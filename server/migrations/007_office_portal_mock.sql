-- =============================================
-- MIGRATION: Mock Office Portal Database
-- Used as fallback HR records when external Office Portal API is not available.
-- Note: External Office Portal API returns ONLY: name, employee_id, email, phone, department, designation.
-- (WhatsApp number is NOT part of Office Portal data; it is collected during IMS account creation.)
-- =============================================

CREATE TABLE IF NOT EXISTS office_portal_employees (
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

-- Remove whatsapp column if previously added during earlier mock schema tests
ALTER TABLE office_portal_employees DROP COLUMN IF EXISTS whatsapp;

-- ============================================================================
-- INSERT / UPDATE HR EMPLOYEES (MOCK DATA FOR TESTING ACCOUNT CREATION)
-- ============================================================================
-- When an employee registers in IMS, the backend checks if employee_id and name 
-- match these portal records, then creates their IMS account with password & whatsapp.
-- ============================================================================

INSERT INTO office_portal_employees (employee_id, name, email, phone, department, designation, role)
VALUES
  -- Existing System Accounts & HODs
  ('13574', 'NIRMAL NAIK', 'nirmalnaik1402@gmail.com', '8093421865', 'Digital Communications', 'Digital Communication Assistant', 'system_admin'),
  ('11111', 'Shubhransu Samal', 'shubhransusamal1998@gmail.com', '8249316764', 'Digital Communications', 'HOD', 'hod'),

  -- Medical Services
  ('10101', 'Dr. Rajesh Sharma', 'rajesh.sharma@jphrc.org', '9876543210', 'Medical Services', 'Chief Medical Officer (HOD)', 'hod'),
  ('10102', 'Dr. Ananya Sen', 'ananya.sen@jphrc.org', '9876543211', 'Medical Services', 'Senior Consultant', 'employee'),
  ('10103', 'Dr. Vikram Pradhan', 'vikram.pradhan@jphrc.org', '9876543212', 'Medical Services', 'Resident Doctor', 'employee'),

  -- Nursing Services
  ('10201', 'Sister Mary Mathew', 'mary.mathew@jphrc.org', '9876543213', 'Nursing Services', 'Nursing Superintendent (HOD)', 'hod'),
  ('10202', 'Priyanka Mohanty', 'priyanka.mohanty@jphrc.org', '9876543214', 'Nursing Services', 'Senior Staff Nurse', 'employee'),
  ('10203', 'Sujata Sahoo', 'sujata.sahoo@jphrc.org', '9876543215', 'Nursing Services', 'ICU Staff Nurse', 'employee'),

  -- Purchase
  ('10301', 'Ashok Kumar Mishra', 'ashok.mishra@jphrc.org', '9876543216', 'Purchase', 'Purchase Manager (HOD)', 'hod'),
  ('10302', 'Rakesh Patnaik', 'rakesh.patnaik@jphrc.org', '9876543217', 'Purchase', 'Purchase Executive', 'employee'),

  -- Finance and Accounts
  ('10401', 'Siddharth Agarwal', 'siddharth.agarwal@jphrc.org', '9876543218', 'Finance and Accounts', 'Chief Financial Officer (HOD)', 'hod'),
  ('10402', 'Neha Gupta', 'neha.gupta@jphrc.org', '9876543219', 'Finance and Accounts', 'Senior Accountant', 'employee'),

  -- Human Resource
  ('10501', 'Sunita Rao', 'sunita.rao@jphrc.org', '9876543220', 'Human Resource', 'HR Manager (HOD)', 'hod'),
  ('10502', 'Amitabh Das', 'amitabh.das@jphrc.org', '9876543221', 'Human Resource', 'HR Executive', 'employee'),

  -- Quality Management
  ('22222', 'Biswa Ranjan Dash', 'naiknirmal1402@gmail.com', '8249991648', 'Quality Management', 'HOD', 'hod'),

  -- Patient Care
  ('10701', 'Meenakshi Sundaram', 'meenakshi.s@jphrc.org', '9876543223', 'Patient Care', 'Patient Relations Head (HOD)', 'hod'),
  ('10702', 'Kiran Bala', 'kiran.bala@jphrc.org', '9876543224', 'Patient Care', 'Patient Care Executive', 'employee'),

  -- Bio-Medical
  ('10801', 'Sandeep Kulkarni', 'sandeep.kulkarni@jphrc.org', '9876543225', 'Bio-Medical', 'Biomedical Engineer Head (HOD)', 'hod'),
  ('10802', 'Rahul Nair', 'rahul.nair@jphrc.org', '9876543226', 'Bio-Medical', 'Junior Biomedical Engineer', 'employee'),

  -- Fire Safety
  ('10901', 'Major (Retd.) K. Singh', 'k.singh@jphrc.org', '9876543227', 'Fire Safety', 'Chief Safety Officer (HOD)', 'hod'),
  ('10902', 'Devendra Yadav', 'devendra.yadav@jphrc.org', '9876543228', 'Fire Safety', 'Fire Safety Inspector', 'employee'),

  -- Lab Medicine
  ('11001', 'Dr. Swati Ghosh', 'swati.ghosh@jphrc.org', '9876543229', 'Lab Medicine', 'Head of Pathology (HOD)', 'hod'),
  ('11002', 'Manas Behera', 'manas.behera@jphrc.org', '9876543230', 'Lab Medicine', 'Senior Lab Technician', 'employee'),

  -- Radiology
  ('11201', 'Dr. Alok Chatterjee', 'alok.chatterjee@jphrc.org', '9876543231', 'Radiology', 'Head of Radiology (HOD)', 'hod'),
  ('11202', 'Rohan Tripathy', 'rohan.tripathy@jphrc.org', '9876543232', 'Radiology', 'X-Ray & MRI Technician', 'employee'),

  -- Infection Control and Microbiology
  ('11301', 'Dr. Priti Banerjee', 'priti.banerjee@jphrc.org', '9876543233', 'Infection Control and Microbiology', 'Infection Control Officer (HOD)', 'hod'),
  ('11302', 'Lopamudra Rout', 'lopamudra.rout@jphrc.org', '9876543234', 'Infection Control and Microbiology', 'Microbiology Nurse', 'employee')

ON CONFLICT (employee_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  department = EXCLUDED.department,
  designation = EXCLUDED.designation,
  role = EXCLUDED.role;