import { Response } from 'express';
import { pool } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { determineFollowUpCategory, calculateDaysSinceContact, getTodayDateString, getStartOfWeekDateString } from '../services/followUpEngine.js';
import { generateCustomerExport, generateActivityExport, generateTransactionExport } from '../services/exportService.js';
import { logAudit } from '../services/auditLogger.js';

export async function exportCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    format = 'xlsx',
    search,
    status_id,
    sales_id,
    fu_status,
  } = req.query;

  try {
    const conditions: string[] = ['c.deleted_at IS NULL'];
    const params: any[] = [];

    if (req.user?.role === 'SALES') {
      conditions.push('c.assigned_sales_id = ?');
      params.push(req.user.id);
    } else if (sales_id && sales_id !== 'all') {
      conditions.push('c.assigned_sales_id = ?');
      params.push(parseInt(sales_id as string, 10));
    }

    if (status_id && status_id !== 'all') {
      conditions.push('c.status_id = ?');
      params.push(parseInt(status_id as string, 10));
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(c.name) LIKE ? OR
        LOWER(COALESCE(c.company_name, '')) LIKE ? OR
        LOWER(COALESCE(c.city, '')) LIKE ? OR
        c.whatsapp_number LIKE ?
      )`);
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT 
        c.*,
        s.label AS status_label, s.code AS status_code,
        u.name AS sales_name
      FROM customers c
      JOIN customer_statuses s ON c.status_id = s.id
      LEFT JOIN users u ON c.assigned_sales_id = u.id
      WHERE ${whereClause}
      ORDER BY c.name ASC
    `;

    const [rows] = await pool.query<any[]>(sql, params);

    let list = rows.map(c => ({
      ...c,
      fu_status: determineFollowUpCategory(c.next_follow_up_date, c.status_code),
    }));

    if (fu_status && fu_status !== 'all') {
      list = list.filter(c => c.fu_status === fu_status);
    }

    const exportType = format === 'csv' ? 'csv' : 'xlsx';
    const { buffer, mimeType, filename } = generateCustomerExport(list, exportType);

    await logAudit({
      userId: req.user?.id,
      action: 'EXPORT_CUSTOMERS',
      entity: 'CUSTOMER',
      newData: { count: list.length, format: exportType },
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[Export exportCustomers error]', err);
    res.status(500).json({ success: false, message: 'Gagal mengekspor data pelanggan.' });
  }
}

export async function exportActivities(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { format = 'xlsx', customer_id, include_trash } = req.query;

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    // Filter soft-deleted customers by default to align with exportCustomers
    if (include_trash !== 'true' || req.user?.role !== 'ADMIN') {
      conditions.push('c.deleted_at IS NULL');
    }

    if (req.user?.role === 'SALES') {
      conditions.push('c.assigned_sales_id = ?');
      params.push(req.user.id);
    }

    if (customer_id && customer_id !== 'all') {
      conditions.push('a.customer_id = ?');
      params.push(parseInt(customer_id as string, 10));
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    const sql = `
      SELECT 
        a.*,
        c.name AS customer_name, c.company_name AS company_name,
        u.name AS user_name,
        t.title AS template_title
      FROM follow_up_activities a
      JOIN customers c ON a.customer_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN whatsapp_templates t ON a.template_id = t.id
      WHERE ${whereClause}
      ORDER BY a.activity_date DESC
    `;

    const [rows] = await pool.query<any[]>(sql, params);

    const exportType = format === 'csv' ? 'csv' : 'xlsx';
    const { buffer, mimeType, filename } = generateActivityExport(rows, exportType);

    await logAudit({
      userId: req.user?.id,
      action: 'EXPORT_ACTIVITIES',
      entity: 'FOLLOW_UP',
      newData: { count: rows.length, format: exportType },
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[Export exportActivities error]', err);
    res.status(500).json({ success: false, message: 'Gagal mengekspor histori follow-up.' });
  }
}

export async function exportTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { format = 'xlsx', sales_id, status, period, start_date, end_date, search } = req.query;

  try {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (req.user?.role === 'SALES') {
      conditions.push('t.sales_id = ?');
      params.push(req.user.id);
    } else if (sales_id && sales_id !== 'all') {
      conditions.push('t.sales_id = ?');
      params.push(parseInt(sales_id as string, 10));
    }

    if (status && status !== 'all') {
      conditions.push('t.status = ?');
      params.push(status);
    }

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
        c.company_name AS company_name,
        COALESCE(u.name, '-') AS sales_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.sales_id = u.id
      WHERE ${whereClause}
      ORDER BY t.transaction_date DESC, t.id DESC
    `;

    const [rows] = await pool.query<any[]>(sql, params);

    const exportType = format === 'csv' ? 'csv' : 'xlsx';
    const { buffer, mimeType, filename } = generateTransactionExport(rows, exportType);

    await logAudit({
      userId: req.user?.id,
      action: 'EXPORT_TRANSACTIONS',
      entity: 'TRANSACTION',
      newData: { count: rows.length, format: exportType },
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[Export exportTransactions error]', err);
    res.status(500).json({ success: false, message: 'Gagal mengekspor transaksi.' });
  }
}
