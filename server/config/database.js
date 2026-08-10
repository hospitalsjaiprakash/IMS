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
  connectionTimeoutMillis: 2000,
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
  ADD COLUMN IF NOT EXISTS asst_coo_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

  ALTER TABLE office_portal_employees
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
`).catch(err => console.warn('Schema check warning:', err.message));

module.exports = { query, getClient, pool };
