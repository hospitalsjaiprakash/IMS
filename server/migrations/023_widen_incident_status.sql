-- =============================================
-- MIGRATION 023: Widen incidents.status column to VARCHAR(60)
-- =============================================

ALTER TABLE incidents ALTER COLUMN status TYPE VARCHAR(60);
