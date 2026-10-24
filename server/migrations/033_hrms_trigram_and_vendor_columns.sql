-- =============================================
-- MIGRATION 033: HRMS Trigram Search Indexes & Vendor Metadata Columns
-- Enables sub-5ms fuzzy search & Last-Write-Wins synchronization protection
-- =============================================

-- 1. Ensure pg_trgm extension is active for high-speed fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add vendor timestamp and notice period columns to master_employees
ALTER TABLE master_employees
  ADD COLUMN IF NOT EXISTS vendor_updated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS notice_period_start_date DATE,
  ADD COLUMN IF NOT EXISTS notice_period_end_date DATE;

-- 3. Create Trigram GIN Indexes on master_employees for sub-millisecond search
CREATE INDEX IF NOT EXISTS idx_master_employees_name_trgm 
  ON master_employees USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_master_employees_emp_id_trgm 
  ON master_employees USING gin (employee_id gin_trgm_ops);

-- 4. B-Tree Indexes on filtering columns
CREATE INDEX IF NOT EXISTS idx_master_employees_dept 
  ON master_employees (department);

CREATE INDEX IF NOT EXISTS idx_master_employees_designation 
  ON master_employees (designation);

CREATE INDEX IF NOT EXISTS idx_master_employees_status_active 
  ON master_employees (status);

-- 5. Track initial vendor sync metadata in system_config
INSERT INTO system_config (key, value, updated_at) VALUES
  ('officeportal_sync_cursor', '', NOW()),
  ('officeportal_last_sync_timestamp', '2000-01-01T00:00:00Z', NOW()),
  ('officeportal_sync_status', 'READY', NOW()),
  ('officeportal_daily_requests_remaining', '20000', NOW()),
  ('officeportal_monthly_requests_remaining', '250000', NOW())
ON CONFLICT (key) DO NOTHING;
