-- Migration 040: Per-category Incident Types (#5) & Multi-file Training Evidence (#6)

-- #5: Store per-category incident_type on incident_category_links and widen summary column
ALTER TABLE incident_category_links
  ADD COLUMN IF NOT EXISTS incident_type VARCHAR(255);

ALTER TABLE incidents
  ALTER COLUMN incident_type TYPE TEXT;

UPDATE incident_category_links icl
SET incident_type = i.incident_type
FROM incidents i
WHERE i.id = icl.incident_id
  AND icl.incident_type IS NULL
  AND i.incident_type IS NOT NULL;

-- #6: Link multiple training report evidence attachments to an incident_trainers row
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS trainer_assignment_id UUID REFERENCES incident_trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_trainer_assignment
  ON attachments(trainer_assignment_id);

UPDATE attachments a
SET trainer_assignment_id = t.id
FROM incident_trainers t
WHERE t.trainer_attachment_id = a.id
  AND a.trainer_assignment_id IS NULL;
