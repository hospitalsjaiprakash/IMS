-- =============================================
-- JAIPRAKASH HOSPITAL IMS - Database Schema
-- =============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  department VARCHAR(100),
  designation VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'employee'
    CHECK (role IN ('employee', 'hod', 'imc', 'head_management', 'system_admin')),
  is_imc_lead BOOLEAN DEFAULT FALSE,
  whatsapp_notifications BOOLEAN DEFAULT TRUE,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- LOCATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS main_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sub_locations (
  id SERIAL PRIMARY KEY,
  main_location_id INTEGER REFERENCES main_locations(id),
  name VARCHAR(100) NOT NULL
);

-- Seed locations
INSERT INTO main_locations (name) VALUES
  ('Dandiapali Main Hospital'),
  ('Uditnagar City Center'),
  ('Rajgangpur City Center')
ON CONFLICT DO NOTHING;

INSERT INTO sub_locations (main_location_id, name) VALUES
  (1, '1st Floor'), (1, '2nd Floor'), (1, '3rd Floor'),
  (1, 'ICU'), (1, 'OPD'), (1, 'Emergency'), (1, 'Admin'),
  (1, 'Pharmacy'), (1, 'Laboratory'), (1, 'Radiology'),
  (1, 'Operation Theatre'), (1, 'Ward A'), (1, 'Ward B'),
  (1, 'Cafeteria'), (1, 'Reception'),
  (2, 'Ground Floor'), (2, 'OPD'), (2, 'Admin'), (2, 'Pharmacy'), (2, 'Laboratory'),
  (3, 'Ground Floor'), (3, 'OPD'), (3, 'Admin'), (3, 'Pharmacy'), (3, 'Laboratory')
ON CONFLICT DO NOTHING;

-- =============================================
-- DEPARTMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  hod_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO departments (name) VALUES
  ('Medical Services'), ('Nursing Services'), ('Purchase'), ('Finance and Accounts'),
  ('Public Relations'), ('Legal Cell'), ('Corporate Relations and Business Development'),
  ('Human Resource'), ('Facility'), ('Food and Beverages'), ('Housekeeping'),
  ('Linen and Laundry'), ('Ambulance / Travel / Transport'), ('Security Services'),
  ('Quality Management'), ('Training and Development'), ('Stores'), ('Fire Safety'),
  ('Patient Care'), ('General Maintenance'), ('Bio-Medical'), ('Digital Communications'),
  ('Strategy and External Communications'), ('Asset'), ('JPIEE'), ('Lab Medicine'),
  ('Blood Centre'), ('Radiology'), ('MD Office'), ('Infection Control and Microbiology')
ON CONFLICT DO NOTHING;

-- =============================================
-- INCIDENTS
-- =============================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_id VARCHAR(30) UNIQUE NOT NULL,
  year INTEGER NOT NULL,
  seq_number INTEGER NOT NULL,

  -- Reporter
  reporter_id UUID NOT NULL REFERENCES users(id),

  -- Date & Time
  incident_date DATE NOT NULL,
  incident_time TIME NOT NULL,

  -- Location
  main_location_id INTEGER REFERENCES main_locations(id),
  sub_location_id INTEGER REFERENCES sub_locations(id),

  -- Details
  occurred_to VARCHAR(50) NOT NULL
    CHECK (occurred_to IN ('Patient', 'Hospital Employee', 'Visitor', 'Asset/Consumables', 'Process Flow', 'Others')),
  severity VARCHAR(20) NOT NULL
    CHECK (severity IN ('Minor', 'Major', 'Grave')),
  incident_category VARCHAR(150) NOT NULL,
  incident_type VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,

  -- Accountability
  has_responsible_person BOOLEAN DEFAULT FALSE,
  responsible_person_name VARCHAR(255),

  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'with_hod', 'with_hod_and_imc', 'with_imc',
      'redirect_requested', 'with_head_management', 'resolved', 'withdrawn', 'locked')),

  -- Withdrawal
  withdrawn_at TIMESTAMP,
  withdrawn_reason TEXT,

  -- HOD first view tracking
  hod_first_viewed_at TIMESTAMP,

  -- Duplicate detection
  potential_duplicate_of UUID REFERENCES incidents(id),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,

  -- Reminder tracking
  last_reminder_day INTEGER DEFAULT 0,
  reminder_last_sent TIMESTAMP
);

-- Sequential numbering per year
CREATE SEQUENCE IF NOT EXISTS incident_seq_2026 START 1;

-- =============================================
-- INCIDENT DEPARTMENTS (multi-department)
-- =============================================
CREATE TABLE IF NOT EXISTS incident_departments (
  id SERIAL PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  UNIQUE(incident_id, department_id)
);

-- =============================================
-- ATTACHMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id),
  stage VARCHAR(30) NOT NULL
    CHECK (stage IN ('submission', 'hod_feedback', 'imc_feedback', 'investigator_report', 'md_decision')),
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100),
  virus_scan_result VARCHAR(20) DEFAULT 'pending'
    CHECK (virus_scan_result IN ('pending', 'clean', 'infected', 'failed')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- FEEDBACKS
-- =============================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(30) NOT NULL
    CHECK (role IN ('hod', 'imc', 'investigator', 'head_management')),
  department_id INTEGER REFERENCES departments(id),
  feedback_text TEXT NOT NULL,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- IMC CLAIMS
-- =============================================
CREATE TABLE IF NOT EXISTS imc_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  claimed_by UUID NOT NULL REFERENCES users(id),
  claimed_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  released_at TIMESTAMP,
  force_released_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE
);

-- =============================================
-- INVESTIGATORS
-- =============================================
CREATE TABLE IF NOT EXISTS investigators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  investigator_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  report_text TEXT,
  status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed'))
);

-- =============================================
-- TRAINING TRACKER
-- =============================================
CREATE TABLE IF NOT EXISTS training_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES users(id),
  training_notes TEXT
);

-- =============================================
-- FINAL REPORTS
-- =============================================
CREATE TABLE IF NOT EXISTS final_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL REFERENCES users(id),
  fault_type VARCHAR(255),
  corrective_actions TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  pdf_filename VARCHAR(255),
  version INTEGER DEFAULT 1,
  is_latest BOOLEAN DEFAULT TRUE
);


-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- AUDIT LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  incident_id UUID REFERENCES incidents(id),
  action VARCHAR(100) NOT NULL,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- KNOWLEDGE BASE
-- =============================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  incident_type VARCHAR(50),
  department_id INTEGER REFERENCES departments(id),
  root_cause TEXT,
  preventive_actions TEXT,
  tags TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- SYSTEM CONFIG
-- =============================================
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_config (key, value) VALUES
  ('sla_days', '7'),
  ('claim_lock_minutes', '30'),
  ('parallel_grave_review', 'true'),
  ('data_retention_years', '5'),
  ('withdrawn_retention_years', '2')
ON CONFLICT DO NOTHING;

-- =============================================
-- ROLE AUDIT TRAIL
-- =============================================
CREATE TABLE IF NOT EXISTS role_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  previous_role VARCHAR(50),
  new_role VARCHAR(50),
  changed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- QR CODES
-- =============================================
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  main_location_id INTEGER REFERENCES main_locations(id),
  sub_location_id INTEGER REFERENCES sub_locations(id),
  qr_data TEXT NOT NULL,
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_ref ON incidents(reference_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_incident ON feedbacks(incident_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_incident_departments ON incident_departments(incident_id, department_id);
CREATE INDEX IF NOT EXISTS idx_kb_search ON knowledge_base USING gin(to_tsvector('english', title || ' ' || COALESCE(root_cause, '') || ' ' || COALESCE(tags, '')));
