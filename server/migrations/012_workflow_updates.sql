-- 012_workflow_updates.sql

-- 1. Make Severity nullable and add 'Pending' as a valid option
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_severity_check;
ALTER TABLE incidents ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE incidents ALTER COLUMN severity SET DEFAULT 'Pending';
ALTER TABLE incidents ADD CONSTRAINT incidents_severity_check 
  CHECK (severity IS NULL OR severity IN ('Minor', 'Major', 'Grave', 'Pending'));

-- 2. Update existing incidents that might have no severity to 'Pending'
UPDATE incidents SET severity = 'Pending' WHERE severity IS NULL OR severity = '';

-- 3. Create the incident_responsible_employees table
CREATE TABLE IF NOT EXISTS incident_responsible_employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id),
  department_id INTEGER REFERENCES departments(id),
  needs_training BOOLEAN DEFAULT FALSE,
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying responsible employees efficiently
CREATE INDEX IF NOT EXISTS idx_responsible_employees_incident ON incident_responsible_employees(incident_id);
CREATE INDEX IF NOT EXISTS idx_responsible_employees_employee ON incident_responsible_employees(employee_id);
