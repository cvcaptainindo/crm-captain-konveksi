-- CRM CAPTAIN KONVEKSI - PR-02 INVOICE METADATA
-- Additive only. Does not rewrite existing invoice, payment, transaction, or customer rows.
-- Review and back up the production database before execution. This file is NOT auto-run.

-- Add invoice_type only when absent. Existing documents receive the neutral default.
SET @has_invoice_type := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_documents' AND COLUMN_NAME = 'invoice_type'
);
SET @sql_add_invoice_type := IF(
  @has_invoice_type = 0,
  'ALTER TABLE sales_documents ADD COLUMN invoice_type VARCHAR(150) NOT NULL DEFAULT ''INVOICE STANDARD'' AFTER doc_type',
  'SELECT 1'
);
PREPARE stmt_add_invoice_type FROM @sql_add_invoice_type;
EXECUTE stmt_add_invoice_type;
DEALLOCATE PREPARE stmt_add_invoice_type;

-- Add parent_invoice_id only when absent.
SET @has_parent_invoice_id := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_documents' AND COLUMN_NAME = 'parent_invoice_id'
);
SET @sql_add_parent_invoice_id := IF(
  @has_parent_invoice_id = 0,
  'ALTER TABLE sales_documents ADD COLUMN parent_invoice_id INT UNSIGNED NULL AFTER invoice_type',
  'SELECT 1'
);
PREPARE stmt_add_parent_invoice_id FROM @sql_add_parent_invoice_id;
EXECUTE stmt_add_parent_invoice_id;
DEALLOCATE PREPARE stmt_add_parent_invoice_id;

-- Add lookup index only when absent.
SET @has_parent_invoice_index := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_documents' AND INDEX_NAME = 'idx_sdoc_parent_invoice'
);
SET @sql_add_parent_invoice_index := IF(
  @has_parent_invoice_index = 0,
  'ALTER TABLE sales_documents ADD INDEX idx_sdoc_parent_invoice (parent_invoice_id)',
  'SELECT 1'
);
PREPARE stmt_add_parent_invoice_index FROM @sql_add_parent_invoice_index;
EXECUTE stmt_add_parent_invoice_index;
DEALLOCATE PREPARE stmt_add_parent_invoice_index;

-- Add self-referencing FK only when absent.
SET @has_parent_invoice_fk := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_documents'
    AND CONSTRAINT_NAME = 'fk_sdoc_parent_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_add_parent_invoice_fk := IF(
  @has_parent_invoice_fk = 0,
  'ALTER TABLE sales_documents ADD CONSTRAINT fk_sdoc_parent_invoice FOREIGN KEY (parent_invoice_id) REFERENCES sales_documents(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt_add_parent_invoice_fk FROM @sql_add_parent_invoice_fk;
EXECUTE stmt_add_parent_invoice_fk;
DEALLOCATE PREPARE stmt_add_parent_invoice_fk;
