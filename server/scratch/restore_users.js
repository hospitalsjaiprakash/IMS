require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const DEFAULT_HASH = '$2a$12$cbr/Yf96fTcsCCUNnZcNVO/U35hGTuSWMsLfo7c3nPPkKMzBT3qrC'; // "1admin"

const usersToRestore = [
  {
    employee_id: '13574',
    name: 'NIRMAL NAIK',
    email: 'nirmalnaik1402@gmail.com',
    phone: '8093421865',
    department: 'Digital Communications',
    designation: 'System Administrator',
    role: 'system_admin',
    is_system_admin: true,
    is_management_member: false,
    is_imc_member: false,
    is_imc_lead: false
  },
  {
    employee_id: '11111',
    name: 'Shubhransu Samal',
    email: 'shubhransusamal1998@gmail.com',
    phone: '8249316764',
    department: 'Digital Communications',
    designation: 'HOD',
    role: 'hod',
    is_system_admin: false,
    is_management_member: false,
    is_imc_member: false,
    is_imc_lead: false
  },
  {
    employee_id: '22222',
    name: 'Biswa Ranjan Dash',
    email: 'naiknirmal1402@gmail.com',
    phone: '8249991648',
    department: 'Quality Management',
    designation: 'HOD',
    role: 'hod',
    is_system_admin: false,
    is_management_member: false,
    is_imc_member: false,
    is_imc_lead: false
  },
  {
    employee_id: '10501',
    name: 'Sunita Rao',
    email: 'sunita.rao@jphrc.org',
    phone: '9876543220',
    department: 'Human Resource',
    designation: 'HR Manager (HOD)',
    role: 'hod',
    is_system_admin: false,
    is_management_member: false,
    is_imc_member: false,
    is_imc_lead: false
  }
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS master_employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        department VARCHAR(100),
        designation VARCHAR(100),
        role VARCHAR(50) DEFAULT 'employee',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    for (const u of usersToRestore) {
      // Insert into master_employees
      await client.query(`
        INSERT INTO master_employees (employee_id, name, department, designation)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (employee_id) DO UPDATE SET 
          name = EXCLUDED.name,
          department = EXCLUDED.department,
          designation = EXCLUDED.designation;
      `, [u.employee_id, u.name, u.department, u.designation]);

      // Insert into users
      await client.query(`
        INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, password_hash, is_system_admin, is_management_member, is_imc_member, is_imc_lead)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (employee_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          department = EXCLUDED.department,
          designation = EXCLUDED.designation,
          role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash,
          is_system_admin = EXCLUDED.is_system_admin,
          is_management_member = EXCLUDED.is_management_member,
          is_imc_member = EXCLUDED.is_imc_member,
          is_imc_lead = EXCLUDED.is_imc_lead,
          is_active = true
      `, [
        u.employee_id,
        u.name,
        u.email,
        u.phone,
        u.department,
        u.designation,
        u.role,
        DEFAULT_HASH,
        u.is_system_admin,
        u.is_management_member,
        u.is_imc_member,
        u.is_imc_lead
      ]);
      console.log("Restored " + u.name);
    }
    console.log("All specified users restored successfully!");
  } catch (error) {
    console.error("Error restoring users:", error);
  } finally {
    client.release();
    pool.end();
  }
}

run();
