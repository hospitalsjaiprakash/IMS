-- =============================================
-- MIGRATION: Add Incident Category
-- =============================================

-- Remove CHECK constraint on incident_type dynamically
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT constraint_name
        FROM information_schema.constraint_column_usage
        WHERE table_name = 'incidents' AND column_name = 'incident_type'
    LOOP
        EXECUTE 'ALTER TABLE incidents DROP CONSTRAINT ' || quote_ident(r.constraint_name);
    END LOOP;
END
$$;

-- Alter incident_type to be longer
ALTER TABLE incidents ALTER COLUMN incident_type TYPE VARCHAR(255);

-- Add incident_category with a default so existing rows don't break
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_category VARCHAR(150) DEFAULT 'Others';
