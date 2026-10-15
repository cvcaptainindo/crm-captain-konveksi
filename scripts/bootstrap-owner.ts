import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { pool, testDbConnection } from '../server/database/db.js';

dotenv.config();

export const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'cvcaptainindo@gmail.com').trim().toLowerCase();

export const FORBIDDEN_PASSWORDS = [
  'password',
  'password123',
  '12345678',
  '123456789',
  'admin123',
  'admin1234',
  'qwerty1234',
];

/**
 * Validates password strength according to corporate security standards.
 * Requirements:
 * - Minimum 8 characters
 * - Must contain letters and numbers/symbols
 * - Must not be in forbidden/common password list
 */
export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password tidak boleh kosong.' };
  }

  const trimmed = password.trim();

  if (trimmed.length < 8) {
    return { isValid: false, error: 'Password minimal 8 karakter demi keamanan akun Owner.' };
  }

  if (FORBIDDEN_PASSWORDS.includes(trimmed.toLowerCase())) {
    return { isValid: false, error: 'Password terlalu umum dan mudah ditebak. Gunakan kombinasi yang lebih kuat.' };
  }

  const hasLetters = /[a-zA-Z]/.test(trimmed);
  const hasNumbersOrSymbols = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed);

  if (!hasLetters || !hasNumbersOrSymbols) {
    return {
      isValid: false,
      error: 'Password harus mengombinasikan huruf dengan angka atau karakter simbol khusus.',
    };
  }

  return { isValid: true };
}

const DEFAULT_TEMPLATES = [
  {
    title: 'Follow-up Penawaran Konveksi',
    code: 'FU_PENAWARAN',
    category: 'FOLLOW_UP',
    content:
      'Halo Bapak/Ibu {{nama_customer}} dari {{perusahaan}},\n\nSalam dari Captain Konveksi. Izin konfirmasi apakah penawaran seragam {{produk}} yang kami kirimkan sebelumnya sudah sempat dipelajari?\n\nJika ada penyesuaian bahan kain atau target deadline, kami siap diskusikan.\n\nTerima kasih,\n{{nama_sales}}\nCaptain Konveksi',
  },
  {
    title: 'Follow-up Sampel Kain & Mockup',
    code: 'FU_SAMPEL',
    category: 'FOLLOW_UP',
    content:
      'Selamat siang {{nama_customer}},\n\nSemoga sehat selalu. Mengenai rencana pesanan {{produk}} untuk {{perusahaan}}, apakah berkenan kami kirimkan sampel bahan kain atau mockup desain preview?\n\nKami siap kirimkan langsung ke alamat Bapak/Ibu.\n\nSalam hangat,\n{{nama_sales}}\nCaptain Konveksi',
  },
  {
    title: 'Re-engagement Promo Khusus',
    code: 'FU_REENGAGE',
    category: 'PROMO',
    content:
      'Halo {{nama_customer}},\n\nApa kabar {{perusahaan}}? Kami dari Captain Konveksi ingin mengabarkan bahwa saat ini ada promo potongan khusus untuk pemesanan rompi, kemeja, dan jaket konveksi {{produk}}.\n\nApakah dalam waktu dekat ada agenda pengadaan seragam tim?\n\nTerima kasih,\n{{nama_sales}}',
  },
];

/**
 * Prompts user for hidden/masked password input via TTY.
 * Strictly throws if TTY is not available — never falls back to plain readline
 * to guarantee characters are never echoed or visible in logs/terminals.
 */
export function promptHiddenPassword(questionText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      return reject(new Error('TTY_NOT_AVAILABLE'));
    }

    process.stdout.write(questionText);
    let password = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    const onData = (data: Buffer | string) => {
      const str = data.toString();
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n[DIBATALKAN] Proses bootstrap dibatalkan oleh pengguna.\n');
          process.exit(130);
        } else if (char === '\u0008' || char === '\x7f') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

export async function seedDefaultTemplates(ownerId: number) {
  try {
    for (const tpl of DEFAULT_TEMPLATES) {
      await pool.execute(
        `INSERT INTO whatsapp_templates (title, code, category, content, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, TRUE, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE code = code`,
        [tpl.title, tpl.code, tpl.category, tpl.content, ownerId]
      );
    }
    console.log(`[OK] Template WhatsApp default terverifikasi/terpasang untuk Owner ID: ${ownerId}.`);
  } catch (err: any) {
    console.warn('[WARN] Pemasangan template WhatsApp dilewati (tabel belum siap):', err.message);
  }
}

export async function bootstrapOwner() {
  console.log('========================================================');
  console.log('CRM CAPTAIN KONVEKSI V1.0 — SECURE OWNER BOOTSTRAP');
  console.log('========================================================');
  console.log(`Target Email Owner : ${OWNER_EMAIL}`);

  // Keamanan Wajib: Larang pengiriman password via argumen command line
  if (process.argv.length > 2) {
    console.error('\n[PELANGGARAN KEAMANAN DITOLAK]');
    console.error('Pengiriman password atau data sensitif via argumen baris perintah (CLI arguments)');
    console.error('DILARANG KERAS karena akan terekam pada riwayat shell (history) dan daftar proses (ps aux / /proc).');
    console.error('\nSilakan jalankan script tanpa argumen CLI:');
    console.error('  node dist/bootstrap-owner.js');
    console.error('Lalu masukkan password secara rahasia dan interaktif saat diminta.');
    process.exitCode = 1;
    return;
  }

  // 1. Verifikasi koneksi MySQL
  const connectionTest = await testDbConnection();
  if (!connectionTest.ok) {
    console.error('\n[FATAL] Gagal terhubung ke MySQL:', connectionTest.message);
    console.error('Pastikan environment variable DB_HOST, DB_USER, DB_PASSWORD, dan DB_NAME sudah valid di file .env.');
    process.exitCode = 1;
    return;
  }

  try {
    // 2. Periksa apakah akun Owner sudah ada di tabel users SEBELUM meminta password
    const [existing] = await pool.query<any[]>(
      'SELECT id, name, email, role, account_status, is_active FROM users WHERE email = ? LIMIT 1',
      [OWNER_EMAIL]
    );

    if (existing && existing.length > 0) {
      const user = existing[0];
      console.log(`\n[INFO] Akun Owner (${OWNER_EMAIL}) sudah ada di database dengan ID: ${user.id}.`);

      // Idempoten: Pastikan role ADMIN dan status ACTIVE tanpa meminta password dan tanpa menimpa password_hash
      await pool.execute(
        'UPDATE users SET role = "ADMIN", account_status = "ACTIVE", is_active = TRUE, updated_at = NOW() WHERE id = ?',
        [user.id]
      );
      console.log('[OK] Kebijakan status akun Owner dipastikan ACTIVE & role ADMIN.');
      console.log('[KEAMANAN] Password TIDAK diminta dan hash password Owner TIDAK pernah diubah (terlindungi utuh).');

      await seedDefaultTemplates(Number(user.id));

      console.log('========================================================');
      console.log('[SUKSES] Akun Owner aktif dan siap digunakan.');
      console.log('========================================================');
      return;
    }

    // 3. Akun Owner belum ada: minta input password secara rahasia
    console.log(`\n[INFO] Akun Owner (${OWNER_EMAIL}) belum ada di database.`);
    console.log('[KEAMANAN] Tidak ada password default yang ditanam dalam sistem.');

    let rawPassword = (process.env.OWNER_PASSWORD || '').trim();

    if (!rawPassword) {
      // Jika TTY tidak tersedia, tolak readline biasa untuk mencegah karakter terlihat di layar / log
      if (!process.stdin.isTTY) {
        console.error('\n[AKSES DITOLAK: TTY TIDAK TERSEDIA]');
        console.error('Terminal interaktif (TTY) tidak terdeteksi.');
        console.error('Sistem MENOLAK meminta password via input teks biasa demi mencegah karakter terlihat di log/layar.');
        console.error('\nUntuk lingkungan non-TTY (seperti dashboard web Hostinger, automasi CI/CD, atau headless runner):');
        console.error('Silakan sediakan environment variable OWNER_PASSWORD sementara sebelum menjalankan script:');
        console.error('  read -s -p "Password Owner: " OWNER_PASSWORD && export OWNER_PASSWORD');
        console.error('  node dist/bootstrap-owner.js');
        console.error('  unset OWNER_PASSWORD');
        console.error('--------------------------------------------------------');
        process.exitCode = 1;
        return;
      }

      console.log('\nSilakan masukkan password baru untuk akun Owner (input tersamar / tanda bintang):');
      const pass1 = await promptHiddenPassword('Password Baru Owner       : ');
      const pass2 = await promptHiddenPassword('Konfirmasi Password Owner : ');

      if (pass1 !== pass2) {
        console.error('\n[ERROR] Password konfirmasi tidak cocok. Proses dibatalkan.');
        process.exitCode = 1;
        return;
      }
      rawPassword = pass1.trim();
    }

    // Validasi kekuatan password
    const validation = validatePasswordStrength(rawPassword);
    if (!validation.isValid) {
      console.error(`\n[ERROR KEAMANAN] ${validation.error}`);
      process.exitCode = 1;
      return;
    }

    console.log('\n[INFO] Melakukan enkripsi password menggunakan BCrypt (cost factor: 10)...');
    const passwordHash = bcrypt.hashSync(rawPassword, 10);

    // 4. Masukkan akun Owner baru ke tabel users
    const [res] = await pool.execute<any>(
      `INSERT INTO users (name, email, phone, password_hash, role, account_status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', TRUE, NOW(), NOW())`,
      ['Owner Captain Konveksi', OWNER_EMAIL, '6281122334455', passwordHash]
    );

    const newOwnerId = Number(res.insertId);
    console.log(`[SUKSES] Akun Owner berhasil dibuat dengan User ID: ${newOwnerId}.`);
    console.log(`[INFO] Email : ${OWNER_EMAIL}`);
    console.log(`[INFO] Role  : ADMIN`);
    console.log(`[INFO] Status: ACTIVE`);
    console.log('[KEAMANAN] Password telah di-hash secara aman dan tidak pernah dicatat dalam log.');

    // 5. Pasang template WhatsApp default
    await seedDefaultTemplates(newOwnerId);

    console.log('========================================================');
    console.log('[SUKSES] Seluruh proses bootstrap akun Owner selesai.');
    console.log('========================================================');
  } catch (err: any) {
    console.error('\n[FATAL ERROR] Gagal melakukan bootstrap akun Owner:', err.message);
    process.exitCode = 1;
  } finally {
    // 6. Tangani penutupan koneksi pool database dengan benar
    try {
      await pool.end();
    } catch {
      // Abaikan penutupan pool jika sudah tertutup
    }
  }
}

// Hanya jalankan otomatis jika dipanggil langsung sebagai executable script
const isExecutable =
  process.argv[1] &&
  (process.argv[1].endsWith('bootstrap-owner.ts') || process.argv[1].endsWith('bootstrap-owner.js'));

if (isExecutable) {
  bootstrapOwner().catch((err) => {
    console.error('[UNHANDLED FATAL]', err.message);
    process.exit(1);
  });
}
