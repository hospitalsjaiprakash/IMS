-- =============================================
-- MIGRATION 024: Expand incident_trainers status constraint to include 'closed' and 'verified'
-- =============================================

ALTER TABLE incident_trainers DROP CONSTRAINT IF EXISTS incident_trainers_status_check;
ALTER TABLE incident_trainers ADD CONSTRAINT incident_trainers_status_check 
  CHECK (status IN (
    'assigned',
    'completed',
    'verified',
    'verified_by_imc',
    'rework_requested',
    'closed'
  ));
