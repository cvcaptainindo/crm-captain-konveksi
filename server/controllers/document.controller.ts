import { Response } from 'express';
import { pool, withTransaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';


function getWibDateString(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Helper to safely compute items subtotal, discounts, tax, and total amount
 */
export function calculateDocumentTotals(
  items: Array<{ quantity: number | string; unit_price: number | string }>,
  discount: number | string = 0,
  tax: number | string = 0
): {
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  total_qty: number;
} {
  let subtotal = 0;
  let total_qty = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    if (qty < 0 || price < 0) {
      throw new Error('Kuantitas dan harga satuan tidak boleh bernilai negatif.');
    }
    const itemSubtotal = Math.round(qty * price * 100) / 100;
    subtotal += itemSubtotal;
    total_qty += qty;
  }

  const numDiscount = Math.max(0, Number(discount) || 0);
  const numTax = Math.max(0, Number(tax) || 0);

  if (numDiscount > subtotal) {
    throw new Error('Nominal diskon tidak boleh melebihi subtotal.');
  }

  const total_amount = Math.round((subtotal - numDiscount + numTax) * 100) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(numDiscount * 100) / 100,
    tax: Math.round(numTax * 100) / 100,
    total_amount,
    total_qty: Math.round(total_qty * 100) / 100,
  };
}

/**
 * Generate next document number (e.g. QUO-202610-0001 or INV-202610-0001)
 */
export async function generateDocumentNumber(
  docType: 'QUOTATION' | 'INVOICE',
  conn?: any
): Promise<string> {
  const prefix = docType === 'QUOTATION' ? 'QUO' : 'INV';
  const yearMonth = getWibDateString().slice(0, 7).replace('-', '');
  const searchPattern = `${prefix}-${yearMonth}-%`;

  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT doc_number FROM sales_documents
     WHERE doc_number LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [searchPattern]
  );

  let nextSequence = 1;
  if (rows && rows.length > 0) {
    const lastNum = rows[0].doc_number;
    const parts = lastNum.split('-');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq)) {
        nextSequence = seq + 1;
      }
    }
  }

  return `${prefix}-${yearMonth}-${String(nextSequence).padStart(4, '0')}`;
}

/**
 * GET /api/sales-documents/preview-number
 * GET /api/documents/preview-number
 */
export async function previewNextNumber(req: AuthenticatedRequest, res: Response): Promise<void> {
  const rawType = (req.query.type || req.query.doc_type || 'QUOTATION') as string;
  const type = rawType.toUpperCase() === 'INVOICE' ? 'INVOICE' : 'QUOTATION';
  try {
    const nextNumber = await generateDocumentNumber(type);
    res.json({ success: true, doc_number: nextNumber, document_number: nextNumber });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Gagal menghasilkan nomor dokumen.' });
  }
}

/**
 * GET /api/sales-documents
 * GET /api/documents
 * List all documents with optional filters (customerId, doc_type, status)
 */
export async function getDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const customerId = req.query.customer_id || req.query.customerId;
    const docType = req.query.type || req.query.doc_type;
    const status = req.query.status;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    // RBAC: Sales can only view documents for their assigned customers
    if (req.user?.role === 'SALES') {
      whereClauses.push('c.assigned_sales_id = ?');
      params.push(req.user.id);
    }

    if (customerId) {
      whereClauses.push('d.customer_id = ?');
      params.push(Number(customerId));
    }

    if (docType && ['QUOTATION', 'INVOICE'].includes(String(docType).toUpperCase())) {
      whereClauses.push('d.doc_type = ?');
      params.push(String(docType).toUpperCase());
    }

    if (status) {
      whereClauses.push('d.status = ?');
      params.push(String(status).toUpperCase());
    }

    const [docs] = await pool.query<any[]>(
      `SELECT d.*,
        c.name AS customer_name, c.customer_code, c.company_name, c.whatsapp_number, c.assigned_sales_id,
        u.name AS sales_name, u.phone AS sales_phone, u.email AS sales_email,
        COALESCE(SUM(p.amount), 0) AS total_paid
       FROM sales_documents d
       JOIN customers c ON d.customer_id = c.id
       LEFT JOIN users u ON d.sales_id = u.id
       LEFT JOIN sales_document_payments p ON d.id = p.document_id
       WHERE ${whereClauses.join(' AND ')}
       GROUP BY d.id
       ORDER BY d.doc_date DESC, d.id DESC`,
      params
    );

    const enriched = docs.map(d => {
      const paid = Number(d.total_paid) || Number(d.paid_amount) || 0;
      const total = Number(d.total_amount) || 0;
      const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
      return {
        ...d,
        paid_amount: paid,
        remaining_balance: remaining,
        document_number: d.doc_number,
        document_type: d.doc_type,
        grand_total: d.total_amount,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    console.error('[getDocuments error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar dokumen.' });
  }
}

/**
 * GET /api/sales-documents/customer/:customerId
 * GET /api/documents/customer/:customerId
 * GET /api/customers/:id/sales-documents
 */
export async function getDocumentsByCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.customerId || req.params.id, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ success: false, message: 'ID Customer tidak valid.' });
    return;
  }

  try {
    // 1. Verify customer and scoping
    const [cRows] = await pool.query<any[]>(
      'SELECT id, name, company_name, assigned_sales_id FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [customerId]
    );

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    const customer = cRows[0];
    if (req.user?.role === 'SALES' && Number(customer.assigned_sales_id) !== Number(req.user.id)) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
      return;
    }

    // 2. Query documents with payments aggregate
    const [docs] = await pool.query<any[]>(
      `SELECT d.*,
        u.name AS sales_name, u.phone AS sales_phone, u.email AS sales_email,
        COALESCE(SUM(p.amount), 0) AS total_paid
       FROM sales_documents d
       LEFT JOIN users u ON d.sales_id = u.id
       LEFT JOIN sales_document_payments p ON d.id = p.document_id
       WHERE d.customer_id = ?
       GROUP BY d.id
       ORDER BY d.doc_date DESC, d.id DESC`,
      [customerId]
    );

    if (docs.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const docIds = docs.map(d => d.id);
    const [items] = await pool.query<any[]>(
      `SELECT * FROM sales_document_items WHERE document_id IN (${docIds.map(() => '?').join(',')}) ORDER BY item_order ASC, id ASC`,
      docIds
    );

    const itemsByDocId = new Map<number, any[]>();
    for (const it of items) {
      if (!itemsByDocId.has(it.document_id)) {
        itemsByDocId.set(it.document_id, []);
      }
      itemsByDocId.get(it.document_id)!.push(it);
    }

    const enrichedDocs = docs.map(d => {
      const paid = Number(d.total_paid) || Number(d.paid_amount) || 0;
      const total = Number(d.total_amount) || 0;
      const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
      return {
        ...d,
        paid_amount: paid,
        remaining_balance: remaining,
        document_number: d.doc_number,
        document_type: d.doc_type,
        grand_total: d.total_amount,
        items: itemsByDocId.get(d.id) || [],
        customer_name: customer.name,
        company_name: customer.company_name,
      };
    });

    res.json({ success: true, data: enrichedDocs });
  } catch (err: any) {
    console.error('[getDocumentsByCustomer error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat dokumen penawaran dan invoice.' });
  }
}

/**
 * GET /api/sales-documents/:id
 * GET /api/documents/:id
 * Detail of a specific document with items, payments history, and balance
 */
export async function getDocumentById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ success: false, message: 'ID Dokumen tidak valid.' });
    return;
  }

  try {
    const [docs] = await pool.query<any[]>(
      `SELECT d.*,
        c.name AS customer_name, c.customer_code, c.company_name, c.whatsapp_number, c.address, c.city, c.assigned_sales_id,
        u.name AS sales_name, u.phone AS sales_phone, u.email AS sales_email
       FROM sales_documents d
       JOIN customers c ON d.customer_id = c.id
       LEFT JOIN users u ON d.sales_id = u.id
       WHERE d.id = ? LIMIT 1`,
      [docId]
    );

    if (!docs || docs.length === 0) {
      res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });
      return;
    }

    const doc = docs[0];

    // RBAC: Sales can only view documents of their assigned customer
    if (req.user?.role === 'SALES' && Number(doc.assigned_sales_id) !== Number(req.user.id)) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Dokumen bukan milik Anda.' });
      return;
    }

    // Fetch items
    const [items] = await pool.query<any[]>(
      'SELECT * FROM sales_document_items WHERE document_id = ? ORDER BY item_order ASC, id ASC',
      [docId]
    );

    // Fetch payments
    const [payments] = await pool.query<any[]>(
      `SELECT p.*, u.name AS recorded_by_name
       FROM sales_document_payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.document_id = ?
       ORDER BY p.payment_date ASC, p.id ASC`,
      [docId]
    );
    const [refunds] = await pool.query<any[]>(
      'SELECT * FROM sales_document_refunds WHERE document_id = ? ORDER BY created_at DESC, id DESC',
      [docId]
    );

    const paid_amount = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const remaining_balance = Math.max(0, Math.round((Number(doc.total_amount) - paid_amount) * 100) / 100);

    res.json({
      success: true,
      data: {
        ...doc,
        document_number: doc.doc_number,
        document_type: doc.doc_type,
        grand_total: doc.total_amount,
        paid_amount,
        remaining_balance,
        items,
        payments,
        refunds,
      },
    });
  } catch (err: any) {
    console.error('[getDocumentById error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat detail dokumen.' });
  }
}

/**
 * POST /api/sales-documents
 * POST /api/documents
 * Create a new Quotation or Invoice
 */
export async function createDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    doc_type,
    document_type,
    customer_id,
    doc_date,
    document_date,
    valid_until,
    due_date,
    notes,
    terms,
    items,
    discount = 0,
    tax = 0,
    status,
  } = req.body;

  const resolvedType = (doc_type || document_type || '').toUpperCase();
  if (resolvedType !== 'INVOICE') {
    res.status(400).json({ success: false, message: 'Pada tahap ini hanya pembuatan Invoice yang diaktifkan.' });
    return;
  }

  if (!customer_id) {
    res.status(400).json({ success: false, message: 'Customer wajib dipilih.' });
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, message: 'Dokumen wajib memiliki minimal satu baris produk.' });
    return;
  }

  try {
    // 1. Verify customer and permissions
    const [cRows] = await pool.query<any[]>(
      'SELECT id, name, company_name, assigned_sales_id FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [customer_id]
    );

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    const customer = cRows[0];

    // RBAC: Sales can only create document for their assigned customer
    if (req.user?.role === 'SALES' && Number(customer.assigned_sales_id) !== Number(req.user.id)) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Anda hanya dapat membuat dokumen untuk customer Anda.' });
      return;
    }

    // Admin read-only enforcement
    if (req.user?.role === 'ADMIN') {
      res.status(403).json({ success: false, message: 'Akses Ditolak: Pembuatan dokumen dilakukan oleh tim Sales penanggung jawab.' });
      return;
    }

    // 2. Validate Items & Math
    const sanitizedItems = items.map((it, idx) => {
      const name = String(it.product_name || it.name || '').trim();
      if (!name) {
        throw new Error(`Baris produk #${idx + 1}: Nama produk tidak boleh kosong.`);
      }
      const qty = Number(it.quantity || it.qty);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Baris produk "${name}": Kuantitas harus lebih besar dari 0.`);
      }
      const price = Number(it.unit_price ?? it.price);
      if (isNaN(price) || price < 0) {
        throw new Error(`Baris produk "${name}": Harga satuan tidak boleh negatif.`);
      }
      const sub = Math.round(qty * price * 100) / 100;
      return {
        item_order: idx + 1,
        product_name: name,
        quantity: qty,
        unit: String(it.unit || 'Pcs').trim() || 'Pcs',
        unit_price: price,
        subtotal: sub,
        notes: it.notes || it.description ? String(it.notes || it.description).trim() : null,
      };
    });

    const totals = calculateDocumentTotals(sanitizedItems, discount, tax);

    const todayStr = getWibDateString();
    const finalDocDate = doc_date || document_date ? String(doc_date || document_date).trim() : todayStr;
    const finalValidUntil = valid_until ? String(valid_until).trim() : null;
    const finalDueDate = due_date ? String(due_date).trim() : null;
    if (!isValidDateOnly(finalDocDate) || (finalValidUntil && !isValidDateOnly(finalValidUntil)) || (finalDueDate && !isValidDateOnly(finalDueDate))) {
      res.status(400).json({ success: false, message: 'Tanggal Invoice atau jatuh tempo tidak valid.' });
      return;
    }

    // Phase one only permits initial Invoice states that are selectable in the form.
    const finalStatus = String(status || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'SENT'].includes(finalStatus)) {
      res.status(400).json({ success: false, message: 'Status awal Invoice harus DRAFT atau SENT.' });
      return;
    }

    const result = await withTransaction(async (conn) => {
      // Generate doc number with transaction lock
      const docNumber = await generateDocumentNumber(resolvedType as 'QUOTATION' | 'INVOICE', conn);

      const [docRes] = await conn.execute<any>(
        `INSERT INTO sales_documents (
          doc_type, doc_number, customer_id, sales_id, doc_date, valid_until, due_date,
          status, subtotal, discount, tax, total_amount, paid_amount, remaining_balance, total_qty,
          notes, terms, quotation_id, transaction_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, NULL, NULL, NOW(), NOW())`,
        [
          resolvedType,
          docNumber,
          customer.id,
          req.user!.id,
          finalDocDate,
          finalValidUntil,
          finalDueDate,
          finalStatus,
          totals.subtotal,
          totals.discount,
          totals.tax,
          totals.total_amount,
          totals.total_amount, // initially remaining_balance = total_amount
          totals.total_qty,
          notes ? String(notes).trim() : null,
          terms ? String(terms).trim() : null,
        ]
      );

      const docId = docRes.insertId;

      // Insert multi items
      for (const item of sanitizedItems) {
        await conn.execute(
          `INSERT INTO sales_document_items (
            document_id, item_order, product_name, quantity, unit,
            unit_price, subtotal, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            docId,
            item.item_order,
            item.product_name,
            item.quantity,
            item.unit,
            item.unit_price,
            item.subtotal,
            item.notes,
          ]
        );
      }

      return { docId, docNumber };
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: `CREATE_${resolvedType}`,
      entity: 'SALES_DOCUMENT',
      entityId: result.docId,
      newData: {
        doc_type: resolvedType,
        doc_number: result.docNumber,
        customer_id: customer.id,
        total_amount: totals.total_amount,
        items_count: sanitizedItems.length,
      },
    });

    res.status(201).json({
      success: true,
      message: `${resolvedType === 'QUOTATION' ? 'Penawaran' : 'Invoice'} berhasil dibuat dengan nomor ${result.docNumber}.`,
      data: {
        id: result.docId,
        doc_number: result.docNumber,
        document_number: result.docNumber,
        total_amount: totals.total_amount,
        grand_total: totals.total_amount,
      },
    });
  } catch (err: any) {
    console.error('[createDocument error]', err);
    res.status(400).json({ success: false, message: err.message || 'Gagal membuat dokumen.' });
  }
}

/**
 * PUT /api/sales-documents/:id
 * PUT /api/documents/:id
 * Update an existing document
 */
export async function updateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ success: false, message: 'ID Dokumen tidak valid.' });
    return;
  }

  try {
    const [docs] = await pool.query<any[]>(
      `SELECT d.*, c.assigned_sales_id
       FROM sales_documents d
       JOIN customers c ON d.customer_id = c.id
       WHERE d.id = ? LIMIT 1`,
      [docId]
    );

    if (!docs || docs.length === 0) {
      res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });
      return;
    }

    const doc = docs[0];
    if (doc.doc_type !== 'INVOICE') {
      res.status(400).json({ success: false, message: 'Pada tahap ini hanya Invoice yang dapat diperbarui.' });
      return;
    }

    // RBAC: Sales can only edit documents of their assigned customer
    if (req.user?.role === 'SALES' && Number(doc.assigned_sales_id) !== Number(req.user.id)) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Dokumen bukan milik Anda.' });
      return;
    }

    if (req.user?.role === 'ADMIN') {
      res.status(403).json({ success: false, message: 'Akses Ditolak: Admin hanya memiliki hak akses read-only pada dokumen Sales.' });
      return;
    }

    // Lifecycle-final or paid invoices are immutable to protect payment and omzet history.
    if (['CLOSING', 'CANCEL', 'CANCELLED', 'PAID'].includes(String(doc.status))) {
      res.status(400).json({
        success: false,
        message: 'Invoice yang sudah lunas, closing, atau dibatalkan tidak dapat diubah.',
      });
      return;
    }

    const [paymentRows] = await pool.query<any[]>(
      'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM sales_document_payments WHERE document_id = ?',
      [docId]
    );
    if (Number(paymentRows[0]?.total_paid) > 0) {
      res.status(400).json({
        success: false,
        message: 'Invoice yang sudah memiliki riwayat pembayaran tidak dapat diedit. Buat invoice koreksi bila diperlukan.',
      });
      return;
    }

    const {
      doc_date,
      document_date,
      valid_until,
      due_date,
      status,
      notes,
      terms,
      items,
      discount = 0,
      tax = 0,
    } = req.body;

    const normalizedStatus = status ? String(status).toUpperCase() : undefined;
    if (normalizedStatus && !['DRAFT', 'SENT', 'UNPAID', 'OVERDUE'].includes(normalizedStatus)) {
      res.status(400).json({ success: false, message: 'Status Invoice tidak valid untuk perubahan manual.' });
      return;
    }
    const requestedDocDate = doc_date || document_date;
    if ((requestedDocDate && !isValidDateOnly(String(requestedDocDate).trim())) ||
        (valid_until && !isValidDateOnly(String(valid_until).trim())) ||
        (due_date && !isValidDateOnly(String(due_date).trim()))) {
      res.status(400).json({ success: false, message: 'Tanggal Invoice atau jatuh tempo tidak valid.' });
      return;
    }

    if (items && (!Array.isArray(items) || items.length === 0)) {
      res.status(400).json({ success: false, message: 'Dokumen harus memiliki minimal satu baris produk.' });
      return;
    }

    let sanitizedItems: any[] | null = null;
    let totals: any = null;

    if (items) {
      sanitizedItems = items.map((it: any, idx: number) => {
        const name = String(it.product_name || it.name || '').trim();
        if (!name) throw new Error(`Baris produk #${idx + 1}: Nama produk tidak boleh kosong.`);
        const qty = Number(it.quantity || it.qty);
        if (isNaN(qty) || qty <= 0) throw new Error(`Baris produk "${name}": Kuantitas harus lebih dari 0.`);
        const price = Number(it.unit_price ?? it.price);
        if (isNaN(price) || price < 0) throw new Error(`Baris produk "${name}": Harga tidak boleh negatif.`);
        return {
          item_order: idx + 1,
          product_name: name,
          quantity: qty,
          unit: String(it.unit || 'Pcs').trim() || 'Pcs',
          unit_price: price,
          subtotal: Math.round(qty * price * 100) / 100,
          notes: it.notes || it.description ? String(it.notes || it.description).trim() : null,
        };
      });

      totals = calculateDocumentTotals(sanitizedItems, discount, tax);
    }

    await withTransaction(async (conn) => {
      const [lockedDocs] = await conn.query<any[]>(
        'SELECT id, status FROM sales_documents WHERE id = ? FOR UPDATE', [docId]
      );
      if (!lockedDocs.length) {
        const err: any = new Error('Invoice tidak ditemukan.'); err.statusCode = 404; throw err;
      }
      if (['CLOSING', 'CANCEL', 'CANCELLED', 'PAID'].includes(String(lockedDocs[0].status))) {
        const err: any = new Error('Invoice sudah berubah status dan tidak dapat diedit.'); err.statusCode = 409; throw err;
      }
      const [lockedPayments] = await conn.query<any[]>(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM sales_document_payments WHERE document_id = ?', [docId]
      );
      if (Number(lockedPayments[0]?.total_paid) > 0) {
        const err: any = new Error('Invoice sudah memiliki riwayat pembayaran dan tidak dapat diedit.'); err.statusCode = 409; throw err;
      }

      const updateFields: string[] = ['updated_at = NOW()'];
      const updateParams: any[] = [];

      const finalDate = doc_date || document_date;
      if (finalDate) {
        updateFields.push('doc_date = ?');
        updateParams.push(String(finalDate).trim());
      }
      if (valid_until !== undefined) {
        updateFields.push('valid_until = ?');
        updateParams.push(valid_until ? String(valid_until).trim() : null);
      }
      if (due_date !== undefined) {
        updateFields.push('due_date = ?');
        updateParams.push(due_date ? String(due_date).trim() : null);
      }
      if (normalizedStatus) {
        updateFields.push('status = ?');
        updateParams.push(normalizedStatus);
      }
      if (notes !== undefined) {
        updateFields.push('notes = ?');
        updateParams.push(notes ? String(notes).trim() : null);
      }
      if (terms !== undefined) {
        updateFields.push('terms = ?');
        updateParams.push(terms ? String(terms).trim() : null);
      }

      if (totals) {
        // Recalculate remaining balance based on existing paid_amount
        const paid = Number(lockedPayments[0]?.total_paid) || 0;
        const remaining = Math.max(0, Math.round((totals.total_amount - paid) * 100) / 100);

        updateFields.push('subtotal = ?, discount = ?, tax = ?, total_amount = ?, remaining_balance = ?, total_qty = ?');
        updateParams.push(totals.subtotal, totals.discount, totals.tax, totals.total_amount, remaining, totals.total_qty);
      }

      updateParams.push(docId);
      await conn.execute(`UPDATE sales_documents SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);

      if (sanitizedItems) {
        // Replace items
        await conn.execute('DELETE FROM sales_document_items WHERE document_id = ?', [docId]);
        for (const item of sanitizedItems) {
          await conn.execute(
            `INSERT INTO sales_document_items (
              document_id, item_order, product_name, quantity, unit,
              unit_price, subtotal, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              docId,
              item.item_order,
              item.product_name,
              item.quantity,
              item.unit,
              item.unit_price,
              item.subtotal,
              item.notes,
            ]
          );
        }
      }
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: `UPDATE_${doc.doc_type}`,
      entity: 'SALES_DOCUMENT',
      entityId: docId,
      oldData: { status: doc.status, total: doc.total_amount },
      newData: { status: status || doc.status, total: totals ? totals.total_amount : doc.total_amount },
    });

    res.json({ success: true, message: 'Dokumen berhasil diperbarui.' });
  } catch (err: any) {
    console.error('[updateDocument error]', err);
    res.status(400).json({ success: false, message: err.message || 'Gagal memperbarui dokumen.' });
  }
}

/**
 * POST /api/sales-documents/:id/convert
 * POST /api/sales-documents/:id/convert-to-invoice
 * POST /api/documents/:id/convert-to-invoice
 * Converts an approved Quotation into an Invoice
 */
export async function convertQuotationToInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const quotationId = parseInt(req.params.id, 10);
  if (isNaN(quotationId)) {
    res.status(400).json({ success: false, message: 'ID Quotation tidak valid.' });
    return;
  }

  // RBAC: Admin is strictly read-only
  if (req.user?.role === 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Konversi dokumen dilakukan oleh tim Sales.' });
    return;
  }

  try {
    const todayStr = getWibDateString();

    const result = await withTransaction(async (conn) => {
      // 1. Lock quotation with SELECT ... FOR UPDATE inside database transaction
      const [docs] = await conn.query<any[]>(
        `SELECT d.*, c.assigned_sales_id, c.name AS customer_name
         FROM sales_documents d
         JOIN customers c ON d.customer_id = c.id
         WHERE d.id = ? AND d.doc_type = 'QUOTATION' FOR UPDATE`,
        [quotationId]
      );

      if (!docs || docs.length === 0) {
        const err: any = new Error('Quotation tidak ditemukan.');
        err.statusCode = 404;
        throw err;
      }

      const quotation = docs[0];

      // RBAC: Sales can only convert quotation of their assigned customer
      if (req.user?.role === 'SALES' && Number(quotation.assigned_sales_id) !== Number(req.user.id)) {
        const err: any = new Error('Akses ditolak: Quotation bukan milik customer Anda.');
        err.statusCode = 403;
        throw err;
      }

      // Check status after row is locked
      if (quotation.status === 'CONVERTED') {
        const err: any = new Error('Quotation ini sudah pernah dikonversi menjadi Invoice. Satu quotation hanya dapat menghasilkan satu invoice.');
        err.statusCode = 409;
        throw err;
      }

      if (quotation.status === 'CANCEL' || quotation.status === 'CANCELLED') {
        const err: any = new Error('Quotation yang dibatalkan tidak dapat dikonversi menjadi invoice.');
        err.statusCode = 400;
        throw err;
      }

      // Check if an invoice already references this quotation_id inside locked transaction
      const [existingInv] = await conn.query<any[]>(
        'SELECT id, doc_number FROM sales_documents WHERE quotation_id = ? FOR UPDATE',
        [quotationId]
      );

      if (existingInv && existingInv.length > 0) {
        const err: any = new Error(`Quotation ini sudah pernah dikonversi menjadi Invoice ${existingInv[0].doc_number}.`);
        err.statusCode = 409;
        throw err;
      }

      // 2. Fetch items within transaction
      const [items] = await conn.query<any[]>(
        'SELECT * FROM sales_document_items WHERE document_id = ? ORDER BY item_order ASC',
        [quotationId]
      );

      if (!items || items.length === 0) {
        const err: any = new Error('Quotation tidak memiliki detail produk untuk dikonversi.');
        err.statusCode = 400;
        throw err;
      }

      // 3. Generate new Invoice Number
      const invoiceNumber = await generateDocumentNumber('INVOICE', conn);

      // 4. Insert new Invoice (guaranteed single invoice by unique constraint uq_sdoc_quotation_id)
      const [invRes] = await conn.execute<any>(
        `INSERT INTO sales_documents (
          doc_type, doc_number, customer_id, sales_id, doc_date, valid_until, due_date,
          status, subtotal, discount, tax, total_amount, paid_amount, remaining_balance, total_qty,
          notes, terms, quotation_id, transaction_id, created_at, updated_at
        ) VALUES ('INVOICE', ?, ?, ?, ?, NULL, ?, 'UNPAID', ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
        [
          invoiceNumber,
          quotation.customer_id,
          req.user!.id,
          todayStr,
          quotation.due_date,
          quotation.subtotal,
          quotation.discount,
          quotation.tax,
          quotation.total_amount,
          quotation.total_amount, // remaining_balance = total_amount
          quotation.total_qty,
          quotation.notes,
          quotation.terms,
          quotation.id,
        ]
      );

      const newInvoiceId = invRes.insertId;

      // 5. Copy items
      for (const item of items) {
        await conn.execute(
          `INSERT INTO sales_document_items (
            document_id, item_order, product_name, quantity, unit,
            unit_price, subtotal, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            newInvoiceId,
            item.item_order,
            item.product_name,
            item.quantity,
            item.unit,
            item.unit_price,
            item.subtotal,
            item.notes,
          ]
        );
      }

      // 6. Update Quotation status to CONVERTED
      await conn.execute(
        "UPDATE sales_documents SET status = 'CONVERTED', updated_at = NOW() WHERE id = ?",
        [quotation.id]
      );

      return { newInvoiceId, invoiceNumber, quotation };
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'CONVERT_QUOTATION_TO_INVOICE',
      entity: 'SALES_DOCUMENT',
      entityId: result.newInvoiceId,
      newData: {
        quotation_id: quotationId,
        invoice_id: result.newInvoiceId,
        invoice_number: result.invoiceNumber,
      },
    });

    res.status(201).json({
      success: true,
      message: `Quotation berhasil dikonversi menjadi Invoice ${result.invoiceNumber}.`,
      data: {
        id: result.newInvoiceId,
        doc_number: result.invoiceNumber,
        document_number: result.invoiceNumber,
      },
    });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry') || err.message?.includes('uq_sdoc_quotation_id')) {
      res.status(409).json({
        success: false,
        message: 'Quotation ini sudah pernah dikonversi menjadi Invoice. Konversi ganda dicegah.',
      });
      return;
    }
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message || 'Gagal mengonversi quotation ke invoice.' });
  }
}

/**
 * POST /api/sales-documents/:id/payments
 * POST /api/documents/:id/payments
 * Record a partial or full payment on an invoice
 */
export async function recordPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ success: false, message: 'ID Dokumen tidak valid.' });
    return;
  }

  // RBAC: Admin is strictly read-only
  if (req.user?.role === 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Admin hanya memiliki hak akses read-only pada dokumen Sales.' });
    return;
  }

  const { amount, payment_date, payment_method = 'TRANSFER', reference_number, notes } = req.body;
  const numAmount = Number(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ success: false, message: 'Nominal pembayaran harus lebih besar dari 0.' });
    return;
  }

  try {
    const todayStr = getWibDateString();
    const finalDate = payment_date ? String(payment_date).trim() : todayStr;
    const finalMethod = String(payment_method || 'TRANSFER').trim().toUpperCase();
    if (!isValidDateOnly(finalDate) || !['TRANSFER', 'CASH', 'QRIS', 'OTHER'].includes(finalMethod)) {
      res.status(400).json({ success: false, message: 'Tanggal atau metode pembayaran tidak valid.' });
      return;
    }

    const result = await withTransaction(async (conn) => {
      // 1. Lock invoice row with SELECT ... FOR UPDATE inside database transaction
      const [docs] = await conn.query<any[]>(
        `SELECT d.*, c.assigned_sales_id
         FROM sales_documents d
         JOIN customers c ON d.customer_id = c.id
         WHERE d.id = ? FOR UPDATE`,
        [docId]
      );

      if (!docs || docs.length === 0) {
        const err: any = new Error('Dokumen tidak ditemukan.');
        err.statusCode = 404;
        throw err;
      }

      const doc = docs[0];

      if (doc.doc_type !== 'INVOICE') {
        const err: any = new Error('Pencatatan pembayaran hanya dapat dilakukan pada dokumen Invoice.');
        err.statusCode = 400;
        throw err;
      }

      if (doc.status === 'CANCEL' || doc.status === 'CANCELLED') {
        const err: any = new Error('Tidak dapat mencatat pembayaran pada invoice yang dibatalkan.');
        err.statusCode = 400;
        throw err;
      }

      // RBAC: Sales can only record payments for their customer
      if (req.user?.role === 'SALES' && Number(doc.assigned_sales_id) !== Number(req.user.id)) {
        const err: any = new Error('Akses ditolak: Invoice bukan milik customer Anda.');
        err.statusCode = 403;
        throw err;
      }

      // 2. Recalculate already paid amount inside transaction with row lock
      const [sumRows] = await conn.query<any[]>(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM sales_document_payments WHERE document_id = ? FOR UPDATE',
        [docId]
      );

      const currentPaid = Number(sumRows[0]?.total_paid) || 0;
      const totalAmount = Number(doc.total_amount) || 0;
      const currentRemaining = Math.max(0, Math.round((totalAmount - currentPaid) * 100) / 100);

      if (currentRemaining <= 0) {
        const err: any = new Error('Invoice ini sudah lunas.');
        err.statusCode = 400;
        throw err;
      }

      // 3. Reject payment that exceeds remaining balance!
      if (numAmount > currentRemaining) {
        const err: any = new Error(
          `Pembayaran sebesar Rp ${numAmount.toLocaleString('id-ID')} melebihi sisa tagihan (Rp ${currentRemaining.toLocaleString('id-ID')}).`
        );
        err.statusCode = 400;
        throw err;
      }

      // 4. Insert payment record into sales_document_payments
      // STRICT: Never insert into transactions table! Payments do not create omzet.
      const [payRes] = await conn.execute<any>(
        `INSERT INTO sales_document_payments (
          document_id, payment_date, amount, payment_method, reference_number, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          docId,
          finalDate,
          numAmount,
          finalMethod,
          reference_number ? String(reference_number).trim() : null,
          notes ? String(notes).trim() : null,
          req.user?.id || null,
        ]
      );

      const newTotalPaid = Math.round((currentPaid + numAmount) * 100) / 100;
      const newRemainingBalance = Math.max(0, Math.round((totalAmount - newTotalPaid) * 100) / 100);

      // 5. Update invoice status & balances
      let newStatus = doc.status;
      if (doc.status !== 'CLOSING') {
        if (newRemainingBalance <= 0) {
          newStatus = 'PAID';
        } else {
          newStatus = 'PARTIAL';
        }
      }

      await conn.execute(
        `UPDATE sales_documents
         SET paid_amount = ?, remaining_balance = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [newTotalPaid, newRemainingBalance, newStatus, docId]
      );

      return {
        paymentId: payRes.insertId,
        totalPaid: newTotalPaid,
        remainingBalance: newRemainingBalance,
        status: newStatus,
        doc,
      };
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'RECORD_INVOICE_PAYMENT',
      entity: 'SALES_DOCUMENT_PAYMENT',
      entityId: result.paymentId,
      newData: {
        document_id: docId,
        amount: numAmount,
        payment_method,
        remaining_balance: result.remainingBalance,
        status: result.status,
      },
    });

    res.status(201).json({
      success: true,
      message: `Pembayaran sebesar Rp ${numAmount.toLocaleString('id-ID')} berhasil dicatat!`,
      data: result,
    });
  } catch (err: any) {
    console.error('[recordPayment error]', err);
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message || 'Gagal mencatat pembayaran.' });
  }
}

/**
 * GET /api/sales-documents/:id/payments
 * GET /api/documents/:id/payments
 * Get list of all payments for an invoice
 */
export async function getPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ success: false, message: 'ID Dokumen tidak valid.' });
    return;
  }

  try {
    const [docs] = await pool.query<any[]>(
      `SELECT d.id, d.doc_type, d.customer_id, c.assigned_sales_id
       FROM sales_documents d JOIN customers c ON c.id = d.customer_id
       WHERE d.id = ? LIMIT 1`,
      [docId]
    );

    if (!docs || docs.length === 0) {
      res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });
      return;
    }
    if (req.user?.role === 'SALES' && Number(docs[0].assigned_sales_id) !== Number(req.user.id)) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Invoice bukan milik customer Anda.' });
      return;
    }
    if (docs[0].doc_type !== 'INVOICE') {
      res.status(400).json({ success: false, message: 'Riwayat pembayaran hanya tersedia untuk Invoice.' });
      return;
    }

    const [payments] = await pool.query<any[]>(
      `SELECT p.*, u.name AS recorded_by_name
       FROM sales_document_payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.document_id = ?
       ORDER BY p.payment_date ASC, p.id ASC`,
      [docId]
    );

    res.json({ success: true, data: payments });
  } catch (err: any) {
    console.error('[getPayments error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat riwayat pembayaran.' });
  }
}

/**
 * POST /api/sales-documents/:id/closing
 * POST /api/sales-documents/:id/close
 * POST /api/documents/:id/close
 * Mark Invoice as CLOSING, creating exactly 1 transaction in `transactions` table.
 * Idempotent: strictly prevents duplicate closing transactions.
 */
export async function closeInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) {
    res.status(400).json({ success: false, message: 'ID Invoice tidak valid.' });
    return;
  }

  // RBAC: Admin is strictly read-only
  if (req.user?.role === 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Penutupan transaksi invoice dilakukan oleh Sales penanggung jawab.' });
    return;
  }

  try {
    const todayStr = getWibDateString();

    const result = await withTransaction(async (conn) => {
      // 1. Lock invoice row with SELECT ... FOR UPDATE inside database transaction
      const [docs] = await conn.query<any[]>(
        `SELECT d.*, c.assigned_sales_id, c.name AS customer_name
         FROM sales_documents d
         JOIN customers c ON d.customer_id = c.id
         WHERE d.id = ? FOR UPDATE`,
        [invoiceId]
      );

      if (!docs || docs.length === 0) {
        const err: any = new Error('Invoice tidak ditemukan.');
        err.statusCode = 404;
        throw err;
      }

      const invoice = docs[0];

      if (invoice.doc_type !== 'INVOICE') {
        const err: any = new Error('Hanya dokumen Invoice yang dapat ditandai sebagai Closing omzet.');
        err.statusCode = 400;
        throw err;
      }

      // RBAC: Sales can only close invoices of their assigned customer
      if (req.user?.role === 'SALES' && Number(invoice.assigned_sales_id) !== Number(req.user.id)) {
        const err: any = new Error('Akses ditolak: Invoice bukan milik customer Anda.');
        err.statusCode = 403;
        throw err;
      }

      // Check status and transaction_id after row is locked
      if (invoice.status === 'CLOSING' || invoice.transaction_id !== null) {
        const err: any = new Error('Invoice ini sudah berstatus CLOSING dan transaksi omzet telah tercatat sebelumnya. Transaksi ganda dicegah.');
        err.statusCode = 409;
        throw err;
      }

      if (invoice.status === 'CANCEL' || invoice.status === 'CANCELLED') {
        const err: any = new Error('Invoice yang dibatalkan tidak dapat ditandai sebagai closing.');
        err.statusCode = 400;
        throw err;
      }

      // Check if transactions table already has a record for this invoice_id inside locked transaction
      const [existingTrx] = await conn.query<any[]>(
        'SELECT id, amount, transaction_date FROM transactions WHERE invoice_id = ? FOR UPDATE',
        [invoiceId]
      );

      if (existingTrx && existingTrx.length > 0) {
        const err: any = new Error('Transaksi closing untuk invoice ini sudah tercatat. Tidak dibuat transaksi kedua; periksa relasi invoice dan transaksi.');
        err.statusCode = 409;
        throw err;
      }

      // Fetch items for transaction product summary within transaction
      const [items] = await conn.query<any[]>(
        'SELECT product_name, quantity, unit FROM sales_document_items WHERE document_id = ? ORDER BY item_order ASC',
        [invoiceId]
      );

      const productSummary = items && items.length > 0
        ? items.map(i => `${i.product_name} (${Number(i.quantity)} ${i.unit})`).join(', ')
        : `Invoice #${invoice.doc_number}`;

      const closingDate = invoice.doc_date || todayStr;
      const numericAmount = Number(invoice.total_amount) || 0;

      if (numericAmount <= 0) {
        const err: any = new Error('Total invoice harus lebih dari 0 untuk dicatat sebagai transaksi closing omzet.');
        err.statusCode = 400;
        throw err;
      }

      // 2. Insert into transactions table (protected by UNIQUE constraint uq_transactions_invoice_id)
      const [trxRes] = await conn.execute<any>(
        `INSERT INTO transactions (
          customer_id, sales_id, transaction_date, product, description,
          amount, status, notes, invoice_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'CLOSING', ?, ?, NOW(), NOW())`,
        [
          invoice.customer_id,
          invoice.sales_id,
          closingDate,
          productSummary.substring(0, 150),
          `Closing otomatis dari Invoice #${invoice.doc_number}`,
          numericAmount,
          invoice.notes ? String(invoice.notes).trim() : '',
          invoiceId,
        ]
      );

      const trxId = trxRes.insertId;

      // 3. Update sales_documents to CLOSING with transaction_id link
      await conn.execute(
        "UPDATE sales_documents SET status = 'CLOSING', transaction_id = ?, updated_at = NOW() WHERE id = ?",
        [trxId, invoiceId]
      );

      // 4. Update customer status to CLOSING
      const [statusRows] = await conn.query<any[]>(
        'SELECT id FROM customer_statuses WHERE code = "CLOSING" LIMIT 1'
      );
      if (statusRows && statusRows.length > 0) {
        await conn.execute(
          'UPDATE customers SET status_id = ?, updated_at = NOW() WHERE id = ?',
          [statusRows[0].id, invoice.customer_id]
        );
      }

      return { trxId, invoice, numericAmount };
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'INVOICE_CLOSED_TO_TRANSACTION',
      entity: 'TRANSACTION',
      entityId: result.trxId,
      newData: {
        invoice_id: invoiceId,
        invoice_number: result.invoice.doc_number,
        transaction_id: result.trxId,
        amount: result.numericAmount,
        status: 'CLOSING',
      },
    });

    res.status(201).json({
      success: true,
      message: `Invoice #${result.invoice.doc_number} berhasil dicatat sebagai transaksi CLOSING senilai Rp ${result.numericAmount.toLocaleString('id-ID')}!`,
      data: {
        transaction_id: result.trxId,
        invoice_id: invoiceId,
        amount: result.numericAmount,
        status: 'CLOSING',
      },
    });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry') || err.message?.includes('uq_transactions_invoice_id')) {
      res.status(409).json({
        success: false,
        message: 'Transaksi closing untuk invoice ini sudah tercatat sebelumnya. Transaksi ganda dicegah.',
      });
      return;
    }
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message || 'Gagal menandai invoice sebagai closing.' });
  }
}

export const markInvoiceClosing = closeInvoice;

/**
 * POST /api/sales-documents/:id/cancel
 * POST /api/documents/:id/cancel
 * Cancel an invoice. If it was already closed, the linked transaction is updated to 'CANCEL',
 * ensuring financial omzet reports exclude it without deleting audit records.
 */
export async function cancelInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ success: false, message: 'ID Invoice tidak valid.' });
    return;
  }
  if (req.user?.role === 'ADMIN') {
    res.status(403).json({ success: false, message: 'Admin hanya memiliki akses baca pada dokumen Sales.' });
    return;
  }

  try {
    const result = await withTransaction(async (conn) => {
      const [docs] = await conn.query<any[]>(
        `SELECT d.*, c.assigned_sales_id FROM sales_documents d
         JOIN customers c ON c.id = d.customer_id WHERE d.id = ? FOR UPDATE`,
        [docId]
      );
      if (!docs.length) {
        const err: any = new Error('Invoice tidak ditemukan.'); err.statusCode = 404; throw err;
      }
      const doc = docs[0];
      if (doc.doc_type !== 'INVOICE') {
        const err: any = new Error('Hanya Invoice yang dapat dibatalkan melalui menu ini.'); err.statusCode = 400; throw err;
      }
      if (Number(doc.assigned_sales_id) !== Number(req.user?.id)) {
        const err: any = new Error('Akses ditolak: Invoice bukan milik customer Anda.'); err.statusCode = 403; throw err;
      }
      if (['CANCEL', 'CANCELLED'].includes(String(doc.status))) {
        const err: any = new Error('Invoice ini sudah pernah dibatalkan.'); err.statusCode = 409; throw err;
      }

      // Cancellation never deletes or modifies payment rows. Refunds are separate records.
      await conn.execute(
        "UPDATE sales_documents SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?",
        [docId]
      );
      if (doc.transaction_id) {
        await conn.execute(
          "UPDATE transactions SET status = 'CANCEL', notes = CONCAT(COALESCE(notes, ''), ' [Dibatalkan via Invoice #', ?, ']'), updated_at = NOW() WHERE id = ?",
          [doc.doc_number, doc.transaction_id]
        );
      } else {
        await conn.execute(
          "UPDATE transactions SET status = 'CANCEL', notes = CONCAT(COALESCE(notes, ''), ' [Dibatalkan via Invoice #', ?, ']'), updated_at = NOW() WHERE invoice_id = ?",
          [doc.doc_number, docId]
        );
      }
      return doc;
    });

    await logAudit({
      userId: req.user?.id, userName: req.user?.name, action: 'CANCEL_INVOICE',
      entity: 'SALES_DOCUMENT', entityId: docId,
      newData: { doc_number: result.doc_number, transaction_id: result.transaction_id, status: 'CANCELLED', payment_history_preserved: true },
    });
    res.json({
      success: true,
      message: `Invoice #${result.doc_number} dibatalkan. Riwayat pembayaran tetap tersimpan; refund harus dicatat secara terpisah.`,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message || 'Gagal membatalkan invoice.' });
  }
}

/**
 * DELETE /api/sales-documents/:id
 * DELETE /api/documents/:id
 * Delete document (only allowed if DRAFT, REJECTED, or CANCELLED)
 */
export async function deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ success: false, message: 'ID Dokumen tidak valid.' });
    return;
  }
  if (req.user?.role === 'ADMIN') {
    res.status(403).json({ success: false, message: 'Admin hanya memiliki akses baca pada dokumen Sales.' });
    return;
  }

  try {
    const result = await withTransaction(async (conn) => {
      const [docs] = await conn.query<any[]>(
        `SELECT d.*, c.assigned_sales_id FROM sales_documents d
         JOIN customers c ON c.id = d.customer_id WHERE d.id = ? FOR UPDATE`,
        [docId]
      );
      if (!docs.length) {
        const err: any = new Error('Dokumen tidak ditemukan.'); err.statusCode = 404; throw err;
      }
      const doc = docs[0];
      if (doc.doc_type !== 'INVOICE') {
        const err: any = new Error('Pada tahap ini penghapusan hanya berlaku untuk Invoice.'); err.statusCode = 400; throw err;
      }
      if (Number(doc.assigned_sales_id) !== Number(req.user?.id)) {
        const err: any = new Error('Akses ditolak: Dokumen bukan milik customer Anda.'); err.statusCode = 403; throw err;
      }
      if (!['DRAFT', 'UNPAID'].includes(String(doc.status))) {
        const err: any = new Error('Hanya Invoice Draft/Belum Dibayar yang belum memiliki transaksi yang boleh dihapus. Gunakan pembatalan untuk dokumen yang sudah berjalan.'); err.statusCode = 409; throw err;
      }
      const [payRows] = await conn.query<any[]>(
        'SELECT COUNT(*) AS payment_count FROM sales_document_payments WHERE document_id = ?', [docId]
      );
      const [refundRows] = await conn.query<any[]>(
        'SELECT COUNT(*) AS refund_count FROM sales_document_refunds WHERE document_id = ?', [docId]
      );
      const [transactionRows] = await conn.query<any[]>(
        'SELECT COUNT(*) AS transaction_count FROM transactions WHERE invoice_id = ? OR id = ?',
        [docId, doc.transaction_id || 0]
      );
      if (Number(payRows[0]?.payment_count) > 0 || Number(refundRows[0]?.refund_count) > 0 || Number(transactionRows[0]?.transaction_count) > 0) {
        const err: any = new Error('Dokumen memiliki riwayat pembayaran, refund, atau transaksi. Data historis tidak boleh dihapus; gunakan pembatalan.'); err.statusCode = 409; throw err;
      }
      await conn.execute('DELETE FROM sales_document_items WHERE document_id = ?', [docId]);
      await conn.execute('DELETE FROM sales_documents WHERE id = ?', [docId]);
      return doc;
    });

    await logAudit({
      userId: req.user?.id, userName: req.user?.name,
      action: `DELETE_${result.doc_type}`, entity: 'SALES_DOCUMENT', entityId: docId,
      oldData: { doc_number: result.doc_number, total: result.total_amount },
    });
    res.json({ success: true, message: `Dokumen #${result.doc_number} berhasil dihapus.` });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message || 'Gagal menghapus dokumen.' });
  }
}



/** GET /api/documents/:id/refunds - separate refund ledger; payment history stays immutable. */
export async function getDocumentRefunds(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(docId)) { res.status(400).json({ success: false, message: 'ID Invoice tidak valid.' }); return; }
  try {
    const [docs] = await pool.query<any[]>(
      `SELECT d.doc_type, c.assigned_sales_id FROM sales_documents d JOIN customers c ON c.id=d.customer_id WHERE d.id=?`, [docId]
    );
    if (!docs.length) { res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' }); return; }
    if (docs[0].doc_type !== 'INVOICE') { res.status(400).json({ success: false, message: 'Refund hanya tersedia untuk Invoice.' }); return; }
    if (req.user?.role === 'SALES' && Number(docs[0].assigned_sales_id) !== Number(req.user.id)) {
      res.status(403).json({ success: false, message: 'Akses ditolak.' }); return;
    }
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM sales_document_refunds WHERE document_id=? ORDER BY created_at DESC, id DESC', [docId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Gagal memuat riwayat refund.' });
  }
}

/** POST /api/documents/:id/refunds - records pending/completed refunds without altering payments or omzet. */
export async function createDocumentRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = Number.parseInt(req.params.id, 10);
  const amount = Number(req.body.amount);
  const status = String(req.body.status || 'PENDING').toUpperCase();
  if (!Number.isInteger(docId) || !Number.isFinite(amount) || amount <= 0 || !['PENDING', 'COMPLETED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Data refund tidak valid.' }); return;
  }
  if (req.user?.role === 'ADMIN') { res.status(403).json({ success: false, message: 'Admin hanya memiliki akses baca.' }); return; }
  const refundDate = req.body.refund_date ? String(req.body.refund_date).trim() : null;
  const refundMethod = req.body.refund_method ? String(req.body.refund_method).trim().toUpperCase() : null;
  if (status === 'COMPLETED' && (!refundDate || !isValidDateOnly(refundDate) || !['TRANSFER', 'CASH', 'QRIS', 'OTHER'].includes(refundMethod || ''))) {
    res.status(400).json({ success: false, message: 'Tanggal dan metode wajib diisi untuk refund yang sudah selesai.' }); return;
  }
  try {
    const result = await withTransaction(async conn => {
      const [docs] = await conn.query<any[]>(
        `SELECT d.*, c.assigned_sales_id FROM sales_documents d JOIN customers c ON c.id=d.customer_id WHERE d.id=? FOR UPDATE`, [docId]
      );
      if (!docs.length) { const e:any=new Error('Invoice tidak ditemukan.'); e.statusCode=404; throw e; }
      const doc=docs[0];
      if (doc.doc_type !== 'INVOICE' || doc.status !== 'CANCELLED' && doc.status !== 'CANCEL') { const e:any=new Error('Refund hanya dapat dicatat untuk Invoice yang sudah dibatalkan.'); e.statusCode=409; throw e; }
      if (Number(doc.assigned_sales_id)!==Number(req.user?.id)) { const e:any=new Error('Akses ditolak.'); e.statusCode=403; throw e; }
      const [paidRows] = await conn.query<any[]>(
        'SELECT COALESCE(SUM(amount),0) AS total_paid FROM sales_document_payments WHERE document_id=?', [docId]
      );
      const [refundRows] = await conn.query<any[]>(
        'SELECT COALESCE(SUM(amount),0) AS total_refund FROM sales_document_refunds WHERE document_id=?', [docId]
      );
      const paid = Number(paidRows[0]?.total_paid)||0;
      const alreadyRefunded = Number(refundRows[0]?.total_refund)||0;
      const available = Math.round((paid-alreadyRefunded)*100)/100;
      if (amount > available) { const e:any=new Error(`Nominal refund melebihi pembayaran yang diterima. Maksimal: Rp ${available.toLocaleString('id-ID')}.`); e.statusCode=400; throw e; }
      const [insert] = await conn.execute<any>(
        `INSERT INTO sales_document_refunds (document_id, refund_date, amount, refund_method, reference_number, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [docId, refundDate, amount, refundMethod, req.body.reference_number ? String(req.body.reference_number).trim() : null, status, req.body.notes ? String(req.body.notes).trim() : null, req.user?.id || null]
      );
      return { id: insert.insertId, doc };
    });
    await logAudit({ userId:req.user?.id, userName:req.user?.name, action:'CREATE_INVOICE_REFUND', entity:'SALES_DOCUMENT_REFUND', entityId:result.id, newData:{ document_id:docId, amount, status } });
    res.status(201).json({ success:true, message:'Catatan refund berhasil disimpan.', data:{ id:result.id } });
  } catch(err:any) { const statusCode=err.statusCode||500; res.status(statusCode).json({ success:false, message:err.message||'Gagal mencatat refund.' }); }
}

/** PATCH /api/documents/:id/refunds/:refundId - marks an existing pending refund completed. */
export async function completeDocumentRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = Number.parseInt(req.params.id, 10);
  const refundId = Number.parseInt(req.params.refundId, 10);
  const refundDate = String(req.body.refund_date || '').trim();
  const refundMethod = String(req.body.refund_method || '').trim().toUpperCase();
  if (!Number.isInteger(docId) || !Number.isInteger(refundId) || !isValidDateOnly(refundDate) || !['TRANSFER', 'CASH', 'QRIS', 'OTHER'].includes(refundMethod)) {
    res.status(400).json({ success: false, message: 'Tanggal dan metode refund wajib valid.' });
    return;
  }
  if (req.user?.role === 'ADMIN') {
    res.status(403).json({ success: false, message: 'Admin hanya memiliki akses baca.' });
    return;
  }
  try {
    await withTransaction(async conn => {
      const [rows] = await conn.query<any[]>(
        `SELECT r.id, r.status, c.assigned_sales_id
         FROM sales_document_refunds r
         JOIN sales_documents d ON d.id = r.document_id
         JOIN customers c ON c.id = d.customer_id
         WHERE r.id = ? AND r.document_id = ? FOR UPDATE`,
        [refundId, docId]
      );
      if (!rows.length) { const e: any = new Error('Catatan refund tidak ditemukan.'); e.statusCode = 404; throw e; }
      if (Number(rows[0].assigned_sales_id) !== Number(req.user?.id)) { const e: any = new Error('Akses ditolak.'); e.statusCode = 403; throw e; }
      if (rows[0].status !== 'PENDING') { const e: any = new Error('Hanya refund berstatus menunggu yang dapat diselesaikan.'); e.statusCode = 409; throw e; }
      await conn.execute(
        `UPDATE sales_document_refunds SET status = 'COMPLETED', refund_date = ?, refund_method = ? WHERE id = ? AND document_id = ?`,
        [refundDate, refundMethod, refundId, docId]
      );
    });
    await logAudit({
      userId: req.user?.id, userName: req.user?.name, action: 'COMPLETE_INVOICE_REFUND',
      entity: 'SALES_DOCUMENT_REFUND', entityId: refundId,
      newData: { document_id: docId, status: 'COMPLETED', refund_date: refundDate, refund_method: refundMethod },
    });
    res.json({ success: true, message: 'Refund berhasil ditandai selesai.' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Gagal memperbarui refund.' });
  }
}
