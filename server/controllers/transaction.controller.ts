import { Response } from 'express';
import { pool, withTransaction, Transaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

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
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    if (period === 'today') {
      conditions.push('t.transaction_date = ?');
      params.push(todayStr);
    } else if (period === 'this_week') {
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      const mondayStr = monday.toISOString().split('T')[0];
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
        LOWER(COALESCE(c.company_name, '')) LIKE ?
      )`);
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT 
        t.*,
        COALESCE(c.name, 'Customer Terhapus') AS customer_name,
        COALESCE(c.company_name, '-') AS company_name,
        COALESCE(c.whatsapp_number, '-') AS whatsapp_number,
        COALESCE(u.name, 'Sales Staff') AS sales_name
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
    product,
    description,
    amount,
    status = 'CLOSING',
    transaction_date,
    notes,
    update_customer_status = true,
  } = req.body;

  if (!customer_id || !product || amount === undefined) {
    res.status(400).json({ success: false, message: 'Customer, nama produk, dan nominal transaksi wajib diisi.' });
    return;
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount < 0) {
    res.status(400).json({ success: false, message: 'Nominal transaksi harus berupa angka positif.' });
    return;
  }

  try {
    const custId = parseInt(customer_id, 10);
    const [cRows] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ? LIMIT 1', [custId]);

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    const customer = cRows[0];

    // Security Check: Sales can ONLY record transaction for their own customer
    if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const finalDate = transaction_date || today;
    const finalStatus = status === 'CANCEL' ? 'CANCEL' : 'CLOSING';

    const result = await withTransaction(async (conn) => {
      const [insertRes] = await conn.execute<any>(
        `INSERT INTO transactions (
          customer_id, sales_id, transaction_date, product, description,
          amount, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          customer.id,
          customer.assigned_sales_id,
          finalDate,
          product.trim(),
          description ? description.trim() : '',
          numericAmount,
          finalStatus,
          notes ? notes.trim() : '',
        ]
      );

      const trxId = insertRes.insertId;

      if (update_customer_status) {
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
        customer_id: customer.id,
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
      const num = Number(amount);
      if (!isNaN(num) && num >= 0) updatedAmount = num;
    }
    let updatedStatus = (status === 'CLOSING' || status === 'CANCEL') ? status : trx.status;
    let updatedDate = transaction_date || trx.transaction_date;
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
    const todayStr = new Date().toISOString().split('T')[0];
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

    // 2. Transactions
    const trxFilterSql = isSales ? 'WHERE sales_id = ?' : '';
    const trxParams = isSales ? [req.user!.id] : [];

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
      const [salesUsers] = await pool.query<any[]>(
        `SELECT 
          u.id AS sales_id, u.name AS sales_name,
          COALESCE(SUM(CASE WHEN t.status = 'CLOSING' THEN t.amount ELSE 0 END), 0) AS omzet,
          COUNT(CASE WHEN t.status = 'CLOSING' THEN 1 END) AS closing_count
         FROM users u
         LEFT JOIN transactions t ON t.sales_id = u.id
         WHERE u.role = 'SALES'
         GROUP BY u.id
         ORDER BY omzet DESC`
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
      },
    });
  } catch (err: any) {
    console.error('[Transaction getOmzetOverview error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat ringkasan omzet.' });
  }
}
