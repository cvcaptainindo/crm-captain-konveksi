#!/bin/bash
# ========================================================
# CRM CAPTAIN KONVEKSI - AUTO DEPLOYMENT SCRIPT
# Jalankan script ini di server Hostinger setelah git pull
# ========================================================

set -e

echo "🚀 [Deploy] Memulai proses deployment..."

# 1. Pastikan branch main terupdate
git pull origin main

# 2. Install dependensi
echo "📦 [Deploy] Menginstall dependensi npm..."
npm install

# 3. Build frontend (Vite) & backend (esbuild)
echo "⚙️ [Deploy] Membangun client & server..."
npm run build

# 4. Restart aplikasi di PM2 (jika menggunakan PM2 di VPS / Cloud)
if command -v pm2 &> /dev/null; then
  echo "🔄 [Deploy] Merestart service PM2..."
  pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs
fi

echo "✅ [Deploy] Sukses! CRM Captain Konveksi berjalan."
