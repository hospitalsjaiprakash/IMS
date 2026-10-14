-- =============================================
-- MIGRATION 025: Trainer Appointment Letter & Incident Needs Training Flag
-- =============================================

-- 1. Add needs_training flag to incidents
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS needs_training BOOLEAN DEFAULT FALSE;

-- Backfill needs_training based on active status, proposed outcome, or responsible employees
UPDATE incidents
SET needs_training = TRUE
WHERE status IN ('pending_trainer_assignment', 'training_in_progress', 'pending_imc_training_review', 'pending_training')
   OR LOWER(COALESCE(proposed_outcome, '')) LIKE '%training%'
   OR EXISTS (
     SELECT 1 FROM incident_responsible_employees r 
     WHERE r.incident_id = incidents.id AND r.needs_training = TRUE
   );

-- 2. Expand incident_letters template_type check constraint to support trainer appointment letters
ALTER TABLE incident_letters DROP CONSTRAINT IF EXISTS incident_letters_template_type_check;
ALTER TABLE incident_letters ADD CONSTRAINT incident_letters_template_type_check
CHECK (template_type IN (
  'advisory', 'advisory_letter',
  'suggestion', 'suggestion_letter',
  'warning', 'warning_letter',
  'warning_penalty', 'warning_penalty_letter',
  'penalty', 'penalty_letter',
  'salary_deduction', 'salary_deduction_letter',
  'training', 'training_letter',
  'trainer_appointment', 'trainer_appointment_letter',
  'custom', 'custom_letter',
  'counselling', 'counselling_letter',
  'suspension', 'suspension_letter',
  'termination', 'termination_letter'
));

-- 3. Add appointment_letter_id reference to incident_trainers
ALTER TABLE incident_trainers ADD COLUMN IF NOT EXISTS appointment_letter_id UUID REFERENCES incident_letters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incident_trainers_letter ON incident_trainers(appointment_letter_id);
