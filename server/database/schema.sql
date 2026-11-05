-- ========================================================
-- CRM CAPTAIN KONVEKSI V1.0 - PRODUCTION MYSQL SCHEMA
-- Compatible with MySQL 8.0+ and MariaDB 10.4+ (Niagahoster)
-- ========================================================

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'SALES') NOT NULL DEFAULT 'SALES',
  account_status ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED') NOT NULL DEFAULT 'ACTIVE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email),
  INDEX idx_users_status (account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. CUSTOMER STATUSES (Configurable by Admin)
-- Standard: PROSPEK, FOLLOW_UP, NEGOSIASI, CLOSING, CANCEL, INACTIVE
CREATE TABLE IF NOT EXISTS customer_statuses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  color_code VARCHAR(20) NOT NULL DEFAULT '#64748B',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. FOLLOW-UP RULES (Admin Settings - Default Company Sequence)
CREATE TABLE IF NOT EXISTS follow_up_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  step_number INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  interval_days INT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rule_step (step_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(50) NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  company_name VARCHAR(150) NULL,
  whatsapp_number VARCHAR(30) NOT NULL,
  phone_number VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  pic_name VARCHAR(100) NULL,
  assigned_sales_id INT UNSIGNED NOT NULL,
  status_id INT UNSIGNED NOT NULL,
  notes TEXT NULL,
  use_custom_rule BOOLEAN NOT NULL DEFAULT FALSE,
  current_rule_step INT UNSIGNED NOT NULL DEFAULT 1,
  last_contact_date DATE NULL,
  next_follow_up_date DATE NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_cust_sales FOREIGN KEY (assigned_sales_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_cust_status FOREIGN KEY (status_id) REFERENCES customer_statuses (id) ON DELETE RESTRICT,
  
  INDEX idx_cust_sales (assigned_sales_id),
  INDEX idx_cust_status (status_id),
  INDEX idx_cust_next_fu (next_follow_up_date),
  INDEX idx_cust_deleted (deleted_at),
  INDEX idx_cust_wa (whatsapp_number),
  FULLTEXT idx_cust_search (name, company_name, city, pic_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. CUSTOMER CUSTOM RULES (Optional per-customer override)
CREATE TABLE IF NOT EXISTS customer_custom_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  step_number INT UNSIGNED NOT NULL,
  interval_days INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ccr_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  UNIQUE KEY uq_customer_step (customer_id, step_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. WHATSAPP TEMPLATES
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tpl_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
  INDEX idx_tpl_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. FOLLOW-UP ACTIVITIES (History Log - Never Lost)
CREATE TABLE IF NOT EXISTS follow_up_activities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  activity_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  channel ENUM('WHATSAPP', 'PHONE', 'EMAIL', 'MEETING', 'OTHER') NOT NULL DEFAULT 'WHATSAPP',
  template_id INT UNSIGNED NULL,
  message_sent TEXT NULL,
  result_status VARCHAR(100) NOT NULL,
  notes TEXT NULL,
  rule_step_executed INT UNSIGNED NOT NULL DEFAULT 1,
  previous_follow_up_date DATE NULL,
  next_follow_up_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_act_cust FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_act_tpl FOREIGN KEY (template_id) REFERENCES whatsapp_templates (id) ON DELETE SET NULL,
  
  INDEX idx_act_customer (customer_id),
  INDEX idx_act_user (user_id),
  INDEX idx_act_date (activity_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. TRANSACTIONS / CLOSINGS (Omzet Tracking - Multiple Closings per Customer)
CREATE TABLE IF NOT EXISTS transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  sales_id INT UNSIGNED NOT NULL,
  transaction_date DATE NOT NULL,
  product VARCHAR(150) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  status ENUM('CLOSING', 'CANCEL') NOT NULL DEFAULT 'CLOSING',
  invoice_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_trx_cust FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_trx_sales FOREIGN KEY (sales_id) REFERENCES users (id) ON DELETE RESTRICT,

  INDEX idx_trx_cust (customer_id),
  INDEX idx_trx_sales (sales_id),
  INDEX idx_trx_date (transaction_date),
  UNIQUE KEY uq_transactions_invoice_id (invoice_id),
  INDEX idx_trx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. SALES DOCUMENTS (Invoice + future Quotation compatibility)
CREATE TABLE IF NOT EXISTS sales_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_type ENUM('QUOTATION', 'INVOICE') NOT NULL,
  invoice_type VARCHAR(150) NOT NULL DEFAULT 'INVOICE STANDARD',
  parent_invoice_id INT UNSIGNED NULL,
  doc_number VARCHAR(60) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NOT NULL,
  sales_id INT UNSIGNED NOT NULL,
  doc_date DATE NOT NULL,
  valid_until DATE NULL,
  due_date DATE NULL,
  status ENUM('DRAFT','SENT','APPROVED','REJECTED','EXPIRED','CONVERTED','UNPAID','PARTIAL','PAID','OVERDUE','CANCELLED','CLOSING','CANCEL') NOT NULL DEFAULT 'DRAFT',
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  discount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  tax DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  remaining_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_qty DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  terms TEXT NULL,
  quotation_id INT UNSIGNED NULL,
  transaction_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_cust FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_sales FOREIGN KEY (sales_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_quotation FOREIGN KEY (quotation_id) REFERENCES sales_documents(id) ON DELETE SET NULL,
  CONSTRAINT fk_sdoc_parent_invoice FOREIGN KEY (parent_invoice_id) REFERENCES sales_documents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_trx FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  INDEX idx_sdoc_cust (customer_id),
  INDEX idx_sdoc_sales (sales_id),
  INDEX idx_sdoc_type (doc_type),
  INDEX idx_sdoc_status (status),
  INDEX idx_sdoc_date (doc_date),
  INDEX idx_sdoc_parent_invoice (parent_invoice_id),
  INDEX idx_sdoc_trx (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. SALES DOCUMENT ITEMS
CREATE TABLE IF NOT EXISTS sales_document_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  item_order INT UNSIGNED NOT NULL DEFAULT 1,
  product_name VARCHAR(200) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00,
  unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_item_doc FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE,
  INDEX idx_sdoc_item_doc (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. INVOICE PAYMENTS: immutable history; never delete rows during cancellation.
CREATE TABLE IF NOT EXISTS sales_document_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'TRANSFER',
  reference_number VARCHAR(100) NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_pay_doc FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_pay_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sdoc_pay_doc (document_id),
  INDEX idx_sdoc_pay_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. REFUNDS: separate ledger; does not mutate payments or omzet transactions.
CREATE TABLE IF NOT EXISTS sales_document_refunds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  refund_date DATE NULL,
  amount DECIMAL(15,2) NOT NULL,
  refund_method VARCHAR(50) NULL,
  reference_number VARCHAR(100) NULL,
  status ENUM('PENDING','COMPLETED') NOT NULL DEFAULT 'PENDING',
  notes TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sdoc_refund_doc FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sdoc_refund_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sdoc_refund_doc (document_id),
  INDEX idx_sdoc_refund_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. AUDIT LOGS (Immutable Activity Log)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id INT UNSIGNED NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
