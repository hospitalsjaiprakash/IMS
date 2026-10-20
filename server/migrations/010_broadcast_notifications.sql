ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255);
