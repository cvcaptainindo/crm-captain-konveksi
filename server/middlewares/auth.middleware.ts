import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, User } from '../database/db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'captain_konveksi_crm_secret_jwt_key_2026_super_secure';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
    const user = db.getState().users.find(u => u.id === decoded.id && u.is_active);

    if (!user) {
      res.status(401).json({ success: false, message: 'Sesi login tidak valid atau akun dinonaktifkan.' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token telah kadaluarsa atau tidak valid.' });
    return;
  }
}
