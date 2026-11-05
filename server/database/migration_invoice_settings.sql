-- CRM CAPTAIN KONVEKSI: Invoice Settings
-- Idempotent table creation; no existing customer/document data is modified.

CREATE TABLE IF NOT EXISTS `invoice_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `company_name` VARCHAR(150) NOT NULL DEFAULT 'CAPTAIN KONVEKSI',
  `company_legal_name` VARCHAR(150) NULL DEFAULT 'CV CAPTAIN INDO',
  `company_logo_url` LONGTEXT NULL,
  `company_address` TEXT NULL,
  `company_whatsapp` VARCHAR(50) NULL,
  `company_phone` VARCHAR(50) NULL,
  `company_email` VARCHAR(190) NULL,
  `company_website` VARCHAR(255) NULL,
  `nib` VARCHAR(100) NULL,
  `npwp` VARCHAR(100) NULL,
  `bank_name` VARCHAR(100) NULL,
  `bank_account_number` VARCHAR(100) NULL,
  `bank_account_holder` VARCHAR(150) NULL,
  `signatory_name` VARCHAR(120) NULL,
  `signatory_role` VARCHAR(100) NULL,
  `signatory_signature_url` LONGTEXT NULL,
  `company_stamp_url` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `invoice_settings` (`id`, `company_name`, `company_legal_name`)
SELECT 1, 'CAPTAIN KONVEKSI', 'CV CAPTAIN INDO'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `invoice_settings` WHERE `id` = 1);

CREATE TABLE IF NOT EXISTS `invoice_terms` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 1,
  `term_text` TEXT NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_iterms_order` (`sort_order`),
  INDEX `idx_iterms_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
