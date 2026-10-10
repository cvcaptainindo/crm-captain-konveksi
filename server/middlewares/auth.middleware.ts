import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool, User } from '../database/db.js';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      throw new Error('[SECURITY FATAL] JWT_SECRET wajib dikonfigurasi dalam environment variable di lingkungan produksi!');
    }
    return 'captain_konveksi_crm_dev_fallback_secret_key_2026';
  }
  return secret;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as { id: number; email: string; role: string };

    const [rows] = await pool.query<any[]>(
      'SELECT id, name, email, phone, role, account_status, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (!rows || rows.length === 0) {
      res.status(401).json({ success: false, message: 'Sesi login tidak valid. Pengguna tidak ditemukan.' });
      return;
    }

    const user = rows[0] as User;

    if (!user.is_active || user.account_status !== 'ACTIVE') {
      res.status(401).json({ success: false, message: 'Akun Anda dinonaktifkan atau belum disetujui oleh Admin.' });
      return;
    }

    req.user = user;
    next();
  } catch (err: any) {
    res.status(401).json({ success: false, message: 'Token telah kadaluarsa atau tidak valid.' });
    return;
  }
}
