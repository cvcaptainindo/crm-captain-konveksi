import { pool } from '../database/db.js';

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

function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const clone = Array.isArray(data) ? [...data] : { ...data };
  const sensitiveKeys = ['password', 'password_hash', 'token', 'jwt', 'secret', 'authorization'];
  
  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      clone[key] = '[REDACTED]';
    } else if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = sanitizeData(clone[key]);
    }
  }
  return clone;
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const cleanOld = params.oldData ? JSON.stringify(sanitizeData(params.oldData)) : null;
    const cleanNew = params.newData ? JSON.stringify(sanitizeData(params.newData)) : null;

    await pool.execute(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, ip_address, user_agent, old_data, new_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        params.userId ?? null,
        params.action,
        params.entity,
        params.entityId ?? null,
        params.ipAddress || '127.0.0.1',
        params.userAgent || 'Applet Client',
        cleanOld,
        cleanNew,
      ]
    );
  } catch (err: any) {
    // Non-blocking error handling: never fail business transaction due to audit log failure
    console.warn('[AuditLog] Warning: Gagal mencatat audit log ke MySQL:', err.message);
  }
}
