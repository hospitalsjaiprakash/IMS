/**
 * Centralized Object-Level Authorization (BOLA / IDOR) Helpers
 *
 * Enforces consistent access control across incidents, attachments,
 * formal disciplinary letters, PDFs, training assignments, and employee search.
 */

const { query } = require('../config/database');

/**
 * Returns true if user holds a privileged governance or administration role
 * (System Admin, IMC Member/Lead, or Head Management).
 */
function isPrivilegedRole(user) {
  if (!user) return false;
  return Boolean(
    user.role === 'system_admin' ||
    user.is_system_admin ||
    user.role === 'head_management' ||
    user.is_management_member ||
    user.role === 'imc' ||
    user.is_imc_member ||
    user.is_imc_lead
  );
}

/**
 * Resolve an incident UUID (accepting either UUID or reference_id safely).
 */
async function resolveIncidentRecord(incidentId) {
  if (!incidentId) return null;
  const res = await query(
    `SELECT id, reporter_id, redirect_requested_by_user_id
     FROM incidents
     WHERE id::text = $1 OR reference_id = $1
     LIMIT 1`,
    [String(incidentId)]
  );
  return res.rows[0] || null;
}

/**
 * Returns unified Reviewer eligibility and active assigned Incident Categories
 * strictly from explicit active assignments in category_feedback_assignees.
 * HR designation or legacy department HOD columns NEVER grant Reviewer access.
 */
async function getReviewerScope(userId) {
  if (!userId) return { isReviewer: false, assignedCategories: [] };
  try {
    const res = await query(
      `SELECT ic.id, ic.name
       FROM category_feedback_assignees cfa
       JOIN incident_categories ic ON ic.id = cfa.category_id
       WHERE cfa.user_id = $1 AND cfa.is_active = TRUE AND ic.is_active = TRUE
       ORDER BY ic.name ASC`,
      [userId]
    );
    return { isReviewer: res.rows.length > 0, assignedCategories: res.rows };
  } catch (err) {
    return { isReviewer: false, assignedCategories: [] };
  }
}

/**
 * Verify whether a user is authorized to access an incident and its related artifacts.
 *
 * Authorized participants:
 *  - Privileged roles: system_admin, head_management, imc (including committee flags)
 *  - Incident reporter
 *  - Redirect requester
 *  - Assigned investigators (investigators.investigator_id)
 *  - Assigned trainers (incident_trainers.trainer_id)
 *  - Responsible employees (incident_responsible_employees.employee_id)
 *  - Assigned category reviewers (category_feedback_assignees.user_id)
 *  - Authors who previously submitted feedback on the incident (retained after reassignment)
 *  - Recipients / CCs of approved/dispatched formal letters for the incident
 */
async function canUserAccessIncident(user, incidentId) {
  if (!user || !incidentId) return false;
  if (isPrivilegedRole(user)) return true;

  const incident = await resolveIncidentRecord(incidentId);
  if (!incident) return false;

  const userId = user.id;
  const empCode = String(user.employee_id || '').trim();

  if (incident.reporter_id === userId || incident.redirect_requested_by_user_id === userId) {
    return true;
  }

  const participantRes = await query(
    `SELECT 1 FROM investigators WHERE incident_id = $1 AND investigator_id = $2
     UNION ALL
     SELECT 1 FROM incident_trainers WHERE incident_id = $1 AND trainer_id = $2
     UNION ALL
     SELECT 1 FROM incident_responsible_employees WHERE incident_id = $1 AND employee_id = $2
     UNION ALL
     SELECT 1 FROM feedbacks WHERE incident_id = $1 AND author_id = $2
     UNION ALL
     SELECT 1
     FROM incident_category_links icl
     JOIN incident_categories ic ON ic.id = icl.category_id
     JOIN category_feedback_assignees cfa ON cfa.category_id = icl.category_id
     WHERE icl.incident_id = $1 AND cfa.user_id = $2 AND cfa.is_active = TRUE AND ic.is_active = TRUE
     UNION ALL
     SELECT 1
     FROM incident_letters l
     WHERE l.incident_id = $1
       AND l.status IN ('approved', 'dispatched')
       AND (
         l.employee_id = $2::text
         OR ($3 <> '' AND LOWER(l.employee_id) = LOWER($3))
         OR ($3 <> '' AND LOWER(COALESCE(l.recipient_emp_no, '')) = LOWER($3))
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(COALESCE(l.cc_recipients, '[]'::jsonb)) = 'array'
                  THEN COALESCE(l.cc_recipients, '[]'::jsonb)
                  ELSE '[]'::jsonb END
           ) AS cc
           WHERE jsonb_typeof(cc) = 'object'
             AND (
               cc->>'user_id' = $2::text
               OR cc->>'id' = $2::text
               OR ($3 <> '' AND LOWER(COALESCE(cc->>'employee_id', '')) = LOWER($3))
             )
         )
       )
     LIMIT 1`,
    [incident.id, userId, empCode]
  );

  return participantRes.rows.length > 0;
}

/**
 * Returns the incident categories linked to an incident for which the given user
 * is an active assigned reviewer in category_feedback_assignees.
 */
async function getUserAssignedCategoriesForIncident(user, incidentId) {
  if (!user || !incidentId) return [];

  const res = await query(
    `SELECT DISTINCT ic.id, ic.name
     FROM incident_category_links icl
     JOIN incident_categories ic ON ic.id = icl.category_id
     JOIN category_feedback_assignees cfa ON cfa.category_id = ic.id
     WHERE icl.incident_id::text = $1
       AND cfa.user_id = $2
       AND cfa.is_active = TRUE
       AND ic.is_active = TRUE
     ORDER BY ic.name ASC`,
    [String(incidentId), user.id]
  );

  return res.rows;
}

/**
 * Legacy department-based letter visibility has been retired; preserved as no-op signature
 * for any caller expecting a Set.
 */
async function getUserManagedDepartmentsForIncident() {
  return new Set();
}

/**
 * Determine whether a non-privileged user may view a specific formal letter record.
 * - Draft/unapproved letters are strictly hidden from non-privileged users.
 * - Approved/dispatched letters are visible to:
 *   1. The letter's recipient (matched by user.id or user.employee_id)
 *   2. The HOD / active reviewer of the letter's recipient department (if assigned on this incident)
 */
function canNonPrivilegedUserViewLetter(user, letter, managedDeptsSet = new Set()) {
  if (!user || !letter) return false;
  if (!['approved', 'dispatched'].includes(letter.status)) {
    return false;
  }

  const userIdStr = String(user.id || '');
  const empCodeLower = String(user.employee_id || '').trim().toLowerCase();

  if (letter.employee_id && String(letter.employee_id) === userIdStr) {
    return true;
  }
  if (empCodeLower) {
    if (String(letter.employee_id || '').trim().toLowerCase() === empCodeLower) return true;
    if (String(letter.recipient_emp_no || '').trim().toLowerCase() === empCodeLower) return true;
    if (String(letter.employee_code || '').trim().toLowerCase() === empCodeLower) return true;
    if (String(letter.user_employee_id || '').trim().toLowerCase() === empCodeLower) return true;
  }

  // CC recipients on approved/dispatched letters are authorized to view that letter
  let ccEntries = letter.cc_recipients ?? letter.cc_list ?? [];
  if (typeof ccEntries === 'string') {
    try { ccEntries = JSON.parse(ccEntries); } catch (_) { ccEntries = []; }
  }
  if (Array.isArray(ccEntries)) {
    const isCcRecipient = ccEntries.some((cc) => {
      if (!cc || typeof cc !== 'object') return false;
      if (cc.user_id && String(cc.user_id) === userIdStr) return true;
      if (cc.id && String(cc.id) === userIdStr) return true;
      if (empCodeLower && cc.employee_id && String(cc.employee_id).trim().toLowerCase() === empCodeLower) return true;
      return false;
    });
    if (isCcRecipient) return true;
  }

  if (managedDeptsSet && managedDeptsSet.size > 0) {
    const letterDept = String(
      letter.recipient_department || letter.employee_department || letter.user_department || ''
    ).trim().toLowerCase();
    // Fail closed: require a non-empty department match so blank-department letters
    // are never exposed to unrelated department HODs.
    if (letterDept && managedDeptsSet.has(letterDept)) {
      return true;
    }
  }

  return false;
}

const INTERNAL_LETTER_EVENT_TYPES = new Set([
  'LETTER_DRAFTED',
  'LETTER_REVISED',
  'LETTER_DELETED',
  'LETTERS_SUBMITTED_TO_MGMT',
  'LETTERS_RETURNED_FOR_REVISION'
]);

/**
 * Filter incident timeline events for non-privileged users so internal draft/revision
 * disciplinary letter metadata is never leaked via GET /api/incidents/:id.
 */
function filterIncidentEventsForUser(user, events = []) {
  if (isPrivilegedRole(user) || !Array.isArray(events)) {
    return events;
  }
  return events.filter((ev) => !INTERNAL_LETTER_EVENT_TYPES.has(ev.event_type));
}

module.exports = {
  isPrivilegedRole,
  getReviewerScope,
  canUserAccessIncident,
  getUserAssignedCategoriesForIncident,
  getUserManagedDepartmentsForIncident,
  canNonPrivilegedUserViewLetter,
  filterIncidentEventsForUser
};
