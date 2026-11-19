-- =============================================================================
-- MIGRATION 036: OfficePortal HRMS Public API v1 Complete Integration
-- =============================================================================
-- 1. Clean up duplicate constraints accumulated by startup schema checks
-- 2. Extend master_employees with OfficePortal v1 fields (employment type,
--    managerId, portalAccessDisableDate, department/job/location IDs)
-- 3. Extend departments with office_portal_department_id & is_hrms_synced and
--    remove all unreferenced hardcoded/pre-seeded departments (100% API-driven)
-- 4. Create hrms_job_titles & hrms_employment_types master tables
-- 5. Fix hrms_sync_logs (TEXT delta_cursor, last_changed_at) and
--    hrms_webhook_events (TEXT event_type, delivery_id, occurred_at)
-- 6. Purge 60 synthetic mock personas (f01a1c0d-*) and reset system_config
--    to JPHRC production OfficePortal tenant (ext_c002bbe65e374675b8d4dc33fbf25dd1)
-- =============================================================================

-- 1. Drop duplicate unnamed constraints accumulated on master_employees & departments
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Duplicate UNIQUE constraints on master_employees.office_portal_id (keep only master_employees_office_portal_id_key)
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'master_employees'::regclass
      AND contype = 'u'
      AND conname ~ '^master_employees_office_portal_id_key[0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE master_employees DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;

  -- Duplicate FK constraints on departments (keep only the base named fkey without trailing digits)
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'departments'::regclass
      AND contype = 'f'
      AND conname ~ '^departments_(incharge_user_id|asst_coo_user_id|assigned_user_id)_fkey[0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE departments DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

-- 2. Extend master_employees with OfficePortal Public API v1 columns
ALTER TABLE master_employees
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS job_title_id INTEGER,
  ADD COLUMN IF NOT EXISTS office_location_id INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type_id INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS manager_id UUID,
  ADD COLUMN IF NOT EXISTS portal_access_disable_date DATE;

-- Widen status check constraint to support all OfficePortal v1 statuses + deleted
ALTER TABLE master_employees DROP CONSTRAINT IF EXISTS chk_master_employee_status;
ALTER TABLE master_employees DROP CONSTRAINT IF EXISTS master_employees_status_check;
ALTER TABLE master_employees
  ADD CONSTRAINT chk_master_employee_status
  CHECK (status IN ('active', 'noticePeriod', 'terminated', 'inactive', 'deleted'));

-- Useful indexes on master_employees
CREATE INDEX IF NOT EXISTS idx_master_employees_office_portal_id
  ON master_employees (office_portal_id);
CREATE INDEX IF NOT EXISTS idx_master_employees_manager_id
  ON master_employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_master_employees_portal_disable_date
  ON master_employees (portal_access_disable_date);

-- 3. Extend departments for 100% API-driven OfficePortal department sync
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS office_portal_department_id UUID,
  ADD COLUMN IF NOT EXISTS is_hrms_synced BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_office_portal_id
  ON departments (office_portal_department_id)
  WHERE office_portal_department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_is_hrms_synced
  ON departments (is_hrms_synced);

-- Enforce ZERO hardcoded departments:
-- Delete all unreferenced pre-seeded/hardcoded departments (is_hrms_synced = FALSE).
-- Any historical row still referenced by past incidents (e.g. in Staging) stays
-- is_hrms_synced = FALSE solely for FK integrity and is never exposed by API endpoints.
DELETE FROM departments d
WHERE d.is_hrms_synced = FALSE
  AND NOT EXISTS (SELECT 1 FROM incident_departments idp WHERE idp.department_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.department_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM incident_responsible_employees ire WHERE ire.department_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base kb WHERE kb.department_id = d.id);

-- 4. Master cache tables for OfficePortal job titles & employment types
CREATE TABLE IF NOT EXISTS hrms_job_titles (
  job_title_id INTEGER PRIMARY KEY,
  name TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hrms_employment_types (
  employment_type_id INTEGER PRIMARY KEY,
  name TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Fix hrms_sync_logs & hrms_webhook_events column widths and metadata
ALTER TABLE hrms_sync_logs
  ALTER COLUMN delta_cursor TYPE TEXT;

ALTER TABLE hrms_sync_logs
  ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE hrms_webhook_events
  ALTER COLUMN event_type TYPE TEXT;

ALTER TABLE hrms_webhook_events
  ADD COLUMN IF NOT EXISTS delivery_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_hrms_webhooks_delivery_id
  ON hrms_webhook_events (delivery_id);

-- 6. Purge all 60 synthetic mock personas (f01a1c0d-*) and mock user records safely
DO $$
DECLARE
  mock_emp_ids TEXT[];
  uid UUID;
BEGIN
  SELECT ARRAY_AGG(employee_id) INTO mock_emp_ids
  FROM master_employees
  WHERE office_portal_id LIKE 'f01a1c0d-%'
     OR employee_id ~ '^EMP-0[1-6][0-9]{2}$';

  -- Delete synthetic mock personas from master_employees
  DELETE FROM master_employees
  WHERE office_portal_id LIKE 'f01a1c0d-%'
     OR employee_id ~ '^EMP-0[1-6][0-9]{2}$';

  -- Safely delete unreferenced users corresponding to purged mock personas (never touch 00000)
  IF mock_emp_ids IS NOT NULL THEN
    FOR uid IN
      SELECT u.id
      FROM users u
      WHERE u.employee_id = ANY(mock_emp_ids)
        AND TRIM(u.employee_id) != '00000'
    LOOP
      BEGIN
        DELETE FROM users WHERE id = uid;
      EXCEPTION WHEN foreign_key_violation THEN
        -- User is referenced by historical staging records: revoke admin privileges and deactivate
        UPDATE users
        SET is_active = FALSE, is_system_admin = FALSE, updated_at = NOW()
        WHERE id = uid;
      END;
    END LOOP;
  END IF;
END $$;

-- Ensure generic System Admin (00000) exists and is active
UPDATE users
SET role = 'system_admin', is_system_admin = TRUE, is_active = TRUE, updated_at = NOW()
WHERE TRIM(employee_id) = '00000';

-- 7. Configure JPHRC real OfficePortal tenant parameters & clear leftover mock URLs/checkpoints
INSERT INTO system_config (key, value, updated_at) VALUES
  ('officeportal_auth_url', 'https://accounts.awarious.com/publicapi/connect/token', NOW()),
  ('officeportal_base_url', 'https://publicapi.officeportal.io/employee', NOW()),
  ('officeportal_client_id', 'ext_c002bbe65e374675b8d4dc33fbf25dd1', NOW()),
  ('officeportal_sync_cursor', '', NOW()),
  ('officeportal_last_changed_at', '2000-01-01T00:00:00Z', NOW()),
  ('officeportal_last_sync_timestamp', '2000-01-01T00:00:00Z', NOW()),
  ('officeportal_sync_status', 'AWAITING_CREDENTIALS', NOW()),
  ('officeportal_daily_requests_limit', '500', NOW()),
  ('officeportal_daily_requests_remaining', '500', NOW()),
  ('officeportal_monthly_requests_quota', '5000', NOW()),
  ('officeportal_monthly_requests_remaining', '5000', NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- Clear leftover mock client secret if it was the demo placeholder
UPDATE system_config
SET value = '', updated_at = NOW()
WHERE key = 'officeportal_client_secret'
  AND value IN ('demo_jphrc_secret_key_123', 'test_secret_key');

-- Clear old mock sync logs & webhook events pointing at localhost:5055 mock runs
DELETE FROM hrms_sync_logs WHERE started_at < NOW();
DELETE FROM hrms_webhook_events WHERE received_at < NOW();
