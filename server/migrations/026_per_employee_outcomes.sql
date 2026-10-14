-- MIGRATION 026: Add per-employee outcomes and penalty amount to incident_responsible_employees

ALTER TABLE incident_responsible_employees 
ADD COLUMN IF NOT EXISTS outcomes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS penalty_amount_words VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Backfill existing rows: if incident has proposed_outcome, assign it as default outcomes array if employee has none
UPDATE incident_responsible_employees ire
SET outcomes = string_to_array(i.proposed_outcome, ', ')
FROM incidents i
WHERE ire.incident_id = i.id 
  AND (ire.outcomes IS NULL OR ire.outcomes = '{}')
  AND i.proposed_outcome IS NOT NULL
  AND i.proposed_outcome != '';

-- Also ensure needs_training is synced: if 'training' or 'counselling' is in outcomes, set needs_training = TRUE
UPDATE incident_responsible_employees
SET needs_training = TRUE
WHERE needs_training = FALSE 
  AND EXISTS (
    SELECT 1 FROM unnest(outcomes) AS o
    WHERE LOWER(o) LIKE '%training%' OR LOWER(o) LIKE '%counselling%' OR LOWER(o) LIKE '%education%'
  );
