import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.js';

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Autentikasi diperlukan.' });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Akses ditolak. Fitur ini hanya dapat diakses oleh Administrator.',
    });
    return;
  }

  next();
}

export function requireRole(allowedRoles: Array<'ADMIN' | 'SALES'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Autentikasi diperlukan.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Akses ditolak. Peran Anda tidak memiliki izin untuk tindakan ini.',
      });
      return;
    }

    next();
  };
}
