-- ========================================================
-- CRM CAPTAIN KONVEKSI V1.0 - OPTIONAL DEMO / TESTING SEEDS
-- For staging, testing, or development environments ONLY
-- DO NOT RUN ON LIVE PRODUCTION DATABASE
-- ========================================================

-- Demo Sales Staff (password: 'sales123')
INSERT INTO users (id, name, email, phone, password_hash, role, account_status, is_active, created_at, updated_at) VALUES
(2, 'Dimas Prasetyo (Sales)', 'sales.dimas@captainkonveksi.com', '6281234567891', '$2b$10$wN1rBsh9VqQxW1K354vNnO8i719q6rV6JgN738r5qW91B4V6g8v.e', 'SALES', 'ACTIVE', TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Demo Customers
INSERT INTO customers (id, customer_code, name, company_name, whatsapp_number, phone_number, email, address, city, pic_name, assigned_sales_id, status_id, notes, use_custom_rule, current_rule_step, last_contact_date, next_follow_up_date, deleted_at, created_at, updated_at) VALUES
(1, 'CK-0001', 'Pak Budi Hartono', 'PT Sumber Makmur Sejahtera', '6281298765432', '021-5551234', 'budi.h@sumbermakmur.co.id', 'Jl. Industri Raya No. 45, MM2100', 'Cikarang', 'Pak Budi (Procurement)', 2, 4, 'Kebutuhan seragam pabrik bahan Lacoste CVC 24s. Sudah closing.', FALSE, 3, DATE_SUB(CURDATE(), INTERVAL 6 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), NULL, NOW(), NOW()),
(2, 'CK-0002', 'Ibu Ratna Dewi', 'CV Maju Jaya Abadi', '6281311223344', '022-7778899', 'ratna.dewi@majujaya.com', 'Jl. Riau No. 12', 'Bandung', 'Ibu Ratna (HR & GA)', 2, 2, 'Pesanan 100 pcs jaket bomber taslan untuk gathering.', FALSE, 1, DATE_SUB(CURDATE(), INTERVAL 3 DAY), CURDATE(), NULL, NOW(), NOW()),
(3, 'CK-0003', 'Pak Hendra Kurniawan', 'PT ABC Logistik Nusantara', '6285244556677', '021-8899001', 'hendra.k@abclogistics.id', 'Jl. Gatot Subroto Kav. 18', 'Jakarta Selatan', 'Pak Hendra (Operational)', 1, 1, 'Prospek rompi safety scotlight.', FALSE, 1, DATE_SUB(CURDATE(), INTERVAL 3 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), NULL, NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Demo Closings (Omzet)
INSERT INTO transactions (id, customer_id, sales_id, transaction_date, product, description, amount, status, notes, created_at, updated_at) VALUES
(1, 1, 2, DATE_SUB(CURDATE(), INTERVAL 10 DAY), '100 pcs Jaket Bomber Konveksi', 'Closing batch 1 seragam lapangan', 20000000.00, 'CLOSING', 'Bahan Taslan ZN bordir komputer', NOW(), NOW()),
(2, 1, 2, DATE_SUB(CURDATE(), INTERVAL 5 DAY), '150 pcs Polo Shirt Lacoste CVC', 'Closing batch 2 seragam kantor', 15000000.00, 'CLOSING', 'Kain Lacoste CVC 24s Navy', NOW(), NOW()),
(3, 1, 2, CURDATE(), '250 pcs Kemeja Drill Seragam', 'Closing batch 3 seragam harian divisi operasional', 30000000.00, 'CLOSING', 'Kain American Drill Grade A', NOW(), NOW())
ON DUPLICATE KEY UPDATE product = VALUES(product);
