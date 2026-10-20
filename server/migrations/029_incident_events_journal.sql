-- Migration 029: Incident Events Journal & Multi-Turn Versioning
-- Implements an immutable, append-only event stream for hospital incident lifecycles.
-- Eliminates destructive overwrites on investigator panels, letter revisions, and training attempts.

-- 1. Create incident_events table
CREATE TABLE IF NOT EXISTS incident_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seq BIGSERIAL UNIQUE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  round_no INT DEFAULT 1,
  related_event_id UUID REFERENCES incident_events(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  actor_role VARCHAR(100),
  actor_designation VARCHAR(255),
  actor_department VARCHAR(255),
  status_before VARCHAR(100),
  status_after VARCHAR(100),
  title VARCHAR(255),
  summary TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  is_system_event BOOLEAN DEFAULT FALSE,
  source VARCHAR(20) DEFAULT 'live',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident_seq ON incident_events(incident_id, seq);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_occurred ON incident_events(incident_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_incident_events_is_system ON incident_events(incident_id, is_system_event);
CREATE INDEX IF NOT EXISTS idx_incident_events_type ON incident_events(event_type);

-- 2. Link attachments to specific events
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES incident_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_event_id ON attachments(event_id);

-- 3. Multi-turn panel preservation for investigators (deactivate instead of delete)
ALTER TABLE investigators ADD COLUMN IF NOT EXISTS round_no INT DEFAULT 1;
ALTER TABLE investigators ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_investigators_active ON investigators(incident_id, is_active);

-- 4. Multi-turn training attempt preservation
ALTER TABLE incident_trainers ADD COLUMN IF NOT EXISTS attempt_no INT DEFAULT 1;
ALTER TABLE incident_trainers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 5. Disciplinary & advisory letter revision history
CREATE TABLE IF NOT EXISTS incident_letter_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  letter_id UUID NOT NULL REFERENCES incident_letters(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  version_no INT NOT NULL DEFAULT 1,
  event_id UUID REFERENCES incident_events(id) ON DELETE SET NULL,
  template_type VARCHAR(100),
  reference_number VARCHAR(100),
  subject TEXT,
  salutation VARCHAR(255),
  body_text TEXT,
  penalty_amount NUMERIC(12, 2),
  penalty_amount_words TEXT,
  cc_recipients JSONB DEFAULT '[]'::jsonb,
  change_summary TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_letter_versions_letter ON incident_letter_versions(letter_id, version_no);
CREATE INDEX IF NOT EXISTS idx_letter_versions_incident ON incident_letter_versions(incident_id, created_at);
