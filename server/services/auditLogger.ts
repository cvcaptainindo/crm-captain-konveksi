import { db } from '../database/db.js';

export interface AuditLogParams {
  userId?: number | null;
  userName?: string;
  action: string;
  entity: string;
  entityId?: number | null;
  ipAddress?: string;
  userAgent?: string;
  oldData?: any;
  newData?: any;
}

export function logAudit(params: AuditLogParams) {
  try {
    const state = db.getState();
    const id = db.nextId('audit_logs');
    const now = new Date().toISOString();

    state.audit_logs.unshift({
      id,
      user_id: params.userId ?? null,
      user_name: params.userName || (params.userId ? state.users.find(u => u.id === params.userId)?.name : 'System'),
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      ip_address: params.ipAddress || '127.0.0.1',
      user_agent: params.userAgent || 'Applet Client',
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
      created_at: now,
    });

    // Cap audit logs at 1000 items in memory to prevent runaway memory
    if (state.audit_logs.length > 1000) {
      state.audit_logs = state.audit_logs.slice(0, 1000);
    }

    db.save();
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
}
