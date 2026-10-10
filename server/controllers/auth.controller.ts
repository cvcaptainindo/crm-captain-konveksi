import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, User } from '../database/db.js';
import { AuthenticatedRequest, getJwtSecret } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

/**
 * Public Sales Registration
 * New sales are created with account_status: 'PENDING' and is_active: false.
 * They CANNOT log in until approved by Admin/Owner.
 */
export async function register(req: AuthenticatedRequest, res: Response): Promise<void> {
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

  try {
    const emailLower = email.trim().toLowerCase();
    const [existing] = await pool.query<any[]>(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [emailLower]
    );

    if (existing && existing.length > 0) {
      res.status(400).json({ success: false, message: 'Email sudah terdaftar dalam sistem.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const [result] = await pool.execute<any>(
      `INSERT INTO users (name, email, phone, password_hash, role, account_status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SALES', 'PENDING', FALSE, NOW(), NOW())`,
      [name.trim(), emailLower, phone ? phone.trim() : '', passwordHash]
    );

    const newUserId = result.insertId;

    await logAudit({
      userId: null,
      userName: name.trim(),
      action: 'REGISTER_SALES',
      entity: 'USER',
      entityId: newUserId,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Browser',
      newData: {
        id: newUserId,
        name: name.trim(),
        email: emailLower,
        role: 'SALES',
        status: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Pendaftaran berhasil! Akun Sales Anda berstatus PENDING dan sedang menunggu persetujuan Admin/Owner.',
      data: {
        id: newUserId,
        name: name.trim(),
        email: emailLower,
        role: 'SALES',
        account_status: 'PENDING',
      },
    });
  } catch (err: any) {
    console.error('[Auth register error]', err);
    res.status(500).json({ success: false, message: 'Gagal memproses pendaftaran. Terjadi kesalahan server.' });
  }
}

/**
 * User Login
 * Enforces status checks: PENDING, REJECTED, INACTIVE accounts cannot login.
 */
export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    return;
  }

  try {
    const emailLower = email.trim().toLowerCase();
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, email, phone, password_hash, role, account_status, is_active FROM users WHERE LOWER(email) = ? LIMIT 1',
      [emailLower]
    );

    if (!rows || rows.length === 0) {
      res.status(401).json({ success: false, message: 'Email atau password salah.' });
      return;
    }

    const user = rows[0];

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

    const secret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      secret,
      { expiresIn: expiresIn as any }
    );

    await logAudit({
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
  } catch (err: any) {
    console.error('[Auth login error]', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat memproses login.' });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
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
 * Anti-Privilege Escalation: Role and account_status cannot be modified through this endpoint.
 */
export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Tidak terotentikasi.' });
    return;
  }

  const { name, phone, oldPassword, newPassword } = req.body;

  try {
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, phone, password_hash, role, account_status, is_active FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const currentUser = rows[0];
    const oldData = { name: currentUser.name, phone: currentUser.phone };

    let updatedName = currentUser.name;
    let updatedPhone = currentUser.phone;
    let updatedPasswordHash = currentUser.password_hash;

    if (name && typeof name === 'string' && name.trim()) {
      updatedName = name.trim();
    }

    if (phone !== undefined) {
      updatedPhone = phone ? phone.trim() : '';
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
        return;
      }

      if (oldPassword) {
        const isOldMatch = bcrypt.compareSync(oldPassword, currentUser.password_hash);
        if (!isOldMatch) {
          res.status(400).json({ success: false, message: 'Password lama Anda tidak sesuai.' });
          return;
        }
      }

      updatedPasswordHash = bcrypt.hashSync(newPassword, 10);
    }

    await pool.execute(
      'UPDATE users SET name = ?, phone = ?, password_hash = ?, updated_at = NOW() WHERE id = ?',
      [updatedName, updatedPhone, updatedPasswordHash, req.user.id]
    );

    await logAudit({
      userId: req.user.id,
      userName: updatedName,
      action: 'UPDATE_PROFILE',
      entity: 'USER',
      entityId: req.user.id,
      oldData,
      newData: { name: updatedName, phone: updatedPhone },
    });

    const [updatedRows] = await pool.query<any[]>(
      'SELECT id, name, email, phone, role, account_status, is_active, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: updatedRows[0],
    });
  } catch (err: any) {
    console.error('[Auth updateProfile error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
  }
}

/**
 * List all users (For sales assignment dropdowns)
 */
export async function getUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, email, phone, role, account_status, is_active, created_at, updated_at FROM users ORDER BY name ASC'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err: any) {
    console.error('[Auth getUsers error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar user.' });
  }
}

/**
 * Admin: Get Sales Management list with stats (Customer count, Total Omzet, Status)
 */
export async function getSalesManagementList(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status } = req.query;

  try {
    let sql = `
      SELECT 
        u.id, u.name, u.email, u.phone, u.role, u.account_status, u.is_active, u.created_at, u.updated_at,
        COUNT(DISTINCT CASE WHEN c.deleted_at IS NULL THEN c.id END) AS customer_count,
        COUNT(DISTINCT CASE WHEN t.status = 'CLOSING' THEN t.id END) AS closing_count,
        COALESCE(SUM(CASE WHEN t.status = 'CLOSING' THEN t.amount ELSE 0 END), 0) AS total_omzet
      FROM users u
      LEFT JOIN customers c ON c.assigned_sales_id = u.id
      LEFT JOIN transactions t ON t.sales_id = u.id
      WHERE u.role = 'SALES'
    `;
    const params: any[] = [];

    if (status && status !== 'all') {
      sql += ' AND u.account_status = ?';
      params.push(status);
    }

    sql += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const [rows] = await pool.query<any[]>(sql, params);

    const formatted = rows.map(r => ({
      ...r,
      customer_count: Number(r.customer_count) || 0,
      closing_count: Number(r.closing_count) || 0,
      total_omzet: Number(r.total_omzet) || 0,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    console.error('[Auth getSalesManagementList error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat data manajemen sales.' });
  }
}

/**
 * Admin: Update Sales Account Status (Approve / Reject / Deactivate / Activate)
 */
export async function updateSalesAccountStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = parseInt(req.params.id, 10);
  const { account_status } = req.body;

  const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'];
  if (!validStatuses.includes(account_status)) {
    res.status(400).json({ success: false, message: 'Status akun tidak valid.' });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const targetUser = rows[0];

    if (targetUser.role === 'ADMIN' && account_status !== 'ACTIVE') {
      res.status(400).json({ success: false, message: 'Akun Admin tidak dapat dinonaktifkan.' });
      return;
    }

    const isActive = account_status === 'ACTIVE';

    await pool.execute(
      'UPDATE users SET account_status = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
      [account_status, isActive, userId]
    );

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: `SALES_STATUS_${account_status}`,
      entity: 'USER',
      entityId: userId,
      oldData: { status: targetUser.account_status, is_active: targetUser.is_active },
      newData: { status: account_status, is_active: isActive },
    });

    const [updatedRows] = await pool.query<any[]>(
      'SELECT id, name, email, phone, role, account_status, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      message: `Status akun ${targetUser.name} berhasil diubah menjadi ${account_status}.`,
      data: updatedRows[0],
    });
  } catch (err: any) {
    console.error('[Auth updateSalesAccountStatus error]', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah status akun sales.' });
  }
}

/**
 * Admin: Reset Sales Password securely
 */
export async function resetSalesPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>('SELECT id, name, email FROM users WHERE id = ? LIMIT 1', [userId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const targetUser = rows[0];
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    await pool.execute(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [passwordHash, userId]
    );

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'ADMIN_RESET_PASSWORD',
      entity: 'USER',
      entityId: userId,
      newData: { targetUserId: targetUser.id, targetUserName: targetUser.name },
    });

    res.json({
      success: true,
      message: `Password untuk ${targetUser.name} berhasil direset.`,
    });
  } catch (err: any) {
    console.error('[Auth resetSalesPassword error]', err);
    res.status(500).json({ success: false, message: 'Gagal mereset password.' });
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, email, phone, role, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    return;
  }

  try {
    const emailLower = email.toLowerCase().trim();
    const [existing] = await pool.query<any[]>('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [emailLower]);

    if (existing && existing.length > 0) {
      res.status(400).json({ success: false, message: 'Email sudah terdaftar.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const assignedRole = role === 'ADMIN' ? 'ADMIN' : 'SALES';

    const [result] = await pool.execute<any>(
      `INSERT INTO users (name, email, phone, password_hash, role, account_status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', TRUE, NOW(), NOW())`,
      [name.trim(), emailLower, phone ? phone.trim() : '', passwordHash, assignedRole]
    );

    const newId = result.insertId;

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE_USER',
      entity: 'USER',
      entityId: newId,
      newData: { id: newId, name: name.trim(), email: emailLower, role: assignedRole },
    });

    const [newUser] = await pool.query<any[]>(
      'SELECT id, name, email, phone, role, account_status, is_active, created_at, updated_at FROM users WHERE id = ?',
      [newId]
    );

    res.status(201).json({ success: true, message: 'User berhasil dibuat.', data: newUser[0] });
  } catch (err: any) {
    console.error('[Auth createUser error]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat user baru.' });
  }
}

export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = parseInt(req.params.id, 10);
  const { name, email, phone, role, is_active, account_status, password } = req.body;

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const user = rows[0];
    const oldData = { ...user };

    let updatedName = name ? name.trim() : user.name;
    let updatedEmail = email ? email.toLowerCase().trim() : user.email;
    let updatedPhone = phone !== undefined ? phone.trim() : user.phone;
    let updatedRole = (role === 'ADMIN' || role === 'SALES') ? role : user.role;
    let updatedStatus = account_status || user.account_status;
    let updatedIsActive = is_active !== undefined ? Boolean(is_active) : (updatedStatus === 'ACTIVE');
    let updatedPasswordHash = password ? bcrypt.hashSync(password, 10) : user.password_hash;

    await pool.execute(
      `UPDATE users 
       SET name = ?, email = ?, phone = ?, role = ?, account_status = ?, is_active = ?, password_hash = ?, updated_at = NOW()
       WHERE id = ?`,
      [updatedName, updatedEmail, updatedPhone, updatedRole, updatedStatus, updatedIsActive, updatedPasswordHash, userId]
    );

    await logAudit({
      userId: req.user?.id,
      action: 'UPDATE_USER',
      entity: 'USER',
      entityId: userId,
      oldData: { name: oldData.name, email: oldData.email, role: oldData.role, is_active: oldData.is_active },
      newData: { name: updatedName, email: updatedEmail, role: updatedRole, is_active: updatedIsActive },
    });

    const [updatedRows] = await pool.query<any[]>(
      'SELECT id, name, email, phone, role, account_status, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ success: true, message: 'Data user berhasil diperbarui.', data: updatedRows[0] });
  } catch (err: any) {
    console.error('[Auth updateUser error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui data user.' });
  }
}
