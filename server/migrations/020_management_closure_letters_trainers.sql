-- =============================================
-- MIGRATION 020: Management-Led Incident Closure, Formal Letters & Trainer Assignments
-- =============================================

-- 1. Update incidents status constraint to include all streamlined lifecycle stages
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check 
  CHECK (status IN (
    'submitted', 
    'with_hod', 
    'with_hod_and_imc', 
    'with_imc', 
    'redirect_requested', 
    'with_investigator',
    'with_imc_review',
    'with_head_management', 
    'pending_letter_generation',
    'pending_management_letter_approval',
    'pending_trainer_assignment',
    'training_in_progress',
    'pending_imc_training_review',
    'pending_imc_report',
    'pending_training',
    'resolved', 
    'closed',
    'withdrawn', 
    'locked'
  ));

-- 2. Add Management Penalty fields to incidents
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(10,2);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS penalty_amount_words VARCHAR(255);

-- 3. Update attachments stage constraint
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_stage_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_stage_check
  CHECK (stage IN (
    'submission',
    'hod_feedback',
    'imc_feedback',
    'investigator_report',
    'md_decision',
    'imc_report',
    'formal_letter',
    'trainer_report'
  ));

-- 4. Create incident_letters table
CREATE TABLE IF NOT EXISTS incident_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  employee_id VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  recipient_emp_no VARCHAR(50),
  recipient_department VARCHAR(100),
  recipient_designation VARCHAR(100),
  recipient_email VARCHAR(255),
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN (
    'advisory_letter', 
    'suggestion_letter', 
    'warning_letter', 
    'warning_penalty_letter', 
    'training_letter', 
    'custom_letter'
  )),
  reference_number VARCHAR(100) NOT NULL,
  letter_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subject VARCHAR(255) NOT NULL,
  salutation VARCHAR(100),
  body_text TEXT NOT NULL,
  penalty_amount NUMERIC(10,2) DEFAULT NULL,
  penalty_amount_words VARCHAR(255) DEFAULT NULL,
  cc_recipients JSONB DEFAULT '[]'::jsonb,
  qr_code_url TEXT,
  status VARCHAR(50) DEFAULT 'drafted' CHECK (status IN (
    'drafted',
    'submitted_to_management',
    'approved',
    'dispatched',
    'rejected'
  )),
  revision_notes TEXT,
  drafted_by UUID REFERENCES users(id),
  drafted_at TIMESTAMP DEFAULT NOW(),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  dispatched_at TIMESTAMP,
  pdf_storage_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_letters_incident ON incident_letters(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_letters_employee ON incident_letters(employee_id);

-- 5. Create incident_trainers table
CREATE TABLE IF NOT EXISTS incident_trainers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  trainee_employee_id VARCHAR(50) NOT NULL,
  trainee_name VARCHAR(255) NOT NULL,
  trainee_department VARCHAR(100),
  trainee_designation VARCHAR(100),
  trainer_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  training_topic VARCHAR(255) NOT NULL,
  training_instructions TEXT,
  target_date DATE,
  status VARCHAR(50) DEFAULT 'assigned' CHECK (status IN (
    'assigned',
    'completed',
    'verified_by_imc',
    'rework_requested'
  )),
  conducted_at TIMESTAMP,
  duration_minutes INTEGER,
  methodology VARCHAR(255),
  trainer_report_text TEXT,
  trainer_attachment_id UUID REFERENCES attachments(id),
  imc_review_notes TEXT,
  imc_verified_by UUID REFERENCES users(id),
  imc_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_trainers_incident ON incident_trainers(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_trainers_trainer ON incident_trainers(trainer_id);
