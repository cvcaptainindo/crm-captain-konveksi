import { Response } from 'express';
import { db } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

export function getAuditLogs(req: AuthenticatedRequest, res: Response) {
  const { action, entity, user_id, page = '1', limit = '25' } = req.query;

  const state = db.getState();
  let logs = [...state.audit_logs];

  if (action && action !== 'all') {
    logs = logs.filter(l => l.action === action);
  }
  if (entity && entity !== 'all') {
    logs = logs.filter(l => l.entity === entity);
  }
  if (user_id && user_id !== 'all') {
    logs = logs.filter(l => l.user_id === parseInt(user_id as string, 10));
  }

  // Sort latest first
  logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const p = Math.max(1, parseInt(page as string, 10));
  const l = Math.max(1, parseInt(limit as string, 10));
  const total = logs.length;
  const paginated = logs.slice((p - 1) * l, p * l);

  res.json({
    success: true,
    data: paginated,
    meta: {
      page: p,
      limit: l,
      total,
      total_pages: Math.ceil(total / l),
    },
  });
}
