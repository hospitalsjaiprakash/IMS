-- =============================================
-- MIGRATION 021: Expand proposed_outcome column to TEXT for multiselect
-- =============================================

ALTER TABLE incidents ALTER COLUMN proposed_outcome TYPE TEXT;
