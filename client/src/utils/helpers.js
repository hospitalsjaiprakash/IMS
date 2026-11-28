import { format, formatDistanceToNow, parseISO } from 'date-fns';

export const formatDate = (d) => {
  if (!d) return '—';
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'dd-MM-yyyy'); } catch { return d; }
};

export const formatDateTime = (d) => {
  if (!d) return '—';
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'dd-MM-yyyy, hh:mm a'); } catch { return d; }
};

export const formatTime = (d) => {
  if (!d) return '—';
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'hh:mm a'); } catch { return d; }
};

export const timeAgo = (d) => {
  if (!d) return '—';
  try { return formatDistanceToNow(typeof d === 'string' ? parseISO(d) : d, { addSuffix: true }); } catch { return d; }
};

export const getSeverityClass = (s) => {
  if (!s) return 'badge-gray';
  const map = { Minor: 'badge-green', Major: 'badge-yellow', Grave: 'badge-purple' };
  return map[s] || 'badge-gray';
};

export const getStatusClass = (s) => {
  if (!s) return 'badge-gray';
  const map = {
    submitted: 'badge-blue',
    with_hod: 'badge-yellow',
    with_hod_and_imc: 'badge-yellow',
    with_imc: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    with_investigator: 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold',
    with_imc_review: 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold',
    redirect_requested: 'bg-orange-50 text-orange-700 border border-orange-200',
    with_head_management: 'bg-orange-50 text-orange-700 border border-orange-200',
    pending_letter_generation: 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold',
    pending_management_letter_approval: 'bg-purple-50 text-purple-700 border border-purple-200 font-semibold',
    pending_trainer_assignment: 'bg-amber-50 text-amber-700 border border-amber-200 font-semibold',
    training_in_progress: 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold',
    pending_imc_training_review: 'bg-purple-50 text-purple-700 border border-purple-200 font-semibold',
    pending_training: 'bg-amber-50 text-amber-800 border border-amber-300 font-bold',
    resolved: 'badge-green',
    closed: 'badge-green',
    withdrawn: 'bg-red-50 text-red-700 border border-red-200 font-medium',
    locked: 'bg-slate-100 text-slate-600 border border-slate-200',
  };
  return `badge ${map[s] || 'badge-gray'}`;
};

export const getStatusLabel = (s) => {
  const map = {
    submitted: 'Submitted',
    with_hod: 'Awaiting Department Feedback',
    with_hod_and_imc: 'Awaiting Department & IMC Feedback',
    with_imc: 'Department Reviewed - Awaiting IMC',
    with_investigator: 'Under Investigation',
    with_imc_review: 'Investigation Submitted - Awaiting IMC',
    redirect_requested: 'Redirect Requested',
    with_head_management: 'IMC Reviewed - Awaiting Mgmt',
    pending_letter_generation: 'Drafting Letter(s)',
    pending_management_letter_approval: 'Awaiting Letter Approval',
    pending_trainer_assignment: 'Awaiting Trainer Assignment',
    training_in_progress: 'Training in Progress',
    pending_imc_training_review: 'Awaiting Training Verification',
    pending_training: 'Pending Training (IMC)',
    resolved: 'Resolved',
    closed: 'Closed',
    withdrawn: 'Withdrawn',
    locked: 'Locked',
  };
  return map[s] || s;
};

export const getSLABadgeInfo = (createdAt, status) => {
  if (!createdAt) return null;
  if (['resolved', 'closed', 'withdrawn', 'locked'].includes(status)) return null;

  const created = new Date(createdAt);
  const now = new Date();

  // 7 days SLA
  const slaDeadline = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
  const diffMs = slaDeadline - now;

  const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));

  if (diffMs < 0) {
    if (diffDays > 0) return { text: `Overdue by ${diffDays}d`, isOverdue: true };
    if (diffHours > 0) return { text: `Overdue by ${diffHours}h`, isOverdue: true };
    return { text: 'Overdue (<1h)', isOverdue: true };
  }
  return null;
};

export const INCIDENT_CATEGORY_MAPPING = {
  'Asset Related': [
    'Delayed or inadequate maintenance of equipment', 'Prolonged non-availability of critical medical equipment', 'Inadequate supply of essential assets', 'Physical damage to hospital equipment', 'Theft or loss of hospital assets', 'Missing or incomplete asset records', 'Inappropriate use of hospital assets', 'Safety incidents involving equipment usage', 'Inaccurate or out-of-calibration equipment', 'Delays in asset procurement', 'Inappropriate disposal or retirement of assets', 'Staff incompetence or lack of training in using equipment', 'Others'
  ],
  'Billing Related': [
    'Patient registration error (KYC)', 'Patient class/payer error', 'Referral doctor/consultants name error', 'Mode of payment (cash/card/ECS) error', 'Wrong investigation/procedure/consultation', 'Billing card errors', 'Insurance/TPA Related billing errors', 'Government credit patient related billing error', 'Medicine and consumable related billing errors', 'Blood bank related billing errors', 'Billing cancellation and modification', 'Others'
  ],
  'Security Related': [
    'Inappropriate behaviour of security staff', 'Theft/Burglary/Pilferage', 'Absconding Patient', 'Unauthorized Personnel Entry', 'Forbidden food items entry into hospital', 'Inebriated staff/visitor in hospital', 'Consumption/possession of tobacco products in the hospital premises', 'Security issues', 'Unauthorized work/activity', 'Theft & misconduct', 'Facility damage issues', 'Behavioural & discipline concerns', 'Health, safety & hygiene issue', 'Others'
  ],
  'Biomedical Related': [
    'Equipment Safety Hazard', 'Equipment/Accessories Lost/Missing', 'Damaged during transfer/ use', 'Unavailability of essential equipment/accessories', 'Oxygen cylinder unavailability/low pressure', 'Delayed preventive maintenance', 'Mishandling of equipment/assets', 'Delayed response to complaints/request', 'Inappropriate documentation', 'Unauthorised movement of equipment/accessories', 'Others'
  ],
  'Blood Bank Related': [
    'Inappropriate storage of blood and blood products', 'Transfusion associated reactions', 'Inappropriate blood/blood component transfusion', 'Documentation related', 'Donor counselling related', 'Packaging and labelling related', 'Others'
  ],
  'Facility Related': [
    'Delayed Response to Complaints/Request', 'Damage to facility asset', 'Misuse of amenities', 'Unauthorized movement of facility item', 'Inappropriate documentation', 'Unauthorized encroachment of accommodation/amenities', 'Others'
  ],
  'Doctor Related': [
    'Admission notes', 'Initial assessment notes', 'Doctors daily notes', 'Doctors transfer notes', 'Procedure notes', 'OT notes', 'Counselling notes', 'Use of unauthorized abbreviations', 'Non-signed documents- Consultants & RMOS', 'Non-compliance to verbal order policy', 'Prescription related error', 'Discharge summary related error', 'MLC related notes', 'Death related notes/Certificate errors', 'Cross-referral related notes', 'Others'
  ],
  'Consent Related': [
    'Incorrect consent form/s used', 'Incomplete consent form', 'Consent not taken', 'Consent given by unauthorized personnel', 'Improper counselling about operative options before surgery', 'Others'
  ],
  'CSSD Related': [
    'Delay in distribution', 'Documentation related', 'Packaging and labelling related', 'Sterility related', 'Package with no/illegible expiry dates', 'Unclean/non-functional packed equipments', 'Missing/broken instruments', 'Incomplete sterile set', 'Others'
  ],
  'Food and Beverages': [
    'Foodborne illness', 'Chemical contamination', 'Inappropriate labelling/packaging', 'Non-adherence to Food safety practices', 'Inadequate quantity of food', 'Deteriorated or stale product', 'Taste and flavour related', 'Foreign matter in food', 'Delay in food service', 'Inappropriate temperature of the food', 'Unavailability of prescribed diet', 'Diet counselling/diet plan related', 'Presentation of food and cleanliness of utensils', 'Hygiene and grooming of delivery person', 'Others'
  ],
  'General Maintenance related': [
    'Breakdown', 'Inappropriate shutdown', 'Delayed response to complaints/Request', 'Misuse amenities (AC, light, fan, etc)', 'Equipment safety hazard', 'Delayed preventive maintenance', 'Inappropriate documentation', 'Unauthorised movement of items', 'Others'
  ],
  'Hospital Emergency Codes Related': [
    'Code Red', 'Code Yellow', 'Code White', 'Code Pink', 'Code Grey', 'Code Green', 'Code Black', 'Code Brown', 'Code Orange', 'Code Blue', 'Others'
  ],
  'HR Related': [
    'Grooming related', 'Behavioural issue', 'Inappropriate documentation', 'Training & development related', 'Others'
  ],
  'Housekeeping Related': [
    'Unclean toilet', 'Unclean room, floor and dustbin', 'Cobweb in any area', 'Pest control related', 'Delay in service', 'Inappropriate use of chemicals', 'Spill management error', 'Biomedical waste handling error', 'Mishandling of machine', 'Unavailability of soap, hand gel, etc', 'Inappropriate documentation', 'Others'
  ],
  'Infection Control Related': [
    'Needle stick injury', 'Improper segregation of Biomedical Waste', 'Non-compliance of standard precautions during the patient care', 'Splash of Hazardous/Infective Material', 'Thrombophlebitis', 'Improper segregation of soiled and dirty linen at source', 'CAUTI (Catheter Associated Urinary Tract Infection)', 'CLABSI (Central Line Associated Blood Stream Infection)', 'VAP (Ventilator Associated Pneumonia)', 'SSI (Surgical Site Infection)', 'Others'
  ],
  'Lab Related': [
    'Sample related', 'Sample mishandling/loss', 'Late reporting', 'Incorrect/inappropriate results', 'Clinical correlation related', 'Critical value reports not being informed', 'Expiry of reagents', 'Reporting error in lab medicine', 'Others'
  ],
  'Laundry and Linen related': [
    'Inadequate supply of linen', 'Unclean Linen', 'Poor Quality of linen', 'Packing & labelling related issue', 'Segregation error', 'Untimely delivery of linen', 'Others'
  ],
  'Medication Related': [
    'Prescription error', 'Transcription error', 'Dispensing error', 'Error/Delay during administration', 'Uninformed non-availability of essential drugs in pharmacy', 'Incorrect storage', 'Adverse drug reactions', 'Incomplete/ incorrect documentation', 'Contaminated/expired medicine', 'Incorrect labeling', 'Others'
  ],
  'Nursing Care Related': [
    'Violation of patient privacy', 'Injury or fall of patient', 'Behavioural issues with patients/doctors', 'Bed sores/pressure ulcers', 'Patient diet/feeding related issues', 'Multiple pricks', 'Non-availability of dressing/appropriate items', 'Return to ICU within 48 hours', 'Return to emergency within 72 hours with similar presenting complaint', 'Accidental removal of tubes and catheters', 'Restrained related injury', 'Thrombophlebitis case', 'Reintubation after planned extubation', 'Others'
  ],
  'Purchase Related': [
    'Prolonged non-availability of item', 'Inappropriate delay in procurement of item', 'Inappropriate documentation', 'Inappropriate storage of items', 'Stock related', 'Physical damage to items', 'Others'
  ],
  'Radiology Related': [
    'Inappropriate imaging', 'Inappropriate exposure to radiation', 'Inappropriate procedure', 'Site/side error', 'Delay in reporting', 'Incorrect/inappropriate results', 'Clinical correlation related', 'Documentation related', 'Critical value reports not being informed', 'Contrast extravasation in radiology', 'Reporting error in radiology', 'Contrast reaction in radiology', 'Others'
  ],
  'Store Related': [
    'Prolonged non-availability of item', 'Inappropriate delay in procurement of item', 'Inappropriate documentation', 'Inappropriate storage of items', 'Stock related', 'Physical damage of items', 'Others'
  ],
  'Software/Hardware Related': [
    'HIMS related', 'Hardware related', 'Network related', 'Breakdown', 'Inappropriate shutdown', 'Delayed Response to Complaints/Request', 'Equipment safety hazard', 'Delayed preventive maintenance', 'Inappropriate documentation', 'Others'
  ],
  'Surgery or Procedure Related': [
    'Incorrect patient/site of surgery/procedure', 'Site not marked', 'Material/Consumable/ Drug not available before surgery', 'Antibiotic prophylaxis not given in time before surgery', 'Pre-anaesthetic checkup not done before surgery', 'Pre-surgical orders not carried out', 'Consents partial or incomplete', 'Inadequate OT staff during surgery', 'Expired CSSD packs', 'Injury/adverse outcomes to patient during procedure', 'Uninformed OT cancellation', 'Unplanned return to OT', 'Surgery rescheduled', 'Adverse anaesthesia event', 'Others'
  ],
  'Nursing Document Related': [
    'Initial assessment notes', 'Care plan', 'Daily monitoring notes', 'Drug Chart', 'Missing/pending Medical Record-Reports, films & scans', 'Improper handover of patients', 'Non-compliance to verbal order policy', 'Non-compliance to doctors written order', 'Non-recording of critical results and information to doctors', 'Non-documentation of patient safety parameters', 'Patient billing card errors', 'Discharge related document handover', 'MRD related', 'Medication and consumables related errors', 'MLC related documentation', 'Death related documentation', 'Crashcart and emergency cart related', 'Record and register maintenance', 'Improper handling of patients valuables and other items', 'Incorrect labeling of samples', 'Incorrect sample collection', 'Incorrect entry of investigation in system', 'Incorrect/Incomplete lab forms', 'Others'
  ],
  'Vehicle and Ambulance Related': [
    'Ambulance medical equipment non-functional/non-available', 'Delayed ambulance/vehicle service', 'Mis/inadequate communications of ambulance/vehicle staff', 'Inappropriate behaviour with patient/relatives/staff', 'Incomplete daily checklist', 'Unavailability of emergency medication', 'Rash driving/accident', 'Inebriated staff', 'Poor maintenance of vehicle', 'Inappropriate use of vehicle', 'Inappropriate documentation', 'Others'
  ],
  'Accommodation Related': [
    'Others'
  ]
};

export const INCIDENT_CATEGORIES = Object.keys(INCIDENT_CATEGORY_MAPPING);

export const OCCURRED_TO_OPTIONS = [
  'Patient', 'Hospital Employee', 'Visitor', 'Asset/Consumables', 'Process Flow', 'Others'
];

export const SEVERITY_OPTIONS = ['Minor', 'Major', 'Grave'];

export const clsx = (...classes) => classes.filter(Boolean).join(' ');

export const truncate = (str, n = 60) =>
  str && str.length > n ? str.slice(0, n) + '…' : str;

export const PROPOSED_OUTCOME_OPTIONS = [
  'No Action',
  'Counselling / Education / Training',
  'Issue a Warning Letter',
  'Issue an Advisory Letter',
  'Financial Penalty',
  'Suspension for a Stipulated Period',
  'Transfer to Other Dept.',
  'Demotion',
  'Termination',
  'Legal Action',
  'Disciplinary Committee',
  'Conflict Resolution Committee',
  'New Protocol and Process Flow',
  'Modifying Protocol and Process Flow',
  'Inappropriate Complaint',
  'Others'
];

export const parseProposedOutcomes = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {
        // ignore invalid JSON fallback
      }
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

export function convertNumberToWords(amount) {
  if (!amount || isNaN(amount)) return '';
  const num = Math.floor(Number(amount));
  if (num <= 0) return '';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const numToWordsUnder1000 = (n) => {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    } else if (n > 0) {
      str += ones[n];
    }
    return str.trim();
  };

  const integerToWords = (n) => {
    if (n <= 0) return '';
    let words = '';
    const crore = Math.floor(n / 10000000);
    let rem = n % 10000000;
    const lakh = Math.floor(rem / 100000);
    rem %= 100000;
    const thousand = Math.floor(rem / 1000);
    rem %= 1000;

    if (crore > 0) words += (crore >= 1000 ? integerToWords(crore) : numToWordsUnder1000(crore)) + ' Crore ';
    if (lakh > 0) words += numToWordsUnder1000(lakh) + ' Lakh ';
    if (thousand > 0) words += numToWordsUnder1000(thousand) + ' Thousand ';
    if (rem > 0) words += numToWordsUnder1000(rem);
    return words.trim();
  };

  return `Rupees ${integerToWords(num)} only`;
}

export const ROLE_CONFIG = {
  employee: { label: 'Employee', dashboard: '/dashboard', badgeClass: 'badge-green' },
  hod: { label: 'Reviewer', dashboard: '/dashboard', badgeClass: 'badge-yellow' },
  imc: { label: 'IMC Committee', dashboard: '/imc/dashboard', badgeClass: 'badge-blue' },
  head_management: { label: 'Management', dashboard: '/management/dashboard', badgeClass: 'badge-purple' },
  system_admin: { label: 'System Admin', dashboard: '/admin/dashboard', badgeClass: 'badge-red' },
};

export const getDisplayRole = (user) => {
  if (!user) return ROLE_CONFIG.employee;
  if (user.role === 'employee' && (user.isReviewer || user.isFeedbackReviewer)) {
    return { label: 'Reviewer', dashboard: '/dashboard', badgeClass: 'badge-yellow' };
  }
  return ROLE_CONFIG[user.role] || ROLE_CONFIG.employee;
};

export const getRoleDashboard = (user) => {
  if (!user) return '/login';
  if (String(user.employeeId || user.employee_id || '').trim() === '00000') {
    return '/admin/dashboard';
  }
  return ROLE_CONFIG[user.role]?.dashboard || '/dashboard';
};

const COMMON_WEAK_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'password@1', 'password@123', 'p@ssword1', 'p@ssw0rd',
  'admin1', 'admin12', 'admin123', 'admin@123', 'admin1234', 'administrator1',
  'welcome1', 'welcome123', 'welcome@123',
  'qwerty1', 'qwerty12', 'qwerty123', 'qwerty@123', 'abc123', 'abc1234', 'abcd1234', 'asdf1234',
  'hospital1', 'hospital123', 'hospital@123',
  'jphrc1', 'jphrc123', 'jphrc@123', 'jphrc2024', 'jphrc2025', 'jphrc2026',
  'jaiprakash1', 'jaiprakash123', 'ims123', 'ims@123', 'ims2026',
  'pass123', 'pass1234', 'test123', 'test1234', 'user123', 'user1234', 'demo123',
  'letmein1', 'iloveyou1', '123456a', 'a123456', '1234567a', '12345678a', '12345a', 'a12345',
]);

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    return {
      valid: false,
      error: 'Password must be at least 6 characters and include at least one letter and one number or special character.',
    };
  }
  if (new TextEncoder().encode(password).length > 72) {
    return { valid: false, error: 'Password must not exceed 72 bytes.' };
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigitOrSymbol = /[0-9]|[^A-Za-z0-9]/.test(password);
  if (!hasLetter || !hasDigitOrSymbol) {
    return {
      valid: false,
      error: 'Password must be at least 6 characters and include at least one letter and one number or special character.',
    };
  }
  if (COMMON_WEAK_PASSWORDS.has(password.trim().toLowerCase())) {
    return {
      valid: false,
      error: 'This password is too common. Please choose a stronger, unique password.',
    };
  }
  return { valid: true, error: '' };
}

export const formatDuration = (hours, fallback = 'N/A') => {
  if (hours === null || hours === undefined || Number.isNaN(Number(hours))) {
    return fallback;
  }
  const h = Number(hours);
  if (h < 24) return `${h.toFixed(1)} hrs`;
  return `${(h / 24).toFixed(1)} days`;
};

export const getApiErrorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

export const isImcUser = (u) => Boolean(u && (u.role === 'imc' || u.is_imc_member || u.is_imc_lead));

