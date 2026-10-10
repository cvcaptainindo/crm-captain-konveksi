# CRM CAPTAIN KONVEKSI V1.0

Aplikasi CRM dan sistem manajemen follow-up customer terstruktur untuk **Captain Konveksi**.
Dirancang untuk memastikan tidak ada prospek maupun pelanggan lama yang terlupakan dengan otomasi siklus tanggal jatuh tempo (*Overdue*, *Due Today*, *Upcoming*), template pesan WhatsApp dinamis, pencatatan histori aktivitas, dan RBAC (Admin & Sales).

---

## 🛡️ Akun Administrator Resmi

- **Email**: `cvcaptainindo@gmail.com`
- **Password**: `sholat5waktu`
- **Hak Akses**: Super Admin (Kelola pelanggan, persetujuan sales, aturan follow-up, template WA, recycle bin, audit log, dan ekspor data).

*(Akun tim sales baru dapat mendaftar langsung lewat form Registrasi Sales di halaman Login dan menunggu persetujuan Admin).*

---

## 🚀 Panduan Lengkap: Upload ke GitHub & Auto Deploy ke Hostinger

### BAGIAN 1: Upload Project ke Repository GitHub

1. **Buat Repository Baru di GitHub**:
   - Buka [GitHub.com](https://github.com) lalu klik tombol **New Repository**.
   - Beri nama repository, misalnya: `crm-captain-konveksi`.
   - Pilih visibilitas **Private** (disarankan untuk CRM internal) atau **Public**.
   - Jangan centang *"Initialize this repository with README"*, biarkan kosong.
   - Klik **Create repository**.

2. **Hubungkan & Push Code ke GitHub**:
   Di terminal komputer lokal Anda (atau di terminal server/applet ini):
   ```bash
   # 1. Tambahkan remote repository GitHub Anda (ganti username dengan akun GitHub Anda)
   git remote add origin https://github.com/USERNAME_ANDA/crm-captain-konveksi.git

   # 2. Pastikan branch utama bernama main
   git branch -M main

   # 3. Push seluruh codebase ke GitHub
   git push -u origin main
   ```
   *(Jika diminta autentikasi oleh GitHub, gunakan GitHub Personal Access Token / PAT sebagai password).*

---

### BAGIAN 2: Setup Database MySQL di Hostinger

1. Masuk ke **hPanel Hostinger** (atau cPanel).
2. Buka menu **Databases** → **Manajemen Database / MySQL Databases**.
3. Buat database baru:
   - **Nama Database**: misal `u123456_crmcaptain`
   - **Username MySQL**: misal `u123456_admin`
   - **Password**: simpan password ini dengan aman.
4. Buka **phpMyAdmin** untuk database tersebut:
   - Pilih tab **Import**.
   - Import file `server/database/schema.sql` (struktur tabel & relasi).
   - Import file `server/database/seeds.sql` (data awal & akun admin).

---

### BAGIAN 3: Setup Auto Deploy di Hostinger

Hostinger menyediakan 2 pilihan deployment tergantung paket hosting yang Anda miliki:

#### Pilihan A: Menggunakan Git Tool & Auto-Deployment di hPanel (Hostinger Web/Cloud Hosting)

1. Di hPanel Hostinger, buka menu **Tingkat Lanjut (Advanced)** → **Git**.
2. Masukkan konfigurasi repository:
   - **Repository**: `https://github.com/USERNAME_ANDA/crm-captain-konveksi.git`
   - **Branch**: `main`
   - **Direktori Instalasi**: biarkan default atau tentukan folder proyek (misal `public_html` atau `crm`).
3. Klik **Buat (Create)**.
4. Setelah repo terhubung, Hostinger akan menampilkan **Auto-Deployment Webhook URL**:
   - Salin URL Webhook tersebut (contoh: `https://srvXXX.main-hosting.eu/git-deploy/...`).
5. Buka repository Anda di **GitHub**:
   - Buka menu **Settings** → **Webhooks** → **Add webhook**.
   - Di kolom **Payload URL**, tempelkan URL Webhook dari Hostinger tadi.
   - **Content type**: pilih `application/json`.
   - **Which events**: pilih `Just the push event`.
   - Klik **Add webhook**.
6. **Selesai!** Setiap kali Anda melakukan `git push origin main` ke GitHub, Hostinger akan otomatis melakukan `git pull` dan sinkronisasi source code terbaru.

---

#### Pilihan B: Menggunakan Hostinger VPS / Cloud Server (PM2 + Auto Deploy)

Jika Anda menggunakan paket **VPS Hostinger** (Ubuntu / Debian):

1. **Clone project ke VPS**:
   ```bash
   cd ~
   git clone https://github.com/USERNAME_ANDA/crm-captain-konveksi.git
   cd crm-captain-konveksi
   ```

2. **Buat file `.env` di VPS**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Isi konfigurasi database Hostinger Anda:
   ```env
   PORT=3000
   NODE_ENV=production
   JWT_SECRET=rahasia_jwt_captain_konveksi_2026_super_aman
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=u123456_admin
   DB_PASSWORD=password_mysql_anda
   DB_NAME=u123456_crmcaptain
   ```

3. **Install Dependensi & Build**:
   ```bash
   npm install
   npm run build
   ```

4. **Jalankan Aplikasi dengan PM2**:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

5. **Auto-Deploy Script (`deploy.sh`)**:
   Untuk memperbarui aplikasi kapan saja, cukup jalankan:
   ```bash
   ./deploy.sh
   ```
   Atau aktifkan GitHub Actions di file `.github/workflows/deploy.yml` dengan mengisi SSH Secret di GitHub.

---

## 🛠️ Perintah Pengembangan (Scripts)

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan fullstack mode development (Express + Vite HMR) |
| `npm run build` | Melakukan build frontend React (`dist/`) dan backend server (`dist/server.js`) |
| `npm run start` | Menjalankan server Node.js produksi (`dist/server.js`) |
| `npm run lint` | Pengecekan tipe data TypeScript (`tsc --noEmit`) |
| `./deploy.sh` | Script otomatis pull, install, build, dan restart PM2 |

---

## 📞 Verifikasi Kesehatan API

Uji endpoint kesehatan sistem dengan perintah:
```bash
curl -s http://localhost:3000/api/health
```
Respons yang diharapkan:
```json
{"status":"ok","app":"CRM Captain Konveksi","version":"1.0.0"}
```
