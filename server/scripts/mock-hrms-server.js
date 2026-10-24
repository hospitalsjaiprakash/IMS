/**
 * JPHRC IMS - Comprehensive OfficePortal HRMS Public API v1 Mock Server
 * 
 * High-fidelity standalone mock server implementing the complete OfficePortal Public API v1 specification:
 * - 60 realistic clinical hospital employee personas spanning all 30 departments and 3 hospital centers
 * - Complete employment lifecycle states (active, noticePeriod with end dates, terminated with relieving dates)
 * - POST /publicapi/connect/token (OAuth 2.0 Client Credentials Grant)
 * - GET  /employee/api/v1/employees (Paginated Employee Directory with filters)
 * - GET  /employee/api/v1/employees/:id (Lookup by vendor GUID)
 * - GET  /employee/api/v1/employees/by-code/:code (Lookup by employee badge ID)
 * - GET  /employee/api/v1/employees/changes (Cursor-based delta change feed)
 * - GET  /employee/api/v1/departments (Master list of 30 hospital departments)
 * - GET  /employee/api/v1/job-titles (Master list of 45 hospital designations)
 * - GET  /employee/api/v1/usage (Quota health & API allowance metrics)
 * - POST /mock/dispatch-webhook (HMAC-SHA256 signed webhook dispatcher to HIMS)
 */

const http = require('http');
const { createHmac } = require('crypto');
const { URL } = require('url');

const PORT = parseInt(process.env.MOCK_HRMS_PORT, 10) || 5050;
const VALID_CLIENT_ID = process.env.OFFICEPORTAL_CLIENT_ID || 'demo_jphrc_client_id';
const VALID_CLIENT_SECRET = process.env.OFFICEPORTAL_CLIENT_SECRET || process.env.OFFICEPORTAL_API_KEY || 'demo_jphrc_secret_key_123';
const WEBHOOK_SIGNING_KEY = process.env.OFFICEPORTAL_WEBHOOK_KEY || process.env.OFFICEPORTAL_WEBHOOK_SECRET || 'whsec_5f0c8e2a7b4d1f9036c2e8a5b7d0f3c6e9a1b4d7f0c3e6a9b2d5f8c1e4a7b0d3';

// ─── 30 HOSPITAL DEPARTMENTS MASTER LIST ───────────────────────────────────
const MOCK_DEPARTMENTS = [
  { departmentId: 'd0000001-0000-0000-0000-000000000001', name: 'Digital Communications' },
  { departmentId: 'd0000002-0000-0000-0000-000000000002', name: 'MD Office' },
  { departmentId: 'd0000003-0000-0000-0000-000000000003', name: 'Quality Management' },
  { departmentId: 'd0000004-0000-0000-0000-000000000004', name: 'Medical Services' },
  { departmentId: 'd0000005-0000-0000-0000-000000000005', name: 'Nursing Services' },
  { departmentId: 'd0000006-0000-0000-0000-000000000006', name: 'Intensive Care Unit' },
  { departmentId: 'd0000007-0000-0000-0000-000000000007', name: 'Emergency and Trauma' },
  { departmentId: 'd0000008-0000-0000-0000-000000000008', name: 'Operation Theatre' },
  { departmentId: 'd0000009-0000-0000-0000-000000000009', name: 'Pathology and Lab' },
  { departmentId: 'd0000010-0000-0000-0000-000000000010', name: 'Radiology and Imaging' },
  { departmentId: 'd0000011-0000-0000-0000-000000000011', name: 'Pharmacy' },
  { departmentId: 'd0000012-0000-0000-0000-000000000012', name: 'Infection Control and Microbiology' },
  { departmentId: 'd0000013-0000-0000-0000-000000000013', name: 'Bio-Medical' },
  { departmentId: 'd0000014-0000-0000-0000-000000000014', name: 'Housekeeping' },
  { departmentId: 'd0000015-0000-0000-0000-000000000015', name: 'Security' },
  { departmentId: 'd0000016-0000-0000-0000-000000000016', name: 'Finance and Accounts' },
  { departmentId: 'd0000017-0000-0000-0000-000000000017', name: 'Human Resource' },
  { departmentId: 'd0000018-0000-0000-0000-000000000018', name: 'Maintenance' },
  { departmentId: 'd0000019-0000-0000-0000-000000000019', name: 'Dietetics' },
  { departmentId: 'd0000020-0000-0000-0000-000000000020', name: 'Front Office' },
  { departmentId: 'd0000021-0000-0000-0000-000000000021', name: 'Medical Records Department' },
  { departmentId: 'd0000022-0000-0000-0000-000000000022', name: 'Blood Bank' },
  { departmentId: 'd0000023-0000-0000-0000-000000000023', name: 'Dialysis Unit' },
  { departmentId: 'd0000024-0000-0000-0000-000000000024', name: 'Cardiology' },
  { departmentId: 'd0000025-0000-0000-0000-000000000025', name: 'Orthopaedics' },
  { departmentId: 'd0000026-0000-0000-0000-000000000026', name: 'Paediatrics' },
  { departmentId: 'd0000027-0000-0000-0000-000000000027', name: 'Obstetrics and Gynaecology' },
  { departmentId: 'd0000028-0000-0000-0000-000000000028', name: 'Anaesthesia' },
  { departmentId: 'd0000029-0000-0000-0000-000000000029', name: 'Store and Purchase' },
  { departmentId: 'd0000030-0000-0000-0000-000000000030', name: 'Billing' },
];

// ─── 45 HOSPITAL JOB TITLES MASTER LIST ─────────────────────────────────────
const MOCK_JOB_TITLES = [
  { jobTitleId: 101, name: 'System Administrator' },
  { jobTitleId: 102, name: 'Medical Director' },
  { jobTitleId: 103, name: 'Chief Medical Officer' },
  { jobTitleId: 104, name: 'Head of Quality & IMC Lead' },
  { jobTitleId: 105, name: 'Nursing Superintendent' },
  { jobTitleId: 106, name: 'Consultant Physician' },
  { jobTitleId: 107, name: 'Consultant Surgeon' },
  { jobTitleId: 108, name: 'Intensivist' },
  { jobTitleId: 109, name: 'Emergency Medical Officer' },
  { jobTitleId: 110, name: 'Consultant Pathologist' },
  { jobTitleId: 111, name: 'Consultant Radiologist' },
  { jobTitleId: 112, name: 'Chief Pharmacist' },
  { jobTitleId: 113, name: 'Infection Control Officer' },
  { jobTitleId: 114, name: 'Senior Biomedical Engineer' },
  { jobTitleId: 115, name: 'Chief Financial Officer' },
  { jobTitleId: 116, name: 'HR Manager' },
  { jobTitleId: 117, name: 'Chief Dietitian' },
  { jobTitleId: 118, name: 'MRD Incharge' },
  { jobTitleId: 119, name: 'Blood Bank Officer' },
  { jobTitleId: 120, name: 'Cardiologist' },
  { jobTitleId: 121, name: 'Orthopaedic Surgeon' },
  { jobTitleId: 122, name: 'Paediatrician' },
  { jobTitleId: 123, name: 'Gynaecologist' },
  { jobTitleId: 124, name: 'Anaesthetist' },
  { jobTitleId: 125, name: 'Senior Staff Nurse' },
  { jobTitleId: 126, name: 'Staff Nurse' },
  { jobTitleId: 127, name: 'Ward Incharge' },
  { jobTitleId: 128, name: 'OT Incharge' },
  { jobTitleId: 129, name: 'ICU Nurse' },
  { jobTitleId: 130, name: 'Emergency Technician' },
  { jobTitleId: 131, name: 'OT Technician' },
  { jobTitleId: 132, name: 'Senior Lab Technician' },
  { jobTitleId: 133, name: 'Lab Technician' },
  { jobTitleId: 134, name: 'X-Ray / CT Technician' },
  { jobTitleId: 135, name: 'Dispensing Pharmacist' },
  { jobTitleId: 136, name: 'Dialysis Technician' },
  { jobTitleId: 137, name: 'Quality Coordinator' },
  { jobTitleId: 138, name: 'Sanitation Supervisor' },
  { jobTitleId: 139, name: 'Security Incharge' },
  { jobTitleId: 140, name: 'Senior Accountant' },
  { jobTitleId: 141, name: 'HR Executive' },
  { jobTitleId: 142, name: 'Front Desk Executive' },
  { jobTitleId: 143, name: 'Purchase Officer' },
  { jobTitleId: 144, name: 'Billing Executive' },
  { jobTitleId: 145, name: 'Staff Assistant' },
];

// Helper to find dept ID
const getDeptId = (name) => {
  const d = MOCK_DEPARTMENTS.find(dept => dept.name.toLowerCase() === name.toLowerCase());
  return d ? d.departmentId : 'd0000001-0000-0000-0000-000000000001';
};

// Helper to find job title ID
const getJobId = (name) => {
  const j = MOCK_JOB_TITLES.find(job => job.name.toLowerCase() === name.toLowerCase());
  return j ? j.jobTitleId : 145;
};

// ─── 60 REALISTIC CLINICAL HOSPITAL PERSONAS ────────────────────────────────
const MOCK_EMPLOYEES = [
  // 1. Leadership & Governance
  {
    employeeId: 'f01a1c0d-0001-4a58-b6c1-000000000001',
    employeeCode: '12243',
    firstName: 'Sourav',
    lastName: 'Barik',
    fullName: 'Sourav Barik',
    departmentName: 'Digital Communications',
    jobTitleName: 'System Administrator',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sourav.barik@jphrc.org',
    mobileNumber: '+91 98765 43200',
    status: 'active',
    dateOfJoining: '2021-01-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-01-10T09:30:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0002-4a58-b6c1-000000000002',
    employeeCode: '10001',
    firstName: 'Alok',
    lastName: 'Mohanty',
    fullName: 'Dr. Alok Mohanty',
    departmentName: 'MD Office',
    jobTitleName: 'Medical Director',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'alok.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43201',
    status: 'active',
    dateOfJoining: '2018-05-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-05-01T08:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0003-4a58-b6c1-000000000003',
    employeeCode: '22222',
    firstName: 'Biswa Ranjan',
    lastName: 'Dash',
    fullName: 'Dr. Biswa Ranjan Dash',
    departmentName: 'Quality Management',
    jobTitleName: 'Head of Quality & IMC Lead',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'biswaranjan.dash@jphrc.org',
    mobileNumber: '+91 82499 91648',
    status: 'active',
    dateOfJoining: '2019-03-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-02-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0004-4a58-b6c1-000000000004',
    employeeCode: '10101',
    firstName: 'Rajesh',
    lastName: 'Sharma',
    fullName: 'Dr. Rajesh Sharma',
    departmentName: 'Medical Services',
    jobTitleName: 'Chief Medical Officer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'rajesh.sharma@jphrc.org',
    mobileNumber: '+91 98765 43210',
    status: 'active',
    dateOfJoining: '2017-08-20T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2017-08-10T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0005-4a58-b6c1-000000000005',
    employeeCode: '10201',
    firstName: 'Mary',
    lastName: 'Mathew',
    fullName: 'Sister Mary Mathew',
    departmentName: 'Nursing Services',
    jobTitleName: 'Nursing Superintendent',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'mary.mathew@jphrc.org',
    mobileNumber: '+91 98765 43213',
    status: 'active',
    dateOfJoining: '2018-11-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-10-25T08:30:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },

  // 2. Notice-Period Staff (Amber Badge Trigger)
  {
    employeeId: 'f01a1c0d-0006-4a58-b6c1-000000000006',
    employeeCode: '10202',
    firstName: 'Priyanka',
    lastName: 'Mohanty',
    fullName: 'Sister Priyanka Mohanty',
    departmentName: 'Nursing Services',
    jobTitleName: 'Senior Staff Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'priyanka.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43214',
    status: 'noticePeriod',
    dateOfJoining: '2020-02-15T00:00:00Z',
    noticePeriodStartDate: '2026-09-01T00:00:00Z',
    noticePeriodEndDate: '2026-11-30T00:00:00Z',
    terminationDate: '2026-11-30T00:00:00Z',
    createdAt: '2020-02-01T10:00:00Z',
    updatedAt: '2026-09-01T11:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0007-4a58-b6c1-000000000007',
    employeeCode: '11001',
    firstName: 'Rakesh',
    lastName: 'Behera',
    fullName: 'Rakesh Behera',
    departmentName: 'Bio-Medical',
    jobTitleName: 'Senior Biomedical Engineer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'rakesh.behera@jphrc.org',
    mobileNumber: '+91 98765 43225',
    status: 'noticePeriod',
    dateOfJoining: '2021-06-10T00:00:00Z',
    noticePeriodStartDate: '2026-09-15T00:00:00Z',
    noticePeriodEndDate: '2026-12-15T00:00:00Z',
    terminationDate: '2026-12-15T00:00:00Z',
    createdAt: '2021-06-01T09:00:00Z',
    updatedAt: '2026-09-15T14:30:00Z'
  },

  // 3. Terminated Staff (Lockout Trigger)
  {
    employeeId: 'f01a1c0d-0008-4a58-b6c1-000000000008',
    employeeCode: '10999',
    firstName: 'Sunil',
    lastName: 'Verma',
    fullName: 'Sunil Verma',
    departmentName: 'Housekeeping',
    jobTitleName: 'Staff Assistant',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sunil.verma@jphrc.org',
    mobileNumber: '+91 98765 43299',
    status: 'terminated',
    dateOfJoining: '2021-04-01T00:00:00Z',
    noticePeriodStartDate: '2026-07-31T00:00:00Z',
    noticePeriodEndDate: '2026-08-31T00:00:00Z',
    terminationDate: '2026-08-31T00:00:00Z',
    createdAt: '2021-03-20T10:00:00Z',
    updatedAt: '2026-08-31T18:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0009-4a58-b6c1-000000000009',
    employeeCode: '10888',
    firstName: 'Anita',
    lastName: 'Soren',
    fullName: 'Anita Soren',
    departmentName: 'Billing',
    jobTitleName: 'Billing Executive',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'anita.soren@jphrc.org',
    mobileNumber: '+91 98765 43288',
    status: 'terminated',
    dateOfJoining: '2022-01-10T00:00:00Z',
    noticePeriodStartDate: '2026-08-15T00:00:00Z',
    noticePeriodEndDate: '2026-09-15T00:00:00Z',
    terminationDate: '2026-09-15T00:00:00Z',
    createdAt: '2022-01-05T09:00:00Z',
    updatedAt: '2026-09-15T17:30:00Z'
  },

  // 4. Clinical Specialists across Hospital Departments
  {
    employeeId: 'f01a1c0d-0010-4a58-b6c1-000000000010',
    employeeCode: '10102',
    firstName: 'Suman',
    lastName: 'Patnaik',
    fullName: 'Dr. Suman Patnaik',
    departmentName: 'Medical Services',
    jobTitleName: 'Consultant Physician',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'suman.patnaik@jphrc.org',
    mobileNumber: '+91 98765 43211',
    status: 'active',
    dateOfJoining: '2019-07-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-06-25T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0011-4a58-b6c1-000000000011',
    employeeCode: '10103',
    firstName: 'Subrat',
    lastName: 'Tripathy',
    fullName: 'Dr. Subrat Tripathy',
    departmentName: 'Medical Services',
    jobTitleName: 'Consultant Surgeon',
    officeLocationName: 'Rajgangpur Center',
    workEmail: 'subrat.tripathy@jphrc.org',
    mobileNumber: '+91 98765 43212',
    status: 'active',
    dateOfJoining: '2020-01-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-01-10T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0012-4a58-b6c1-000000000012',
    employeeCode: '10203',
    firstName: 'Jyotsna',
    lastName: 'Rout',
    fullName: 'Sister Jyotsna Rout',
    departmentName: 'Nursing Services',
    jobTitleName: 'ICU Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'jyotsna.rout@jphrc.org',
    mobileNumber: '+91 98765 43215',
    status: 'active',
    dateOfJoining: '2021-03-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-02-20T09:30:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0013-4a58-b6c1-000000000013',
    employeeCode: '10204',
    firstName: 'Saraswati',
    lastName: 'Das',
    fullName: 'Sister Saraswati Das',
    departmentName: 'Nursing Services',
    jobTitleName: 'Ward Incharge',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'saraswati.das@jphrc.org',
    mobileNumber: '+91 98765 43216',
    status: 'active',
    dateOfJoining: '2019-09-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-09-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0014-4a58-b6c1-000000000014',
    employeeCode: '10302',
    firstName: 'Ananya',
    lastName: 'Mishra',
    fullName: 'Dr. Ananya Mishra',
    departmentName: 'Intensive Care Unit',
    jobTitleName: 'Intensivist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'ananya.mishra@jphrc.org',
    mobileNumber: '+91 98765 43217',
    status: 'active',
    dateOfJoining: '2020-05-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-05-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0015-4a58-b6c1-000000000015',
    employeeCode: '10303',
    firstName: 'Kalyani',
    lastName: 'Barik',
    fullName: 'Sister Kalyani Barik',
    departmentName: 'Intensive Care Unit',
    jobTitleName: 'ICU Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'kalyani.barik@jphrc.org',
    mobileNumber: '+91 98765 43218',
    status: 'active',
    dateOfJoining: '2021-08-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-08-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0016-4a58-b6c1-000000000016',
    employeeCode: '10401',
    firstName: 'Debasis',
    lastName: 'Samal',
    fullName: 'Dr. Debasis Samal',
    departmentName: 'Emergency and Trauma',
    jobTitleName: 'Emergency Medical Officer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'debasis.samal@jphrc.org',
    mobileNumber: '+91 98765 43219',
    status: 'active',
    dateOfJoining: '2019-11-20T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-11-10T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0017-4a58-b6c1-000000000017',
    employeeCode: '10402',
    firstName: 'Ramesh',
    lastName: 'Mohapatra',
    fullName: 'Ramesh Mohapatra',
    departmentName: 'Emergency and Trauma',
    jobTitleName: 'Emergency Technician',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'ramesh.mohapatra@jphrc.org',
    mobileNumber: '+91 98765 43220',
    status: 'active',
    dateOfJoining: '2021-02-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-02-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0018-4a58-b6c1-000000000018',
    employeeCode: '10501',
    firstName: 'Arati',
    lastName: 'Nayak',
    fullName: 'Sister Arati Nayak',
    departmentName: 'Operation Theatre',
    jobTitleName: 'OT Incharge',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'arati.nayak@jphrc.org',
    mobileNumber: '+91 98765 43221',
    status: 'active',
    dateOfJoining: '2018-04-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-04-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0019-4a58-b6c1-000000000019',
    employeeCode: '10502',
    firstName: 'Sukant',
    lastName: 'Behera',
    fullName: 'Sukant Behera',
    departmentName: 'Operation Theatre',
    jobTitleName: 'OT Technician',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sukant.behera@jphrc.org',
    mobileNumber: '+91 98765 43222',
    status: 'active',
    dateOfJoining: '2020-07-20T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-07-10T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0020-4a58-b6c1-000000000020',
    employeeCode: '10601',
    firstName: 'Meena',
    lastName: 'Pradhan',
    fullName: 'Dr. Meena Pradhan',
    departmentName: 'Pathology and Lab',
    jobTitleName: 'Consultant Pathologist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'meena.pradhan@jphrc.org',
    mobileNumber: '+91 98765 43223',
    status: 'active',
    dateOfJoining: '2019-01-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-01-05T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0021-4a58-b6c1-000000000021',
    employeeCode: '10602',
    firstName: 'Tapan Kumar',
    lastName: 'Panda',
    fullName: 'Tapan Kumar Panda',
    departmentName: 'Pathology and Lab',
    jobTitleName: 'Senior Lab Technician',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'tapan.panda@jphrc.org',
    mobileNumber: '+91 98765 43224',
    status: 'active',
    dateOfJoining: '2020-03-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-03-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0022-4a58-b6c1-000000000022',
    employeeCode: '10701',
    firstName: 'Pradeep',
    lastName: 'Jena',
    fullName: 'Dr. Pradeep Jena',
    departmentName: 'Radiology and Imaging',
    jobTitleName: 'Consultant Radiologist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'pradeep.jena@jphrc.org',
    mobileNumber: '+91 98765 43226',
    status: 'active',
    dateOfJoining: '2018-09-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-08-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0023-4a58-b6c1-000000000023',
    employeeCode: '10702',
    firstName: 'Santosh',
    lastName: 'Sahu',
    fullName: 'Santosh Sahu',
    departmentName: 'Radiology and Imaging',
    jobTitleName: 'X-Ray / CT Technician',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'santosh.sahu@jphrc.org',
    mobileNumber: '+91 98765 43227',
    status: 'active',
    dateOfJoining: '2021-05-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-05-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0024-4a58-b6c1-000000000024',
    employeeCode: '10801',
    firstName: 'Niranjan',
    lastName: 'Biswal',
    fullName: 'Niranjan Biswal',
    departmentName: 'Pharmacy',
    jobTitleName: 'Chief Pharmacist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'niranjan.biswal@jphrc.org',
    mobileNumber: '+91 98765 43228',
    status: 'active',
    dateOfJoining: '2017-06-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2017-06-01T08:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0025-4a58-b6c1-000000000025',
    employeeCode: '10802',
    firstName: 'Rashmi Rekha',
    lastName: 'Swain',
    fullName: 'Rashmi Rekha Swain',
    departmentName: 'Pharmacy',
    jobTitleName: 'Dispensing Pharmacist',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'rashmi.swain@jphrc.org',
    mobileNumber: '+91 98765 43229',
    status: 'active',
    dateOfJoining: '2020-10-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-09-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0026-4a58-b6c1-000000000026',
    employeeCode: '10901',
    firstName: 'Smita',
    lastName: 'Panigrahi',
    fullName: 'Dr. Smita Panigrahi',
    departmentName: 'Infection Control and Microbiology',
    jobTitleName: 'Infection Control Officer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'smita.panigrahi@jphrc.org',
    mobileNumber: '+91 98765 43230',
    status: 'active',
    dateOfJoining: '2019-04-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-04-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0027-4a58-b6c1-000000000027',
    employeeCode: '10902',
    firstName: 'Pravati',
    lastName: 'Sahoo',
    fullName: 'Sister Pravati Sahoo',
    departmentName: 'Infection Control and Microbiology',
    jobTitleName: 'Staff Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'pravati.sahoo@jphrc.org',
    mobileNumber: '+91 98765 43231',
    status: 'active',
    dateOfJoining: '2021-09-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-09-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0028-4a58-b6c1-000000000028',
    employeeCode: '11002',
    firstName: 'Manoranjan',
    lastName: 'Sahu',
    fullName: 'Manoranjan Sahu',
    departmentName: 'Bio-Medical',
    jobTitleName: 'Staff Assistant',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'manoranjan.sahu@jphrc.org',
    mobileNumber: '+91 98765 43232',
    status: 'active',
    dateOfJoining: '2022-03-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-02-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0029-4a58-b6c1-000000000029',
    employeeCode: '11101',
    firstName: 'Babula',
    lastName: 'Palei',
    fullName: 'Babula Palei',
    departmentName: 'Housekeeping',
    jobTitleName: 'Sanitation Supervisor',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'babula.palei@jphrc.org',
    mobileNumber: '+91 98765 43233',
    status: 'active',
    dateOfJoining: '2018-02-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-02-01T08:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0030-4a58-b6c1-000000000030',
    employeeCode: '11201',
    firstName: 'Subash',
    lastName: 'Singh',
    fullName: 'Subash Singh',
    departmentName: 'Security',
    jobTitleName: 'Security Incharge',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'subash.singh@jphrc.org',
    mobileNumber: '+91 98765 43234',
    status: 'active',
    dateOfJoining: '2017-09-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2017-08-25T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0031-4a58-b6c1-000000000031',
    employeeCode: '11202',
    firstName: 'Jagannath',
    lastName: 'Sahu',
    fullName: 'Jagannath Sahu',
    departmentName: 'Security',
    jobTitleName: 'Staff Assistant',
    officeLocationName: 'Rajgangpur Center',
    workEmail: 'jagannath.sahu@jphrc.org',
    mobileNumber: '+91 98765 43235',
    status: 'active',
    dateOfJoining: '2021-04-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-04-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0032-4a58-b6c1-000000000032',
    employeeCode: '11301',
    firstName: 'Ashok',
    lastName: 'Agrawal',
    fullName: 'Ashok Agrawal',
    departmentName: 'Finance and Accounts',
    jobTitleName: 'Chief Financial Officer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'ashok.agrawal@jphrc.org',
    mobileNumber: '+91 98765 43236',
    status: 'active',
    dateOfJoining: '2018-01-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-01-02T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0033-4a58-b6c1-000000000033',
    employeeCode: '11302',
    firstName: 'Srikant',
    lastName: 'Behera',
    fullName: 'Srikant Behera',
    departmentName: 'Finance and Accounts',
    jobTitleName: 'Senior Accountant',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'srikant.behera@jphrc.org',
    mobileNumber: '+91 98765 43237',
    status: 'active',
    dateOfJoining: '2020-02-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-02-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0034-4a58-b6c1-000000000034',
    employeeCode: '11401',
    firstName: 'Minati',
    lastName: 'Senapati',
    fullName: 'Minati Senapati',
    departmentName: 'Human Resource',
    jobTitleName: 'HR Manager',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'minati.senapati@jphrc.org',
    mobileNumber: '+91 98765 43238',
    status: 'active',
    dateOfJoining: '2019-06-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-05-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0035-4a58-b6c1-000000000035',
    employeeCode: '11402',
    firstName: 'Sandeep',
    lastName: 'Padhi',
    fullName: 'Sandeep Padhi',
    departmentName: 'Human Resource',
    jobTitleName: 'HR Executive',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sandeep.padhi@jphrc.org',
    mobileNumber: '+91 98765 43239',
    status: 'active',
    dateOfJoining: '2021-07-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-07-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0036-4a58-b6c1-000000000036',
    employeeCode: '11501',
    firstName: 'Gopinath',
    lastName: 'Das',
    fullName: 'Gopinath Das',
    departmentName: 'Maintenance',
    jobTitleName: 'Staff Assistant',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'gopinath.das@jphrc.org',
    mobileNumber: '+91 98765 43240',
    status: 'active',
    dateOfJoining: '2018-03-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-03-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0037-4a58-b6c1-000000000037',
    employeeCode: '11601',
    firstName: 'Suchitra',
    lastName: 'Mohapatra',
    fullName: 'Suchitra Mohapatra',
    departmentName: 'Dietetics',
    jobTitleName: 'Chief Dietitian',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'suchitra.mohapatra@jphrc.org',
    mobileNumber: '+91 98765 43241',
    status: 'active',
    dateOfJoining: '2019-10-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-09-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0038-4a58-b6c1-000000000038',
    employeeCode: '11701',
    firstName: 'Madhumita',
    lastName: 'Ray',
    fullName: 'Madhumita Ray',
    departmentName: 'Front Office',
    jobTitleName: 'Front Desk Executive',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'madhumita.ray@jphrc.org',
    mobileNumber: '+91 98765 43242',
    status: 'active',
    dateOfJoining: '2021-01-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-01-05T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0039-4a58-b6c1-000000000039',
    employeeCode: '11801',
    firstName: 'Pramod',
    lastName: 'Jena',
    fullName: 'Pramod Jena',
    departmentName: 'Medical Records Department',
    jobTitleName: 'MRD Incharge',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'pramod.jena@jphrc.org',
    mobileNumber: '+91 98765 43243',
    status: 'active',
    dateOfJoining: '2018-07-20T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-07-10T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0040-4a58-b6c1-000000000040',
    employeeCode: '11901',
    firstName: 'Chinmayee',
    lastName: 'Das',
    fullName: 'Dr. Chinmayee Das',
    departmentName: 'Blood Bank',
    jobTitleName: 'Blood Bank Officer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'chinmayee.das@jphrc.org',
    mobileNumber: '+91 98765 43244',
    status: 'active',
    dateOfJoining: '2020-04-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-04-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0041-4a58-b6c1-000000000041',
    employeeCode: '12001',
    firstName: 'Deepak Kumar',
    lastName: 'Sahoo',
    fullName: 'Deepak Kumar Sahoo',
    departmentName: 'Dialysis Unit',
    jobTitleName: 'Dialysis Technician',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'deepak.sahoo@jphrc.org',
    mobileNumber: '+91 98765 43245',
    status: 'active',
    dateOfJoining: '2021-06-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-05-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0042-4a58-b6c1-000000000042',
    employeeCode: '12101',
    firstName: 'Bikash Chandra',
    lastName: 'Nayak',
    fullName: 'Dr. Bikash Chandra Nayak',
    departmentName: 'Cardiology',
    jobTitleName: 'Cardiologist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'bikash.nayak@jphrc.org',
    mobileNumber: '+91 98765 43246',
    status: 'active',
    dateOfJoining: '2019-08-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-08-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0043-4a58-b6c1-000000000043',
    employeeCode: '12201',
    firstName: 'Tarun Kumar',
    lastName: 'Panda',
    fullName: 'Dr. Tarun Kumar Panda',
    departmentName: 'Orthopaedics',
    jobTitleName: 'Orthopaedic Surgeon',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'tarun.panda@jphrc.org',
    mobileNumber: '+91 98765 43247',
    status: 'active',
    dateOfJoining: '2018-12-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-11-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0044-4a58-b6c1-000000000044',
    employeeCode: '12301',
    firstName: 'Archana',
    lastName: 'Mohanty',
    fullName: 'Dr. Archana Mohanty',
    departmentName: 'Paediatrics',
    jobTitleName: 'Paediatrician',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'archana.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43248',
    status: 'active',
    dateOfJoining: '2020-09-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-09-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0045-4a58-b6c1-000000000045',
    employeeCode: '12401',
    firstName: 'Pratima',
    lastName: 'Barik',
    fullName: 'Dr. Pratima Barik',
    departmentName: 'Obstetrics and Gynaecology',
    jobTitleName: 'Gynaecologist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'pratima.barik@jphrc.org',
    mobileNumber: '+91 98765 43249',
    status: 'active',
    dateOfJoining: '2019-03-20T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-03-10T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0046-4a58-b6c1-000000000046',
    employeeCode: '12501',
    firstName: 'Satyabrata',
    lastName: 'Mishra',
    fullName: 'Dr. Satyabrata Mishra',
    departmentName: 'Anaesthesia',
    jobTitleName: 'Anaesthetist',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'satyabrata.mishra@jphrc.org',
    mobileNumber: '+91 98765 43250',
    status: 'active',
    dateOfJoining: '2018-06-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2018-06-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0047-4a58-b6c1-000000000047',
    employeeCode: '12601',
    firstName: 'Hemant Kumar',
    lastName: 'Das',
    fullName: 'Hemant Kumar Das',
    departmentName: 'Store and Purchase',
    jobTitleName: 'Purchase Officer',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'hemant.das@jphrc.org',
    mobileNumber: '+91 98765 43251',
    status: 'active',
    dateOfJoining: '2021-02-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-01-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0048-4a58-b6c1-000000000048',
    employeeCode: '12701',
    firstName: 'Amitava',
    lastName: 'Mohanty',
    fullName: 'Amitava Mohanty',
    departmentName: 'Billing',
    jobTitleName: 'Billing Executive',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'amitava.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43252',
    status: 'active',
    dateOfJoining: '2020-11-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2020-11-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0049-4a58-b6c1-000000000049',
    employeeCode: '10301',
    firstName: 'Manaswini',
    lastName: 'Sahoo',
    fullName: 'Manaswini Sahoo',
    departmentName: 'Quality Management',
    jobTitleName: 'Quality Coordinator',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'manaswini.sahoo@jphrc.org',
    mobileNumber: '+91 98765 43253',
    status: 'active',
    dateOfJoining: '2021-10-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-09-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0050-4a58-b6c1-000000000050',
    employeeCode: '10603',
    firstName: 'Ritanjali',
    lastName: 'Rout',
    fullName: 'Ritanjali Rout',
    departmentName: 'Pathology and Lab',
    jobTitleName: 'Lab Technician',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'ritanjali.rout@jphrc.org',
    mobileNumber: '+91 98765 43254',
    status: 'active',
    dateOfJoining: '2022-04-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-04-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0051-4a58-b6c1-000000000051',
    employeeCode: '10703',
    firstName: 'Bhabani Sankar',
    lastName: 'Das',
    fullName: 'Bhabani Sankar Das',
    departmentName: 'Radiology and Imaging',
    jobTitleName: 'X-Ray / CT Technician',
    officeLocationName: 'Rajgangpur Center',
    workEmail: 'bhabani.das@jphrc.org',
    mobileNumber: '+91 98765 43255',
    status: 'active',
    dateOfJoining: '2021-12-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-11-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0052-4a58-b6c1-000000000052',
    employeeCode: '10205',
    firstName: 'Sipra',
    lastName: 'Priydarshini',
    fullName: 'Sister Sipra Priydarshini',
    departmentName: 'Nursing Services',
    jobTitleName: 'Staff Nurse',
    officeLocationName: 'Rajgangpur Center',
    workEmail: 'sipra.priydarshini@jphrc.org',
    mobileNumber: '+91 98765 43256',
    status: 'active',
    dateOfJoining: '2022-02-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-02-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0053-4a58-b6c1-000000000053',
    employeeCode: '10206',
    firstName: 'Laxmipriya',
    lastName: 'Sahoo',
    fullName: 'Sister Laxmipriya Sahoo',
    departmentName: 'Nursing Services',
    jobTitleName: 'Staff Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'laxmipriya.sahoo@jphrc.org',
    mobileNumber: '+91 98765 43257',
    status: 'active',
    dateOfJoining: '2022-05-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-05-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0054-4a58-b6c1-000000000054',
    employeeCode: '10803',
    firstName: 'Santilata',
    lastName: 'Panda',
    fullName: 'Santilata Panda',
    departmentName: 'Pharmacy',
    jobTitleName: 'Dispensing Pharmacist',
    officeLocationName: 'Rajgangpur Center',
    workEmail: 'santilata.panda@jphrc.org',
    mobileNumber: '+91 98765 43258',
    status: 'active',
    dateOfJoining: '2021-08-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-07-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0055-4a58-b6c1-000000000055',
    employeeCode: '10403',
    firstName: 'Goutam',
    lastName: 'Tripathy',
    fullName: 'Goutam Tripathy',
    departmentName: 'Emergency and Trauma',
    jobTitleName: 'Emergency Technician',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'goutam.tripathy@jphrc.org',
    mobileNumber: '+91 98765 43259',
    status: 'active',
    dateOfJoining: '2022-01-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-01-02T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0056-4a58-b6c1-000000000056',
    employeeCode: '10503',
    firstName: 'Puspanjali',
    lastName: 'Nath',
    fullName: 'Sister Puspanjali Nath',
    departmentName: 'Operation Theatre',
    jobTitleName: 'Staff Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'puspanjali.nath@jphrc.org',
    mobileNumber: '+91 98765 43260',
    status: 'active',
    dateOfJoining: '2021-11-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-11-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0057-4a58-b6c1-000000000057',
    employeeCode: '10304',
    firstName: 'Sashikanta',
    lastName: 'Mohanty',
    fullName: 'Sashikanta Mohanty',
    departmentName: 'Intensive Care Unit',
    jobTitleName: 'ICU Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sashikanta.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43261',
    status: 'active',
    dateOfJoining: '2022-06-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-05-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0058-4a58-b6c1-000000000058',
    employeeCode: '11102',
    firstName: 'Ranjita',
    lastName: 'Sethy',
    fullName: 'Ranjita Sethy',
    departmentName: 'Housekeeping',
    jobTitleName: 'Staff Assistant',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'ranjita.sethy@jphrc.org',
    mobileNumber: '+91 98765 43262',
    status: 'active',
    dateOfJoining: '2021-03-10T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2021-03-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0059-4a58-b6c1-000000000059',
    employeeCode: '11203',
    firstName: 'Baidhar',
    lastName: 'Mandal',
    fullName: 'Baidhar Mandal',
    departmentName: 'Security',
    jobTitleName: 'Staff Assistant',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'baidhar.mandal@jphrc.org',
    mobileNumber: '+91 98765 43263',
    status: 'active',
    dateOfJoining: '2019-12-01T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2019-11-20T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  },
  {
    employeeId: 'f01a1c0d-0060-4a58-b6c1-000000000060',
    employeeCode: '12702',
    firstName: 'Subhashree',
    lastName: 'Swain',
    fullName: 'Subhashree Swain',
    departmentName: 'Billing',
    jobTitleName: 'Billing Executive',
    officeLocationName: 'Uditnagar City Center',
    workEmail: 'subhashree.swain@jphrc.org',
    mobileNumber: '+91 98765 43264',
    status: 'active',
    dateOfJoining: '2022-07-15T00:00:00Z',
    noticePeriodStartDate: null,
    noticePeriodEndDate: null,
    terminationDate: null,
    createdAt: '2022-07-01T09:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z'
  }
].map(emp => ({
  ...emp,
  departmentId: getDeptId(emp.departmentName),
  jobTitleId: getJobId(emp.jobTitleName),
  officeLocationId: emp.officeLocationName.includes('Uditnagar') ? 2 : (emp.officeLocationName.includes('Rajgangpur') ? 3 : 1)
}));

// Utility helper to send JSON
function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Quota-Requests-DailyLimit': '20000',
    'X-Quota-Requests-DailyRemaining': '19850',
    'X-Quota-Requests-DailyReset': new Date(Date.now() + 86400000).toISOString(),
    'X-Quota-Requests-MonthlyLimit': '250000',
    'X-Quota-Requests-MonthlyRemaining': '248200',
    ...extraHeaders
  });
  res.end(body);
}

// Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const str = raw.toString('utf8');
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(str);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        resolve({ raw, obj });
      } else if (contentType.includes('application/json')) {
        try {
          resolve({ raw, obj: JSON.parse(str || '{}') });
        } catch (e) {
          resolve({ raw, obj: {} });
        }
      } else {
        resolve({ raw, obj: {} });
      }
    });
    req.on('error', reject);
  });
}

// ─── HTTP SERVER ROUTING ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. POST /publicapi/connect/token (OAuth 2.0 Client Credentials Grant)
  if (req.method === 'POST' && pathname === '/publicapi/connect/token') {
    const { obj } = await parseBody(req);
    const grantType = obj.grant_type;
    const clientId = obj.client_id;
    const clientSecret = obj.client_secret;

    if (grantType !== 'client_credentials') {
      return sendJson(res, 400, { error: 'unsupported_grant_type' });
    }

    if (!clientId || !clientSecret) {
      return sendJson(res, 400, { error: 'invalid_client' });
    }

    const token = `mock_token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    return sendJson(res, 200, {
      access_token: token,
      expires_in: 900,
      token_type: 'Bearer',
      scope: 'emp:read'
    });
  }

  // Token Validation for all /employee/api/v1/* routes
  if (pathname.startsWith('/employee/api/v1/')) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sendJson(res, 401, { error: 'Invalid token' });
    }
  }

  // 2. GET /employee/api/v1/departments
  if (req.method === 'GET' && pathname === '/employee/api/v1/departments') {
    return sendJson(res, 200, MOCK_DEPARTMENTS);
  }

  // 3. GET /employee/api/v1/job-titles
  if (req.method === 'GET' && pathname === '/employee/api/v1/job-titles') {
    return sendJson(res, 200, MOCK_JOB_TITLES);
  }

  // 4. GET /employee/api/v1/usage
  if (req.method === 'GET' && pathname === '/employee/api/v1/usage') {
    return sendJson(res, 200, {
      periodStart: new Date(Date.now() - 10 * 86400000).toISOString(),
      periodEnd: new Date(Date.now() + 20 * 86400000).toISOString(),
      requestsRemaining: 248200,
      dailyRequestsRemaining: 19850,
      bytesUsed: 1048576,
      requestsUsed: 1800,
      overageAllowed: false
    });
  }

  // 5. GET /employee/api/v1/employees/by-code/:code
  if (req.method === 'GET' && pathname.startsWith('/employee/api/v1/employees/by-code/')) {
    const code = decodeURIComponent(pathname.replace('/employee/api/v1/employees/by-code/', '')).trim();
    const emp = MOCK_EMPLOYEES.find(e => e.employeeCode.toUpperCase() === code.toUpperCase());
    if (emp) {
      return sendJson(res, 200, emp);
    }
    return sendJson(res, 404, { title: 'Not Found', status: 404, detail: `Employee code ${code} not found.` });
  }

  // 6. GET /employee/api/v1/employees/:id
  const singleEmpMatch = pathname.match(/^\/employee\/api\/v1\/employees\/([0-9a-fA-F-]+)$/);
  if (req.method === 'GET' && singleEmpMatch) {
    const empId = singleEmpMatch[1];
    const emp = MOCK_EMPLOYEES.find(e => e.employeeId === empId);
    if (emp) {
      return sendJson(res, 200, emp);
    }
    return sendJson(res, 404, { title: 'Not Found', status: 404, detail: `Employee GUID ${empId} not found.` });
  }

  // 7. GET /employee/api/v1/employees/changes (Change Feed Endpoint)
  if (req.method === 'GET' && pathname === '/employee/api/v1/employees/changes') {
    const token = parsedUrl.searchParams.get('token');
    const updatedAfter = parsedUrl.searchParams.get('updatedAfter');

    if (!token && updatedAfter) {
      // Bootstrap / Initial sync: return all mock employees as upserted
      return sendJson(res, 200, {
        data: MOCK_EMPLOYEES.map(emp => ({
          changeType: emp.status === 'terminated' ? 'deleted' : 'upserted',
          employeeId: emp.employeeId,
          changedAt: emp.updatedAt,
          employee: emp
        })),
        nextCursor: 'cursor_checkpoint_page_1'
      });
    }

    // Subsequent incremental call with cursor
    return sendJson(res, 200, {
      data: [],
      nextCursor: null
    });
  }

  // 8. GET /employee/api/v1/employees (Directory Endpoint with Paging & Search)
  if (req.method === 'GET' && pathname === '/employee/api/v1/employees') {
    const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
    const perPage = parseInt(parsedUrl.searchParams.get('perPage') || '100', 10);
    const searchTerm = (parsedUrl.searchParams.get('q') || '').toLowerCase().trim();
    const deptFilter = (parsedUrl.searchParams.get('department') || '').toLowerCase().trim();
    const statusFilter = (parsedUrl.searchParams.get('status') || '').toLowerCase().trim();

    let filtered = MOCK_EMPLOYEES;

    if (searchTerm) {
      filtered = filtered.filter(e => 
        e.fullName.toLowerCase().includes(searchTerm) ||
        e.employeeCode.toLowerCase().includes(searchTerm) ||
        e.workEmail.toLowerCase().includes(searchTerm)
      );
    }

    if (deptFilter && deptFilter !== 'all') {
      filtered = filtered.filter(e => e.departmentName.toLowerCase() === deptFilter);
    }

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status.toLowerCase() === statusFilter);
    }

    const startIndex = (page - 1) * perPage;
    const pageData = filtered.slice(startIndex, startIndex + perPage);

    return sendJson(res, 200, {
      data: pageData,
      pagination: {
        totalCount: filtered.length,
        pageNumber: page,
        pageSize: perPage,
        totalPages: Math.ceil(filtered.length / perPage) || 1
      }
    });
  }

  // 9. POST /mock/dispatch-webhook (Testing utility to dispatch a signed webhook to HIMS)
  if (req.method === 'POST' && pathname === '/mock/dispatch-webhook') {
    const { obj } = await parseBody(req);
    const targetUrl = obj.targetUrl || 'http://localhost:5000/api/webhooks/officeportal';
    const eventType = obj.eventType || 'employee.updated';
    const employeeData = obj.employee || MOCK_EMPLOYEES[0];
    const signingKey = obj.signingKey || WEBHOOK_SIGNING_KEY;

    const payload = JSON.stringify({
      apiVersion: 'v1',
      deliveryId: `del-${Date.now()}`,
      events: [
        {
          eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          types: Array.isArray(eventType) ? eventType : [eventType],
          occurredAt: new Date().toISOString(),
          attempt: 1,
          data: employeeData
        }
      ]
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = Buffer.concat([
      Buffer.from(`${timestamp}.`, 'utf8'),
      Buffer.from(payload, 'utf8')
    ]);

    const signature = createHmac('sha256', signingKey)
      .update(signedPayload)
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${signature}`;

    try {
      const parsedTarget = new URL(targetUrl);
      const postReq = http.request({
        hostname: parsedTarget.hostname,
        port: parsedTarget.port,
        path: parsedTarget.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
          'X-Awarious-Signature': signatureHeader
        }
      }, (postRes) => {
        let respBody = '';
        postRes.on('data', d => respBody += d);
        postRes.on('end', () => {
          sendJson(res, 200, {
            success: true,
            dispatchedTo: targetUrl,
            statusReceived: postRes.statusCode,
            responseBody: respBody,
            signatureHeader
          });
        });
      });

      postReq.on('error', (err) => {
        sendJson(res, 502, { error: `Failed to dispatch: ${err.message}` });
      });

      postReq.write(payload);
      postReq.end();
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  // 404 Fallback
  return sendJson(res, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`   OfficePortal Public API Mock Server Running        `);
    console.log(`   Listening at: http://localhost:${PORT}             `);
    console.log(`   Total Mock Personas: ${MOCK_EMPLOYEES.length}     `);
    console.log(`   Departments:         ${MOCK_DEPARTMENTS.length}    `);
    console.log(`   Designations:        ${MOCK_JOB_TITLES.length}     `);
    console.log(`======================================================\n`);
  });
}

module.exports = {
  server,
  MOCK_EMPLOYEES,
  MOCK_DEPARTMENTS,
  MOCK_JOB_TITLES,
  PORT
};
