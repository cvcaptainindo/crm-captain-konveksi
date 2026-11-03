-- CRM CAPTAIN KONVEKSI - SAFE INVOICE MIGRATION
-- Additive only. No DELETE, UPDATE, or rewrite of existing transactions/payments.
-- Run once against the intended database after taking a database backup.

CREATE TABLE IF NOT EXISTS sales_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_type ENUM('QUOTATION','INVOICE') NOT NULL,
  doc_number VARCHAR(60) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NOT NULL,
  sales_id INT UNSIGNED NOT NULL,
  doc_date DATE NOT NULL, valid_until DATE NULL, due_date DATE NULL,
  status ENUM('DRAFT','SENT','APPROVED','REJECTED','EXPIRED','CONVERTED','UNPAID','PARTIAL','PAID','OVERDUE','CANCELLED','CLOSING','CANCEL') NOT NULL DEFAULT 'DRAFT',
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00, discount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  tax DECIMAL(15,2) NOT NULL DEFAULT 0.00, total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00, remaining_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_qty DECIMAL(12,2) NOT NULL DEFAULT 0.00, notes TEXT NULL, terms TEXT NULL,
  quotation_id INT UNSIGNED NULL, transaction_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_cust FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_sales FOREIGN KEY (sales_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_quotation FOREIGN KEY (quotation_id) REFERENCES sales_documents(id) ON DELETE SET NULL,
  CONSTRAINT fk_sdoc_trx FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  INDEX idx_sdoc_cust (customer_id), INDEX idx_sdoc_sales (sales_id), INDEX idx_sdoc_type (doc_type),
  INDEX idx_sdoc_status (status), INDEX idx_sdoc_date (doc_date), INDEX idx_sdoc_trx (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_document_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, document_id INT UNSIGNED NOT NULL,
  item_order INT UNSIGNED NOT NULL DEFAULT 1, product_name VARCHAR(200) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00, unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00, subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_item_doc FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE,
  INDEX idx_sdoc_item_doc (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_document_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, document_id INT UNSIGNED NOT NULL,
  payment_date DATE NOT NULL, amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'TRANSFER', reference_number VARCHAR(100) NULL,
  notes TEXT NULL, created_by INT UNSIGNED NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_pay_doc FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_pay_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sdoc_pay_doc (document_id), INDEX idx_sdoc_pay_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_document_refunds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, document_id INT UNSIGNED NOT NULL,
  refund_date DATE NULL, amount DECIMAL(15,2) NOT NULL, refund_method VARCHAR(50) NULL,
  reference_number VARCHAR(100) NULL, status ENUM('PENDING','COMPLETED') NOT NULL DEFAULT 'PENDING',
  notes TEXT NULL, created_by INT UNSIGNED NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_refund_doc FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_refund_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sdoc_refund_doc (document_id), INDEX idx_sdoc_refund_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add transactions.invoice_id only when absent.
SET @has_invoice_id := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND COLUMN_NAME='invoice_id');
SET @sql_add_invoice_id := IF(@has_invoice_id=0, 'ALTER TABLE transactions ADD COLUMN invoice_id INT UNSIGNED NULL AFTER status', 'SELECT 1');
PREPARE stmt_add_invoice_id FROM @sql_add_invoice_id; EXECUTE stmt_add_invoice_id; DEALLOCATE PREPARE stmt_add_invoice_id;

-- Add a unique index only if no duplicate invoice links exist. Never delete or rewrite existing rows.
SET @has_invoice_idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND INDEX_NAME='uq_transactions_invoice_id');
SET @duplicate_invoice_links := (SELECT COUNT(*) FROM (SELECT invoice_id FROM transactions WHERE invoice_id IS NOT NULL GROUP BY invoice_id HAVING COUNT(*)>1) dups);
SET @sql_add_invoice_idx := IF(@has_invoice_idx>0, 'SELECT 1', IF(@duplicate_invoice_links=0, 'ALTER TABLE transactions ADD UNIQUE KEY uq_transactions_invoice_id (invoice_id)', 'SELECT "STOP: duplicate transactions.invoice_id values exist; no rows were changed. Resolve manually after backup." AS migration_blocked'));
PREPARE stmt_add_invoice_idx FROM @sql_add_invoice_idx; EXECUTE stmt_add_invoice_idx; DEALLOCATE PREPARE stmt_add_invoice_idx;
