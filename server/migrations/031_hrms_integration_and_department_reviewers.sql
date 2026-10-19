-- =============================================
-- MIGRATION 031: HRMS Integration & Department Reviewers
-- Supports OfficePortal Public API v1 & Multi-Department Senior Staff Mappings
-- =============================================

-- 1. Upgrade master_employees Table with OfficePortal Public API Schema Fields
ALTER TABLE master_employees
  ADD COLUMN IF NOT EXISTS office_portal_id VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS office_location VARCHAR(128),
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Status constraint for master_employees: 'active', 'noticePeriod', 'terminated'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_master_employee_status'
  ) THEN
    ALTER TABLE master_employees 
      ADD CONSTRAINT chk_master_employee_status 
      CHECK (status IN ('active', 'noticePeriod', 'terminated'));
  END IF;
END $$;

-- Indexes on master_employees
CREATE INDEX IF NOT EXISTS idx_master_emp_portal_id ON master_employees(office_portal_id);
CREATE INDEX IF NOT EXISTS idx_master_emp_status ON master_employees(status);
CREATE INDEX IF NOT EXISTS idx_master_emp_email ON master_employees(email);

-- 2. Department Reviewers Table (Senior Staff Single/Multi-Department Oversight Mapping)
CREATE TABLE IF NOT EXISTS department_reviewers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  reviewer_role VARCHAR(32) NOT NULL DEFAULT 'HOD' 
    CHECK (reviewer_role IN ('HOD', 'Incharge', 'Assistant COO')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_user_department_reviewer_role UNIQUE (user_id, department_id, reviewer_role)
);

CREATE INDEX IF NOT EXISTS idx_dept_reviewers_user_active ON department_reviewers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_dept_reviewers_dept_active ON department_reviewers(department_id, is_active);

-- Backfill department_reviewers from existing departments columns if any
INSERT INTO department_reviewers (user_id, department_id, reviewer_role, is_active)
SELECT hod_user_id, id, 'HOD', true FROM departments WHERE hod_user_id IS NOT NULL
ON CONFLICT (user_id, department_id, reviewer_role) DO NOTHING;

INSERT INTO department_reviewers (user_id, department_id, reviewer_role, is_active)
SELECT incharge_user_id, id, 'Incharge', true FROM departments WHERE incharge_user_id IS NOT NULL
ON CONFLICT (user_id, department_id, reviewer_role) DO NOTHING;

INSERT INTO department_reviewers (user_id, department_id, reviewer_role, is_active)
SELECT asst_coo_user_id, id, 'Assistant COO', true FROM departments WHERE asst_coo_user_id IS NOT NULL
ON CONFLICT (user_id, department_id, reviewer_role) DO NOTHING;

-- 3. Ingested HRMS Webhook Events Table (OfficePortal Signed Webhook Log & Queue)
CREATE TABLE IF NOT EXISTS hrms_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(128) UNIQUE NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrms_webhooks_event_id ON hrms_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_hrms_webhooks_status_date ON hrms_webhook_events(status, received_at);

-- 4. HRMS Sync History & Audit Log Table
CREATE TABLE IF NOT EXISTS hrms_sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(32) NOT NULL 
    CHECK (sync_type IN ('full', 'delta', 'webhook')),
  status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS' 
    CHECK (status IN ('IN_PROGRESS', 'SUCCESS', 'FAILED')),
  delta_cursor VARCHAR(255),
  records_fetched INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deactivated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_hrms_sync_logs_started ON hrms_sync_logs(started_at DESC);
