-- =============================================
-- MIGRATION 030: Add training tracking columns to incident_responsible_employees & ensure status constraint
-- =============================================

ALTER TABLE incident_responsible_employees 
ADD COLUMN IF NOT EXISTS training_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS training_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS training_verified_by UUID REFERENCES users(id);

ALTER TABLE incidents ALTER COLUMN status TYPE VARCHAR(60);
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
