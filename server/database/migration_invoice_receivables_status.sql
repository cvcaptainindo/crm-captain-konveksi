-- FIX-04: Normalize legacy invoice lifecycle statuses.
-- Run once on the production database after taking a backup.
-- DRAFT/SENT remain in the shared ENUM for quotation compatibility;
-- only INVOICE rows are migrated to the active unpaid state.
START TRANSACTION;

UPDATE sales_documents
SET status = 'UNPAID',
    updated_at = NOW()
WHERE doc_type = 'INVOICE'
  AND status IN ('DRAFT', 'SENT');

COMMIT;
