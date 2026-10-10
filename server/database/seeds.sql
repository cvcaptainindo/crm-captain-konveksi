-- ========================================================
-- CRM CAPTAIN KONVEKSI V1.0 - IDEMPOTENT PRODUCTION SEEDS
-- Safe to run repeatedly without overwriting existing passwords
-- ========================================================

-- 1. USERS: Bootstrap Permanent Owner Account
-- Password default: 'sholat5waktu' (hash $2b$10$uvsobIC2dXI3l893JFhjBOjT99mP0Sb.rF0velmUBIKvQtjk8L8RO)
-- If account already exists, password_hash is preserved (NOT overwritten).
INSERT INTO users (id, name, email, phone, password_hash, role, account_status, is_active, created_at, updated_at)
VALUES (1, 'Owner Captain Konveksi', 'cvcaptainindo@gmail.com', '6281122334455', '$2b$10$uvsobIC2dXI3l893JFhjBOjT99mP0Sb.rF0velmUBIKvQtjk8L8RO', 'ADMIN', 'ACTIVE', TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  role = 'ADMIN',
  account_status = 'ACTIVE',
  is_active = TRUE;

-- 2. CUSTOMER STATUSES (6 Standard Business Statuses)
INSERT INTO customer_statuses (id, code, label, color_code, sort_order, is_active, created_at, updated_at) VALUES
(1, 'PROSPEK', 'Prospek', '#3B82F6', 1, TRUE, NOW(), NOW()),
(2, 'FOLLOW_UP', 'Follow-Up', '#F59E0B', 2, TRUE, NOW(), NOW()),
(3, 'NEGOSIASI', 'Negosiasi', '#8B5CF6', 3, TRUE, NOW(), NOW()),
(4, 'CLOSING', 'Closing (Deal)', '#059669', 4, TRUE, NOW(), NOW()),
(5, 'CANCEL', 'Batal / Cancel', '#EF4444', 5, TRUE, NOW(), NOW()),
(6, 'INACTIVE', 'Tidak Aktif', '#6B7280', 6, TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  color_code = VALUES(color_code),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- 3. FOLLOW-UP RULES (Company Standard 4-Step Follow-Up Sequence)
INSERT INTO follow_up_rules (id, step_number, name, interval_days, is_active, description, created_at, updated_at) VALUES
(1, 1, 'Follow-up 1 (Cek Kebutuhan & Katalog)', 3, TRUE, 'Follow-up 3 hari setelah kontak pertama', NOW(), NOW()),
(2, 2, 'Follow-up 2 (Penawaran Harga & Desain)', 7, TRUE, 'Follow-up 7 hari untuk detail penawaran', NOW(), NOW()),
(3, 3, 'Follow-up 3 (Sampel Kain & Negosiasi)', 14, TRUE, 'Follow-up 14 hari untuk keputusan sampel/mockup', NOW(), NOW()),
(4, 4, 'Follow-up 4 (Re-engagement / Promo)', 30, TRUE, 'Follow-up 30 hari untuk re-engagement jangka panjang', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  interval_days = VALUES(interval_days),
  description = VALUES(description),
  is_active = VALUES(is_active);

-- 4. WHATSAPP TEMPLATES (Standard Conversational Templates)
INSERT INTO whatsapp_templates (id, title, code, category, content, is_active, created_by, created_at, updated_at) VALUES
(1, 'Follow-up Penawaran Konveksi', 'FU_PENAWARAN', 'FOLLOW_UP', 'Halo Bapak/Ibu {{nama_customer}} dari {{perusahaan}},\n\nSalam dari Captain Konveksi. Izin konfirmasi apakah penawaran seragam {{produk}} yang kami kirimkan sebelumnya sudah sempat dipelajari?\n\nJika ada penyesuaian bahan kain atau target deadline, kami siap diskusikan.\n\nTerima kasih,\n{{nama_sales}}\nCaptain Konveksi', TRUE, 1, NOW(), NOW()),
(2, 'Follow-up Sampel Kain & Mockup', 'FU_SAMPEL', 'FOLLOW_UP', 'Selamat siang {{nama_customer}},\n\nSemoga sehat selalu. Mengenai rencana pesanan {{produk}} untuk {{perusahaan}}, apakah berkenan kami kirimkan sampel bahan kain atau mockup desain preview?\n\nKami siap kirimkan langsung ke alamat Bapak/Ibu.\n\nSalam hangat,\n{{nama_sales}}\nCaptain Konveksi', TRUE, 1, NOW(), NOW()),
(3, 'Re-engagement Promo Khusus', 'FU_REENGAGE', 'PROMO', 'Halo {{nama_customer}},\n\nApa kabar {{perusahaan}}? Kami dari Captain Konveksi ingin mengabarkan bahwa saat ini ada promo potongan khusus untuk pemesanan rompi, kemeja, dan jaket konveksi {{produk}}.\n\nApakah dalam waktu dekat ada agenda pengadaan seragam tim?\n\nTerima kasih,\n{{nama_sales}}', TRUE, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  content = VALUES(content),
  category = VALUES(category),
  is_active = VALUES(is_active);
