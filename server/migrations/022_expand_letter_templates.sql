-- Migration 022: Expand incident_letters template_type check constraint
-- Supports both short keys ('warning', 'penalty', 'training', 'advisory', 'suggestion', 'custom') 
-- and full template names ('warning_letter', 'warning_penalty_letter', etc.)

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
  'custom', 'custom_letter',
  'counselling', 'counselling_letter',
  'suspension', 'suspension_letter',
  'termination', 'termination_letter'
));
