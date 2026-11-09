import { Response } from 'express';
import { pool, withTransaction, Transaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';
import { getTodayDateString, getStartOfWeekDateString } from '../services/followUpEngine.js';

/**
 * Strictly validates that an input string is in 'YYYY-MM-DD' format and represents an authentic calendar date.
 * Rejects nonexistent calendar dates (e.g., '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10').
 * Accepts valid dates including leap year days (e.g., '2024-02-29', '2026-02-28', '2026-12-31').
 */
export function isValidCalendarDate(dateStr: any): boolean {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonths = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day > daysInMonths[month - 1]) return false;

  return true;
}

export async function getTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    customer_id,
    sales_id,
    status,
    period = 'all',
    start_date,
    end_date,
    search,
  } = req.query;

  try {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // 1. SALES role scoping: strictly only transactions they own
    if (req.user?.role === 'SALES') {
      conditions.push('t.sales_id = ?');
      params.push(req.user.id);
    } else if (sales_id && sales_id !== 'all') {
      conditions.push('t.sales_id = ?');
      params.push(parseInt(sales_id as string, 10));
    }

    // 2. Filter by Customer ID
    if (customer_id) {
      conditions.push('t.customer_id = ?');
      params.push(parseInt(customer_id as string, 10));
    }

    // 3. Filter by Status (CLOSING / CANCEL)
    if (status && status !== 'all') {
      conditions.push('t.status = ?');
      params.push(status);
    }

    // 4. Filter by Date / Period
    const todayStr = getTodayDateString();

    if (period === 'today') {
      conditions.push('t.transaction_date = ?');
      params.push(todayStr);
    } else if (period === 'this_week') {
      const mondayStr = getStartOfWeekDateString(todayStr);
      conditions.push('t.transaction_date >= ? AND t.transaction_date <= ?');
      params.push(mondayStr, todayStr);
    } else if (period === 'this_month') {
      const currentMonthPrefix = todayStr.substring(0, 7);
      conditions.push('t.transaction_date LIKE ?');
      params.push(`${currentMonthPrefix}%`);
    } else if (period === 'custom' || (start_date && end_date)) {
      if (start_date) {
        conditions.push('t.transaction_date >= ?');
        params.push(start_date);
      }
      if (end_date) {
        conditions.push('t.transaction_date <= ?');
        params.push(end_date);
      }
    }

    // 5. Search
    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(t.product) LIKE ? OR
        LOWER(COALESCE(t.description, '')) LIKE ? OR
        LOWER(COALESCE(c.name, '')) LIKE ? OR
        LOWER(COALESCE(t.customer_name_manual, '')) LIKE ? OR
        LOWER(COALESCE(c.company_name, '')) LIKE ?
      )`);
      params.push(q, q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT 
        t.*,
        COALESCE(NULLIF(t.customer_name_manual, ''), c.name, CASE WHEN t.customer_id IS NULL THEN 'Tanpa Customer' ELSE 'Customer Terhapus' END) AS customer_name,
        COALESCE(c.company_name, '-') AS company_name,
        COALESCE(c.whatsapp_number, '-') AS whatsapp_number,
        COALESCE(u.name, '-') AS sales_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.sales_id = u.id
      WHERE ${whereClause}
      ORDER BY t.transaction_date DESC, t.id DESC
    `;

    const [rows] = await pool.query<any[]>(sql, params);

    const formatted = rows.map(r => ({
      ...r,
      amount: Number(r.amount) || 0,
    }));

    // Calculate Accurate Backend Omzet Totals:
    // RULE: Only status === 'CLOSING' counts into omzet! CANCEL is excluded.
    const closingTransactions = formatted.filter(t => t.status === 'CLOSING');
    const cancelTransactions = formatted.filter(t => t.status === 'CANCEL');

    const totalOmzet = closingTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalCancelAmount = cancelTransactions.reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      data: formatted,
      summary: {
        total_omzet: totalOmzet,
        total_closing_count: closingTransactions.length,
        total_cancel_count: cancelTransactions.length,
        total_cancel_amount: totalCancelAmount,
      },
    });
  } catch (err: any) {
    console.error('[Transaction getTransactions error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar transaksi.' });
  }
}

export async function createTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    customer_id,
    customer_name_manual,
    sales_id,
    product,
    description,
    amount,
    status = 'CLOSING',
    transaction_date,
    notes,
    update_customer_status = true,
  } = req.body;

  if (typeof product !== 'string' || !product.trim() || amount === undefined) {
    res.status(400).json({ success: false, message: 'Nama produk dan nominal transaksi wajib diisi.' });
    return;
  }

  const numericAmount = typeof amount === 'string' && amount.trim() === '' ? NaN : Number(amount);
  if (typeof amount === 'boolean' || isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount < 0) {
    res.status(400).json({ success: false, message: 'Nominal transaksi harus berupa angka positif.' });
    return;
  }

  const validStatuses = ['CLOSING', 'CANCEL'];
  if (status !== undefined && !validStatuses.includes(status)) {
    res.status(400).json({ success: false, message: 'Status transaksi harus bernilai CLOSING atau CANCEL.' });
    return;
  }

  if (transaction_date !== undefined && transaction_date !== null && transaction_date !== '') {
    if (!isValidCalendarDate(transaction_date)) {
      res.status(400).json({ success: false, message: 'Format tanggal transaksi tidak valid (gunakan format YYYY-MM-DD yang sah).' });
      return;
    }
  }

  const manualCustomerName = typeof customer_name_manual === 'string' ? customer_name_manual.trim() : '';
  if (manualCustomerName.length > 120) {
    res.status(400).json({ success: false, message: 'Nama customer manual maksimal 120 karakter.' });
    return;
  }

  try {
    let customer: any = null;
    let finalCustomerId: number | null = null;

    if (customer_id !== undefined && customer_id !== null && String(customer_id).trim() !== '') {
      const parsedCustomerId = Number(customer_id);
      if (!Number.isInteger(parsedCustomerId) || parsedCustomerId <= 0) {
        res.status(400).json({ success: false, message: 'Customer yang dipilih tidak valid.' });
        return;
      }

      const [cRows] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ? LIMIT 1', [parsedCustomerId]);
      if (!cRows || cRows.length === 0) {
        res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
        return;
      }
      customer = cRows[0];
      finalCustomerId = customer.id;
    }

    // Keep legacy API clients compatible: when sales_id is omitted for a registered
    // customer, retain the customer's assigned Sales. An explicit null means no PIC.
    let finalSalesId: number | null = customer?.assigned_sales_id ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'sales_id')) {
      if (sales_id === null || sales_id === undefined || String(sales_id).trim() === '') {
        finalSalesId = null;
      } else {
        const parsedSalesId = Number(sales_id);
        if (!Number.isInteger(parsedSalesId) || parsedSalesId <= 0) {
          res.status(400).json({ success: false, message: 'Sales PIC yang dipilih tidak valid.' });
          return;
        }
        const [salesRows] = await pool.query<any[]>(
          "SELECT id FROM users WHERE id = ? AND role = 'SALES' LIMIT 1",
          [parsedSalesId]
        );
        if (!salesRows || salesRows.length === 0) {
          res.status(404).json({ success: false, message: 'Sales PIC tidak ditemukan.' });
          return;
        }
        finalSalesId = salesRows[0].id;
      }
    }

    // Defense in depth. The route already requires Admin; preserve the ownership
    // check in case this controller is reused by another route in the future.
    if (req.user?.role === 'SALES' && customer && customer.assigned_sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
      return;
    }

    const today = getTodayDateString();
    const finalDate = transaction_date ? String(transaction_date).trim() : today;
    const finalStatus = status || 'CLOSING';
    const finalManualCustomerName = finalCustomerId === null && manualCustomerName ? manualCustomerName : null;

    const result = await withTransaction(async (conn) => {
      const [insertRes] = await conn.execute<any>(
        `INSERT INTO transactions (
          customer_id, customer_name_manual, sales_id, transaction_date, product, description,
          amount, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          finalCustomerId,
          finalManualCustomerName,
          finalSalesId,
          finalDate,
          product.trim(),
          description ? String(description).trim() : '',
          numericAmount,
          finalStatus,
          notes ? String(notes).trim() : '',
        ]
      );

      const trxId = insertRes.insertId;

      if (update_customer_status && customer) {
        const [statusRows] = await conn.query<any[]>(
          'SELECT id FROM customer_statuses WHERE code = ? LIMIT 1',
          [finalStatus]
        );
        if (statusRows && statusRows.length > 0) {
          await conn.execute(
            'UPDATE customers SET status_id = ?, updated_at = NOW() WHERE id = ?',
            [statusRows[0].id, customer.id]
          );
        }
      }

      return { trxId };
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: `CREATE_TRANSACTION_${finalStatus}`,
      entity: 'TRANSACTION',
      entityId: result.trxId,
      newData: {
        id: result.trxId,
        customer_id: finalCustomerId,
        customer_name_manual: finalManualCustomerName,
        sales_id: finalSalesId,
        amount: numericAmount,
        status: finalStatus,
        product: product.trim(),
      },
    });

    const [createdTrx] = await pool.query<any[]>('SELECT * FROM transactions WHERE id = ?', [result.trxId]);

    res.status(201).json({
      success: true,
      message: finalStatus === 'CLOSING'
        ? `Transaksi closing senilai Rp ${numericAmount.toLocaleString('id-ID')} berhasil dicatat!`
        : 'Transaksi pembatalan/cancel berhasil dicatat.',
      data: createdTrx[0],
    });
  } catch (err: any) {
    console.error('[Transaction createTransaction error]', err);
    res.status(500).json({ success: false, message: 'Gagal mencatat transaksi.' });
  }
}

export async function updateTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
  const trxId = parseInt(req.params.id, 10);

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM transactions WHERE id = ? LIMIT 1', [trxId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
      return;
    }

    const trx = rows[0];

    // Invoice-linked transactions are managed from the Invoice workflow only.
    // Keep their amount, status, date, and audit history consistent with the source invoice.
    if (trx.invoice_id !== undefined && trx.invoice_id !== null) {
      res.status(409).json({
        success: false,
        message: 'Transaksi yang terhubung ke Invoice dikelola melalui menu Invoice dan tidak dapat diedit langsung.',
      });
      return;
    }

    // Security: Sales can only edit transactions they own
    if (req.user?.role === 'SALES' && trx.sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Akses ditolak.' });
      return;
    }

    const { product, description, amount, status, transaction_date, notes } = req.body;

    let updatedProduct = product ? product.trim() : trx.product;
    let updatedDesc = description !== undefined ? description.trim() : trx.description;

    let updatedAmount = trx.amount;
    if (amount !== undefined) {
      const num = typeof amount === 'string' && amount.trim() === '' ? NaN : Number(amount);
      if (typeof amount === 'boolean' || isNaN(num) || !isFinite(num) || num < 0) {
        res.status(400).json({ success: false, message: 'Nominal transaksi tidak valid.' });
        return;
      }
      updatedAmount = num;
    }

    let updatedStatus = trx.status;
    if (status !== undefined) {
      if (!['CLOSING', 'CANCEL'].includes(status)) {
        res.status(400).json({ success: false, message: 'Status transaksi harus bernilai CLOSING atau CANCEL.' });
        return;
      }
      updatedStatus = status;
    }

    let updatedDate = trx.transaction_date;
    if (transaction_date !== undefined && transaction_date !== null && transaction_date !== '') {
      if (!isValidCalendarDate(transaction_date)) {
        res.status(400).json({ success: false, message: 'Format tanggal transaksi tidak valid (gunakan format YYYY-MM-DD yang sah).' });
        return;
      }
      updatedDate = String(transaction_date).trim();
    }

    let updatedNotes = notes !== undefined ? notes : trx.notes;

    await pool.execute(
      `UPDATE transactions SET
        product = ?, description = ?, amount = ?, status = ?,
        transaction_date = ?, notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [updatedProduct, updatedDesc, updatedAmount, updatedStatus, updatedDate, updatedNotes, trxId]
    );

    await logAudit({
      userId: req.user?.id,
      action: 'UPDATE_TRANSACTION',
      entity: 'TRANSACTION',
      entityId: trxId,
      oldData: trx,
      newData: { id: trxId, product: updatedProduct, amount: updatedAmount, status: updatedStatus },
    });

    const [updatedRows] = await pool.query<any[]>('SELECT * FROM transactions WHERE id = ?', [trxId]);

    res.json({
      success: true,
      message: 'Transaksi berhasil diperbarui.',
      data: updatedRows[0],
    });
  } catch (err: any) {
    console.error('[Transaction updateTransaction error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui transaksi.' });
  }
}

export async function deleteTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
  const trxId = parseInt(req.params.id, 10);

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM transactions WHERE id = ? LIMIT 1', [trxId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
      return;
    }

    const removed = rows[0];

    // Never delete a closing record linked to an Invoice. Cancellation keeps history.
    if (removed.invoice_id !== undefined && removed.invoice_id !== null) {
      res.status(409).json({
        success: false,
        message: 'Transaksi yang terhubung ke Invoice tidak dapat dihapus. Batalkan melalui menu Invoice agar riwayat tetap tersimpan.',
      });
      return;
    }

    await pool.execute('DELETE FROM transactions WHERE id = ?', [trxId]);

    await logAudit({
      userId: req.user?.id,
      action: 'DELETE_TRANSACTION',
      entity: 'TRANSACTION',
      entityId: trxId,
      oldData: removed,
    });

    res.json({
      success: true,
      message: 'Transaksi berhasil dihapus.',
    });
  } catch (err: any) {
    console.error('[Transaction deleteTransaction error]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus transaksi.' });
  }
}

export async function getOmzetOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isSales = req.user?.role === 'SALES';
    const todayStr = getTodayDateString();
    const currentMonth = todayStr.substring(0, 7);

    // 1. Customer summary
    const custFilterSql = isSales ? 'WHERE deleted_at IS NULL AND assigned_sales_id = ?' : 'WHERE deleted_at IS NULL';
    const custParams = isSales ? [req.user!.id] : [];

    const [custRows] = await pool.query<any[]>(
      `SELECT c.id, s.code AS status_code
       FROM customers c
       JOIN customer_statuses s ON c.status_id = s.id
       ${custFilterSql}`,
      custParams
    );

    const customerSummary = {
      total: custRows.length,
      prospek: 0,
      follow_up: 0,
      negosiasi: 0,
      closing: 0,
      cancel: 0,
      inactive: 0,
    };

    custRows.forEach(c => {
      const code = c.status_code || 'PROSPEK';
      if (code === 'PROSPEK' || code === 'NEW') customerSummary.prospek++;
      else if (code === 'FOLLOW_UP') customerSummary.follow_up++;
      else if (code === 'NEGOSIASI' || code === 'WAITING') customerSummary.negosiasi++;
      else if (code === 'CLOSING' || code === 'CUSTOMER') customerSummary.closing++;
      else if (code === 'CANCEL' || code === 'LOST') customerSummary.cancel++;
      else if (code === 'INACTIVE') customerSummary.inactive++;
    });

    // 3. Period-based financial summary for the Transactions page.
    // Closing omzet is recognized by transaction_date; cash receipts and refunds
    // are recognized by their own ledger dates. Pending refunds are not cash outflows.
    const requestedMonth = String(req.query.month || currentMonth.slice(5, 7));
    const requestedYear = String(req.query.year || currentMonth.slice(0, 4));
    if (!/^\d{2}$/.test(requestedMonth) || Number(requestedMonth) < 1 || Number(requestedMonth) > 12 ||
        !/^\d{4}$/.test(requestedYear)) {
      res.status(400).json({ success: false, message: 'Filter bulan atau tahun tidak valid.' });
      return;
    }
    const periodStart = `${requestedYear}-${requestedMonth}-01`;
    const periodEnd = new Date(Date.UTC(Number(requestedYear), Number(requestedMonth), 0))
      .toISOString().slice(0, 10);
    const yearStart = `${requestedYear}-01-01`;
    const yearEnd = `${requestedYear}-12-31`;
    const selectedSalesId = !isSales && req.query.sales_id && req.query.sales_id !== 'all'
      ? Number(req.query.sales_id) : null;

    // 2. Transactions
    const trxFilterSql = isSales
      ? 'WHERE sales_id = ?'
      : selectedSalesId ? 'WHERE sales_id = ?' : '';
    const trxParams = isSales
      ? [req.user!.id]
      : selectedSalesId ? [selectedSalesId] : [];

    const [trxRows] = await pool.query<any[]>(`SELECT * FROM transactions ${trxFilterSql}`, trxParams);

    const closings = trxRows.filter(t => t.status === 'CLOSING');
    const cancels = trxRows.filter(t => t.status === 'CANCEL');

    const totalOmzet = closings.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const omzetToday = closings
      .filter(t => t.transaction_date === todayStr)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const omzetThisMonth = closings
      .filter(t => String(t.transaction_date).startsWith(currentMonth))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    let omzetBySales: any[] = [];
    if (!isSales) {
      const salesBreakdownFilter = selectedSalesId ? ' AND u.id = ?' : '';
      const [salesUsers] = await pool.query<any[]>(
        `SELECT 
          u.id AS sales_id, u.name AS sales_name,
          COALESCE(SUM(t.amount), 0) AS omzet,
          COUNT(t.id) AS closing_count
         FROM users u
         LEFT JOIN transactions t
           ON t.sales_id = u.id
           AND t.status = 'CLOSING'
           AND t.transaction_date >= ?
           AND t.transaction_date <= ?
         WHERE u.role = 'SALES'${salesBreakdownFilter}
         GROUP BY u.id
         ORDER BY omzet DESC`,
        selectedSalesId
          ? [periodStart, periodEnd, selectedSalesId]
          : [periodStart, periodEnd]
      );
      omzetBySales = salesUsers.map(s => ({
        sales_id: s.sales_id,
        sales_name: s.sales_name,
        omzet: Number(s.omzet) || 0,
        closing_count: Number(s.closing_count) || 0,
      }));
    } else {
      omzetBySales = [
        {
          sales_id: req.user!.id,
          sales_name: req.user!.name,
          omzet: totalOmzet,
          closing_count: closings.length,
        },
      ];
    }

    const salesFilter = isSales
      ? ' AND t.sales_id = ?'
      : selectedSalesId ? ' AND t.sales_id = ?' : '';
    const salesParams = isSales ? [req.user!.id] : selectedSalesId ? [selectedSalesId] : [];

    const [periodOmzetRows] = await pool.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS closing_count
       FROM transactions t
       WHERE t.status = 'CLOSING' AND t.transaction_date >= ? AND t.transaction_date <= ?${salesFilter}`,
      [periodStart, periodEnd, ...salesParams]
    );

    const documentSalesFilter = isSales
      ? ' AND d.sales_id = ?'
      : selectedSalesId ? ' AND d.sales_id = ?' : '';
    const documentSalesParams = isSales ? [req.user!.id] : selectedSalesId ? [selectedSalesId] : [];

    // Aggregate payments and completed refunds independently to avoid multiplying
    // payment rows by refund rows in the join.
    const [receivedRows] = await pool.query<any[]>(
      `SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM sales_document_payments p
       JOIN sales_documents d ON d.id = p.document_id AND d.doc_type = 'INVOICE'
       JOIN customers c ON c.id = d.customer_id
       WHERE p.payment_date >= ? AND p.payment_date <= ?${documentSalesFilter}`,
      [periodStart, periodEnd, ...documentSalesParams]
    );
    const [refundRows] = await pool.query<any[]>(
      `SELECT COALESCE(SUM(r.amount), 0) AS total
       FROM sales_document_refunds r
       JOIN sales_documents d ON d.id = r.document_id AND d.doc_type = 'INVOICE'
       JOIN customers c ON c.id = d.customer_id
       WHERE r.status = 'COMPLETED' AND r.refund_date >= ? AND r.refund_date <= ?${documentSalesFilter}`,
      [periodStart, periodEnd, ...documentSalesParams]
    );

    const [receivableRows] = await pool.query<any[]>(
      `SELECT
         COALESCE(SUM(GREATEST(0, d.total_amount - COALESCE(NULLIF(p.total_paid, 0), d.paid_amount, 0))), 0) AS balance,
         COUNT(CASE WHEN GREATEST(0, d.total_amount - COALESCE(NULLIF(p.total_paid, 0), d.paid_amount, 0)) > 0 THEN 1 END) AS unpaid_count
       FROM sales_documents d
       JOIN customers c ON c.id = d.customer_id
       LEFT JOIN (
         SELECT document_id, SUM(amount) AS total_paid
         FROM sales_document_payments GROUP BY document_id
       ) p ON p.document_id = d.id
       WHERE d.doc_type = 'INVOICE'
         AND d.status NOT IN ('CANCELLED', 'CANCEL')
         AND GREATEST(0, d.total_amount - COALESCE(NULLIF(p.total_paid, 0), d.paid_amount, 0)) > 0${documentSalesFilter}`,
      documentSalesParams
    );

    const [annualRows] = await pool.query<any[]>(
      `SELECT MONTH(t.transaction_date) AS month,
              COALESCE(SUM(t.amount), 0) AS omzet,
              COUNT(*) AS closing_count
       FROM transactions t
       WHERE t.status = 'CLOSING' AND t.transaction_date >= ? AND t.transaction_date <= ?${salesFilter}
       GROUP BY MONTH(t.transaction_date)
       ORDER BY MONTH(t.transaction_date)`,
      [yearStart, yearEnd, ...salesParams]
    );
    const annualByMonth = new Map(annualRows.map(row => [Number(row.month), row]));
    const annualRecap = Array.from({ length: 12 }, (_, index) => {
      const row = annualByMonth.get(index + 1);
      return {
        month: index + 1,
        omzet: Number(row?.omzet) || 0,
        closing_count: Number(row?.closing_count) || 0,
      };
    });
    const received = Number(receivedRows[0]?.total) || 0;
    const refunded = Number(refundRows[0]?.total) || 0;

    res.json({
      success: true,
      data: {
        customer_summary: customerSummary,
        omzet_summary: {
          total_omzet: totalOmzet,
          closing_count: closings.length,
          cancel_count: cancels.length,
          cancel_amount: cancels.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
          omzet_this_month: omzetThisMonth,
          omzet_today: omzetToday,
          by_sales: omzetBySales,
        },
        period_summary: {
          month: requestedMonth,
          year: requestedYear,
          total_sales: Number(periodOmzetRows[0]?.total) || 0,
          closing_count: Number(periodOmzetRows[0]?.closing_count) || 0,
          payments_received: Math.round((received - refunded) * 100) / 100,
          gross_payments_received: received,
          completed_refunds: refunded,
          outstanding_receivables: Number(receivableRows[0]?.balance) || 0,
          unpaid_invoice_count: Number(receivableRows[0]?.unpaid_count) || 0,
        },
        annual_recap: annualRecap,
      },
    });
  } catch (err: any) {
    console.error('[Transaction getOmzetOverview error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat ringkasan omzet.' });
  }
}
