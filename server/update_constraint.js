require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});
async function run() {
  await pool.query('ALTER TABLE communication_logs DROP CONSTRAINT communication_logs_type_check');
  await pool.query("ALTER TABLE communication_logs ADD CONSTRAINT communication_logs_type_check CHECK (((type)::text = ANY ((ARRAY['EMAIL', 'WHATSAPP', 'IN_APP_NOTIFICATION', 'BROADCAST'])::text[])))");
  console.log('done');
  pool.end();
}
run();
