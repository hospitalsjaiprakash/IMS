-- 018_redirect_and_email_settings.sql
-- Add redirect tracking columns and email notification system config

ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS redirect_requested_by_user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS redirect_rejected_reason TEXT,
ADD COLUMN IF NOT EXISTS redirect_rejected_at TIMESTAMP;

INSERT INTO system_config (key, value) VALUES
  ('email_notifications_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
