-- Migration 028: IMC Outcome & Decision Preservation
-- Adds dedicated columns to preserve IMC recommendations, severity, and responsible employee snapshots
-- Adds stage and proposed_outcome to feedbacks to track multi-turn iterations (re-investigation, revisions, management decisions)

DO $$ 
BEGIN
  -- 1. Incidents Table Columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incidents' AND column_name = 'imc_proposed_outcome'
  ) THEN
    ALTER TABLE incidents ADD COLUMN imc_proposed_outcome TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incidents' AND column_name = 'imc_severity'
  ) THEN
    ALTER TABLE incidents ADD COLUMN imc_severity VARCHAR(50) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incidents' AND column_name = 'imc_responsible_employees'
  ) THEN
    ALTER TABLE incidents ADD COLUMN imc_responsible_employees JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- 2. Feedbacks Table Columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'feedbacks' AND column_name = 'stage'
  ) THEN
    ALTER TABLE feedbacks ADD COLUMN stage VARCHAR(50) DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'feedbacks' AND column_name = 'proposed_outcome'
  ) THEN
    ALTER TABLE feedbacks ADD COLUMN proposed_outcome TEXT DEFAULT NULL;
  END IF;

  -- 3. Backfill JPHRC/IMS/2026/0009 where IMC proposed No Action and Management modified to Counselling / Training
  UPDATE incidents 
  SET imc_proposed_outcome = 'No Action',
      imc_severity = 'Minor',
      imc_responsible_employees = '[{"full_name": "RANI JIT", "emp_id": "11989", "department_name": "DIGITAL COMMUNICATION", "outcomes": ["No Action"]}]'::jsonb
  WHERE reference_id = 'JPHRC/IMS/2026/0009';

  -- 4. General backfill for existing incidents where IMC proposal was not explicitly stored
  UPDATE incidents
  SET imc_proposed_outcome = proposed_outcome,
      imc_severity = COALESCE(severity, 'Minor')
  WHERE imc_proposed_outcome IS NULL AND proposed_outcome IS NOT NULL;

END $$;
