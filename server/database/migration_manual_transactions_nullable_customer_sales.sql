-- CRM CAPTAIN KONVEKSI
-- Manual omzet: customer terdaftar, nama manual, atau tanpa customer; Sales PIC opsional.
-- Jalankan pada database aktif sebelum deploy aplikasi yang memakai fitur ini.

ALTER TABLE transactions
  MODIFY COLUMN customer_id INT UNSIGNED NULL,
  MODIFY COLUMN sales_id INT UNSIGNED NULL;

SET @schema_name = DATABASE();
SET @has_manual_customer_name = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'customer_name_manual'
);
SET @ddl = IF(
  @has_manual_customer_name = 0,
  'ALTER TABLE transactions ADD COLUMN customer_name_manual VARCHAR(120) NULL AFTER customer_id',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
