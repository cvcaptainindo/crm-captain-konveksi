import { Response } from 'express';
import { pool, withTransaction, Customer, CustomerCustomRule } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  calculateDaysSinceContact,
  determineFollowUpCategory,
  computeCustomerNextFollowUp,
  getTodayDateString,
} from '../services/followUpEngine.js';
import { sanitizeWhatsAppPhone } from '../services/templateParser.js';
import { logAudit } from '../services/auditLogger.js';

export async function getCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    search,
    status_id,
    sales_id,
    fu_status,
    page = '1',
    limit = '15',
    sort_by = 'next_follow_up_date',
    sort_dir = 'asc',
  } = req.query;

  try {
    const conditions: string[] = ['c.deleted_at IS NULL'];
    const params: any[] = [];

    // 1. SALES role scoping: strictly only assigned customers
    if (req.user?.role === 'SALES') {
      conditions.push('c.assigned_sales_id = ?');
      params.push(req.user.id);
    } else if (sales_id && sales_id !== 'all') {
      conditions.push('c.assigned_sales_id = ?');
      params.push(parseInt(sales_id as string, 10));
    }

    // 2. Status filter
    if (status_id && status_id !== 'all') {
      conditions.push('c.status_id = ?');
      params.push(parseInt(status_id as string, 10));
    }

    // 3. Search filter
    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(c.name) LIKE ? OR
        LOWER(COALESCE(c.company_name, '')) LIKE ? OR
        LOWER(COALESCE(c.pic_name, '')) LIKE ? OR
        LOWER(COALESCE(c.city, '')) LIKE ? OR
        c.whatsapp_number LIKE ? OR
        LOWER(COALESCE(c.customer_code, '')) LIKE ?
      )`);
      params.push(q, q, q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // Query all matching rows to calculate accurate follow-up categories
    const sql = `
      SELECT 
        c.*,
        s.code AS status_code, s.label AS status_label, s.color_code AS status_color_code, s.sort_order AS status_sort_order,
        u.name AS sales_name, u.email AS sales_email
      FROM customers c
      JOIN customer_statuses s ON c.status_id = s.id
      LEFT JOIN users u ON c.assigned_sales_id = u.id
      WHERE ${whereClause}
    `;

    const [rows] = await pool.query<any[]>(sql, params);

    // Enrich with follow-up calculation
    const enrichedList = rows.map(c => {
      const category = determineFollowUpCategory(c.next_follow_up_date, c.status_code);
      const daysSince = calculateDaysSinceContact(c.last_contact_date);

      return {
        ...c,
        status: {
          id: c.status_id,
          code: c.status_code,
          label: c.status_label,
          color_code: c.status_color_code,
          sort_order: c.status_sort_order,
        },
        sales: c.assigned_sales_id ? { id: c.assigned_sales_id, name: c.sales_name, email: c.sales_email } : null,
        fu_status: category,
        days_since_contact: daysSince,
      };
    });

    let filtered = enrichedList;
    if (fu_status && fu_status !== 'all') {
      filtered = enrichedList.filter(c => c.fu_status === fu_status);
    }

    // Safe sorting
    const allowedSortFields = ['name', 'company_name', 'next_follow_up_date', 'last_contact_date', 'created_at'];
    const safeSortBy = allowedSortFields.includes(sort_by as string) ? (sort_by as string) : 'next_follow_up_date';
    const isDesc = (sort_dir as string).toLowerCase() === 'desc';

    filtered.sort((a, b) => {
      let valA = (a as any)[safeSortBy] ?? '';
      let valB = (b as any)[safeSortBy] ?? '';
      if (valA < valB) return isDesc ? 1 : -1;
      if (valA > valB) return isDesc ? -1 : 1;
      return 0;
    });

    // Pagination (Robust parsing protecting against NaN, negative values, and unbounded limit)
    const rawPage = parseInt(page as string, 10);
    const rawLimit = parseInt(limit as string, 10);
    const p = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;
    const l = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;
    const total = filtered.length;
    const totalPages = Math.ceil(total / l) || 1;
    const paginated = filtered.slice((p - 1) * l, p * l);

    res.json({
      success: true,
      data: paginated,
      meta: {
        page: p,
        limit: l,
        total,
        total_pages: totalPages,
      },
    });
  } catch (err: any) {
    console.error('[Customer getCustomers error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat data pelanggan.' });
  }
}

export async function getCustomerById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.id, 10);

  try {
    const [cRows] = await pool.query<any[]>(
      `SELECT 
        c.*,
        s.code AS status_code, s.label AS status_label, s.color_code AS status_color_code, s.sort_order AS status_sort_order,
        u.name AS sales_name, u.email AS sales_email, u.phone AS sales_phone
       FROM customers c
       JOIN customer_statuses s ON c.status_id = s.id
       LEFT JOIN users u ON c.assigned_sales_id = u.id
       WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [customerId]
    );

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    const customer = cRows[0];

    // Permission check for SALES
    if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke customer ini.' });
      return;
    }

    // Query custom rules
    const [customRules] = await pool.query<any[]>(
      'SELECT * FROM customer_custom_rules WHERE customer_id = ? ORDER BY step_number ASC',
      [customerId]
    );

    // Query follow-up activities
    const [activities] = await pool.query<any[]>(
      `SELECT a.*, u.name AS user_name, t.title AS template_name
       FROM follow_up_activities a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN whatsapp_templates t ON a.template_id = t.id
       WHERE a.customer_id = ?
       ORDER BY a.activity_date DESC`,
      [customerId]
    );

    // Query transactions
    const [transactions] = await pool.query<any[]>(
      'SELECT * FROM transactions WHERE customer_id = ? ORDER BY transaction_date DESC, id DESC',
      [customerId]
    );

    const totalOmzet = transactions
      .filter((t: any) => t.status === 'CLOSING')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);

    const fuStatus = determineFollowUpCategory(customer.next_follow_up_date, customer.status_code);
    const daysSinceContact = calculateDaysSinceContact(customer.last_contact_date);

    res.json({
      success: true,
      data: {
        ...customer,
        status: {
          id: customer.status_id,
          code: customer.status_code,
          label: customer.status_label,
          color_code: customer.status_color_code,
        },
        sales: customer.assigned_sales_id
          ? { id: customer.assigned_sales_id, name: customer.sales_name, email: customer.sales_email, phone: customer.sales_phone }
          : null,
        fu_status: fuStatus,
        days_since_contact: daysSinceContact,
        custom_rules: customRules,
        activities,
        transactions,
        total_omzet: totalOmzet,
      },
    });
  } catch (err: any) {
    console.error('[Customer getCustomerById error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat detail pelanggan.' });
  }
}

export async function createCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    name,
    company_name,
    whatsapp_number,
    phone_number,
    email,
    address,
    city,
    pic_name,
    assigned_sales_id,
    status_id,
    notes,
    use_custom_rule,
    custom_rules,
  } = req.body;

  if (!name || !whatsapp_number) {
    res.status(400).json({ success: false, message: 'Nama dan nomor WhatsApp wajib diisi.' });
    return;
  }

  try {
    const today = getTodayDateString();
    const sanitizedWA = sanitizeWhatsAppPhone(whatsapp_number);
    const assignedSales = (req.user?.role === 'ADMIN' && assigned_sales_id)
      ? parseInt(assigned_sales_id, 10)
      : req.user!.id;
    const statusId = status_id ? parseInt(status_id, 10) : 1; // Default PROSPEK

    const result = await withTransaction(async (conn) => {
      // 1. Insert customer with provisional code
      const [insertRes] = await conn.execute<any>(
        `INSERT INTO customers (
          customer_code, name, company_name, whatsapp_number, phone_number,
          email, address, city, pic_name, assigned_sales_id, status_id,
          notes, use_custom_rule, current_rule_step, last_contact_date,
          next_follow_up_date, deleted_at, created_at, updated_at
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, NULL, NOW(), NOW())`,
        [
          name.trim(),
          company_name ? company_name.trim() : '',
          sanitizedWA,
          phone_number ? phone_number.trim() : '',
          email ? email.trim() : '',
          address ? address.trim() : '',
          city ? city.trim() : '',
          pic_name ? pic_name.trim() : '',
          assignedSales,
          statusId,
          notes || '',
          Boolean(use_custom_rule),
          today,
        ]
      );

      const customerId = insertRes.insertId;
      const customerCode = `CK-${String(customerId).padStart(4, '0')}`;

      // 2. Insert custom rules if any
      if (Boolean(use_custom_rule) && Array.isArray(custom_rules) && custom_rules.length > 0) {
        for (let i = 0; i < custom_rules.length; i++) {
          const cr = custom_rules[i];
          await conn.execute(
            `INSERT INTO customer_custom_rules (customer_id, step_number, interval_days, created_at, updated_at)
             VALUES (?, ?, ?, NOW(), NOW())`,
            [customerId, i + 1, parseInt(cr.interval_days, 10) || 7]
          );
        }
      }

      // 3. Compute first follow-up date
      const { nextDate } = await computeCustomerNextFollowUp(
        { id: customerId, use_custom_rule: Boolean(use_custom_rule), current_rule_step: 1 },
        false
      );

      // 4. Update customer_code and next_follow_up_date
      await conn.execute(
        'UPDATE customers SET customer_code = ?, next_follow_up_date = ? WHERE id = ?',
        [customerCode, nextDate, customerId]
      );

      return { customerId, customerCode, nextDate };
    });

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE_CUSTOMER',
      entity: 'CUSTOMER',
      entityId: result.customerId,
      newData: {
        id: result.customerId,
        code: result.customerCode,
        name: name.trim(),
        company: company_name,
        assigned_sales_id: assignedSales,
        next_follow_up_date: result.nextDate,
      },
    });

    const [createdRows] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ?', [result.customerId]);

    res.status(201).json({
      success: true,
      message: 'Customer baru berhasil ditambahkan.',
      data: createdRows[0],
    });
  } catch (err: any) {
    console.error('[Customer createCustomer error]', err);
    res.status(500).json({ success: false, message: 'Gagal menambahkan customer baru.' });
  }
}

export async function updateCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.id, 10);

  try {
    const [cRows] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1', [customerId]);

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    const customer = cRows[0];

    // Permission check for SALES
    if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Akses ditolak.' });
      return;
    }

    const {
      name,
      company_name,
      whatsapp_number,
      phone_number,
      email,
      address,
      city,
      pic_name,
      assigned_sales_id,
      status_id,
      notes,
      use_custom_rule,
      custom_rules,
      next_follow_up_date,
    } = req.body;

    let updatedName = name ? name.trim() : customer.name;
    let updatedCompany = company_name !== undefined ? company_name.trim() : customer.company_name;
    let updatedWA = whatsapp_number ? sanitizeWhatsAppPhone(whatsapp_number) : customer.whatsapp_number;
    let updatedPhone = phone_number !== undefined ? phone_number.trim() : customer.phone_number;
    let updatedEmail = email !== undefined ? email.trim() : customer.email;
    let updatedAddress = address !== undefined ? address.trim() : customer.address;
    let updatedCity = city !== undefined ? city.trim() : customer.city;
    let updatedPic = pic_name !== undefined ? pic_name.trim() : customer.pic_name;
    let updatedStatusId = status_id ? parseInt(status_id, 10) : customer.status_id;
    let updatedNotes = notes !== undefined ? notes : customer.notes;
    let updatedNextDate = next_follow_up_date || customer.next_follow_up_date;
    let updatedSalesId = customer.assigned_sales_id;

    if (req.user?.role === 'ADMIN' && assigned_sales_id) {
      updatedSalesId = parseInt(assigned_sales_id, 10);
    }

    let updatedUseCustom = use_custom_rule !== undefined ? Boolean(use_custom_rule) : customer.use_custom_rule;

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE customers SET
          name = ?, company_name = ?, whatsapp_number = ?, phone_number = ?,
          email = ?, address = ?, city = ?, pic_name = ?, assigned_sales_id = ?,
          status_id = ?, notes = ?, use_custom_rule = ?, next_follow_up_date = ?,
          updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
        [
          updatedName,
          updatedCompany,
          updatedWA,
          updatedPhone,
          updatedEmail,
          updatedAddress,
          updatedCity,
          updatedPic,
          updatedSalesId,
          updatedStatusId,
          updatedNotes,
          updatedUseCustom,
          updatedNextDate,
          customerId,
        ]
      );

      if (use_custom_rule !== undefined && updatedUseCustom && Array.isArray(custom_rules)) {
        await conn.execute('DELETE FROM customer_custom_rules WHERE customer_id = ?', [customerId]);
        for (let i = 0; i < custom_rules.length; i++) {
          const cr = custom_rules[i];
          await conn.execute(
            `INSERT INTO customer_custom_rules (customer_id, step_number, interval_days, created_at, updated_at)
             VALUES (?, ?, ?, NOW(), NOW())`,
            [customerId, i + 1, parseInt(cr.interval_days, 10) || 7]
          );
        }
      }
    });

    await logAudit({
      userId: req.user?.id,
      action: 'UPDATE_CUSTOMER',
      entity: 'CUSTOMER',
      entityId: customerId,
      oldData: customer,
      newData: { id: customerId, name: updatedName, company: updatedCompany },
    });

    const [updatedRows] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ?', [customerId]);

    res.json({
      success: true,
      message: 'Data customer berhasil diperbarui.',
      data: updatedRows[0],
    });
  } catch (err: any) {
    console.error('[Customer updateCustomer error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui data customer.' });
  }
}

export async function softDeleteCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.id, 10);

  try {
    const [cRows] = await pool.query<any[]>('SELECT id, name FROM customers WHERE id = ? LIMIT 1', [customerId]);

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    await pool.execute('UPDATE customers SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [customerId]);

    await logAudit({
      userId: req.user?.id,
      action: 'SOFT_DELETE_CUSTOMER',
      entity: 'CUSTOMER',
      entityId: customerId,
      newData: { id: customerId, name: cRows[0].name, deleted_at: new Date().toISOString() },
    });

    res.json({
      success: true,
      message: 'Customer dipindahkan ke Trash (Soft Delete).',
    });
  } catch (err: any) {
    console.error('[Customer softDeleteCustomer error]', err);
    res.status(500).json({ success: false, message: 'Gagal memindahkan customer ke Trash.' });
  }
}

export async function getTrashCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const sql = `
      SELECT 
        c.*,
        s.label AS status_label, s.color_code AS status_color_code,
        u.name AS sales_name
      FROM customers c
      JOIN customer_statuses s ON c.status_id = s.id
      LEFT JOIN users u ON c.assigned_sales_id = u.id
      WHERE c.deleted_at IS NOT NULL
      ORDER BY c.deleted_at DESC
    `;

    const [rows] = await pool.query<any[]>(sql);

    const formatted = rows.map(c => ({
      ...c,
      status: { id: c.status_id, label: c.status_label, color_code: c.status_color_code },
      sales: c.assigned_sales_id ? { id: c.assigned_sales_id, name: c.sales_name } : null,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    console.error('[Customer getTrashCustomers error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat data Trash.' });
  }
}

export async function restoreCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.id, 10);

  try {
    const [cRows] = await pool.query<any[]>(
      'SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1',
      [customerId]
    );

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan di Trash.' });
      return;
    }

    await pool.execute('UPDATE customers SET deleted_at = NULL, updated_at = NOW() WHERE id = ?', [customerId]);

    await logAudit({
      userId: req.user?.id,
      action: 'RESTORE_CUSTOMER',
      entity: 'CUSTOMER',
      entityId: customerId,
      newData: { id: customerId, name: cRows[0].name },
    });

    res.json({
      success: true,
      message: 'Customer berhasil dipulihkan dari Trash.',
    });
  } catch (err: any) {
    console.error('[Customer restoreCustomer error]', err);
    res.status(500).json({ success: false, message: 'Gagal memulihkan customer dari Trash.' });
  }
}

export async function permanentDeleteCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.id, 10);

  try {
    const [cRows] = await pool.query<any[]>('SELECT id, customer_code, name FROM customers WHERE id = ? LIMIT 1', [customerId]);

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    // Business Data Retention Policy: Check if customer has closing/cancel transactions
    const [trxRows] = await pool.query<any[]>(
      'SELECT COUNT(*) AS trx_count FROM transactions WHERE customer_id = ?',
      [customerId]
    );

    const trxCount = Number(trxRows[0]?.trx_count) || 0;
    if (trxCount > 0) {
      res.status(400).json({
        success: false,
        message: 'Pelanggan memiliki riwayat transaksi/omzet dan tidak boleh dihapus permanen demi audit keuangan. Gunakan Soft Delete (Trash) atau Nonaktifkan status akun pelanggan.',
      });
      return;
    }

    // Atomic permanent deletion for customer with no transactions
    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM customer_custom_rules WHERE customer_id = ?', [customerId]);
      await conn.execute('DELETE FROM follow_up_activities WHERE customer_id = ?', [customerId]);
      await conn.execute('DELETE FROM customers WHERE id = ?', [customerId]);
    });

    await logAudit({
      userId: req.user?.id,
      action: 'PERMANENT_DELETE_CUSTOMER',
      entity: 'CUSTOMER',
      entityId: customerId,
      oldData: cRows[0],
    });

    res.json({
      success: true,
      message: 'Customer dan seluruh relasi histori follow-up berhasil dihapus permanen.',
    });
  } catch (err: any) {
    console.error('[Customer permanentDeleteCustomer error]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus customer permanen.' });
  }
}

export async function getStatuses(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM customer_statuses WHERE is_active = TRUE ORDER BY sort_order ASC'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err: any) {
    console.error('[Customer getStatuses error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat status pelanggan.' });
  }
}
