-- ========================================================
-- CRM CAPTAIN KONVEKSI V1.0 - IDEMPOTENT MASTER SEEDS
-- Safe to run repeatedly without overwriting existing data
-- Zero Hardcoded Passwords / Zero Secret Leaks
-- ========================================================

-- 1. CUSTOMER STATUSES (6 Standard CRM Pipeline Statuses)
-- Strategi Aman: Gunakan ON DUPLICATE KEY UPDATE id = id
-- Ini menjamin jika status sudah ada (berdasarkan id atau code unik),
-- konfigurasi warna, label, atau urutan yang telah disesuaikan Admin TIDAK AKAN DITIMPA.
INSERT INTO customer_statuses (id, code, label, color_code, sort_order, is_active, created_at, updated_at) VALUES
(1, 'PROSPEK', 'Prospek', '#3B82F6', 1, TRUE, NOW(), NOW()),
(2, 'FOLLOW_UP', 'Follow-Up', '#F59E0B', 2, TRUE, NOW(), NOW()),
(3, 'NEGOSIASI', 'Negosiasi', '#8B5CF6', 3, TRUE, NOW(), NOW()),
(4, 'CLOSING', 'Closing (Deal)', '#059669', 4, TRUE, NOW(), NOW()),
(5, 'CANCEL', 'Batal / Cancel', '#EF4444', 5, TRUE, NOW(), NOW()),
(6, 'INACTIVE', 'Tidak Aktif', '#6B7280', 6, TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE id = id;

-- 2. FOLLOW-UP RULES (Company Standard 4-Step Follow-Up Sequence)
-- Strategi Aman: Gunakan ON DUPLICATE KEY UPDATE id = id
-- Ini menjamin jika aturan tahapan follow-up sudah ada (berdasarkan id atau step_number unik),
-- interval hari atau nama aturan yang telah diatur Admin TIDAK AKAN DI-RESET ke default.
INSERT INTO follow_up_rules (id, step_number, name, interval_days, is_active, description, created_at, updated_at) VALUES
(1, 1, 'Follow-up 1 (Cek Kebutuhan & Katalog)', 3, TRUE, 'Follow-up 3 hari setelah kontak pertama', NOW(), NOW()),
(2, 2, 'Follow-up 2 (Penawaran Harga & Desain)', 7, TRUE, 'Follow-up 7 hari untuk detail penawaran', NOW(), NOW()),
(3, 3, 'Follow-up 3 (Sampel Kain & Negosiasi)', 14, TRUE, 'Follow-up 14 hari untuk keputusan sampel/mockup', NOW(), NOW()),
(4, 4, 'Follow-up 4 (Re-engagement / Promo)', 30, TRUE, 'Follow-up 30 hari untuk re-engagement jangka panjang', NOW(), NOW())
ON DUPLICATE KEY UPDATE id = id;

-- CATATAN KEAMANAN:
-- Akun Owner (cvcaptainindo@gmail.com) dan Template WhatsApp dipasang secara terpisah
-- melalui utilitas node `dist/bootstrap-owner.js`
-- untuk menjamin password diinput secara rahasia dan di-hash dengan BCrypt saat runtime.
