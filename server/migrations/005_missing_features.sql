-- =============================================
-- JPHRC IMS - Migration 005: Missing Features
-- =============================================

-- Add is_imc_member and is_management_member flags to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_imc_member BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_management_member BOOLEAN DEFAULT FALSE;

-- Update existing imc/management users
UPDATE users SET is_imc_member = TRUE WHERE role = 'imc';
UPDATE users SET is_management_member = TRUE WHERE role = 'head_management';

-- Add priority escalation tracking to incidents
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_escalated_by VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_escalated_at TIMESTAMP;

-- Add redirect tracking
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS redirect_reason TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS redirect_requested_by_dept VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS redirect_requested_at TIMESTAMP;

-- Add training completion tracking
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS training_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS training_completed_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS training_verified_by UUID REFERENCES users(id);

-- Add pending_training to the status CHECK constraint
-- First, drop the old constraint and re-add with pending_training
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN (
    'submitted', 'with_hod', 'with_hod_and_imc', 'with_imc',
    'redirect_requested', 'with_head_management', 'pending_training',
    'resolved', 'withdrawn', 'locked'
  ));

-- Add reporter employee_id to the incidents query join helper (no schema change needed,
-- but adding index for reporter employee_id joins)
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

-- Note: Generic dummy users (SYS_IMC, SYS_MGMT) are removed because IMC and Management access is strictly role-based for real employees.

-- Ensure role_credentials has system admin entry
INSERT INTO role_credentials (role, username, password_hash) VALUES
  ('system_admin', 'SYSTEM2026', '$2a$10$2.fTo1nrq9KJEheEqgK4XuW/EZhTRW6/RzqSYcUyLzxeXSSdQBLde')
ON CONFLICT (role) DO NOTHING;
