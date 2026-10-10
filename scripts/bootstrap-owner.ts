import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { pool, testDbConnection } from '../server/database/db.js';

dotenv.config();

const OWNER_EMAIL = 'cvcaptainindo@gmail.com';
const DEFAULT_PASSWORD = 'sholat5waktu';

async function bootstrapOwner() {
  console.log('========================================================');
  console.log('CRM CAPTAIN KONVEKSI - OWNER BOOTSTRAP UTILITY');
  console.log('========================================================');

  const connectionTest = await testDbConnection();
  if (!connectionTest.ok) {
    console.error('[ERROR] Gagal terhubung ke MySQL:', connectionTest.message);
    console.error('Pastikan variabel DB_HOST, DB_USER, DB_PASSWORD, dan DB_NAME sudah benar.');
    process.exit(1);
  }

  try {
    const [existing] = await pool.query<any[]>(
      'SELECT id, name, email, role, account_status, is_active FROM users WHERE email = ? LIMIT 1',
      [OWNER_EMAIL]
    );

    if (existing && existing.length > 0) {
      const user = existing[0];
      console.log(`[INFO] Akun Owner (${OWNER_EMAIL}) sudah terdaftar (ID: ${user.id}).`);
      
      // Ensure role and account_status are active without touching password_hash
      await pool.execute(
        'UPDATE users SET role = "ADMIN", account_status = "ACTIVE", is_active = TRUE, updated_at = NOW() WHERE id = ?',
        [user.id]
      );
      console.log('[OK] Status akun Owner dipastikan ACTIVE & role ADMIN (Password hash tidak diubah).');
    } else {
      console.log(`[INFO] Membuat akun Owner baru: ${OWNER_EMAIL}...`);
      const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
      
      const [res] = await pool.execute<any>(
        `INSERT INTO users (name, email, phone, password_hash, role, account_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', TRUE, NOW(), NOW())`,
        ['Owner Captain Konveksi', OWNER_EMAIL, '6281122334455', passwordHash]
      );

      console.log(`[SUKSES] Akun Owner berhasil dibuat dengan ID: ${res.insertId}.`);
    }

    console.log('========================================================');
    console.log('Proses bootstrap selesai.');
    process.exit(0);
  } catch (err: any) {
    console.error('[ERROR] Terjadi kesalahan saat bootstrap akun owner:', err.message);
    process.exit(1);
  }
}

bootstrapOwner();
