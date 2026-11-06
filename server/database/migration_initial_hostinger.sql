-- ==============================================================================
-- CRM CAPTAIN KONVEKSI V1.0 - MASTER INITIAL MIGRATION SCRIPT
-- Target Database: u461262494_crm_captain (Hostinger / Niagahoster MySQL 8.0+ / MariaDB 10.4+)
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Standar Keamanan: Zero Hardcoded Secret & Idempoten (Aman Dijalankan Ulang)
-- ==============================================================================
-- PETUNJUK EKSEKUSI DI PHPMYADMIN HOSTINGER:
-- 1. Buka cPanel / hPanel Hostinger -> Masuk ke phpMyAdmin.
-- 2. Pilih database: `u461262494_crm_captain` di panel kiri.
-- 3. Buka tab "SQL" di menu atas.
-- 4. Copy & Paste seluruh isi script ini, lalu klik "Kirim" / "Go".
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+07:00";

-- ==============================================================================
-- BAGIAN 1: DDL STRUKTUR 9 TABEL LENGKAP (CREATE TABLE IF NOT EXISTS)
-- ==============================================================================

-- 1.1 TABEL: users (Akun Admin, Owner, dan Tim Sales)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(120) NOT NULL UNIQUE,
  `phone` VARCHAR(30) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'SALES') NOT NULL DEFAULT 'SALES',
  `account_status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED') NOT NULL DEFAULT 'ACTIVE',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_status` (`account_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.2 TABEL: customer_statuses (Master Status Pipeline Pelanggan)
CREATE TABLE IF NOT EXISTS `customer_statuses` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `label` VARCHAR(100) NOT NULL,
  `color_code` VARCHAR(20) NOT NULL DEFAULT '#64748B',
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.3 TABEL: follow_up_rules (Master Aturan Follow-Up Default Perusahaan)
CREATE TABLE IF NOT EXISTS `follow_up_rules` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `step_number` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `interval_days` INT UNSIGNED NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `description` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_rule_step` (`step_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.4 TABEL: customers (Data Pelanggan & Prospek Konveksi)
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_code` VARCHAR(50) NULL UNIQUE,
  `name` VARCHAR(120) NOT NULL,
  `company_name` VARCHAR(150) NULL,
  `whatsapp_number` VARCHAR(30) NOT NULL,
  `phone_number` VARCHAR(30) NULL,
  `email` VARCHAR(120) NULL,
  `address` TEXT NULL,
  `city` VARCHAR(100) NULL,
  `pic_name` VARCHAR(100) NULL,
  `assigned_sales_id` INT UNSIGNED NOT NULL,
  `status_id` INT UNSIGNED NOT NULL,
  `notes` TEXT NULL,
  `use_custom_rule` BOOLEAN NOT NULL DEFAULT FALSE,
  `current_rule_step` INT UNSIGNED NOT NULL DEFAULT 1,
  `last_contact_date` DATE NULL,
  `next_follow_up_date` DATE NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT `fk_cust_sales` FOREIGN KEY (`assigned_sales_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cust_status` FOREIGN KEY (`status_id`) REFERENCES `customer_statuses` (`id`) ON DELETE RESTRICT,
  
  INDEX `idx_cust_sales` (`assigned_sales_id`),
  INDEX `idx_cust_status` (`status_id`),
  INDEX `idx_cust_next_fu` (`next_follow_up_date`),
  INDEX `idx_cust_deleted` (`deleted_at`),
  INDEX `idx_cust_wa` (`whatsapp_number`),
  FULLTEXT `idx_cust_search` (`name`, `company_name`, `city`, `pic_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.5 TABEL: customer_custom_rules (Override Aturan Follow-Up Khusus Per Pelanggan)
CREATE TABLE IF NOT EXISTS `customer_custom_rules` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT UNSIGNED NOT NULL,
  `step_number` INT UNSIGNED NOT NULL,
  `interval_days` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ccr_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_customer_step` (`customer_id`, `step_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.6 TABEL: whatsapp_templates (Template Pesan Follow-Up WhatsApp)
CREATE TABLE IF NOT EXISTS `whatsapp_templates` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(120) NOT NULL,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `category` VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  `content` TEXT NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_tpl_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  INDEX `idx_tpl_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.7 TABEL: follow_up_activities (Log Riwayat Interaksi Follow-Up)
CREATE TABLE IF NOT EXISTS `follow_up_activities` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `activity_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `channel` ENUM('WHATSAPP', 'PHONE', 'EMAIL', 'MEETING', 'OTHER') NOT NULL DEFAULT 'WHATSAPP',
  `template_id` INT UNSIGNED NULL,
  `message_sent` TEXT NULL,
  `result_status` VARCHAR(100) NOT NULL,
  `notes` TEXT NULL,
  `rule_step_executed` INT UNSIGNED NOT NULL DEFAULT 1,
  `previous_follow_up_date` DATE NULL,
  `next_follow_up_date` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT `fk_act_cust` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_act_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_act_tpl` FOREIGN KEY (`template_id`) REFERENCES `whatsapp_templates` (`id`) ON DELETE SET NULL,
  
  INDEX `idx_act_customer` (`customer_id`),
  INDEX `idx_act_user` (`user_id`),
  INDEX `idx_act_date` (`activity_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.8 TABEL: transactions (Pencatatan Omzet Closing & Status Transaksi)
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT UNSIGNED NULL,
  `customer_name_manual` VARCHAR(120) NULL,
  `sales_id` INT UNSIGNED NULL,
  `transaction_date` DATE NOT NULL,
  `product` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('CLOSING', 'CANCEL') NOT NULL DEFAULT 'CLOSING',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT `fk_trx_cust` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_trx_sales` FOREIGN KEY (`sales_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,

  INDEX `idx_trx_cust` (`customer_id`),
  INDEX `idx_trx_sales` (`sales_id`),
  INDEX `idx_trx_date` (`transaction_date`),
  INDEX `idx_trx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.9 TABEL: audit_logs (Audit Trail Aktivitas Sistem)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `action` VARCHAR(50) NOT NULL,
  `entity` VARCHAR(50) NOT NULL,
  `entity_id` INT UNSIGNED NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `old_data` JSON NULL,
  `new_data` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_audit_entity` (`entity`, `entity_id`),
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- BAGIAN 2: MASTER DATA SISTEM (AMAN & NON-DESTRUKTIF - TIDAK MENIMPA SETTING ADMIN)
-- Catatan: Menggunakan INSERT ... ON DUPLICATE KEY UPDATE id=id
-- Jika baris sudah ada atau diedit oleh Admin (warna, nama, interval),
-- data konfigurasi tidak akan ditimpa atau di-reset.
-- ==============================================================================

-- 2.1 Master Status Pelanggan (6 Status Siklus CRM)
INSERT INTO `customer_statuses` (`id`, `code`, `label`, `color_code`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'PROSPEK', 'Prospek', '#3B82F6', 1, TRUE, NOW(), NOW()),
(2, 'FOLLOW_UP', 'Follow-Up', '#F59E0B', 2, TRUE, NOW(), NOW()),
(3, 'NEGOSIASI', 'Negosiasi', '#8B5CF6', 3, TRUE, NOW(), NOW()),
(4, 'CLOSING', 'Closing (Deal)', '#059669', 4, TRUE, NOW(), NOW()),
(5, 'CANCEL', 'Batal / Cancel', '#EF4444', 5, TRUE, NOW(), NOW()),
(6, 'INACTIVE', 'Tidak Aktif', '#6B7280', 6, TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;

-- 2.2 Master Aturan Follow-Up Default Perusahaan (4 Tahapan Interval Hari)
INSERT INTO `follow_up_rules` (`id`, `step_number`, `name`, `interval_days`, `is_active`, `description`, `created_at`, `updated_at`) VALUES
(1, 1, 'Follow-up 1 (Cek Kebutuhan & Katalog)', 3, TRUE, 'Follow-up 3 hari setelah kontak pertama', NOW(), NOW()),
(2, 2, 'Follow-up 2 (Penawaran Harga & Desain)', 7, TRUE, 'Follow-up 7 hari untuk detail penawaran', NOW(), NOW()),
(3, 3, 'Follow-up 3 (Sampel Kain & Negosiasi)', 14, TRUE, 'Follow-up 14 hari untuk keputusan sampel/mockup', NOW(), NOW()),
(4, 4, 'Follow-up 4 (Re-engagement / Promo)', 30, TRUE, 'Follow-up 30 hari untuk re-engagement jangka panjang', NOW(), NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;

-- ==============================================================================
-- BAGIAN 3: BOOTSTRAP AKUN OWNER (KEBIJAKAN ZERO-SECRET & PRESERVASI KREDENSIAL)
-- ==============================================================================
-- ATURAN KEAMANAN PRODUKSI:
-- 1. TIDAK ADA password default atau hash BCrypt hardcoded yang ditanam pada file SQL ini.
-- 2. TIDAK MEMATOK ID Owner = 1.
-- 3. JIKA AKUN SUDAH ADA: Query berikut hanya memastikan role='ADMIN' dan status='ACTIVE'
--    tanpa mengubah atau mereset password hash yang sudah ada!
-- 4. JIKA AKUN BELUM ADA: Jalankan utilitas Node.js dengan perintah:
--      OWNER_PASSWORD="PasswordKuatPilihanAnda" npm run bootstrap:owner
--    Hal ini menjamin enkripsi BCrypt salt cost 10 dilakukan di runtime Node.js
--    tanpa meninggalkan jejak kredensial di log git/SQL.
-- ==============================================================================

UPDATE `users`
SET `role` = 'ADMIN',
    `account_status` = 'ACTIVE',
    `is_active` = TRUE,
    `updated_at` = NOW()
WHERE `email` = 'cvcaptainindo@gmail.com';

-- ==============================================================================
-- BAGIAN 4: MASTER TEMPLATE WHATSAPP STANDAR (DYNAMIC OWNER BINDING)
-- ==============================================================================
-- Mengaitkan template langsung ke ID aktual dari akun Owner 'cvcaptainindo@gmail.com'.
-- Tidak mengasumsikan ID = 1 secara statis.
-- Menggunakan ON DUPLICATE KEY UPDATE code=code agar template yang diedit Admin
-- tidak tertimpa saat script dijalankan ulang.
-- ==============================================================================

INSERT INTO `whatsapp_templates` (`title`, `code`, `category`, `content`, `is_active`, `created_by`, `created_at`, `updated_at`)
SELECT 
  'Follow-up Penawaran Konveksi', 
  'FU_PENAWARAN', 
  'FOLLOW_UP', 
  'Halo Bapak/Ibu {{nama_customer}} dari {{perusahaan}},\n\nSalam dari Captain Konveksi. Izin konfirmasi apakah penawaran seragam {{produk}} yang kami kirimkan sebelumnya sudah sempat dipelajari?\n\nJika ada penyesuaian bahan kain atau target deadline, kami siap diskusikan.\n\nTerima kasih,\n{{nama_sales}}\nCaptain Konveksi', 
  TRUE, 
  u.id, 
  NOW(), 
  NOW()
FROM `users` u 
WHERE u.email = 'cvcaptainindo@gmail.com'
LIMIT 1
ON DUPLICATE KEY UPDATE `code` = `code`;

INSERT INTO `whatsapp_templates` (`title`, `code`, `category`, `content`, `is_active`, `created_by`, `created_at`, `updated_at`)
SELECT 
  'Follow-up Sampel Kain & Mockup', 
  'FU_SAMPEL', 
  'FOLLOW_UP', 
  'Selamat siang {{nama_customer}},\n\nSemoga sehat selalu. Mengenai rencana pesanan {{produk}} untuk {{perusahaan}}, apakah berkenan kami kirimkan sampel bahan kain atau mockup desain preview?\n\nKami siap kirimkan langsung ke alamat Bapak/Ibu.\n\nSalam hangat,\n{{nama_sales}}\nCaptain Konveksi', 
  TRUE, 
  u.id, 
  NOW(), 
  NOW()
FROM `users` u 
WHERE u.email = 'cvcaptainindo@gmail.com'
LIMIT 1
ON DUPLICATE KEY UPDATE `code` = `code`;

INSERT INTO `whatsapp_templates` (`title`, `code`, `category`, `content`, `is_active`, `created_by`, `created_at`, `updated_at`)
SELECT 
  'Re-engagement Promo Khusus', 
  'FU_REENGAGE', 
  'PROMO', 
  'Halo {{nama_customer}},\n\nApa kabar {{perusahaan}}? Kami dari Captain Konveksi ingin mengabarkan bahwa saat ini ada promo potongan khusus untuk pemesanan rompi, kemeja, dan jaket konveksi {{produk}}.\n\nApakah dalam waktu dekat ada agenda pengadaan seragam tim?\n\nTerima kasih,\n{{nama_sales}}', 
  TRUE, 
  u.id, 
  NOW(), 
  NOW()
FROM `users` u 
WHERE u.email = 'cvcaptainindo@gmail.com'
LIMIT 1
ON DUPLICATE KEY UPDATE `code` = `code`;

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- AKHIR DARI MIGRATION SCRIPT
-- ==============================================================================
