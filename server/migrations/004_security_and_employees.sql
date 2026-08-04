-- =============================================
-- JAIPRAKASH HOSPITAL IMS - Security and Employees
-- =============================================

-- Create role_credentials table for committee access
CREATE TABLE IF NOT EXISTS role_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(50) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert generic credentials for committees (hashed with bcrypt)
INSERT INTO role_credentials (role, username, password_hash) VALUES
  ('imc', 'IMC2026', '$2a$10$eA/lzk9CgepCfR1B4GtJpO3v62/ZoBmVGv.Ct/KMybx.sn10K8i.6'),
  ('head_management', 'MGMT2026', '$2a$10$gMboFnx8ROZPeEoq7HUXGuaSJi/5RoCPXzSH/bt9haJwjefK8Ab02'),
  ('system_admin', 'SYSTEM2026', '$2a$10$2.fTo1nrq9KJEheEqgK4XuW/EZhTRW6/RzqSYcUyLzxeXSSdQBLde')
ON CONFLICT (role) DO UPDATE SET 
  username = EXCLUDED.username,
  password_hash = EXCLUDED.password_hash;

-- Migrate employees from load_employees.js into the database
-- Clear existing non-admin users and their incidents to avoid FK errors (from load_employees.js logic)
DELETE FROM incident_departments;
DELETE FROM feedbacks;
DELETE FROM notifications;
DELETE FROM audit_logs;
DELETE FROM role_audit;
DELETE FROM incidents;
DELETE FROM users WHERE role NOT IN ('system_admin', 'head_management');

-- Pre-seeded employees removed in favor of pure RBAC and Office Portal DB registration flow

