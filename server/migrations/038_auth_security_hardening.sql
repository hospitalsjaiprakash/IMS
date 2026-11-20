-- =============================================
-- MIGRATION 038: User Authentication Security Hardening
-- 1. Add users.token_version for immediate server-side JWT revocation
-- 2. Add security_otps.target_email + composite index for email-bound HMAC OTPs & 60s resend cooldowns
-- 3. Retire shared generic committee accounts (SYS_IMC, SYS_MGMT) while preserving root 00000 admin
-- =============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE security_otps
  ADD COLUMN IF NOT EXISTS target_email TEXT;

CREATE INDEX IF NOT EXISTS idx_security_otps_emp_action_created
  ON security_otps (employee_id, action, created_at DESC);

-- Retire shared generic committee accounts completely (all IMC/Management staff use named Employee IDs + switchRole)
UPDATE users
SET is_active = FALSE,
    token_version = COALESCE(token_version, 1) + 1,
    updated_at = NOW()
WHERE UPPER(TRIM(employee_id)) IN ('SYS_IMC', 'SYS_MGMT');

-- Ensure root System Admin (00000) remains active and system_admin
UPDATE users
SET is_active = TRUE,
    role = 'system_admin',
    is_system_admin = TRUE,
    updated_at = NOW()
WHERE TRIM(employee_id) = '00000';
