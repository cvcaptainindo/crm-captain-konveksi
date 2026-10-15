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

export interface PromptHiddenPasswordOptions {
  input?: any;
  output?: any;
}

/**
 * Prompts user for hidden/masked password input via TTY.
 * Strictly throws if TTY is not available — never falls back to plain readline
 * to guarantee characters are never echoed or visible in logs/terminals.
 *
 * Robustly filters out all ANSI escape sequences:
 * - CSI: terminal queries/replies (\x1b[?1;2c, \x1b[24;80R, \x1b[I, arrow keys, etc.)
 * - SS3: application keypad (\x1bOA, \x1bOP, etc.)
 * - OSC: window title / palette queries (\x1b]0;...\x07 or \x1b]...\x1b\)
 * - DCS, PM, APC, and 2-byte escape sequences
 * Handles CRLF and orphaned trailing LF across packet boundaries, Backspace (\x7f / \x08),
 * Ctrl+U (clear line), and Ctrl+C cleanly, with full listener detachment and raw mode restoration
 * across all paths (Enter, Ctrl+C, error, stream end).
 */
export function promptHiddenPassword(
  questionText: string,
  options?: PromptHiddenPasswordOptions
): Promise<string> {
  const input = options?.input || process.stdin;
  const output = options?.output || process.stdout;

  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      return reject(new Error('TTY_NOT_AVAILABLE'));
    }

    output.write(questionText);

    let password = '';
    let isFinished = false;

    // Parser state for multi-byte ANSI escape sequences
    let inEscape = false;
    let escapeBuffer = '';

    const cleanup = () => {
      if (typeof input.setRawMode === 'function') {
        try {
          input.setRawMode(false);
        } catch {}
      }
      if (typeof input.pause === 'function') {
        try {
          input.pause();
        } catch {}
      }
      if (typeof input.removeListener === 'function') {
        try {
          input.removeListener('data', onData);
          input.removeListener('error', onError);
          input.removeListener('end', onEnd);
        } catch {}
      }
    };

    // Do not call input.read() to drain the stream; discarding buffered data could throw
    // away valid user input or pasted passwords. All ANSI/terminal sequences are safely
    // filtered in real time by the parser in onData.

    if (typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    if (typeof input.resume === 'function') {
      input.resume();
    }
    if (typeof input.setEncoding === 'function') {
      input.setEncoding('utf-8');
    }

    const onError = (err: any) => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      reject(err);
    };

    const onEnd = () => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      if (password.length > 0) {
        output.write('\n');
        resolve(password);
      } else {
        reject(new Error('STREAM_ENDED_BEFORE_INPUT'));
      }
    };

    const onData = (data: Buffer | string) => {
      if (isFinished) return;

      const str = typeof data === 'string' ? data : data.toString('utf-8');

      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        // 1. Process active ANSI escape sequence
        if (inEscape) {
          escapeBuffer += char;

          // Guard against runaway buffer on malformed sequence
          if (escapeBuffer.length > 256) {
            inEscape = false;
            escapeBuffer = '';
            continue;
          }

          if (
            escapeBuffer === '\x1b[' ||
            escapeBuffer === '\x1bO' ||
            escapeBuffer === '\x1b]' ||
            escapeBuffer === '\x1bP' ||
            escapeBuffer === '\x1b^' ||
            escapeBuffer === '\x1b_'
          ) {
            // Sequence prefix received, continue collecting parameters
            continue;
          } else if (escapeBuffer.startsWith('\x1b[')) {
            // CSI sequence: ends with final byte (0x40-0x7E)
            if (code >= 0x40 && code <= 0x7e) {
              inEscape = false;
              escapeBuffer = '';
            }
            continue;
          } else if (escapeBuffer.startsWith('\x1bO')) {
            // SS3 sequence: ends with final byte (0x40-0x7E)
            if (code >= 0x40 && code <= 0x7e) {
              inEscape = false;
              escapeBuffer = '';
            }
            continue;
          } else if (
            escapeBuffer.startsWith('\x1b]') ||
            escapeBuffer.startsWith('\x1bP') ||
            escapeBuffer.startsWith('\x1b^') ||
            escapeBuffer.startsWith('\x1b_')
          ) {
            // OSC / DCS / PM / APC: ends with BEL (\x07) or ST (\x1b\)
            if (char === '\x07' || escapeBuffer.endsWith('\x1b\\')) {
              inEscape = false;
              escapeBuffer = '';
            }
            continue;
          } else {
            // 2-byte escape sequence completed (e.g. \x1b=, \x1b>, \x1bM, etc.)
            inEscape = false;
            escapeBuffer = '';
            continue;
          }
        }

        // 2. Detect start of ANSI escape sequence (\x1b / ESC / 27)
        if (char === '\x1b') {
          inEscape = true;
          escapeBuffer = '\x1b';
          continue;
        }

        // 3. Enter key / Finished (CR = \r / 13, LF = \n / 10, EOT = Ctrl+D / \u0004)
        if (char === '\r' || char === '\n' || char === '\u0004') {
          // If this was \r and the immediately following character in the same chunk is \n, consume it
          if (char === '\r' && i + 1 < str.length && str[i + 1] === '\n') {
            i++;
          }

          // If no characters typed yet:
          // An orphaned \n (LF following \r across packet boundaries) or empty Enter must NOT submit empty password.
          if (password.length === 0) {
            // Allow Ctrl+D to reject on empty input, otherwise wait for real user input
            if (char === '\u0004') {
              isFinished = true;
              cleanup();
              reject(new Error('EOF_RECEIVED'));
              return;
            }
            continue;
          }

          // Valid submission with non-empty password
          isFinished = true;
          cleanup();
          output.write('\n');
          resolve(password);
          return;
        }

        // 4. Ctrl+C (\u0003) -> Cancellation
        if (char === '\u0003') {
          isFinished = true;
          cleanup();
          output.write('\n');
          reject(new Error('USER_CANCELLED'));
          return;
        }

        // 5. Backspace (\x7f / DEL or \x08 / BS)
        if (char === '\x7f' || char === '\x08') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }

        // 6. Ctrl+U (\x15) -> Clear line
        if (char === '\x15') {
          if (password.length > 0) {
            output.write('\b \b'.repeat(password.length));
            password = '';
          }
          continue;
        }

        // 7. Valid printable characters
        // Only accept printable characters (ASCII 32-126 or valid non-control Unicode)
        const isPrintable =
          (code >= 32 && code <= 126) ||
          (code > 127 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(char));

        if (isPrintable) {
          password += char;
          output.write('*');
        }
        // Non-printable control characters (TAB, NULL, BEL, etc.) are safely ignored
      }
    };

    input.on('data', onData);
    input.on('error', onError);
    input.on('end', onEnd);
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
      let pass1 = '';
      let pass2 = '';
      try {
        pass1 = await promptHiddenPassword('Password Baru Owner       : ');
        pass2 = await promptHiddenPassword('Konfirmasi Password Owner : ');
      } catch (promptErr: any) {
        if (promptErr.message === 'USER_CANCELLED') {
          console.log('\n[DIBATALKAN] Proses bootstrap dibatalkan oleh pengguna.');
          process.exitCode = 130;
          return;
        }
        throw promptErr;
      }

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
    // 6. Pastikan terminal selalu dipulihkan ke normal mode (rawMode = false)
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      try {
        process.stdin.setRawMode(false);
      } catch {}
    }
    // 7. Tangani penutupan koneksi pool database dengan benar
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
