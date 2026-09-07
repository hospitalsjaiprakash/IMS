-- =============================================
-- MIGRATION: Master Employee Database
-- Replaces office_portal_employees with a formalized master list
-- =============================================

-- 1. Create the new formal table
CREATE TABLE IF NOT EXISTS master_employees (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  department VARCHAR(100),
  designation VARCHAR(100),
  role VARCHAR(50) DEFAULT 'employee',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Insert any existing users from the `users` table into `master_employees` 
-- so that current active users are recognized as valid master employees.
INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role)
SELECT employee_id, full_name, email, phone, department, designation, role
FROM users
ON CONFLICT (employee_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = COALESCE(master_employees.email, EXCLUDED.email),
  phone = COALESCE(master_employees.phone, EXCLUDED.phone),
  department = COALESCE(master_employees.department, EXCLUDED.department),
  designation = COALESCE(master_employees.designation, EXCLUDED.designation),
  role = COALESCE(master_employees.role, EXCLUDED.role);

-- 3. Drop the old mock table since it's no longer required
DROP TABLE IF EXISTS office_portal_employees;
