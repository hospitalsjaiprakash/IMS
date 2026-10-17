const { query: defaultQuery } = require('../config/database');

/**
 * Record an immutable event in the incident_events journal.
 *
 * @param {object} clientOrPool - pg transaction client or pool/query runner
 * @param {object} eventData
 *   - incidentId (UUID, required)
 *   - eventType (string, required)
 *   - actor (object: { id, full_name, name, role, designation, department })
 *   - roundNo (number, default 1)
 *   - relatedEventId (UUID, optional)
 *   - statusBefore (string, optional)
 *   - statusAfter (string, optional)
 *   - title (string, required)
 *   - summary (string, optional)
 *   - payload (object, default {})
 *   - isSystemEvent (boolean, default false)
 *   - source (string, default 'live')
 *   - occurredAt (Date|string, optional)
 * @returns {Promise<object>} The newly inserted event
 */
async function recordEvent(clientOrPool, eventData) {
  const runner = clientOrPool && clientOrPool.query ? clientOrPool : { query: defaultQuery };
  const {
    incidentId,
    eventType,
    actor = {},
    roundNo = 1,
    relatedEventId = null,
    statusBefore = null,
    statusAfter = null,
    title,
    summary = null,
    payload = {},
    isSystemEvent = false,
    source = 'live',
    occurredAt = null
  } = eventData;

  if (!incidentId || !eventType || !title) {
    throw new Error('recordEvent requires incidentId, eventType, and title.');
  }

  const actorId = actor.id || actor.user_id || null;
  const actorName = actor.full_name || actor.name || actor.username || 'System';
  const actorRole = actor.role || (actorId ? 'staff' : 'system');
  const actorDesignation = actor.designation || null;
  const actorDepartment = actor.department || actor.department_name || null;

  const insertSql = `
    INSERT INTO incident_events (
      incident_id, event_type, round_no, related_event_id,
      actor_id, actor_name, actor_role, actor_designation, actor_department,
      status_before, status_after, title, summary, payload,
      is_system_event, source, occurred_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17, NOW()))
    RETURNING *
  `;

  const values = [
    incidentId,
    eventType,
    roundNo,
    relatedEventId,
    actorId,
    actorName,
    actorRole,
    actorDesignation,
    actorDepartment,
    statusBefore,
    statusAfter,
    title,
    summary,
    JSON.stringify(payload || {}),
    Boolean(isSystemEvent),
    source,
    occurredAt || null
  ];

  const result = await runner.query(insertSql, values);
  return result.rows[0];
}

/**
 * Link an array of attachment IDs or stored filenames to a newly created event.
 */
async function linkAttachmentsToEvent(clientOrPool, eventId, attachmentIdsOrFilenames = []) {
  if (!eventId || !attachmentIdsOrFilenames || !attachmentIdsOrFilenames.length) return;
  const runner = clientOrPool && clientOrPool.query ? clientOrPool : { query: defaultQuery };
  
  // Try matching by UUID id or by stored_filename
  await runner.query(
    `UPDATE attachments
     SET event_id = $1
     WHERE id::text = ANY($2::text[]) OR stored_filename = ANY($2::text[])`,
    [eventId, attachmentIdsOrFilenames.map(String)]
  );
}

/**
 * Get the next round number for a repeating event type on an incident.
 */
async function getNextRoundNo(clientOrPool, incidentId, eventType) {
  const runner = clientOrPool && clientOrPool.query ? clientOrPool : { query: defaultQuery };
  const res = await runner.query(
    `SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round
     FROM incident_events
     WHERE incident_id = $1 AND event_type = $2`,
    [incidentId, eventType]
  );
  return parseInt(res.rows[0].next_round, 10) || 1;
}

/**
 * Save an immutable letter version snapshot when drafted or revised.
 */
async function recordLetterVersion(clientOrPool, {
  letterId,
  incidentId,
  eventId = null,
  versionNo = null,
  templateType,
  referenceNumber,
  subject,
  salutation,
  bodyText,
  penaltyAmount,
  penaltyAmountWords,
  ccRecipients,
  changeSummary = null,
  createdBy = null
}) {
  const runner = clientOrPool && clientOrPool.query ? clientOrPool : { query: defaultQuery };

  let finalVersionNo = versionNo;
  if (!finalVersionNo) {
    const vRes = await runner.query(
      `SELECT COALESCE(MAX(version_no), 0) + 1 as next_v
       FROM incident_letter_versions
       WHERE letter_id = $1`,
      [letterId]
    );
    finalVersionNo = parseInt(vRes.rows[0].next_v, 10) || 1;
  }

  const insertSql = `
    INSERT INTO incident_letter_versions (
      letter_id, incident_id, version_no, event_id,
      template_type, reference_number, subject, salutation,
      body_text, penalty_amount, penalty_amount_words, cc_recipients,
      change_summary, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `;

  const values = [
    letterId,
    incidentId,
    finalVersionNo,
    eventId,
    templateType,
    referenceNumber,
    subject,
    salutation,
    bodyText,
    penaltyAmount !== undefined && penaltyAmount !== '' ? Number(penaltyAmount) : null,
    penaltyAmountWords || null,
    JSON.stringify(ccRecipients || []),
    changeSummary,
    createdBy
  ];

  const res = await runner.query(insertSql, values);
  return res.rows[0];
}

module.exports = {
  recordEvent,
  linkAttachmentsToEvent,
  getNextRoundNo,
  recordLetterVersion
};
