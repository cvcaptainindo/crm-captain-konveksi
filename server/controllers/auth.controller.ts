import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, User } from '../database/db.js';
import { AuthenticatedRequest, JWT_SECRET } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

/**
 * Public Sales Registration
 * New sales are created with account_status: 'PENDING' and is_active: false.
 * They CANNOT log in until approved by Admin/Owner.
 */
export function register(req: AuthenticatedRequest, res: Response) {
  const { name, email, phone, password, confirmPassword } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ success: false, message: 'Nama lengkap, email, dan password wajib diisi.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ success: false, message: 'Password minimal 6 karakter.' });
    return;
  }

  if (confirmPassword && password !== confirmPassword) {
    res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok.' });
    return;
  }

  const state = db.getState();
  const emailLower = email.trim().toLowerCase();
  const exists = state.users.find(u => u.email.toLowerCase() === emailLower);

  if (exists) {
    res.status(400).json({ success: false, message: 'Email sudah terdaftar dalam sistem.' });
    return;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const id = db.nextId('users');

  // Hard rule: Public registration ONLY creates SALES with PENDING status!
  const newUser: User = {
    id,
    name: name.trim(),
    email: emailLower,
    phone: phone ? phone.trim() : '',
    password_hash,
    role: 'SALES',
    account_status: 'PENDING',
    is_active: false,
    created_at: now,
    updated_at: now,
  };

  state.users.push(newUser);
  db.save();

  logAudit({
    userId: null,
    userName: newUser.name,
    action: 'REGISTER_SALES',
    entity: 'USER',
    entityId: newUser.id,
    ipAddress: req.ip || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'Browser',
    newData: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.account_status,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Pendaftaran berhasil! Akun Sales Anda berstatus PENDING dan sedang menunggu persetujuan Admin/Owner.',
    data: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      account_status: newUser.account_status,
    },
  });
}

/**
 * User Login
 * Enforces status checks: PENDING, REJECTED, INACTIVE accounts cannot login.
 */
export function login(req: AuthenticatedRequest, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    return;
  }

  const emailLower = email.trim().toLowerCase();
  const user = db.getState().users.find(u => u.email.toLowerCase() === emailLower);

  if (!user) {
    res.status(401).json({ success: false, message: 'Email atau password salah.' });
    return;
  }

  // Check account status
  if (user.account_status === 'PENDING') {
    res.status(403).json({
      success: false,
      message: 'Akun Sales Anda berstatus PENDING dan sedang menunggu persetujuan Admin/Owner.',
    });
    return;
  }

  if (user.account_status === 'REJECTED') {
    res.status(403).json({
      success: false,
      message: 'Pendaftaran akun Anda ditolak oleh Admin.',
    });
    return;
  }

  if (user.account_status === 'INACTIVE' || !user.is_active) {
    res.status(403).json({
      success: false,
      message: 'Akun Anda dinonaktifkan oleh Admin. Silakan hubungi Administrator.',
    });
    return;
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    res.status(401).json({ success: false, message: 'Email atau password salah.' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  logAudit({
    userId: user.id,
    userName: user.name,
    action: 'LOGIN',
    entity: 'USER',
    entityId: user.id,
    ipAddress: req.ip || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'Browser',
  });

  const { password_hash, ...safeUser } = user;
  res.json({
    success: true,
    message: 'Login berhasil.',
    token,
    user: safeUser,
  });
}

export function getMe(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Tidak terotentikasi.' });
    return;
  }

  const { password_hash, ...safeUser } = req.user;
  res.json({
    success: true,
    user: safeUser,
  });
}

/**
 * Update Profile for current logged-in user (Profil Saya)
 * Sales CANNOT change role or account_status (Security: Anti-Privilege Escalation)
 */
export function updateProfile(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Tidak terotentikasi.' });
    return;
  }

  const state = db.getState();
  const user = state.users.find(u => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    return;
  }

  const { name, phone, oldPassword, newPassword } = req.body;
  const oldData = { name: user.name, phone: user.phone };

  if (name && typeof name === 'string' && name.trim()) {
    user.name = name.trim();
  }

  if (phone !== undefined) {
    user.phone = phone ? phone.trim() : '';
  }

  // Handle password change
  if (newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
      return;
    }

    if (oldPassword) {
      const isOldMatch = bcrypt.compareSync(oldPassword, user.password_hash);
      if (!isOldMatch) {
        res.status(400).json({ success: false, message: 'Password lama Anda tidak sesuai.' });
        return;
      }
    }

    user.password_hash = bcrypt.hashSync(newPassword, 10);
  }

  user.updated_at = new Date().toISOString();
  db.save();

  logAudit({
    userId: user.id,
    userName: user.name,
    action: 'UPDATE_PROFILE',
    entity: 'USER',
    entityId: user.id,
    oldData,
    newData: { name: user.name, phone: user.phone },
  });

  const { password_hash: _, ...safeUser } = user;
  res.json({
    success: true,
    message: 'Profil berhasil diperbarui.',
    user: safeUser,
  });
}

/**
 * List all users (For sales assignment dropdowns)
 */
export function getUsers(req: AuthenticatedRequest, res: Response) {
  const users = db.getState().users.map(u => {
    const { password_hash, ...safe } = u;
    return safe;
  });

  res.json({
    success: true,
    data: users,
  });
}

/**
 * Admin: Get Sales Management list with stats (Customer count, Total Omzet, Status)
 */
export function getSalesManagementList(req: AuthenticatedRequest, res: Response) {
  const { status } = req.query;
  const state = db.getState();

  let salesUsers = state.users.filter(u => u.role === 'SALES');

  if (status && status !== 'all') {
    salesUsers = salesUsers.filter(u => u.account_status === status);
  }

  const enriched = salesUsers.map(u => {
    const { password_hash, ...safe } = u;
    const customerCount = state.customers.filter(c => c.assigned_sales_id === u.id && c.deleted_at === null).length;
    
    // Calculate total closing omzet for this sales
    const closingTransactions = (state.transactions || []).filter(
      t => t.sales_id === u.id && t.status === 'CLOSING'
    );
    const totalOmzet = closingTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const closingCount = closingTransactions.length;

    return {
      ...safe,
      customer_count: customerCount,
      closing_count: closingCount,
      total_omzet: totalOmzet,
    };
  });

  res.json({
    success: true,
    data: enriched,
  });
}

/**
 * Admin: Update Sales Account Status (Approve / Reject / Deactivate / Activate)
 */
export function updateSalesAccountStatus(req: AuthenticatedRequest, res: Response) {
  const userId = parseInt(req.params.id, 10);
  const { account_status } = req.body;

  const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'];
  if (!validStatuses.includes(account_status)) {
    res.status(400).json({ success: false, message: 'Status akun tidak valid.' });
    return;
  }

  const state = db.getState();
  const targetUser = state.users.find(u => u.id === userId);

  if (!targetUser) {
    res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    return;
  }

  if (targetUser.role === 'ADMIN' && account_status !== 'ACTIVE') {
    res.status(400).json({ success: false, message: 'Akun Admin tidak dapat dinonaktifkan.' });
    return;
  }

  const oldStatus = targetUser.account_status;
  targetUser.account_status = account_status;
  targetUser.is_active = (account_status === 'ACTIVE');
  targetUser.updated_at = new Date().toISOString();

  db.save();

  logAudit({
    userId: req.user?.id,
    userName: req.user?.name,
    action: `SALES_STATUS_${account_status}`,
    entity: 'USER',
    entityId: targetUser.id,
    oldData: { status: oldStatus },
    newData: { status: account_status, is_active: targetUser.is_active },
  });

  const { password_hash: _, ...safe } = targetUser;
  res.json({
    success: true,
    message: `Status akun ${targetUser.name} berhasil diubah menjadi ${account_status}.`,
    data: safe,
  });
}

/**
 * Admin: Reset Sales Password securely
 */
export function resetSalesPassword(req: AuthenticatedRequest, res: Response) {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
    return;
  }

  const state = db.getState();
  const targetUser = state.users.find(u => u.id === userId);

  if (!targetUser) {
    res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    return;
  }

  targetUser.password_hash = bcrypt.hashSync(newPassword, 10);
  targetUser.updated_at = new Date().toISOString();
  db.save();

  logAudit({
    userId: req.user?.id,
    userName: req.user?.name,
    action: 'ADMIN_RESET_PASSWORD',
    entity: 'USER',
    entityId: targetUser.id,
    newData: { targetUserId: targetUser.id, targetUserName: targetUser.name },
  });

  res.json({
    success: true,
    message: `Password untuk ${targetUser.name} berhasil direset.`,
  });
}

export function createUser(req: AuthenticatedRequest, res: Response) {
  const { name, email, phone, role, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    return;
  }

  const state = db.getState();
  const exists = state.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    res.status(400).json({ success: false, message: 'Email sudah terdaftar.' });
    return;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const id = db.nextId('users');

  const newUser: User = {
    id,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone || '',
    password_hash,
    role: role === 'ADMIN' ? 'ADMIN' : 'SALES',
    account_status: 'ACTIVE',
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  state.users.push(newUser);
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_USER',
    entity: 'USER',
    entityId: newUser.id,
    newData: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
  });

  const { password_hash: _, ...safe } = newUser;
  res.status(201).json({ success: true, message: 'User berhasil dibuat.', data: safe });
}

export function updateUser(req: AuthenticatedRequest, res: Response) {
  const userId = parseInt(req.params.id, 10);
  const { name, email, phone, role, is_active, account_status, password } = req.body;

  const state = db.getState();
  const user = state.users.find(u => u.id === userId);

  if (!user) {
    res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    return;
  }

  const oldData = { ...user };
  if (name) user.name = name;
  if (email) user.email = email.toLowerCase();
  if (phone !== undefined) user.phone = phone;
  if (role && (role === 'ADMIN' || role === 'SALES')) user.role = role;
  if (account_status) {
    user.account_status = account_status;
    user.is_active = (account_status === 'ACTIVE');
  } else if (is_active !== undefined) {
    user.is_active = Boolean(is_active);
    user.account_status = user.is_active ? 'ACTIVE' : 'INACTIVE';
  }
  if (password) {
    user.password_hash = bcrypt.hashSync(password, 10);
  }
  user.updated_at = new Date().toISOString();

  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_USER',
    entity: 'USER',
    entityId: user.id,
    oldData: { name: oldData.name, email: oldData.email, role: oldData.role, is_active: oldData.is_active },
    newData: { name: user.name, email: user.email, role: user.role, is_active: user.is_active },
  });

  const { password_hash: _, ...safe } = user;
  res.json({ success: true, message: 'Data user berhasil diperbarui.', data: safe });
}
