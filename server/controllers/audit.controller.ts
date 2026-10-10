import { Response } from 'express';
import { pool } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

export async function getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { action, entity, user_id, page = '1', limit = '25' } = req.query;

  try {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (action && action !== 'all') {
      conditions.push('a.action = ?');
      params.push(action);
    }

    if (entity && entity !== 'all') {
      conditions.push('a.entity = ?');
      params.push(entity);
    }

    if (user_id && user_id !== 'all') {
      conditions.push('a.user_id = ?');
      params.push(parseInt(user_id as string, 10));
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM audit_logs a WHERE ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    // Pagination
    const p = Math.max(1, parseInt(page as string, 10));
    const l = Math.max(1, parseInt(limit as string, 10));
    const offset = (p - 1) * l;

    const sql = `
      SELECT 
        a.*,
        COALESCE(u.name, 'System') AS user_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<any[]>(sql, [...params, l, offset]);

    const formatted = rows.map(r => ({
      ...r,
      old_data: typeof r.old_data === 'string' ? JSON.parse(r.old_data) : r.old_data,
      new_data: typeof r.new_data === 'string' ? JSON.parse(r.new_data) : r.new_data,
    }));

    res.json({
      success: true,
      data: formatted,
      meta: {
        page: p,
        limit: l,
        total,
        total_pages: Math.ceil(total / l),
      },
    });
  } catch (err: any) {
    console.error('[Audit getAuditLogs error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat log audit.' });
  }
}
