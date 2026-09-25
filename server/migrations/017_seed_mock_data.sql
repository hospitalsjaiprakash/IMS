-- =============================================
-- Migration 017: Seed Mock Data for All Roles
-- System Administrator: Sourav Barik (12243)
-- =============================================

-- 1. Insert/Update System Administrator & Key Role Employees into master_employees
INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role)
VALUES
  -- System Administrator
  ('12243', 'Sourav Barik', 'sourav.barik@jphrc.org', '9876543200', 'Digital Communications', 'System Administrator', 'system_admin'),

  -- Management
  ('10001', 'Dr. Alok Mohanty', 'alok.mohanty@jphrc.org', '9876543201', 'MD Office', 'Medical Director', 'head_management'),
  ('10002', 'Dr. Debasis Panda', 'debasis.panda@jphrc.org', '9876543202', 'MD Office', 'Managing Director', 'head_management'),

  -- Incident Management Committee (IMC)
  ('22222', 'Dr. Biswa Ranjan Dash', 'biswaranjan.dash@jphrc.org', '8249991648', 'Quality Management', 'Head of Quality & IMC Lead', 'imc'),
  ('11301', 'Dr. Priti Banerjee', 'priti.banerjee@jphrc.org', '9876543233', 'Infection Control and Microbiology', 'Infection Control Officer & IMC Member', 'imc'),

  -- HODs
  ('10101', 'Dr. Rajesh Sharma', 'rajesh.sharma@jphrc.org', '9876543210', 'Medical Services', 'Chief Medical Officer (HOD)', 'hod'),
  ('10201', 'Sister Mary Mathew', 'mary.mathew@jphrc.org', '9876543213', 'Nursing Services', 'Nursing Superintendent (HOD)', 'hod'),
  ('10301', 'Ashok Kumar Mishra', 'ashok.mishra@jphrc.org', '9876543216', 'Purchase', 'Purchase Manager (HOD)', 'hod'),
  ('10401', 'Siddharth Agarwal', 'siddharth.agarwal@jphrc.org', '9876543218', 'Finance and Accounts', 'Chief Financial Officer (HOD)', 'hod'),
  ('10501', 'Sunita Rao', 'sunita.rao@jphrc.org', '9876543220', 'Human Resource', 'HR Manager (HOD)', 'hod'),
  ('10701', 'Meenakshi Sundaram', 'meenakshi.s@jphrc.org', '9876543223', 'Patient Care', 'Patient Relations Head (HOD)', 'hod'),
  ('10801', 'Sandeep Kulkarni', 'sandeep.kulkarni@jphrc.org', '9876543225', 'Bio-Medical', 'Biomedical Engineer Head (HOD)', 'hod'),
  ('10901', 'Major (Retd.) K. Singh', 'k.singh@jphrc.org', '9876543227', 'Fire Safety', 'Chief Safety Officer (HOD)', 'hod'),
  ('11001', 'Dr. Swati Ghosh', 'swati.ghosh@jphrc.org', '9876543229', 'Lab Medicine', 'Head of Pathology (HOD)', 'hod'),
  ('11111', 'Shubhransu Samal', 'shubhransu.samal@jphrc.org', '8249316764', 'Digital Communications', 'HOD', 'hod'),
  ('11201', 'Dr. Alok Chatterjee', 'alok.chatterjee@jphrc.org', '9876543231', 'Radiology', 'Head of Radiology (HOD)', 'hod'),

  -- Staff Employees
  ('10102', 'Dr. Ananya Sen', 'ananya.sen@jphrc.org', '9876543211', 'Medical Services', 'Senior Consultant', 'employee'),
  ('10202', 'Priyanka Mohanty', 'priyanka.mohanty@jphrc.org', '9876543214', 'Nursing Services', 'Senior Staff Nurse', 'employee'),
  ('10203', 'Sujata Sahoo', 'sujata.sahoo@jphrc.org', '9876543215', 'Nursing Services', 'ICU Staff Nurse', 'employee'),
  ('10302', 'Rakesh Patnaik', 'rakesh.patnaik@jphrc.org', '9876543217', 'Purchase', 'Purchase Executive', 'employee'),
  ('10402', 'Neha Gupta', 'neha.gupta@jphrc.org', '9876543219', 'Finance and Accounts', 'Senior Accountant', 'employee'),
  ('10502', 'Amitabh Das', 'amitabh.das@jphrc.org', '9876543221', 'Human Resource', 'HR Executive', 'employee'),
  ('10802', 'Rahul Nair', 'rahul.nair@jphrc.org', '9876543226', 'Bio-Medical', 'Junior Biomedical Engineer', 'employee'),
  ('10902', 'Devendra Yadav', 'devendra.yadav@jphrc.org', '9876543228', 'Fire Safety', 'Fire Safety Inspector', 'employee'),
  ('11002', 'Manas Behera', 'manas.behera@jphrc.org', '9876543230', 'Lab Medicine', 'Senior Lab Technician', 'employee'),
  ('11202', 'Rohan Tripathy', 'rohan.tripathy@jphrc.org', '9876543232', 'Radiology', 'X-Ray & MRI Technician', 'employee'),
  ('13574', 'NIRMAL NAIK', 'nirmalnaik1402@gmail.com', '8093421865', 'Digital Communications', 'Department Assistant', 'employee')
ON CONFLICT (employee_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  department = EXCLUDED.department,
  designation = EXCLUDED.designation,
  role = EXCLUDED.role;

-- 2. Insert/Update Users with Active Passwords (Password@123 / 1admin)
INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, is_system_admin, is_imc_member, is_imc_lead, is_management_member, password_hash, is_active)
VALUES
  -- Sourav Barik - System Administrator (password: 1admin)
  ('12243', 'Sourav Barik', 'sourav.barik@jphrc.org', '9876543200', 'Digital Communications', 'System Administrator', 'system_admin', true, false, false, false, '$2a$10$mXidzhhKBfVUaeeXBjI6WOdyj7LWtvspoAlBP4m7QGn5GkJX6iDcC', true),
  
  -- Dr. Alok Mohanty - Head Management (password: Password@123)
  ('10001', 'Dr. Alok Mohanty', 'alok.mohanty@jphrc.org', '9876543201', 'MD Office', 'Medical Director', 'head_management', false, false, false, true, '$2a$10$7JVdW2L6Y0DYw9XS91XlgO6XKvro9Hx2Dcnl1aLHoNYy3md2t5Tz2', true),

  -- Dr. Biswa Ranjan Dash - IMC Lead (password: Password@123)
  ('22222', 'Dr. Biswa Ranjan Dash', 'biswaranjan.dash@jphrc.org', '8249991648', 'Quality Management', 'Head of Quality & IMC Lead', 'imc', false, true, true, false, '$2a$10$7JVdW2L6Y0DYw9XS91XlgO6XKvro9Hx2Dcnl1aLHoNYy3md2t5Tz2', true),

  -- Sister Mary Mathew - HOD Nursing Services (password: Password@123)
  ('10201', 'Sister Mary Mathew', 'mary.mathew@jphrc.org', '9876543213', 'Nursing Services', 'Nursing Superintendent (HOD)', 'hod', false, false, false, false, '$2a$10$7JVdW2L6Y0DYw9XS91XlgO6XKvro9Hx2Dcnl1aLHoNYy3md2t5Tz2', true),

  -- Dr. Rajesh Sharma - HOD Medical Services (password: Password@123)
  ('10101', 'Dr. Rajesh Sharma', 'rajesh.sharma@jphrc.org', '9876543210', 'Medical Services', 'Chief Medical Officer (HOD)', 'hod', false, false, false, false, '$2a$10$7JVdW2L6Y0DYw9XS91XlgO6XKvro9Hx2Dcnl1aLHoNYy3md2t5Tz2', true),

  -- Priyanka Mohanty - Senior Staff Nurse (password: Password@123)
  ('10202', 'Priyanka Mohanty', 'priyanka.mohanty@jphrc.org', '9876543214', 'Nursing Services', 'Senior Staff Nurse', 'employee', false, false, false, false, '$2a$10$7JVdW2L6Y0DYw9XS91XlgO6XKvro9Hx2Dcnl1aLHoNYy3md2t5Tz2', true)
ON CONFLICT (employee_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  department = EXCLUDED.department,
  designation = EXCLUDED.designation,
  role = EXCLUDED.role,
  is_system_admin = EXCLUDED.is_system_admin,
  is_imc_member = EXCLUDED.is_imc_member,
  is_imc_lead = EXCLUDED.is_imc_lead,
  is_management_member = EXCLUDED.is_management_member,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  updated_at = NOW();
