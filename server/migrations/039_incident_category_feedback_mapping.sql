-- ==============================================================================
-- Migration 039: Incident Category -> Feedback Staff Mapping & Category Routing
-- Replaces department-bound incident routing with Incident Category -> Concerned
-- Department Staff assignments (allowing any active employee without forcing HOD role).
-- ==============================================================================

-- 1. Canonical Incident Categories table
CREATE TABLE IF NOT EXISTS incident_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO incident_categories (name) VALUES
  ('Asset Related'),
  ('Billing Related'),
  ('Security Related'),
  ('Biomedical Related'),
  ('Blood Bank Related'),
  ('Facility Related'),
  ('Doctor Related'),
  ('Consent Related'),
  ('CSSD Related'),
  ('Food and Beverages'),
  ('General Maintenance related'),
  ('Hospital Emergency Codes Related'),
  ('HR Related'),
  ('Housekeeping Related'),
  ('Infection Control Related'),
  ('Lab Related'),
  ('Laundry and Linen related'),
  ('Medication Related'),
  ('Nursing Care Related'),
  ('Purchase Related'),
  ('Radiology Related'),
  ('Store Related'),
  ('Software/Hardware Related'),
  ('Surgery or Procedure Related'),
  ('Nursing Document Related'),
  ('Vehicle and Ambulance Related'),
  ('Accommodation Related')
ON CONFLICT (name) DO NOTHING;

-- 2. Mapping table: Incident Category -> Assigned Concerned Department Staff (any active employee)
CREATE TABLE IF NOT EXISTS category_feedback_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id INTEGER NOT NULL REFERENCES incident_categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_assignees_cat_active ON category_feedback_assignees(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cat_assignees_user_active ON category_feedback_assignees(user_id, is_active);

-- 3. Multi-category links per incident (supports reporting, redirection, and involvement)
CREATE TABLE IF NOT EXISTS incident_category_links (
  id SERIAL PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES incident_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_inc_cat_links_incident ON incident_category_links(incident_id);
CREATE INDEX IF NOT EXISTS idx_inc_cat_links_category ON incident_category_links(category_id);

-- 4. Track which category a reviewer feedback was submitted for
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES incident_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_feedbacks_category ON feedbacks(incident_id, category_id);

-- 5. Track redirecting category alongside legacy department column
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS redirect_requested_by_category VARCHAR(150);

-- 6. Backfill incident_category_links for any existing incidents
INSERT INTO incident_categories (name)
SELECT DISTINCT TRIM(i.incident_category)
FROM incidents i
WHERE i.incident_category IS NOT NULL
  AND TRIM(i.incident_category) <> ''
  AND TRIM(i.incident_category) <> 'Others'
ON CONFLICT (name) DO NOTHING;

INSERT INTO incident_category_links (incident_id, category_id)
SELECT i.id, ic.id
FROM incidents i
JOIN incident_categories ic ON LOWER(TRIM(ic.name)) = LOWER(TRIM(i.incident_category))
ON CONFLICT (incident_id, category_id) DO NOTHING;
