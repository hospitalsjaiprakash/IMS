-- Migration 027: Structured Clinical & Safety Training Completion Fields
-- Adds venue, pre/post competency assessment, and CAPA recommendations to incident_trainers

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incident_trainers' AND column_name = 'venue'
  ) THEN
    ALTER TABLE incident_trainers ADD COLUMN venue VARCHAR(255) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incident_trainers' AND column_name = 'pre_assessment'
  ) THEN
    ALTER TABLE incident_trainers ADD COLUMN pre_assessment VARCHAR(100) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incident_trainers' AND column_name = 'post_assessment'
  ) THEN
    ALTER TABLE incident_trainers ADD COLUMN post_assessment VARCHAR(100) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incident_trainers' AND column_name = 'capa_recommendations'
  ) THEN
    ALTER TABLE incident_trainers ADD COLUMN capa_recommendations TEXT DEFAULT NULL;
  END IF;
END $$;
