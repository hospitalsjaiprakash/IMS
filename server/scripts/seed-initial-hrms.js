const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/database');

const sampleEmployees = [
  {
    employee_id: "12243",
    name: "Sourav Barik",
    email: "hospitalsjaiprakash@gmail.com",
    department: "Digital Communications",
    job_title: "System Administrator",
    whatsapp: "918456817717"
  },
  {
    employee_id: "10004",
    name: "ZANGMO BHUTIA",
    department: "PATIENT CARE- OPD",
    job_title: "ASSISTANT HOD",
    whatsapp: "919556344814"
  },
  {
    employee_id: "10009",
    name: "ROOPA KUMARI BANCHOR",
    department: "OPERATIONS",
    job_title: "ASSISTANT COO",
    whatsapp: "917873835262"
  },
  {
    employee_id: "10013",
    name: "JENET KLIVER HORO",
    department: "MEDICAL STORES",
    job_title: "SENIOR PHARMACIST",
    whatsapp: "918456817717"
  },
  {
    employee_id: "10014",
    name: "NANDA KISHOR BEHERA",
    department: "FINANCE AND ACCOUNTS",
    job_title: "ASSISTANT (FINANCE AND ACCOUNTS)",
    whatsapp: "919861059361"
  },
  {
    employee_id: "10016",
    name: "ROHINI KANTA TRIPATHY",
    department: "NON MEDICAL STORES",
    job_title: "SENIOR COORDINATOR",
    whatsapp: "919439104071"
  },
  {
    employee_id: "13983",
    name: "RASMITA MAJHI",
    department: "NURSING SERVICES- RESERVE FORCE",
    job_title: "TRAINEE NURSE",
    whatsapp: ""
  },
  {
    employee_id: "13984",
    name: "SANGITA KUJUR",
    department: "NURSING SERVICES- RESERVE FORCE",
    job_title: "TRAINEE NURSE",
    whatsapp: ""
  }
];

async function seedInitial() {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    console.log('[Seed Initial] Seeding sample employees and Primary Admin...');

    for (const emp of sampleEmployees) {
      const isSystemAdmin = emp.employee_id === "12243";
      const role = isSystemAdmin ? 'system_admin' : (emp.job_title?.includes('HOD') ? 'hod' : 'employee');
      
      await client.query(
        `INSERT INTO master_employees (employee_id, name, phone, department, designation, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (employee_id) DO UPDATE SET
           name = EXCLUDED.name,
           phone = COALESCE(NULLIF(EXCLUDED.phone, ''), master_employees.phone),
           department = COALESCE(EXCLUDED.department, master_employees.department),
           designation = COALESCE(EXCLUDED.designation, master_employees.designation),
           role = CASE WHEN master_employees.role = 'system_admin' THEN 'system_admin' ELSE EXCLUDED.role END`,
        [emp.employee_id, emp.name, emp.whatsapp || null, emp.department, emp.job_title, role]
      );
    }

    // Ensure System Admin 12243 is created in users table
    const defaultPasswordHash = await bcrypt.hash('1admin', 12);
    await client.query(
      `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_system_admin, is_active, password_hash)
       VALUES ('12243', 'Sourav Barik', 'hospitalsjaiprakash@gmail.com', 'Digital Communications', 'System Administrator', 'system_admin', TRUE, TRUE, $1)
       ON CONFLICT (employee_id) DO UPDATE SET
         email = 'hospitalsjaiprakash@gmail.com',
         role = 'system_admin',
         is_system_admin = TRUE,
         is_active = TRUE,
         updated_at = NOW()`,
      [defaultPasswordHash]
    );

    await client.query('COMMIT');
    console.log('[Seed Initial] Completed successfully. Primary Admin 12243 ready.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed Initial] Error:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedInitial();
