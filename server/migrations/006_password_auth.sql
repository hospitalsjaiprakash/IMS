-- =============================================
-- JPHRC IMS - Migration 006: Password Auth
-- =============================================

-- Add password_hash column to users for employee self-registration
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Insert / update NIRMAL NAIK as system_admin with hashed password "1admin"
-- bcrypt hash of "1admin" with 12 rounds
INSERT INTO users (employee_id, full_name, email, phone, whatsapp, department, designation, role, password_hash, is_system_admin)
VALUES (
  '13574',
  'NIRMAL NAIK',
  'nirmalnaik1402@gmail.com',
  '8093421865',
  '8093421865',
  'Digital Communications',
  'System Administrator',
  'system_admin',
  '$2a$12$cbr/Yf96fTcsCCUNnZcNVO/U35hGTuSWMsLfo7c3nPPkKMzBT3qrC',
  TRUE
)
ON CONFLICT (employee_id) DO UPDATE SET
  full_name       = 'NIRMAL NAIK',
  email           = 'nirmalnaik1402@gmail.com',
  phone           = '8093421865',
  whatsapp        = '8093421865',
  department      = 'Digital Communications',
  designation     = 'System Administrator',
  role            = 'system_admin',
  is_system_admin = TRUE,
  password_hash   = '$2a$12$cbr/Yf96fTcsCCUNnZcNVO/U35hGTuSWMsLfo7c3nPPkKMzBT3qrC',
  updated_at      = NOW();

-- Note: The hash above is a valid bcrypt hash (12 rounds) corresponding to "1admin".
