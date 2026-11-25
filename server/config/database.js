const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const isTestEnv = process.env.NODE_ENV === 'test';
const envPath = path.resolve(__dirname, '../.env');
const testEnvPath = path.resolve(__dirname, '../.env.test');
const hasTestEnvFile = fs.existsSync(testEnvPath);
const callerExplicitDbName = process.env.DB_NAME;

// Always load server/.env with override: true so unrelated host shell DB vars never leak in
require('dotenv').config({ path: envPath, override: true });
if (isTestEnv) {
  if (hasTestEnvFile) {
    require('dotenv').config({ path: testEnvPath, override: true });
  }
  process.env.NODE_ENV = 'test';
}

const PRODUCTION_DB_NAME = 'jaiprakash_ims';
const DEFAULT_TEST_DB_NAME = 'jaiprakash_ims_test';

function extractDatabaseName(cfg) {
  if (cfg.database) {
    return String(cfg.database).trim();
  }
  if (cfg.connectionString) {
    try {
      const parsed = new URL(cfg.connectionString);
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
    } catch {
      return '';
    }
  }
  return '';
}

// Fix pg driver treating "timestamp without time zone" as local time
// OID 1114 is for timestamp without time zone. We append 'Z' to force UTC parsing.
types.setTypeParser(1114, function(stringValue) {
  return new Date(stringValue + 'Z');
});

// Keep PostgreSQL DATE (OID 1082) as raw 'YYYY-MM-DD' calendar strings to avoid IST/UTC 1-day shifts
types.setTypeParser(1082, function(stringValue) {
  return stringValue;
});

const poolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// Priority: If DB_HOST & DB_USER are explicitly defined in .env, use them.
// Otherwise fallback to DATABASE_URL (for services like Render / Supabase)
if (isTestEnv && process.env.TEST_DATABASE_URL) {
  poolConfig.connectionString = process.env.TEST_DATABASE_URL;
} else if (process.env.DB_HOST && process.env.DB_USER) {
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = parseInt(process.env.DB_PORT || '5432', 10);
  if (isTestEnv) {
    poolConfig.database =
      process.env.TEST_DB_NAME ||
      (hasTestEnvFile ? process.env.DB_NAME : DEFAULT_TEST_DB_NAME);
  } else {
    poolConfig.database = process.env.DB_NAME || PRODUCTION_DB_NAME;
  }
  poolConfig.user = process.env.DB_USER;
  poolConfig.password = process.env.DB_PASSWORD;

  if (process.env.DB_HOST.includes('supabase.co')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else if (process.env.DATABASE_URL) {
  poolConfig.connectionString = isTestEnv
    ? (hasTestEnvFile ? process.env.DATABASE_URL : '')
    : process.env.DATABASE_URL;
  // Remote connections requiring SSL
  if (process.env.NODE_ENV === 'production' && !poolConfig.connectionString.includes('localhost') && !poolConfig.connectionString.includes('127.0.0.1')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  poolConfig.host = '127.0.0.1';
  poolConfig.port = 5432;
  poolConfig.database = isTestEnv ? (process.env.TEST_DB_NAME || DEFAULT_TEST_DB_NAME) : PRODUCTION_DB_NAME;
  poolConfig.user = 'ims_app_user';
  poolConfig.password = process.env.DB_PASSWORD;
}

// Hard safety guard: never allow automated tests to connect to the production database
if (isTestEnv) {
  if (callerExplicitDbName && callerExplicitDbName.trim().toLowerCase() === PRODUCTION_DB_NAME) {
    throw new Error(
      `SAFETY GUARD ABORT: NODE_ENV=test cannot connect to production database "${PRODUCTION_DB_NAME}" (explicit DB_NAME="${callerExplicitDbName}"). Configure TEST_DB_NAME, TEST_DATABASE_URL, or server/.env.test.`
    );
  }
  const resolvedDbName = extractDatabaseName(poolConfig).toLowerCase();
  if (!resolvedDbName || resolvedDbName === PRODUCTION_DB_NAME) {
    throw new Error(
      `SAFETY GUARD ABORT: NODE_ENV=test cannot connect to production database "${PRODUCTION_DB_NAME}" (resolved: "${resolvedDbName || 'empty'}"). Configure TEST_DB_NAME, TEST_DATABASE_URL, or server/.env.test.`
    );
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

// Auto-check schema enhancements for department mappings & HRMS v1 columns (idempotent, no duplicate constraints)
pool.query(`
  ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS incharge_user_id UUID,
  ADD COLUMN IF NOT EXISTS asst_coo_user_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID,
  ADD COLUMN IF NOT EXISTS office_portal_department_id UUID,
  ADD COLUMN IF NOT EXISTS is_hrms_synced BOOLEAN NOT NULL DEFAULT FALSE;

  UPDATE departments
  SET assigned_user_id = COALESCE(hod_user_id, incharge_user_id)
  WHERE assigned_user_id IS NULL AND (hod_user_id IS NOT NULL OR incharge_user_id IS NOT NULL);

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

  CREATE TABLE IF NOT EXISTS security_otps (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    target_email TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE security_otps
  ADD COLUMN IF NOT EXISTS target_email TEXT;

  CREATE INDEX IF NOT EXISTS idx_security_otps_emp_action_created
  ON security_otps (employee_id, action, created_at DESC);

  ALTER TABLE master_employees
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS office_portal_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS office_location VARCHAR(128),
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS job_title_id INTEGER,
  ADD COLUMN IF NOT EXISTS office_location_id INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type_id INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS manager_id UUID,
  ADD COLUMN IF NOT EXISTS portal_access_disable_date DATE,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

  CREATE TABLE IF NOT EXISTS hrms_job_titles (
    job_title_id INTEGER PRIMARY KEY,
    name TEXT,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS hrms_employment_types (
    employment_type_id INTEGER PRIMARY KEY,
    name TEXT,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

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
    event_type TEXT NOT NULL,
    delivery_id VARCHAR(128),
    occurred_at TIMESTAMP WITH TIME ZONE,
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
    delta_cursor TEXT,
    last_changed_at TIMESTAMP WITH TIME ZONE,
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_deactivated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
  );
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
