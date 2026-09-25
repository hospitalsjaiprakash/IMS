/**
 * JPHRC IMS - Mock Data Generator for All Roles
 * 
 * Generates comprehensive mock data for:
 * 1. System Administrator (Sourav Barik, Emp ID: 12243)
 * 2. Head Management / MD Office
 * 3. Incident Management Committee (IMC Lead & Members)
 * 4. Heads of Department (HODs) across hospital departments
 * 5. General Staff / Employees across clinical & non-clinical departments
 * 6. Executive Leaders (COO / Asst COO)
 * 7. Mock incidents spanning every stage of the incident workflow
 * 
 * Run with: node scripts/seed-mock-data.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT, 10) === 5432 ? 6543 : (parseInt(process.env.DB_PORT, 10) || 6543),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function seed() {
  console.log('\n======================================================');
  console.log('   JPHRC IMS — Generating Mock Data for All Roles     ');
  console.log('======================================================\n');

  const client = await pool.connect();

  try {
    // Hashes for passwords
    // Common passwords: "1admin" and "Password@123"
    const hash1Admin = await bcrypt.hash('1admin', 10);
    const hashPassword123 = await bcrypt.hash('Password@123', 10);

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. MASTER EMPLOYEES & USERS DATA DEFINITION
    // ─────────────────────────────────────────────────────────────────────────────
    const mockEmployees = [
      // SYSTEM ADMINISTRATOR (Specified by user)
      {
        employeeId: '12243',
        fullName: 'Sourav Barik',
        email: 'sourav.barik@jphrc.org',
        phone: '9876543200',
        department: 'Digital Communications',
        designation: 'System Administrator',
        role: 'system_admin',
        isSystemAdmin: true,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hash1Admin, // Password: "1admin" or "Password@123"
      },

      // HEAD MANAGEMENT / MD OFFICE
      {
        employeeId: '10001',
        fullName: 'Dr. Alok Mohanty',
        email: 'alok.mohanty@jphrc.org',
        phone: '9876543201',
        department: 'MD Office',
        designation: 'Medical Director',
        role: 'head_management',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: true,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10002',
        fullName: 'Dr. Debasis Panda',
        email: 'debasis.panda@jphrc.org',
        phone: '9876543202',
        department: 'MD Office',
        designation: 'Managing Director',
        role: 'head_management',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: true,
        passwordHash: hashPassword123,
      },

      // INCIDENT MANAGEMENT COMMITTEE (IMC)
      {
        employeeId: '22222',
        fullName: 'Dr. Biswa Ranjan Dash',
        email: 'biswaranjan.dash@jphrc.org',
        phone: '8249991648',
        department: 'Quality Management',
        designation: 'Head of Quality & IMC Lead',
        role: 'imc',
        isSystemAdmin: false,
        isImcMember: true,
        isImcLead: true,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '11301',
        fullName: 'Dr. Priti Banerjee',
        email: 'priti.banerjee@jphrc.org',
        phone: '9876543233',
        department: 'Infection Control and Microbiology',
        designation: 'Infection Control Officer & IMC Member',
        role: 'imc',
        isSystemAdmin: false,
        isImcMember: true,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },

      // HEADS OF DEPARTMENT (HODs)
      {
        employeeId: '10101',
        fullName: 'Dr. Rajesh Sharma',
        email: 'rajesh.sharma@jphrc.org',
        phone: '9876543210',
        department: 'Medical Services',
        designation: 'Chief Medical Officer (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10201',
        fullName: 'Sister Mary Mathew',
        email: 'mary.mathew@jphrc.org',
        phone: '9876543213',
        department: 'Nursing Services',
        designation: 'Nursing Superintendent (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10301',
        fullName: 'Ashok Kumar Mishra',
        email: 'ashok.mishra@jphrc.org',
        phone: '9876543216',
        department: 'Purchase',
        designation: 'Purchase Manager (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10401',
        fullName: 'Siddharth Agarwal',
        email: 'siddharth.agarwal@jphrc.org',
        phone: '9876543218',
        department: 'Finance and Accounts',
        designation: 'Chief Financial Officer (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10501',
        fullName: 'Sunita Rao',
        email: 'sunita.rao@jphrc.org',
        phone: '9876543220',
        department: 'Human Resource',
        designation: 'HR Manager (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10701',
        fullName: 'Meenakshi Sundaram',
        email: 'meenakshi.s@jphrc.org',
        phone: '9876543223',
        department: 'Patient Care',
        designation: 'Patient Relations Head (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10801',
        fullName: 'Sandeep Kulkarni',
        email: 'sandeep.kulkarni@jphrc.org',
        phone: '9876543225',
        department: 'Bio-Medical',
        designation: 'Biomedical Engineer Head (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10901',
        fullName: 'Major (Retd.) K. Singh',
        email: 'k.singh@jphrc.org',
        phone: '9876543227',
        department: 'Fire Safety',
        designation: 'Chief Safety Officer (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '11001',
        fullName: 'Dr. Swati Ghosh',
        email: 'swati.ghosh@jphrc.org',
        phone: '9876543229',
        department: 'Lab Medicine',
        designation: 'Head of Pathology (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '11111',
        fullName: 'Shubhransu Samal',
        email: 'shubhransu.samal@jphrc.org',
        phone: '8249316764',
        department: 'Digital Communications',
        designation: 'HOD',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '11201',
        fullName: 'Dr. Alok Chatterjee',
        email: 'alok.chatterjee@jphrc.org',
        phone: '9876543231',
        department: 'Radiology',
        designation: 'Head of Radiology (HOD)',
        role: 'hod',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },

      // GENERAL STAFF / EMPLOYEES (Clinicians, Nurses, Techs)
      {
        employeeId: '10102',
        fullName: 'Dr. Ananya Sen',
        email: 'ananya.sen@jphrc.org',
        phone: '9876543211',
        department: 'Medical Services',
        designation: 'Senior Consultant',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10202',
        fullName: 'Priyanka Mohanty',
        email: 'priyanka.mohanty@jphrc.org',
        phone: '9876543214',
        department: 'Nursing Services',
        designation: 'Senior Staff Nurse',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10203',
        fullName: 'Sujata Sahoo',
        email: 'sujata.sahoo@jphrc.org',
        phone: '9876543215',
        department: 'Nursing Services',
        designation: 'ICU Staff Nurse',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10302',
        fullName: 'Rakesh Patnaik',
        email: 'rakesh.patnaik@jphrc.org',
        phone: '9876543217',
        department: 'Purchase',
        designation: 'Purchase Executive',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10402',
        fullName: 'Neha Gupta',
        email: 'neha.gupta@jphrc.org',
        phone: '9876543219',
        department: 'Finance and Accounts',
        designation: 'Senior Accountant',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10502',
        fullName: 'Amitabh Das',
        email: 'amitabh.das@jphrc.org',
        phone: '9876543221',
        department: 'Human Resource',
        designation: 'HR Executive',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10802',
        fullName: 'Rahul Nair',
        email: 'rahul.nair@jphrc.org',
        phone: '9876543226',
        department: 'Bio-Medical',
        designation: 'Junior Biomedical Engineer',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10902',
        fullName: 'Devendra Yadav',
        email: 'devendra.yadav@jphrc.org',
        phone: '9876543228',
        department: 'Fire Safety',
        designation: 'Fire Safety Inspector',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '11002',
        fullName: 'Manas Behera',
        email: 'manas.behera@jphrc.org',
        phone: '9876543230',
        department: 'Lab Medicine',
        designation: 'Senior Lab Technician',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '11202',
        fullName: 'Rohan Tripathy',
        email: 'rohan.tripathy@jphrc.org',
        phone: '9876543232',
        department: 'Radiology',
        designation: 'X-Ray & MRI Technician',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '13574',
        fullName: 'NIRMAL NAIK',
        email: 'nirmalnaik1402@gmail.com',
        phone: '8093421865',
        department: 'Digital Communications',
        designation: 'Department Assistant',
        role: 'employee',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hash1Admin,
      },

      // EXECUTIVE ROLES (COO, Asst COO)
      {
        employeeId: '10005',
        fullName: 'Dr. Sandeep Kulkarni (COO)',
        email: 'coo@jphrc.org',
        phone: '9876543299',
        department: 'MD Office',
        designation: 'COO',
        role: 'coo',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: true,
        passwordHash: hashPassword123,
      },
      {
        employeeId: '10006',
        fullName: 'Rajiv Mehra',
        email: 'asst.coo@jphrc.org',
        phone: '9876543298',
        department: 'Facility',
        designation: 'Assistant COO',
        role: 'asst_coo',
        isSystemAdmin: false,
        isImcMember: false,
        isImcLead: false,
        isManagementMember: false,
        passwordHash: hashPassword123,
      },
    ];

    // Generic fallback users required by committeeLogin
    const genericUsers = [
      {
        employeeId: 'SYS_ADMIN',
        fullName: 'System Administrator (Generic)',
        email: 'sysadmin@jphrc.org',
        department: 'Digital Communications',
        designation: 'System Administrator',
        role: 'system_admin',
        isSystemAdmin: true,
      },
      {
        employeeId: 'SYS_IMC',
        fullName: 'Incident Management Committee (Generic)',
        email: 'imc.committee@jphrc.org',
        department: 'Quality Management',
        designation: 'IMC Panel',
        role: 'imc',
        isImcMember: true,
      },
      {
        employeeId: 'SYS_MGMT',
        fullName: 'Management Director (Generic)',
        email: 'mgmt.director@jphrc.org',
        department: 'MD Office',
        designation: 'Board of Management',
        role: 'head_management',
        isManagementMember: true,
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. SEED MASTER EMPLOYEES TABLE
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('1. Seeding master_employees table...');
    for (const emp of mockEmployees) {
      await client.query(`
        INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (employee_id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          department = EXCLUDED.department,
          designation = EXCLUDED.designation,
          role = EXCLUDED.role
      `, [emp.employeeId, emp.fullName, emp.email, emp.phone, emp.department, emp.designation, emp.role]);
    }
    console.log(`  ✅ ${mockEmployees.length} master employee records synced.`);

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. SEED USERS TABLE WITH ACTIVATED ACCOUNTS & PASSWORDS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n2. Seeding users table with activated credentials...');
    const userMap = {}; // employeeId -> uuid

    for (const emp of mockEmployees) {
      const res = await client.query(`
        INSERT INTO users (
          employee_id, full_name, email, phone, department, designation,
          role, is_system_admin, is_imc_member, is_imc_lead, is_management_member,
          password_hash, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW())
        ON CONFLICT (employee_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          department = EXCLUDED.department,
          designation = EXCLUDED.designation,
          role = EXCLUDED.role,
          is_system_admin = EXCLUDED.is_system_admin,
          is_imc_member = EXCLUDED.is_imc_member,
          is_imc_lead = EXCLUDED.is_imc_lead,
          is_management_member = EXCLUDED.is_management_member,
          password_hash = EXCLUDED.password_hash,
          is_active = true,
          updated_at = NOW()
        RETURNING id, employee_id, full_name, role
      `, [
        emp.employeeId, emp.fullName, emp.email, emp.phone, emp.department, emp.designation,
        emp.role, emp.isSystemAdmin, emp.isImcMember, emp.isImcLead, emp.isManagementMember,
        emp.passwordHash
      ]);

      const savedUser = res.rows[0];
      userMap[emp.employeeId] = savedUser.id;
    }

    // Seed generic users
    for (const gen of genericUsers) {
      const res = await client.query(`
        INSERT INTO users (
          employee_id, full_name, email, department, designation,
          role, is_system_admin, is_imc_member, is_management_member,
          password_hash, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        ON CONFLICT (employee_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          is_system_admin = EXCLUDED.is_system_admin,
          is_imc_member = EXCLUDED.is_imc_member,
          is_management_member = EXCLUDED.is_management_member,
          is_active = true
        RETURNING id, employee_id
      `, [
        gen.employeeId, gen.fullName, gen.email, gen.department, gen.designation,
        gen.role, !!gen.isSystemAdmin, !!gen.isImcMember, !!gen.isManagementMember,
        hash1Admin
      ]);
      userMap[gen.employeeId] = res.rows[0].id;
    }

    console.log(`  ✅ ${Object.keys(userMap).length} users ready with active credentials.`);

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. MAP DEPARTMENTS TO THEIR HOD USER IDS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n3. Linking department HODs in departments table...');
    const hodMappings = [
      { dept: 'Medical Services', empId: '10101' },
      { dept: 'Nursing Services', empId: '10201' },
      { dept: 'Purchase', empId: '10301' },
      { dept: 'Finance and Accounts', empId: '10401' },
      { dept: 'Human Resource', empId: '10501' },
      { dept: 'Patient Care', empId: '10701' },
      { dept: 'Bio-Medical', empId: '10801' },
      { dept: 'Fire Safety', empId: '10901' },
      { dept: 'Lab Medicine', empId: '11001' },
      { dept: 'Digital Communications', empId: '11111' },
      { dept: 'Radiology', empId: '11201' },
      { dept: 'Quality Management', empId: '22222' },
      { dept: 'Infection Control and Microbiology', empId: '11301' },
      { dept: 'MD Office', empId: '10001' },
    ];

    for (const map of hodMappings) {
      const hodUserId = userMap[map.empId];
      if (hodUserId) {
        await client.query(`
          UPDATE departments SET hod_user_id = $1
          WHERE LOWER(name) = LOWER($2)
        `, [hodUserId, map.dept]);
      }
    }
    console.log('  ✅ Departments mapped to respective HODs.');

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. UPDATE ROLE CREDENTIALS (for committee quick logins)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n4. Syncing role_credentials table...');
    const committeeCreds = [
      { role: 'system_admin', username: 'SYSTEM2026', hash: hash1Admin },
      { role: 'imc', username: 'IMC2026', hash: hash1Admin },
      { role: 'head_management', username: 'MGMT2026', hash: hash1Admin },
    ];
    for (const c of committeeCreds) {
      await client.query(`
        INSERT INTO role_credentials (role, username, password_hash, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (role) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
      `, [c.role, c.username, c.hash]);
    }
    console.log('  ✅ Role credentials updated.');

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. SEED MOCK INCIDENTS SPANNING ALL ROLES & STATUSES
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n5. Seeding realistic hospital incidents across workflow stages...');

    // Fetch department IDs
    const deptRows = await client.query('SELECT id, name FROM departments');
    const deptLookup = {};
    for (const d of deptRows.rows) {
      deptLookup[d.name] = d.id;
    }

    // List of diverse mock incidents to populate each role's view
    const mockIncidents = [
      {
        refId: 'JPHRC/IMS/2026/0101',
        year: 2026,
        seq: 101,
        reporterEmpId: '10202', // Priyanka Mohanty (Staff Nurse)
        incidentDate: '2026-09-20',
        incidentTime: '09:15:00',
        mainLocationId: 1, // Dandiapali Main Hospital
        subLocationId: 1, // 1st Floor
        departmentNames: ['Nursing Services', 'Medical Services'],
        occurredTo: 'Patient',
        severity: 'Minor',
        category: 'Medication',
        incidentType: 'Incorrect Dosage Dispensed',
        description: 'During morning medication round in Ward A, the prescribed antibiotic dose was labeled 500mg instead of 250mg. Discrepancy caught by nurse before administration. Patient was unharmed.',
        status: 'submitted',
        actionBy: 'Priyanka Mohanty',
      },
      {
        refId: 'JPHRC/IMS/2026/0102',
        year: 2026,
        seq: 102,
        reporterEmpId: '10203', // Sujata Sahoo (ICU Staff Nurse)
        incidentDate: '2026-09-21',
        incidentTime: '11:45:00',
        mainLocationId: 1,
        subLocationId: 4, // ICU
        departmentNames: ['Nursing Services', 'Bio-Medical'],
        occurredTo: 'Patient',
        severity: 'Major',
        category: 'Equipment/Medical Device',
        incidentType: 'Infusion Pump Calibration Warning',
        description: 'Syringe pump in ICU Bed 4 exhibited an intermittent pressure occlusion alarm during low-rate dopamine delivery. Swapped with standby unit immediately. No adverse patient outcome.',
        status: 'with_hod',
        actionBy: 'Sister Mary Mathew',
        hodFeedback: 'Standby syringe pump inspected. Bio-medical department notified for sensor recalibration test.',
      },
      {
        refId: 'JPHRC/IMS/2026/0103',
        year: 2026,
        seq: 103,
        reporterEmpId: '10102', // Dr. Ananya Sen (Senior Consultant)
        incidentDate: '2026-09-18',
        incidentTime: '14:20:00',
        mainLocationId: 1,
        subLocationId: 6, // Emergency
        departmentNames: ['Medical Services', 'Bio-Medical'],
        occurredTo: 'Asset/Consumables',
        severity: 'Grave',
        category: 'Equipment/Medical Device',
        incidentType: 'Emergency Defibrillator Battery Degradation',
        description: 'Routine pre-shift check on Emergency Crash Cart 2 indicated battery degradation warning. Unit required mains supply to deliver sync shock test. Replaced with primary unit from Trauma OT.',
        status: 'with_hod_and_imc',
        actionBy: 'Dr. Rajesh Sharma',
        hodFeedback: 'Critical equipment alert: Defibrillator battery pack sent for urgent replacement under AMC.',
      },
      {
        refId: 'JPHRC/IMS/2026/0104',
        year: 2026,
        seq: 104,
        reporterEmpId: '11002', // Manas Behera (Senior Lab Tech)
        incidentDate: '2026-09-19',
        incidentTime: '16:00:00',
        mainLocationId: 1,
        subLocationId: 9, // Laboratory
        departmentNames: ['Lab Medicine', 'Infection Control and Microbiology'],
        occurredTo: 'Hospital Employee',
        severity: 'Major',
        category: 'Needlestick / Sharp Injury',
        incidentType: 'Needle Stick Injury During Blood Collection',
        description: 'Phlebotomist sustained a superficial puncture through latex glove while recapping a safety vacutainer needle following blood draw in OPD collection booth. Source patient HIV/HBsAg non-reactive.',
        status: 'with_imc',
        actionBy: 'Dr. Biswa Ranjan Dash',
        hodFeedback: 'Post-exposure prophylaxis protocols initiated immediately. Occupational Health incident logged.',
        imcFeedback: 'IMC reviewed: Mandatory retraining on single-use sharp disposable container protocol recommended.',
      },
      {
        refId: 'JPHRC/IMS/2026/0105',
        year: 2026,
        seq: 105,
        reporterEmpId: '10802', // Rahul Nair (Bio-Medical Engineer)
        incidentDate: '2026-09-15',
        incidentTime: '08:30:00',
        mainLocationId: 1,
        subLocationId: 4, // ICU
        departmentNames: ['Bio-Medical', 'General Maintenance', 'MD Office'],
        occurredTo: 'Asset/Consumables',
        severity: 'Grave',
        category: 'Facility/Safety',
        incidentType: 'Medical Gas Secondary Pressure Fluctuation',
        description: 'Central Oxygen manifold secondary regulator experienced a momentary 0.4 bar drop during peak ventilator load in 3rd Floor ICU. Auto-switchover to backup bank functioned as designed.',
        status: 'with_head_management',
        actionBy: 'Dr. Alok Mohanty',
        hodFeedback: 'Detailed technical log compiled with Linde engineering team.',
        imcFeedback: 'IMC RCA completed: Recommends installing tertiary dual-stage digital manifold regulators.',
      },
      {
        refId: 'JPHRC/IMS/2026/0106',
        year: 2026,
        seq: 106,
        reporterEmpId: '10202', // Priyanka Mohanty
        incidentDate: '2026-09-14',
        incidentTime: '17:10:00',
        mainLocationId: 1,
        subLocationId: 12, // Ward A
        departmentNames: ['Nursing Services', 'Housekeeping'],
        occurredTo: 'Patient',
        severity: 'Major',
        category: 'Fall',
        incidentType: 'Assisted Slip near Bathroom Entrance',
        description: 'An elderly patient slipped on damp tiles while returning from bathroom with nurse assistance. Nurse slowed the descent; patient assessed by resident on duty — no fracture or hematoma.',
        status: 'pending_training',
        actionBy: 'Sister Mary Mathew',
        hodFeedback: 'Anti-skid floor mats installed in all ward washrooms. Training session for ward attendants scheduled.',
      },
      {
        refId: 'JPHRC/IMS/2026/0107',
        year: 2026,
        seq: 107,
        reporterEmpId: '10302', // Rakesh Patnaik (Purchase)
        incidentDate: '2026-09-17',
        incidentTime: '10:00:00',
        mainLocationId: 1,
        subLocationId: 7, // Admin
        departmentNames: ['Purchase', 'Stores'],
        occurredTo: 'Process Flow',
        severity: 'Minor',
        category: 'Documentation/Administrative',
        incidentType: 'Surgical Gloves Lot Number Mismatch',
        description: 'Consignment delivery of sterile size 7.5 surgical gloves had lot numbers differing by one digit from the purchase dispatch note. Batch quarantined pending vendor rectification.',
        status: 'redirect_requested',
        actionBy: 'Ashok Kumar Mishra',
        redirectReason: 'Referred to Quality Control and Stores for batch certificate verification.',
      },
      {
        refId: 'JPHRC/IMS/2026/0108',
        year: 2026,
        seq: 108,
        reporterEmpId: '10902', // Devendra Yadav (Fire Safety)
        incidentDate: '2026-09-10',
        incidentTime: '13:00:00',
        mainLocationId: 1,
        subLocationId: 14, // Cafeteria
        departmentNames: ['Fire Safety', 'Facility'],
        occurredTo: 'Asset/Consumables',
        severity: 'Minor',
        category: 'Fire Safety',
        incidentType: 'Blocked Fire Hose Reel Access',
        description: 'Vendor crates temporarily obstructed the access path to the 1st floor fire hose reel cabinet near the service corridor. Crates relocated within 15 minutes of discovery.',
        status: 'resolved',
        actionBy: 'Major (Retd.) K. Singh',
        hodFeedback: 'Vendor issued warning citation. High-visibility yellow boundary marking painted around all hose reels.',
      },
      {
        refId: 'JPHRC/IMS/2026/0109',
        year: 2026,
        seq: 109,
        reporterEmpId: '11202', // Rohan Tripathy (Radiology Tech)
        incidentDate: '2026-09-08',
        incidentTime: '15:30:00',
        mainLocationId: 1,
        subLocationId: 10, // Radiology
        departmentNames: ['Radiology', 'Medical Services'],
        occurredTo: 'Patient',
        severity: 'Minor',
        category: 'Radiation Safety / Diagnostic',
        incidentType: 'Contrast Agent Extravasation',
        description: 'Mild 5ml subcutaneous extravasation of non-ionic iodinated contrast occurred during high-rate CT angiogram injection. Cold compress and elevation protocol applied. Resolved fully.',
        status: 'closed',
        actionBy: 'Dr. Alok Chatterjee',
        hodFeedback: 'Contrast extravasation protocol followed. Patient discharged with normal follow-up after 48h.',
      },
      {
        refId: 'JPHRC/IMS/2026/0110',
        year: 2026,
        seq: 110,
        reporterEmpId: '12243', // Sourav Barik (System Administrator)
        incidentDate: '2026-09-22',
        incidentTime: '18:00:00',
        mainLocationId: 1,
        subLocationId: 7, // Admin
        departmentNames: ['Digital Communications'],
        occurredTo: 'Process Flow',
        severity: 'Minor',
        category: 'IT/Cybersecurity',
        incidentType: 'Phishing Email Detection in HR Inbox',
        description: 'Suspicious email disguised as an employee salary revision notification was flagged by email gateway. URL was sandboxed and blocked across hospital network firewall. No user credentials compromised.',
        status: 'resolved',
        actionBy: 'Sourav Barik',
        hodFeedback: 'Domain added to global DNS blocklist. Hospital-wide cybersecurity advisory issued.',
      }
    ];

    let createdIncidents = 0;

    for (const inc of mockIncidents) {
      const reporterUuid = userMap[inc.reporterEmpId];
      if (!reporterUuid) {
        console.warn(`  ⚠️ Reporter ${inc.reporterEmpId} not found, skipping ${inc.refId}`);
        continue;
      }

      // Upsert incident
      const incRes = await client.query(`
        INSERT INTO incidents (
          reference_id, year, seq_number, reporter_id, incident_date, incident_time,
          main_location_id, sub_location_id, occurred_to, severity,
          incident_category, incident_type, description, status,
          redirect_reason, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        ON CONFLICT (reference_id) DO UPDATE SET
          incident_category = EXCLUDED.incident_category,
          incident_type = EXCLUDED.incident_type,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          severity = EXCLUDED.severity,
          redirect_reason = EXCLUDED.redirect_reason,
          updated_at = NOW()
        RETURNING id
      `, [
        inc.refId, inc.year, inc.seq, reporterUuid, inc.incidentDate, inc.incidentTime,
        inc.mainLocationId, inc.subLocationId, inc.occurredTo, inc.severity,
        inc.category, inc.incidentType, inc.description, inc.status,
        inc.redirectReason || null
      ]);

      const incidentId = incRes.rows[0].id;
      createdIncidents++;

      // Link departments
      for (const deptName of inc.departmentNames) {
        const deptId = deptLookup[deptName];
        if (deptId) {
          await client.query(`
            INSERT INTO incident_departments (incident_id, department_id)
            SELECT $1, $2
            WHERE NOT EXISTS (
              SELECT 1 FROM incident_departments WHERE incident_id = $1 AND department_id = $2
            )
          `, [incidentId, deptId]);
        }
      }

      // Add feedback if provided
      if (inc.hodFeedback) {
        const hodEmpId = inc.departmentNames[0] ? hodMappings.find(m => m.dept === inc.departmentNames[0])?.empId : null;
        const hodUserId = hodEmpId ? userMap[hodEmpId] : null;
        if (hodUserId) {
          await client.query(`
            INSERT INTO feedbacks (incident_id, author_id, role, feedback_text, created_at)
            VALUES ($1, $2, 'hod', $3, NOW())
            ON CONFLICT DO NOTHING
          `, [incidentId, hodUserId, inc.hodFeedback]);
        }
      }

      if (inc.imcFeedback) {
        const imcUserId = userMap['22222'];
        if (imcUserId) {
          await client.query(`
            INSERT INTO feedbacks (incident_id, author_id, role, feedback_text, created_at)
            VALUES ($1, $2, 'imc', $3, NOW())
            ON CONFLICT DO NOTHING
          `, [incidentId, imcUserId, inc.imcFeedback]);
        }
      }

      // Add audit log
      await client.query(`
        INSERT INTO audit_logs (user_id, incident_id, action, details, ip_address, created_at)
        VALUES ($1, $2, $3, $4, '127.0.0.1', NOW())
      `, [
        reporterUuid, incidentId, 'INCIDENT_RECORDED',
        JSON.stringify({ ref: inc.refId, status: inc.status, severity: inc.severity })
      ]);
    }

    console.log(`  ✅ ${createdIncidents} mock incidents inserted/updated across hospital workflows.`);

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. SUMMARY & CREDENTIALS CHEAT-SHEET
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n======================================================');
    console.log('   MOCK DATA GENERATION COMPLETE!                     ');
    console.log('======================================================');
    console.log('\n🔐 QUICK LOGIN CREDENTIALS FOR ALL ROLES:');
    console.log('------------------------------------------------------');
    console.log('1. System Administrator (Requested):');
    console.log('   Name:        Sourav Barik');
    console.log('   Employee ID: 12243');
    console.log('   Password:    1admin  (or Password@123)');
    console.log('   Portal URL:  /login  -> /admin/dashboard');
    console.log('------------------------------------------------------');
    console.log('2. Head Management (MD Office):');
    console.log('   Name:        Dr. Alok Mohanty');
    console.log('   Employee ID: 10001');
    console.log('   Password:    Password@123');
    console.log('   Portal URL:  /login  -> /management/dashboard');
    console.log('------------------------------------------------------');
    console.log('3. Incident Management Committee (IMC Lead):');
    console.log('   Name:        Dr. Biswa Ranjan Dash');
    console.log('   Employee ID: 22222');
    console.log('   Password:    Password@123');
    console.log('   Portal URL:  /login  -> /imc/dashboard');
    console.log('------------------------------------------------------');
    console.log('4. Head of Department (HOD - Medical Services):');
    console.log('   Name:        Dr. Rajesh Sharma');
    console.log('   Employee ID: 10101');
    console.log('   Password:    Password@123');
    console.log('   Portal URL:  /login  -> /dashboard & /my-team');
    console.log('------------------------------------------------------');
    console.log('5. Head of Department (HOD - Nursing Services):');
    console.log('   Name:        Sister Mary Mathew');
    console.log('   Employee ID: 10201');
    console.log('   Password:    Password@123');
    console.log('   Portal URL:  /login  -> /dashboard & /my-team');
    console.log('------------------------------------------------------');
    console.log('6. General Staff / Nurse (Employee):');
    console.log('   Name:        Priyanka Mohanty');
    console.log('   Employee ID: 10202');
    console.log('   Password:    Password@123');
    console.log('   Portal URL:  /login  -> /dashboard');
    console.log('------------------------------------------------------');
    console.log('7. Executive (COO):');
    console.log('   Name:        Dr. Sandeep Kulkarni (COO)');
    console.log('   Employee ID: 10005');
    console.log('   Password:    Password@123');
    console.log('   Portal URL:  /login  -> /executive/dashboard');
    console.log('------------------------------------------------------\n');

  } catch (err) {
    console.error('❌ Error during mock data seeding:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Fatal seed error:', err.message);
  process.exit(1);
});
