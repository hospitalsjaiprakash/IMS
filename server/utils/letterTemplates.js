const { numberToWords } = require('./numberToWords');

/**
 * Format date in DD/MM/YYYY
 */
function formatDate(d) {
  const date = d ? new Date(d) : new Date();
  if (isNaN(date.getTime())) return String(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Standard CC list generator based on template type and employee department/role
 */
function getDefaultCcList(templateType, employee, incident) {
  const empName = employee.name || employee.full_name || 'Concerned Employee';
  const dept = employee.department || 'Concerned Department';
  const isDoctor = (employee.designation || '').toLowerCase().includes('consultant') ||
                   (employee.designation || '').toLowerCase().includes('dr.') ||
                   (employee.name || '').toLowerCase().startsWith('dr.');

  switch (templateType) {
    case 'advisory_letter':
      return [
        { label: empName, role: 'Recipient Employee' },
        { label: `Ward / Area In-charge, ${dept}`, role: 'In-charge' },
        { label: isDoctor ? 'Medical Superintendent' : 'Nursing Superintendent', role: 'Superintendent' },
        { label: 'Management Office', role: 'Executive Office' },
        { label: 'HOD- HR', role: 'Human Resources' }
      ];

    case 'suggestion_letter':
      return [
        { label: empName, role: 'Recipient Lead' },
        { label: 'Medical Superintendent', role: 'Clinical Governance' },
        { label: 'Management Office', role: 'Executive Office' }
      ];

    case 'warning_letter':
      return [
        { label: empName, role: 'Recipient Employee' },
        { label: `HOD- ${dept}`, role: 'Department Head' },
        { label: 'Asst. COO / COO', role: 'Operations' },
        { label: 'Management Office', role: 'Executive Office' },
        { label: 'HOD- HR', role: 'Human Resources' }
      ];

    case 'warning_penalty_letter':
      return [
        { label: empName, role: 'Recipient Employee' },
        { label: `Area In-charge, ${dept}`, role: 'Area Lead' },
        { label: `HOD- ${dept}`, role: 'Department Head' },
        { label: 'Asst. COO / COO', role: 'Operations' },
        { label: 'Management Office', role: 'Executive Office' },
        { label: 'HOD- HR', role: 'Human Resources' },
        { label: 'HOD- Accounts', role: 'Finance & Accounts (Salary Deduction)' }
      ];

    case 'training_letter':
      return [
        { label: empName, role: 'Recipient Employee' },
        { label: 'HOD- T&D', role: 'Training & Development' },
        { label: `HOD- ${dept}`, role: 'Department Head' },
        { label: 'Management Office', role: 'Executive Office' }
      ];

    case 'trainer_appointment_letter':
    case 'trainer_appointment':
      return [
        { label: empName, role: 'Designated Trainer' },
        { label: 'HOD- T&D', role: 'Training & Development' },
        { label: 'Medical Superintendent / Nursing Superintendent', role: 'Clinical Governance' },
        { label: 'Incident Management Committee (IMC)', role: 'Oversight Committee' },
        { label: 'Management Office', role: 'Executive Office' }
      ];

    default:
      return [
        { label: empName, role: 'Recipient Employee' },
        { label: `HOD- ${dept}`, role: 'Department Head' },
        { label: 'Management Office', role: 'Executive Office' },
        { label: 'HOD- HR', role: 'Human Resources' }
      ];
  }
}

/**
 * Letter body generators matching the exact hospital samples
 */
const TEMPLATE_DEFINITIONS = {
  advisory_letter: {
    name: 'Advisory Letter',
    subject: 'Advisory Letter',
    generateBody: ({ employee, incident }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const incBrief = incident.description ? incident.description.slice(0, 150) : 'the reported incident';
      const desig = employee.designation || 'concerned staff member';

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate} regarding ${incBrief}.

The Incident Management Committee has taken serious cognizance of this incident. As the concerned ${desig}, you are advised to exercise greater care, vigilance, and diligence while carrying out your designated responsibilities and document verifications.

You are specifically advised to ensure that all required hospital authorizations, verification procedures, and patient safety protocols are properly followed before proceeding, in order to prevent recurrence of similar incidents in the future.`;
    }
  },

  trainer_appointment_letter: {
    name: 'Trainer Appointment Letter',
    subject: 'Appointment as Designated Trainer - Incident Corrective Action',
    generateBody: ({ trainer = {}, incident = {}, trainingTopic, trainingInstructions, targetDate, trainees = [] }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const traineeList = trainees.length > 0
        ? trainees.map(t => `• ${t.name || t.full_name || t.recipient_name || 'Staff Member'} (${t.department || t.department_name || 'Hospital Staff'}${t.designation ? ' - ' + t.designation : ''})`).join('\n')
        : `• Designated Hospital Staff Member(s)`;

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate}.

The Incident Management Committee (IMC) and Hospital Executive Management have reviewed this incident and mandated corrective competency training under our hospital quality assurance and patient safety protocol.

You are hereby formally appointed as the Designated Trainer to conduct the mandated corrective training session(s).

TRAINING MANDATE DETAILS:
• Training Subject / Topic: ${trainingTopic || 'Standard Operating Procedures & Safety Guidelines'}
• Target Completion Date: ${targetDate ? formatDate(targetDate) : 'Within 7 business days'}
${trainingInstructions ? `• Specific Instructions / Focus Areas:\n${trainingInstructions}\n` : ''}
TRAINEE ROSTER:
${traineeList}

RESPONSIBILITIES OF THE DESIGNATED TRAINER:
1. Conduct structured, hands-on training covering standard operating protocols, safety guidelines, and error-prevention techniques.
2. Conduct practical verification and assessment of trainee competency upon conclusion of the session.
3. Maintain an official attendance record signed by all attending staff.
4. Log into the JPHRC IMS portal to submit your formal Training Completion Report along with the signed attendance sheet and any documentary proof.

Upon submission of your report, the Incident Management Committee will verify the training records and forward the file to Executive Management for official incident closure.

Your expertise and leadership in upholding clinical excellence, organizational discipline, and patient safety are highly valued.`;
    }
  },

  suggestion_letter: {
    name: 'Suggestion Letter',
    subject: 'Suggestion Letter',
    generateBody: ({ employee, incident }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const incBrief = incident.description ? incident.description.slice(0, 150) : 'the reported operational observation';
      const dept = employee.department || 'the concerned department';

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate} regarding ${incBrief}.

The Incident Management Committee values the utmost importance of clinical and operational excellence and requests you to kindly develop and introduce a comprehensive policy/protocol addressing this area of practice.

The protocol should be implemented in ${dept} and all applicable clinical/operational areas to ensure proper management, monitoring, and compliance, and to prevent recurrence of similar incidents in the future.`;
    }
  },

  warning_letter: {
    name: 'Warning Letter',
    subject: 'Warning Letter',
    generateBody: ({ employee, incident }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const incBrief = incident.description ? incident.description.slice(0, 150) : 'the reported procedural non-compliance';

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate} regarding ${incBrief}.

The Incident Management Committee has taken serious cognizance of this incident. As the person responsible in this matter, you are required to exercise greater diligence, adherence to established operating procedures, and professional care.

You are hereby instructed to ensure that all relevant protocols are strictly maintained, regular inventory/procedural audits are conducted, and necessary records are up to date at all times.

You are advised to treat this matter seriously and ensure that such incidents do not recur in the future. Any repeated non-compliance may lead to further disciplinary action.`;
    }
  },

  warning_penalty_letter: {
    name: 'Warning and Penalty Letter',
    subject: 'Warning and Penalty Letter',
    generateBody: ({ employee, incident, penaltyAmount, penaltyAmountWords }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const incBrief = incident.description ? incident.description.slice(0, 150) : 'the incident causing disruption or damage';
      const desig = employee.designation || 'Staff Member';
      const amt = Number(penaltyAmount) || 1000;
      const words = penaltyAmountWords || numberToWords(amt) || 'Rupees One Thousand only';

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate}, regarding ${incBrief}.

The Incident Management Committee has taken serious cognizance of this matter. As the ${desig}, you are advised to exercise self-control and maintain a calm, respectful, and professional demeanor at the workplace. You are expected to handle workplace situations appropriately and ensure that your conduct remains in accordance with the organization’s professional standards.

Further, as recommended by the Incident Management Committee and approved by the Management, a penalty of ₹${amt.toLocaleString('en-IN')}/- (${words}) will be deducted from your monthly salary.

You are hereby advised to exercise greater caution and maintain professional conduct at all times to prevent the recurrence of similar incidents in the future.`;
    }
  },

  training_letter: {
    name: 'Training Letter',
    subject: 'Training Letter',
    generateBody: ({ employee, incident }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const incBrief = incident.description ? incident.description.slice(0, 150) : 'the reported procedural issue';
      const desig = employee.designation || 'department leader';

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate} regarding ${incBrief}.

The Incident Management Committee and Hospital Management have reviewed the matter and noted concerns related to professional practice, clinical workflows, and patient safety. You are hereby advised that, as the ${desig}, kindly ensure that all staff members under your supervision are properly trained in standard operating protocols and safety guidelines.

You are instructed to organize a structured training session, including practical demonstrations using available resources, to educate your team on the prevention of similar errors and adherence to established protocols.

Ensuring patient safety and compliance with hospital guidelines must remain a priority. Kindly take necessary action to complete this training and prevent recurrence of such incidents in the future.`;
    }
  },

  custom_letter: {
    name: 'Custom Formal Letter',
    subject: 'Formal Incident Communication',
    generateBody: ({ employee, incident }) => {
      const incDate = formatDate(incident.incident_date);
      const incRef = incident.reference_id || 'Incident';
      const incBrief = incident.description ? incident.description.slice(0, 150) : 'the reported incident';

      return `This is with reference to Incident Report No. ${incRef} dated ${incDate} regarding ${incBrief}.

The Incident Management Committee and Hospital Executive Management have reviewed this matter and recorded formal instructions regarding this case.

Kindly take note of these directives and ensure full compliance with hospital standards.`;
    }
  }
};

/**
 * Pre-populate all fields for a letter given the template type, employee, and incident
 */
function buildInitialLetterData({ templateType, employee, incident, yearSeq = '001', penaltyAmount = null }) {
  const currentYear = new Date().getFullYear();
  const refNum = `JPHRC/IMC/${currentYear}/${yearSeq}`;
  const def = TEMPLATE_DEFINITIONS[templateType] || TEMPLATE_DEFINITIONS.advisory_letter;

  const penaltyWords = penaltyAmount ? numberToWords(penaltyAmount) : '';
  const body = def.generateBody({
    employee,
    incident,
    penaltyAmount,
    penaltyAmountWords: penaltyWords
  });

  const empName = employee.name || employee.full_name || 'Staff Member';
  const salutation = empName.toLowerCase().startsWith('dr.')
    ? 'Dear Doctor,'
    : `Dear ${empName.split(' ')[0] || empName},`;

  const ccList = getDefaultCcList(templateType, employee, incident);

  return {
    templateType,
    referenceNumber: refNum,
    letterDate: new Date().toISOString().split('T')[0],
    subject: def.subject,
    salutation,
    bodyText: body,
    penaltyAmount: penaltyAmount ? Number(penaltyAmount) : null,
    penaltyAmountWords: penaltyWords || null,
    ccRecipients: ccList,
    recipientName: empName,
    recipientEmpNo: employee.employee_id || '',
    recipientDepartment: employee.department || '',
    recipientDesignation: employee.designation || '',
    recipientEmail: employee.email || ''
  };
}

/**
 * Pre-populate all fields for an official Trainer Appointment Letter
 */
function buildTrainerAppointmentLetterData({ trainer, incident, trainingTopic, trainingInstructions, targetDate, trainees = [], yearSeq = '001' }) {
  const currentYear = new Date().getFullYear();
  const refNum = `JPHRC/TRN/${currentYear}/${yearSeq}`;
  const def = TEMPLATE_DEFINITIONS.trainer_appointment_letter;

  const body = def.generateBody({
    trainer,
    incident,
    trainingTopic,
    trainingInstructions,
    targetDate,
    trainees
  });

  const trainerName = trainer.name || trainer.full_name || 'Designated Trainer';
  const salutation = trainerName.toLowerCase().startsWith('dr.')
    ? 'Dear Doctor,'
    : `Dear ${trainerName.split(' ')[0] || trainerName},`;

  const ccList = getDefaultCcList('trainer_appointment_letter', trainer, incident);

  return {
    templateType: 'trainer_appointment_letter',
    referenceNumber: refNum,
    letterDate: new Date().toISOString().split('T')[0],
    subject: `Trainer Appointment Letter - Incident ${incident.reference_id}`,
    salutation,
    bodyText: body,
    penaltyAmount: null,
    penaltyAmountWords: null,
    ccRecipients: ccList,
    recipientName: trainerName,
    recipientEmpNo: trainer.employee_id || '',
    recipientDepartment: trainer.department || '',
    recipientDesignation: trainer.designation || 'Designated Trainer',
    recipientEmail: trainer.email || ''
  };
}

module.exports = {
  TEMPLATE_DEFINITIONS,
  getDefaultCcList,
  buildInitialLetterData,
  buildTrainerAppointmentLetterData,
  formatDate
};
