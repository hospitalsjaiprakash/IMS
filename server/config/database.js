const { Pool, types } = require('pg');
require('dotenv').config();

// Fix pg driver treating "timestamp without time zone" as local time
// OID 1114 is for timestamp without time zone. We append 'Z' to force UTC parsing.
types.setTypeParser(1114, function(stringValue) {
  return new Date(stringValue + 'Z');
});

const poolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  // Supabase and Render require SSL for remote connections
  if (process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = process.env.DB_PORT;
  poolConfig.database = process.env.DB_NAME;
  poolConfig.user = process.env.DB_USER;
  poolConfig.password = process.env.DB_PASSWORD;
  
  if (process.env.DB_HOST && process.env.DB_HOST.includes('supabase.co')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 1000) {
      console.warn('Slow query detected:', { text: text.substring(0, 100), duration });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

const getClient = () => pool.connect();

// Auto-check schema enhancements for department mappings & phone columns
pool.query(`
  ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS incharge_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asst_coo_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

  UPDATE departments
  SET assigned_user_id = COALESCE(hod_user_id, incharge_user_id)
  WHERE assigned_user_id IS NULL AND (hod_user_id IS NOT NULL OR incharge_user_id IS NOT NULL);

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

  ALTER TABLE master_employees
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS office_portal_id VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS office_location VARCHAR(128),
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

  CREATE TABLE IF NOT EXISTS department_reviewers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    reviewer_role VARCHAR(32) NOT NULL DEFAULT 'HOD',
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_department_reviewer_role UNIQUE (user_id, department_id, reviewer_role)
  );

  CREATE TABLE IF NOT EXISTS hrms_webhook_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(128) UNIQUE NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    signature_verified BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS hrms_sync_logs (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS',
    delta_cursor VARCHAR(255),
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_deactivated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
  );

  ALTER TABLE incident_responsible_employees
  ADD COLUMN IF NOT EXISTS training_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS training_verified_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS training_verified_by UUID REFERENCES users(id);

  ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
  ALTER TABLE incidents ADD CONSTRAINT incidents_status_check 
    CHECK (status IN (
      'submitted', 'with_hod', 'with_hod_and_imc', 'with_imc', 
      'redirect_requested', 'with_investigator', 'with_imc_review',
      'with_head_management', 'pending_letter_generation',
      'pending_management_letter_approval', 'pending_trainer_assignment',
      'training_in_progress', 'pending_imc_training_review',
      'pending_imc_report', 'pending_training', 'resolved', 
      'closed', 'withdrawn', 'locked'
    ));
`).catch(err => console.warn('Schema check warning:', err.message));

module.exports = { query, getClient, pool };
