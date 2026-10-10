# PANDUAN DEPLOYMENT MANUAL & OPERASIONAL DATABASE MYSQL
## CRM CAPTAIN KONVEKSI V1.0 — NIAGAHOSTER HOSTING

Dokumen ini adalah panduan resmi deployment dan operasional CRM Captain Konveksi ke hosting Node.js Niagahoster dengan database produksi MySQL / MariaDB.

---

### A. ARSITEKTUR & PRASYARAT
- **Runtime:** Node.js v18+ atau v20+ / v22+
- **Database Engine:** MySQL 8.0+ atau MariaDB 10.4+ (Standar cPanel Niagahoster)
- **Koneksi Database:** `mysql2/promise` dengan Connection Pool & Parameterized Queries
- **Mode Deployment:** MANUAL (Tidak ada auto-deploy yang tidak terkontrol)

---

### B. LANGKAH 1 — PERSIAPAN DATABASE DI CPANEL NIAGAHOSTER

1. Masuk ke cPanel akun Niagahoster Anda.
2. Buka menu **MySQL® Databases**:
   - **Create New Database**: Buat database baru, misalnya: `uXXXXXXX_crm_captain_konveksi`.
   - **Create New User**: Buat database user baru, misalnya: `uXXXXXXX_crmcaptain`.
   - Buat password yang kuat dan catat dengan aman.
   - **Add User To Database**: Hubungkan user tersebut ke database dengan memberikan centang **ALL PRIVILEGES**.
3. Buka menu **phpMyAdmin** di cPanel:
   - Pilih database `uXXXXXXX_crm_captain_konveksi`.
   - Klik tab **Import** (atau tab **SQL**).
   - Unggah dan jalankan file `server/database/schema.sql` (Membuat 9 tabel relasional dengan indeks dan foreign key yang tepat).
   - Unggah dan jalankan file `server/database/seeds.sql` (Inisialisasi akun Owner, 6 status pelanggan standar, 4 aturan follow-up, dan 3 template WhatsApp default secara idempotent).

> **PENTING:** Jangan menjalankan file `demo_seed.sql` di database produksi agar data transaksi dan pelanggan asli tidak bercampur dengan data uji coba.

---

### C. LANGKAH 2 — KONFIGURASI ENVIRONMENT (.env)

Salin template `.env.example` menjadi `.env` di direktori proyek:
```bash
cp .env.example .env
```

Buka file `.env` dan sesuaikan nilainya:
```env
PORT=3000
NODE_ENV=production
APP_URL="https://crm.captainkonveksi.com"

# JWT Secret Wajib Minimal 32 Karakter Acak (Jangan gunakan default dev!)
# Buat string acak di terminal: openssl rand -base64 32
JWT_SECRET="ganti_dengan_random_secret_panjang_minimal_32_karakter"
JWT_EXPIRES_IN="24h"

# MySQL Database Credentials Niagahoster
DB_HOST="localhost"
DB_PORT=3306
DB_USER="uXXXXXXX_crmcaptain"
DB_PASSWORD="Password_Database_cPanel_Anda"
DB_NAME="uXXXXXXX_crm_captain_konveksi"
DB_CONNECTION_LIMIT=10
DB_CONNECT_TIMEOUT=10000
```

---

### D. LANGKAH 3 — BOOTSTRAP & VERIFIKASI AKUN OWNER

Untuk memastikan akun Owner `cvcaptainindo@gmail.com` aktif dan berstatus `ACTIVE` tanpa mereset password yang telah ada, jalankan perintah CLI:
```bash
npm run bootstrap:owner
```

Output yang diharapkan:
```
[INFO] Akun Owner (cvcaptainindo@gmail.com) sudah terdaftar (ID: 1).
[OK] Status akun Owner dipastikan ACTIVE & role ADMIN (Password hash tidak diubah).
```

---

### E. LANGKAH 4 — VERIFIKASI INDEPENDEN (TERMUX / SSH)

Sebelum aplikasi dijalankan untuk operasional, lakukan validasi penuh:

1. **Uji Test Suite Otomatis (21 Pengujian Komprehensif):**
   ```bash
   npm test
   ```
   *Wajib menghasilkan:* `TOTAL TESTS: 21 | PASSED: 21 | FAILED: 0 (EXIT CODE: 0)`.

2. **Validasi Sintaks & Tipe Data:**
   ```bash
   npm run lint
   ```
   *Wajib menghasilkan:* Exit code 0 tanpa error.

3. **Build Client & Server:**
   ```bash
   npm run build
   ```
   *Wajib menghasilkan:* `dist/index.html` dan `dist/server.js`.

---

### F. LANGKAH 5 — MENJALANKAN APLIKASI DI NIAGAHOSTER

#### Opsi A: Melalui Menu "Setup Node.js App" di cPanel
1. Buka menu **Setup Node.js App** di cPanel.
2. Klik **Create Application**:
   - **Node.js version:** Pilih 20.x atau 22.x
   - **Application mode:** `Production`
   - **Application root:** path folder proyek Anda
   - **Application startup file:** `dist/server.js` (atau `server.ts` jika memakai tsx)
3. Masukkan variabel environment dari file `.env` ke bagian **Environment variables**.
4. Klik **Start Application**.

#### Opsi B: Melalui Terminal SSH / PM2
Jika paket hosting mendukung SSH/Process Manager:
```bash
pm2 start dist/server.js --name "crm-captain" --env NODE_ENV=production
```

---

### G. LANGKAH 6 — VERIFIKASI HEALTH & READINESS ENDPOINTS

Periksa respons server melalui browser atau `curl`:

1. **Liveness Check:**
   ```bash
   curl -i http://localhost:3000/api/health
   ```
   Respons yang benar: `HTTP/1.1 200 OK` dengan status `ok` dan informasi koneksi database.

2. **Readiness Check (Kesiapan Database):**
   ```bash
   curl -i http://localhost:3000/api/ready
   ```
   Respons saat MySQL siap: `HTTP/1.1 200 OK`
   ```json
   {"ready": true, "database": "connected", "latencyMs": 2}
   ```
   *Catatan:* Jika MySQL belum berjalan atau kredensial salah, endpoint ini akan mengembalikan `HTTP 503 Service Unavailable` secara aman tanpa menyebabkan crash pada aplikasi.

---

### H. PROSEDUR BACKUP, RESTORE & ROLLBACK PLAN

#### 1. Prosedur Backup Rutin (MySQL Dump)
Jalankan perintah ini secara harian atau mingguan melalui cron job cPanel:
```bash
mysqldump -u uXXXXXXX_crmcaptain -p uXXXXXXX_crm_captain_konveksi > backup_crm_$(date +%Y%m%d_%H%M%S).sql
```

#### 2. Prosedur Restore Database
Untuk memulihkan data dari backup:
```bash
mysql -u uXXXXXXX_crmcaptain -p uXXXXXXX_crm_captain_konveksi < backup_crm_YYYYMMDD_HHMMSS.sql
```

#### 3. Rollback Plan
Jika terdapat kendala setelah pembaruan versi:
1. Hentikan aplikasi Node.js sementara melalui cPanel.
2. Kembalikan kode aplikasi ke tag/commit stabil sebelumnya (`git checkout <tag-sebelumnya>`).
3. Restore database ke snapshot sebelum migrasi jika terdapat perubahan skema.
4. Jalankan `npm test` dan `npm run build`.
5. Hidupkan kembali aplikasi dan verifikasi endpoint `/api/health` dan `/api/ready`.
