require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { query, getClient } = require('../config/database');
const { recordEvent, linkAttachmentsToEvent } = require('../utils/incidentEvents');

async function backfill() {
  console.log('--- Starting Incident Events Journal Backfill ---');
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Clear any previous backfill rows to ensure clean idempotency
    await client.query(`DELETE FROM incident_events WHERE source = 'backfill'`);

    const incidentsRes = await client.query(
      `SELECT i.*, u.full_name as reporter_name, u.role as reporter_role, u.department as reporter_dept, u.designation as reporter_desig,
              ml.name as main_location_name, sl.name as sub_location_name
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       LEFT JOIN main_locations ml ON ml.id = i.main_location_id
       LEFT JOIN sub_locations sl ON sl.id = i.sub_location_id
       ORDER BY i.created_at ASC`
    );

    console.log(`Processing ${incidentsRes.rows.length} incidents...`);

    for (const inc of incidentsRes.rows) {
      console.log(`\nReconstructing story for ${inc.reference_id} (${inc.id})...`);

      // 1. Fetch all raw data for this incident sequentially
      const auditsRes = await client.query(
        `SELECT al.*, u.full_name, u.role, u.department, u.designation
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.incident_id = $1
         ORDER BY al.created_at ASC`,
        [inc.id]
      );
      const fbsRes = await client.query(
        `SELECT f.*, u.full_name, u.role as user_role, u.department, u.designation, d.name as dept_name
         FROM feedbacks f
         LEFT JOIN users u ON u.id = f.author_id
         LEFT JOIN departments d ON d.id = f.department_id
         WHERE f.incident_id = $1
         ORDER BY f.created_at ASC`,
        [inc.id]
      );
      const lettersRes = await client.query(
        `SELECT l.*, u_draft.full_name as drafted_by_name, u_app.full_name as approved_by_name
         FROM incident_letters l
         LEFT JOIN users u_draft ON u_draft.id = l.drafted_by
         LEFT JOIN users u_app ON u_app.id = l.approved_by
         WHERE l.incident_id = $1
         ORDER BY l.created_at ASC`,
        [inc.id]
      );
      const trainersRes = await client.query(
        `SELECT t.*, u_tr.full_name as trainer_name, u_as.full_name as assigned_by_name, u_ve.full_name as verified_by_name
         FROM incident_trainers t
         LEFT JOIN users u_tr ON u_tr.id = t.trainer_id
         LEFT JOIN users u_as ON u_as.id = t.assigned_by
         LEFT JOIN users u_ve ON u_ve.id = t.imc_verified_by
         WHERE t.incident_id = $1
         ORDER BY t.created_at ASC`,
        [inc.id]
      );
      const invsRes = await client.query(
        `SELECT inv.*, u.full_name, u.role, u.department, u.designation, u.employee_id
         FROM investigators inv
         JOIN users u ON u.id = inv.investigator_id
         WHERE inv.incident_id = $1
         ORDER BY inv.assigned_at ASC`,
        [inc.id]
      );
      const finalRepRes = await client.query(
        `SELECT * FROM final_reports WHERE incident_id = $1 ORDER BY generated_at DESC LIMIT 1`,
        [inc.id]
      );
      const attsRes = await client.query(
        `SELECT * FROM attachments WHERE incident_id = $1 ORDER BY created_at ASC`,
        [inc.id]
      );
      const deptsRes = await client.query(
        `SELECT d.name FROM incident_departments id2 JOIN departments d ON d.id = id2.department_id WHERE id2.incident_id = $1`,
        [inc.id]
      );

      const audits = auditsRes.rows;
      const fbs = fbsRes.rows;
      const letters = lettersRes.rows;
      const trainers = trainersRes.rows;
      const invs = invsRes.rows;
      const finalReport = finalRepRes.rows[0];
      const attachments = attsRes.rows;
      const departmentNames = deptsRes.rows.map(d => d.name);

      // ── Event 1: INCIDENT_CREATED ───────────────────────────────────
      const createAudit = audits.find(a => a.action === 'INCIDENT_CREATED');
      const createTime = createAudit ? createAudit.created_at : inc.created_at;
      const submissionAtts = attachments.filter(a => a.stage === 'submission');

      const createdEvent = await recordEvent(client, {
        incidentId: inc.id,
        eventType: 'INCIDENT_CREATED',
        actor: {
          id: inc.reporter_id,
          full_name: inc.reporter_name,
          role: inc.reporter_role || 'reporter',
          designation: inc.reporter_desig,
          department: inc.reporter_dept
        },
        roundNo: 1,
        statusBefore: null,
        statusAfter: inc.severity === 'Grave' ? 'with_hod_and_imc' : 'with_hod',
        title: 'Incident Reported',
        summary: `Reported by ${inc.reporter_name || 'Staff'} (${inc.reporter_dept || 'Hospital Staff'})`,
        payload: {
          reference_id: inc.reference_id,
          incident_date: inc.incident_date,
          incident_time: inc.incident_time,
          main_location_name: inc.main_location_name,
          sub_location_name: inc.sub_location_name,
          specific_location: inc.specific_location,
          occurred_to: inc.occurred_to,
          reported_severity: inc.severity,
          incident_category: inc.incident_category,
          incident_type: inc.incident_type,
          departments: departmentNames,
          description: inc.description,
          attachments: submissionAtts.map(a => ({
            id: a.id,
            original_filename: a.original_filename,
            stored_filename: a.stored_filename,
            file_size: a.file_size
          }))
        },
        isSystemEvent: false,
        source: 'backfill',
        occurredAt: createTime
      });

      if (submissionAtts.length > 0) {
        await linkAttachmentsToEvent(client, createdEvent.id, submissionAtts.map(a => a.id));
      }

      // Track consumed items so we don't duplicate
      const consumedFbIds = new Set();
      let imcRoundNo = 0;
      let invRoundNo = 0;

      // Iterate through audits sequentially
      for (const a of audits) {
        if (a.action === 'INCIDENT_CREATED') continue;

        const actor = {
          id: a.user_id,
          full_name: a.full_name,
          role: a.role,
          designation: a.designation,
          department: a.department
        };

        switch (a.action) {
          case 'HOD_REMINDED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'HOD_REMINDER_SENT',
              actor,
              title: 'HOD Feedback Reminder Dispatched',
              summary: `Reminder sent to ${a.details?.hodCount || 1} HOD(s) by ${a.details?.remindedBy || 'IMC'}`,
              payload: a.details || {},
              isSystemEvent: true,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'REDIRECT_REQUESTED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'REDIRECT_REQUESTED',
              actor,
              title: 'Department Redirection Requested',
              summary: `HOD of ${a.details?.fromDept || actor.department || 'Department'} requested routing to another department`,
              payload: {
                from_department: a.details?.fromDept || actor.department,
                reason: a.details?.reason || inc.redirect_reason
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'REDIRECT_APPROVED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'REDIRECT_APPROVED',
              actor,
              title: 'Redirection Approved & Reassigned',
              summary: `IMC Convenor approved redirection to: ${(a.details?.targetDepartments || []).join(', ')}`,
              payload: a.details || {},
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'REDIRECT_REJECTED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'REDIRECT_REJECTED',
              actor,
              title: 'Redirection Request Rejected',
              summary: `IMC Convenor rejected redirection. Reason: "${a.details?.reason || inc.redirect_rejected_reason || 'N/A'}"`,
              payload: {
                reason: a.details?.reason || inc.redirect_rejected_reason,
                requested_by_dept: a.details?.requestedByDept
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'DEPARTMENTS_INVOLVED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'DEPARTMENTS_INVOLVED',
              actor,
              title: 'Additional Department(s) Involment',
              summary: `Added: ${(a.details?.addedDepartments || []).join(', ')}`,
              payload: a.details || {},
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'HOD_FEEDBACK_SUBMITTED': {
            // Find corresponding feedback
            const matchingFb = fbs.find(f => f.role === 'hod' && !consumedFbIds.has(f.id));
            if (matchingFb) consumedFbIds.add(matchingFb.id);
            const hodAtts = attachments.filter(att => att.stage === 'hod_feedback' && Math.abs(new Date(att.created_at) - new Date(a.created_at)) < 300000);

            const hodEvt = await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'HOD_FEEDBACK_SUBMITTED',
              actor: matchingFb ? {
                id: matchingFb.author_id,
                full_name: matchingFb.full_name,
                role: 'hod',
                designation: matchingFb.designation,
                department: matchingFb.dept_name || matchingFb.department
              } : actor,
              title: `Department Feedback: ${matchingFb?.dept_name || actor.department || 'Concerned HOD'}`,
              summary: matchingFb?.feedback_text ? `"${matchingFb.feedback_text.slice(0, 100)}..."` : 'HOD feedback submitted',
              payload: {
                feedback_text: matchingFb?.feedback_text || 'Feedback submitted',
                department_name: matchingFb?.dept_name || actor.department,
                attachments: hodAtts.map(att => ({
                  id: att.id,
                  original_filename: att.original_filename,
                  stored_filename: att.stored_filename,
                  file_size: att.file_size
                }))
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: matchingFb?.created_at || a.created_at
            });

            if (hodAtts.length > 0) {
              await linkAttachmentsToEvent(client, hodEvt.id, hodAtts.map(att => att.id));
            }
            break;
          }

          case 'IMC_FEEDBACK_SUBMITTED': {
            imcRoundNo++;
            const matchingFb = fbs.find(f => f.role === 'imc' && !consumedFbIds.has(f.id));
            if (matchingFb) consumedFbIds.add(matchingFb.id);
            const imcAtts = attachments.filter(att => att.stage === 'imc_feedback' && Math.abs(new Date(att.created_at) - new Date(a.created_at)) < 300000);

            const isRevised = imcRoundNo > 1 || matchingFb?.stage === 'revised_imc';
            const imcEvt = await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'IMC_ASSESSMENT_SUBMITTED',
              actor: matchingFb ? {
                id: matchingFb.author_id,
                full_name: matchingFb.full_name,
                role: 'imc',
                designation: matchingFb.designation,
                department: matchingFb.department
              } : actor,
              roundNo: imcRoundNo,
              statusBefore: 'with_imc',
              statusAfter: a.details?.forwardToMd ? 'with_head_management' : 'with_imc',
              title: isRevised ? `IMC Revised Quality Assessment (Round ${imcRoundNo})` : 'IMC Quality Assessment & Recommendation',
              summary: `Assessed Severity: ${inc.imc_severity || inc.severity || 'Minor'} · Proposed Outcome: ${matchingFb?.proposed_outcome || inc.imc_proposed_outcome || inc.proposed_outcome || 'No Action'}`,
              payload: {
                round_no: imcRoundNo,
                is_revised: isRevised,
                severity: inc.imc_severity || inc.severity || 'Minor',
                proposed_outcome: matchingFb?.proposed_outcome || inc.imc_proposed_outcome || inc.proposed_outcome || 'No Action',
                responsible_employees: inc.imc_responsible_employees || inc.responsible_employees || [],
                feedback_text: matchingFb?.feedback_text || 'Quality assessment submitted',
                forwarded_to_management: Boolean(a.details?.forwardToMd),
                attachments: imcAtts.map(att => ({
                  id: att.id,
                  original_filename: att.original_filename,
                  stored_filename: att.stored_filename,
                  file_size: att.file_size
                }))
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: matchingFb?.created_at || a.created_at
            });

            if (imcAtts.length > 0) {
              await linkAttachmentsToEvent(client, imcEvt.id, imcAtts.map(att => att.id));
            }
            break;
          }

          case 'MANAGEMENT_RETURNED': {
            const decision = a.details?.decision || 'DISAGREE_REINVESTIGATE';
            const isReinvestigate = decision === 'DISAGREE_REINVESTIGATE';
            const matchingFb = fbs.find(f => f.role === 'head_management' && !consumedFbIds.has(f.id));
            if (matchingFb) consumedFbIds.add(matchingFb.id);

            await recordEvent(client, {
              incidentId: inc.id,
              eventType: isReinvestigate ? 'MGMT_RETURNED_FOR_REINVESTIGATION' : 'MGMT_RETURNED_FOR_REVISION',
              actor,
              title: isReinvestigate ? 'Management Ordered Re-investigation' : 'Management Returned for Revised Review',
              summary: isReinvestigate
                ? 'Executive Management deemed findings inconclusive and ordered panel re-investigation'
                : 'Executive Management requested IMC to re-evaluate quality observations and sanctions',
              payload: {
                decision,
                notes: inc.management_notes || matchingFb?.feedback_text,
                next_status: a.details?.nextStatus || 'with_imc'
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'MANAGEMENT_DECISION': {
            const decision = a.details?.decision || inc.management_decision || 'AGREE';
            const isModified = decision === 'DISAGREE_MODIFY';
            const matchingFb = fbs.find(f => f.role === 'head_management' && !consumedFbIds.has(f.id));
            if (matchingFb) consumedFbIds.add(matchingFb.id);

            if (isModified) {
              await recordEvent(client, {
                incidentId: inc.id,
                eventType: 'MGMT_DECISION_MODIFIED',
                actor,
                title: 'Management Directive: Outcome Modified',
                summary: `IMC Proposed: [ ${inc.imc_proposed_outcome || 'No Action'} ] ──► Management Directed: [ ${inc.proposed_outcome} ]`,
                payload: {
                  decision: 'DISAGREE_MODIFY',
                  imc_proposed_outcome: inc.imc_proposed_outcome || 'No Action',
                  final_mandated_outcome: inc.proposed_outcome,
                  penalty_amount: inc.penalty_amount,
                  penalty_amount_words: inc.penalty_amount_words,
                  management_notes: inc.management_notes || matchingFb?.feedback_text,
                  next_status: a.details?.nextStatus
                },
                isSystemEvent: false,
                source: 'backfill',
                occurredAt: a.created_at
              });
            } else {
              await recordEvent(client, {
                incidentId: inc.id,
                eventType: 'MGMT_DECISION_AGREED',
                actor,
                title: 'Executive Management Endorsement',
                summary: `Management concurred with IMC recommendation (${inc.proposed_outcome})`,
                payload: {
                  decision: 'AGREE',
                  endorsed_outcome: inc.proposed_outcome,
                  management_notes: inc.management_notes || matchingFb?.feedback_text,
                  next_status: a.details?.nextStatus
                },
                isSystemEvent: false,
                source: 'backfill',
                occurredAt: a.created_at
              });
            }
            break;
          }

          case 'LETTER_DRAFTED': {
            const letter = letters.find(l => l.id === a.details?.letterId) || letters[0];
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'LETTER_DRAFTED',
              actor,
              title: `Formal Letter Drafted: ${letter?.recipient_name || a.details?.recipientName || 'Staff'}`,
              summary: `Template: ${letter?.template_type || a.details?.templateType} · Ref: ${letter?.reference_number || 'Pending'}`,
              payload: {
                letter_id: letter?.id || a.details?.letterId,
                recipient_name: letter?.recipient_name || a.details?.recipientName,
                recipient_emp_no: letter?.recipient_emp_no,
                template_type: letter?.template_type || a.details?.templateType,
                reference_number: letter?.reference_number,
                subject: letter?.subject,
                body_text: letter?.body_text,
                penalty_amount: letter?.penalty_amount
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'LETTERS_SUBMITTED_TO_MANAGEMENT': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'LETTERS_SUBMITTED_TO_MGMT',
              actor,
              title: 'Formal Letter Drafts Submitted to Management',
              summary: `${a.details?.letterCount || letters.length} letter(s) forwarded for Executive dispatch approval`,
              payload: a.details || {},
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'LETTERS_DISPATCHED_TRAINING_ACTIVE':
          case 'LETTERS_DISPATCHED_AND_CLOSED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'LETTERS_APPROVED_DISPATCHED',
              actor,
              title: 'Formal Letters Approved & Dispatched',
              summary: `${letters.length} letter(s) stamped with official QR codes and dispatched to recipients and HODs`,
              payload: {
                approver: a.details?.approver || actor.full_name,
                letters_count: letters.length,
                letters: letters.map(l => ({
                  recipient_name: l.recipient_name,
                  template_type: l.template_type,
                  ref_number: l.reference_number,
                  qr_code_url: l.qr_code_url
                }))
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'TRAINER_ASSIGNED': {
            const tr = trainers.find(t => t.training_topic === a.details?.trainingTopic) || trainers[0];
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'TRAINER_ASSIGNED',
              actor,
              title: 'Mandatory Trainer Appointed',
              summary: `Assigned Trainer: ${a.details?.trainerName || tr?.trainer_name} · Trainee: ${a.details?.traineeName || tr?.trainee_name}`,
              payload: {
                trainer_name: a.details?.trainerName || tr?.trainer_name,
                trainee_name: a.details?.traineeName || tr?.trainee_name,
                training_topic: a.details?.trainingTopic || tr?.training_topic,
                appointment_letter_ref: a.details?.letterRef,
                target_date: tr?.target_date,
                instructions: tr?.training_instructions
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'TRAINER_REPORT_SUBMITTED': {
            const tr = trainers.find(t => t.id === a.details?.assignmentId) || trainers[0];
            const durationMins = tr?.duration_minutes || (tr?.duration_hours ? Math.round(Number(tr.duration_hours) * 60) : 60);
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'TRAINING_REPORT_SUBMITTED',
              actor,
              title: 'Training Report & Attendance Submitted',
              summary: `Conducted on ${tr?.conducted_at ? new Date(tr.conducted_at).toLocaleDateString('en-GB') : 'Session date'} · Duration: ${durationMins} mins`,
              payload: {
                conducted_at: tr?.conducted_at,
                duration_minutes: durationMins,
                venue: tr?.venue,
                methodology: tr?.methodology,
                pre_assessment: tr?.pre_assessment,
                post_assessment: tr?.post_assessment,
                summary: tr?.trainer_report_text
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'IMC_TRAINING_VERIFIED': {
            const tr = trainers.find(t => t.id === a.details?.assignmentId) || trainers[0];
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'TRAINING_VERIFIED_BY_IMC',
              actor,
              title: 'Training Verified & Endorsed by IMC',
              summary: `IMC Convenor verified attendance sheet and certified trainee competency: ${a.details?.traineeName || tr?.trainee_name}`,
              payload: {
                review_notes: tr?.imc_review_notes,
                verified_at: tr?.imc_verified_at || a.created_at
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'MANAGEMENT_TRAINING_CLOSED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'MGMT_TRAINING_CLOSED',
              actor,
              title: 'Mandatory Training Protocol Concluded',
              summary: 'Executive Management formally closed the training & CAPA requirement for this incident',
              payload: {},
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'IMC_REPORT_GENERATED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'FINAL_REPORT_GENERATED',
              actor,
              title: 'Official Final Report Generated',
              summary: `Assessed Fault Type: ${finalReport?.fault_type || 'Hospital / Process'} · CAPA documented`,
              payload: {
                fault_type: finalReport?.fault_type,
                corrective_actions: finalReport?.corrective_actions,
                generated_at: finalReport?.generated_at || a.created_at
              },
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          case 'INCIDENT_CLOSED': {
            await recordEvent(client, {
              incidentId: inc.id,
              eventType: 'INCIDENT_CLOSED',
              actor,
              title: 'Incident Officially Closed',
              summary: 'All findings, directives, letters, and training verification fulfilled. Case closed.',
              payload: {},
              isSystemEvent: false,
              source: 'backfill',
              occurredAt: a.created_at
            });
            break;
          }

          default:
            // Generic audit event
            break;
        }
      }

      // Check for any investigators assigned not captured in audits
      if (invs.length > 0) {
        const invEventCheck = await client.query(
          `SELECT 1 FROM incident_events WHERE incident_id = $1 AND event_type = 'INVESTIGATION_PANEL_ASSIGNED'`,
          [inc.id]
        );
        if (!invEventCheck.rows.length) {
          const earliestInv = invs[0];
          await recordEvent(client, {
            incidentId: inc.id,
            eventType: 'INVESTIGATION_PANEL_ASSIGNED',
            actor: {
              id: earliestInv.assigned_by,
              full_name: 'IMC Convenor',
              role: 'imc'
            },
            roundNo: 1,
            title: 'Investigation Panel Appointed',
            summary: `${invs.length} investigator(s) assigned as a collective team`,
            payload: {
              panel: invs.map(i => ({
                id: i.investigator_id,
                full_name: i.full_name,
                designation: i.designation,
                department: i.department,
                is_primary: Boolean(i.role === 'imc' || i.is_imc_member || i.is_imc_lead)
              }))
            },
            isSystemEvent: false,
            source: 'backfill',
            occurredAt: earliestInv.assigned_at || inc.created_at
          });
        }
      }

      // Check for any investigator report feedbacks in feedbacks table not captured in events
      const invFeedbacks = fbs.filter(f => f.role === 'investigator' && !consumedFbIds.has(f.id));
      for (const invFb of invFeedbacks) {
        consumedFbIds.add(invFb.id);
        const invAtts = attachments.filter(att => att.stage === 'investigator_report' && Math.abs(new Date(att.created_at) - new Date(invFb.created_at)) < 300000);
        const invEvt = await recordEvent(client, {
          incidentId: inc.id,
          eventType: 'INVESTIGATION_REPORT_SUBMITTED',
          actor: {
            id: invFb.author_id,
            full_name: invFb.full_name,
            role: 'investigator',
            designation: invFb.designation,
            department: invFb.dept_name || invFb.department
          },
          roundNo: 1,
          statusBefore: 'with_investigator',
          statusAfter: 'with_imc_review',
          title: 'Joint Investigation Report Submitted',
          summary: `Submitted by ${invFb.full_name} on behalf of the investigation panel`,
          payload: {
            report_text: invFb.feedback_text,
            submitted_by: invFb.full_name,
            findings: invFb.feedback_text,
            attachments_count: invAtts.length
          },
          isSystemEvent: false,
          source: 'backfill',
          occurredAt: invFb.created_at
        });

        if (invAtts.length > 0) {
          await linkAttachmentsToEvent(client, invEvt.id, invAtts.map(att => att.id));
        }
      }

      const countRes = await client.query('SELECT COUNT(*) FROM incident_events WHERE incident_id = $1', [inc.id]);
      console.log(`-> Reconstructed ${countRes.rows[0].count} events for ${inc.reference_id}.`);
    }

    await client.query('COMMIT');
    console.log('\n--- Backfill completed successfully! ---');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Backfill failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

backfill();
