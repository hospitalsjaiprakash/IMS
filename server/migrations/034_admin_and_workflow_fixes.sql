-- =============================================
-- JPHRC IMS - Migration 034: Admin & Workflow Fixes
-- =============================================

-- 1. Reset all existing individual system admins to employee
UPDATE users 
SET role = 'employee', is_system_admin = FALSE 
WHERE role = 'system_admin' OR is_system_admin = TRUE;

UPDATE master_employees 
SET role = 'employee' 
WHERE role = 'system_admin';

-- 2. Create / Upsert the single generic system admin account (Employee ID: 00000)
-- Password hash corresponds to "1admin" (bcrypt 12 rounds)
INSERT INTO users (
  employee_id, full_name, email, department, designation, role, password_hash, is_system_admin, is_active
)
VALUES (
  '00000',
  'System Administrator',
  'hospitalsjaiprakash@gmail.com',
  'Digital Communications',
  'System Administrator',
  'system_admin',
  '$2a$12$cbr/Yf96fTcsCCUNnZcNVO/U35hGTuSWMsLfo7c3nPPkKMzBT3qrC',
  TRUE,
  TRUE
)
ON CONFLICT (employee_id) DO UPDATE SET
  full_name = 'System Administrator',
  email = 'hospitalsjaiprakash@gmail.com',
  department = 'Digital Communications',
  designation = 'System Administrator',
  role = 'system_admin',
  is_system_admin = TRUE,
  is_active = TRUE,
  password_hash = '$2a$12$cbr/Yf96fTcsCCUNnZcNVO/U35hGTuSWMsLfo7c3nPPkKMzBT3qrC',
  updated_at = NOW();

-- Upsert into master_employees cache for directory integrity
INSERT INTO master_employees (
  employee_id, name, email, department, designation, role, status
)
VALUES (
  '00000',
  'System Administrator',
  'hospitalsjaiprakash@gmail.com',
  'Digital Communications',
  'System Administrator',
  'system_admin',
  'active'
)
ON CONFLICT (employee_id) DO UPDATE SET
  name = 'System Administrator',
  email = 'hospitalsjaiprakash@gmail.com',
  department = 'Digital Communications',
  designation = 'System Administrator',
  role = 'system_admin',
  status = 'active';

-- Update role_credentials to map generic system admin username to 00000
UPDATE role_credentials
SET username = '00000',
    password_hash = '$2a$12$cbr/Yf96fTcsCCUNnZcNVO/U35hGTuSWMsLfo7c3nPPkKMzBT3qrC',
    updated_at = NOW()
WHERE role = 'system_admin';

-- 3. Clean up the duplicate foreign key constraints on incident_responsible_employees
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'incident_responsible_employees'::regclass 
      AND conname LIKE '%training_verified_by%'
  ) LOOP
    EXECUTE 'ALTER TABLE incident_responsible_employees DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE incident_responsible_employees
ADD CONSTRAINT incident_responsible_employees_training_verified_by_fkey
FOREIGN KEY (training_verified_by) REFERENCES users(id) ON DELETE SET NULL;

-- 4. Expand incidents_management_decision_check to include DISAGREE_REVISE_FEEDBACK
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_management_decision_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_management_decision_check 
  CHECK (management_decision IN ('AGREE', 'DISAGREE_MODIFY', 'DISAGREE_REINVESTIGATE', 'DISAGREE_REVISE_FEEDBACK'));
