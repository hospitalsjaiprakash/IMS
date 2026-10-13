import React, { useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  Paperclip,
  AlertTriangle,
  ArrowRightLeft,
  XCircle,
  Search,
  MessageSquare,
  ShieldCheck,
  Award,
  GraduationCap,
  Flame,
  Bell,
  Undo2,
  FileText,
  ChevronDown,
  ChevronUp,
  Building,
  UserCheck,
  Activity,
  Layers,
  Mail
} from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';
import { UPLOADS_URL } from '../../api';

// Format elapsed time between two timestamps
function formatTimeDelta(prevDate, currDate) {
  if (!prevDate || !currDate) return null;
  try {
    const diffMs = new Date(currDate) - new Date(prevDate);
    if (isNaN(diffMs) || diffMs < 0) return null;
    const totalMins = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;
    if (days > 0) return `+${days}d ${hours}h later`;
    if (hours > 0) return `+${hours}h ${mins}m later`;
    if (mins > 0) return `+${mins}m later`;
    return 'just now';
  } catch {
    return null;
  }
}

// Stage Attachments Renderer
function StageAttachments({ attachments, stage, onViewAttachment }) {
  const list = (attachments || []).filter(a => !stage || a.stage === stage);
  if (!list.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {list.map(att => (
        <button
          type="button"
          key={att.id}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onViewAttachment) onViewAttachment(att);
            else window.open(`${UPLOADS_URL}/${att.stored_filename}`, '_blank');
          }}
          title={att.original_filename}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-indigo-700 font-medium hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-2xs truncate max-w-[200px]"
        >
          <Paperclip size={11} className="flex-shrink-0 text-slate-400" />
          <span className="truncate">{att.original_filename}</span>
        </button>
      ))}
    </div>
  );
}

export default function InteractiveTimeline({
  incident,
  feedbacks = [],
  attachments = [],
  finalReport,
  timelineEvents = [],
  letters = [],
  trainers = [],
  onViewAttachment
}) {
  const [expandedKeys, setExpandedKeys] = useState({});

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Build unified, industry-standard dynamic timeline
  const milestones = useMemo(() => {
    if (!incident) return [];

    const events = [];

    // 1. Incident Raised / Created
    if (incident.created_at) {
      events.push({
        id: 'incident-created',
        timestamp: new Date(incident.created_at),
        type: 'raised',
        title: 'Incident Raised & Logged',
        subtitle: `Reported by ${incident.reporter_name || 'Staff Member'}`,
        actor: {
          name: incident.reporter_name || 'Reporter',
          role: incident.reporter_department || 'Staff',
          tag: 'Reported'
        },
        badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: FileText,
        iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
        content: (
          <div className="text-xs space-y-1.5 text-slate-700">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
                Ref: {incident.reference_id}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700">
                {incident.incident_category}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                Occurred: {incident.incident_date} {incident.incident_time || ''}
              </span>
            </div>
            <p className="line-clamp-3 text-slate-600 italic mt-1 bg-white p-2.5 rounded-lg border border-slate-100">
              "{incident.description || 'No description provided.'}"
            </p>
            <div className="text-[11px] text-slate-500 font-medium">
              Targeted Department(s):{' '}
              <strong className="text-slate-700">
                {(incident.departments || []).map(d => typeof d === 'string' ? d : d.name).join(', ') || 'General'}
              </strong>
            </div>
            <StageAttachments attachments={attachments} stage="submission" onViewAttachment={onViewAttachment} />
          </div>
        )
      });
    }

    // 2. Redirection Requested
    const redirectReqLog = timelineEvents.find(e => e.action === 'REDIRECT_REQUESTED');
    if (incident.redirect_reason || redirectReqLog) {
      const ts = redirectReqLog ? new Date(redirectReqLog.created_at) : (incident.redirect_requested_at ? new Date(incident.redirect_requested_at) : new Date(incident.created_at));
      events.push({
        id: 'redirect-requested',
        timestamp: ts,
        type: 'redirection_requested',
        title: 'Department Redirection Requested',
        subtitle: `Requested by ${redirectReqLog?.full_name || incident.redirect_requested_by_dept || 'Concerned HOD'}`,
        actor: {
          name: redirectReqLog?.full_name || 'Concerned HOD',
          role: redirectReqLog?.user_department || incident.redirect_requested_by_dept || 'HOD',
          tag: 'Redirection'
        },
        badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: ArrowRightLeft,
        iconColor: 'text-orange-600 bg-orange-50 border-orange-200',
        content: (
          <div className="text-xs space-y-1.5 text-slate-700">
            <p className="text-slate-600 italic bg-white p-2.5 rounded-lg border border-orange-100">
              "{incident.redirect_reason || redirectReqLog?.details?.reason || 'Redirection requested to another department.'}"
            </p>
          </div>
        )
      });
    }

    // 3. Redirection Rejected
    const redirectRejLog = timelineEvents.find(e => e.action === 'REDIRECT_REJECTED');
    if (incident.redirect_rejected_at || redirectRejLog) {
      const ts = incident.redirect_rejected_at ? new Date(incident.redirect_rejected_at) : (redirectRejLog ? new Date(redirectRejLog.created_at) : new Date());
      events.push({
        id: 'redirect-rejected',
        timestamp: ts,
        type: 'redirection_rejected',
        title: 'Redirection Request Rejected by IMC',
        subtitle: `Reviewed by ${redirectRejLog?.full_name || 'IMC Convenor'}`,
        actor: {
          name: redirectRejLog?.full_name || 'IMC Convenor',
          role: 'Incident Management Committee',
          tag: 'IMC Decision'
        },
        badgeColor: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
        iconColor: 'text-red-600 bg-red-50 border-red-200',
        content: (
          <div className="text-xs space-y-1.5 text-slate-700">
            <div className="bg-red-50/70 p-2.5 rounded-lg border border-red-200 text-red-800">
              <strong className="block text-[11px] font-bold uppercase mb-0.5 text-red-900">Rejection Reason:</strong>
              <p className="italic">
                "{incident.redirect_rejected_reason || redirectRejLog?.details?.reason || 'The redirection was rejected. Original department must provide feedback.'}"
              </p>
            </div>
          </div>
        )
      });
    }

    // 4. Redirection Approved
    const redirectAppLog = timelineEvents.find(e => e.action === 'REDIRECT_APPROVED');
    if (redirectAppLog) {
      events.push({
        id: 'redirect-approved',
        timestamp: new Date(redirectAppLog.created_at),
        type: 'redirection_approved',
        title: 'Redirection Approved & Reassigned',
        subtitle: `Approved by ${redirectAppLog.full_name || 'IMC Lead'}`,
        actor: {
          name: redirectAppLog.full_name || 'IMC Lead',
          role: 'Incident Management Committee',
          tag: 'Routing'
        },
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        content: (
          <div className="text-xs space-y-1 text-slate-700">
            <p className="text-slate-600">Incident successfully routed to updated responsible department(s).</p>
          </div>
        )
      });
    }

    // 5. Additional Departments Involved
    const deptInvolvedLogs = timelineEvents.filter(e => e.action === 'DEPARTMENTS_INVOLVED');
    deptInvolvedLogs.forEach((log, idx) => {
      events.push({
        id: `dept-involved-${idx}`,
        timestamp: new Date(log.created_at),
        type: 'department_involved',
        title: 'Additional Department(s) Involment',
        subtitle: `Added by ${log.full_name || 'IMC Lead'}`,
        actor: {
          name: log.full_name || 'IMC Lead',
          role: 'Incident Management Committee',
          tag: 'Collaboration'
        },
        badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: Building,
        iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
        content: (
          <div className="text-xs text-slate-600">
            Additional cross-functional department(s) brought in for multi-department investigation.
          </div>
        )
      });
    });

    // 6. Investigators Assigned
    if (incident.investigators && incident.investigators.length > 0) {
      const invLog = timelineEvents.find(e => e.action === 'INVESTIGATOR_ASSIGNED');
      const ts = invLog ? new Date(invLog.created_at) : new Date(incident.investigators[0].assigned_at || incident.created_at);
      events.push({
        id: 'investigator-assigned',
        timestamp: ts,
        type: 'investigation_assigned',
        title: 'Investigator(s) Appointed',
        subtitle: `${incident.investigators.length} Investigator(s) assigned for root-cause analysis`,
        actor: {
          name: invLog?.full_name || 'IMC Committee',
          role: 'Incident Management Committee',
          tag: 'Investigation'
        },
        badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        icon: Search,
        iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
        content: (
          <div className="text-xs space-y-1.5 text-slate-700">
            <div className="font-semibold text-slate-800 mb-1">Appointed Investigation Team:</div>
            <div className="space-y-1">
              {incident.investigators.map(inv => (
                <div key={inv.id || inv.investigator_id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200">
                  <span className="font-medium text-slate-800">{inv.full_name || 'Investigator'}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    inv.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {inv.status === 'completed' ? 'Report Submitted' : 'Investigation In Progress'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      });
    }

    // 7. Investigator Report Submitted
    const invFeedbacks = feedbacks.filter(f => f.role === 'investigator');
    const invReportLog = timelineEvents.find(e => e.action === 'INVESTIGATOR_REPORT_SUBMITTED');
    if (invFeedbacks.length > 0) {
      invFeedbacks.forEach((invFb, idx) => {
        events.push({
          id: `investigator-report-${invFb.id || idx}`,
          timestamp: new Date(invFb.created_at),
          type: 'investigation_reported',
          title: invFeedbacks.length > 1 ? `Investigation Findings (${idx + 1}/${invFeedbacks.length})` : 'Investigation Findings Submitted',
          subtitle: `Findings compiled by ${invFb.full_name} (${invFb.designation || 'Investigator'})`,
          actor: {
            name: invFb.full_name,
            role: 'Investigation Team',
            tag: 'Findings'
          },
          badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
          icon: ShieldCheck,
          iconColor: 'text-cyan-600 bg-cyan-50 border-cyan-200',
          content: (
            <div className="text-xs space-y-2 text-slate-700">
              <blockquote className="bg-white p-2.5 rounded-lg border-l-2 border-cyan-400 italic text-slate-700 shadow-2xs whitespace-pre-line">
                "{invFb.feedback_text}"
              </blockquote>
              <StageAttachments attachments={attachments} stage="investigator_report" onViewAttachment={onViewAttachment} />
            </div>
          )
        });
      });
    } else if (invReportLog) {
      events.push({
        id: 'investigator-report-log',
        timestamp: new Date(invReportLog.created_at),
        type: 'investigation_reported',
        title: 'Investigation Findings Submitted',
        subtitle: `Findings compiled by ${invReportLog.full_name || 'Lead Investigator'}`,
        actor: {
          name: invReportLog.full_name || 'Investigator',
          role: 'Investigation Team',
          tag: 'Findings'
        },
        badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        icon: ShieldCheck,
        iconColor: 'text-cyan-600 bg-cyan-50 border-cyan-200',
        content: (
          <div className="text-xs space-y-2 text-slate-700">
            <StageAttachments attachments={attachments} stage="investigator_report" onViewAttachment={onViewAttachment} />
          </div>
        )
      });
    }

    // 8. HOD Feedbacks (All concerned departments)
    const hodFeedbacks = feedbacks.filter(f => f.role === 'hod');
    hodFeedbacks.forEach((fb, idx) => {
      events.push({
        id: `hod-fb-${fb.id || idx}`,
        timestamp: new Date(fb.created_at),
        type: 'hod_feedback',
        title: `HOD Feedback: ${fb.dept_name || 'Concerned Department'}`,
        subtitle: `Submitted by ${fb.full_name} (${fb.designation || 'HOD'})`,
        actor: {
          name: fb.full_name,
          role: `${fb.dept_name ? fb.dept_name + ' · ' : ''}HOD`,
          tag: 'Department Review'
        },
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: MessageSquare,
        iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        content: (
          <div className="text-xs space-y-2 text-slate-700">
            <blockquote className="bg-white p-2.5 rounded-lg border-l-2 border-emerald-400 italic text-slate-700 shadow-2xs whitespace-pre-line">
              "{fb.feedback_text}"
            </blockquote>
            <StageAttachments attachments={attachments} stage="hod_feedback" onViewAttachment={onViewAttachment} />
          </div>
        )
      });
    });

    // 9. IMC Quality Review & Assessment (supports multiple cycles/re-evaluations)
    const imcFeedbacks = feedbacks.filter(f => f.role === 'imc');
    imcFeedbacks.forEach((imcFeedback, idx) => {
      events.push({
        id: `imc-review-${imcFeedback.id || idx}`,
        timestamp: new Date(imcFeedback.created_at),
        type: 'imc_review',
        title: imcFeedbacks.length > 1 ? `IMC Quality Review (${idx + 1}/${imcFeedbacks.length})` : 'IMC Quality Review & Classification',
        subtitle: `Assessment by ${imcFeedback.full_name} (${imcFeedback.designation || 'IMC Convenor'})`,
        actor: {
          name: imcFeedback.full_name,
          role: 'Incident Management Committee',
          tag: 'Quality Audit'
        },
        badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: ShieldCheck,
        iconColor: 'text-purple-600 bg-purple-50 border-purple-200',
        content: (
          <div className="text-xs space-y-2 text-slate-700">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded font-semibold bg-purple-100 text-purple-800">
                Assigned Severity: {incident.severity || 'Major'}
              </span>
              {incident.proposed_outcome && (
                <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-700">
                  Proposed: {incident.proposed_outcome}
                </span>
              )}
            </div>
            <blockquote className="bg-white p-2.5 rounded-lg border-l-2 border-purple-400 italic text-slate-700 shadow-2xs whitespace-pre-line">
              "{imcFeedback.feedback_text}"
            </blockquote>
            <StageAttachments attachments={attachments} stage="imc_feedback" onViewAttachment={onViewAttachment} />
          </div>
        )
      });
    });

    // 10. Management Action / Decision(s) (supports multiple decisions: reverts, re-evaluations, approvals)
    const mgmtLogs = (timelineEvents || []).filter(e => e.action === 'MANAGEMENT_DECISION' || e.action === 'MANAGEMENT_RETURNED');
    const mgmtFeedbacks = (feedbacks || []).filter(f => f.role === 'head_management');

    const formatDecisionLabel = (decision) => {
      if (!decision) return 'Action Approved';
      const map = {
        'AGREE': 'Approved / Agreed with IMC',
        'DISAGREE_MODIFY': 'Outcome Modified by Management',
        'DISAGREE_REINVESTIGATE': 'Rejected & Re-investigation Requested',
        'DISAGREE_REVISE_FEEDBACK': 'Rejected & Revised Feedback Requested'
      };
      return map[decision] || decision.replace(/_/g, ' ');
    };

    if (mgmtLogs.length > 0) {
      const matchedFbIds = new Set();

      mgmtLogs.forEach((log, idx) => {
        const isReturned = log.action === 'MANAGEMENT_RETURNED';
        const decisionCode = log.details?.decision || (isReturned ? 'DISAGREE_REINVESTIGATE' : 'AGREE');
        const decisionLabel = formatDecisionLabel(decisionCode);
        const logTime = new Date(log.created_at).getTime();

        // Match closest feedback in head_management
        let matchedFb = null;
        let minDiff = Infinity;
        for (const fb of mgmtFeedbacks) {
          if (matchedFbIds.has(fb.id)) continue;
          const diff = Math.abs(new Date(fb.created_at).getTime() - logTime);
          if (diff < minDiff && diff < 300000) {
            minDiff = diff;
            matchedFb = fb;
          }
        }
        if (!matchedFb && mgmtFeedbacks[idx] && !matchedFbIds.has(mgmtFeedbacks[idx].id)) {
          matchedFb = mgmtFeedbacks[idx];
        }
        if (matchedFb) {
          matchedFbIds.add(matchedFb.id);
        }

        const actorName = log.full_name || matchedFb?.full_name || 'Hospital Executive Leadership';
        const actorDesignation = log.user_designation || matchedFb?.designation || 'Director / Leadership';

        events.push({
          id: `management-action-${log.id || idx}`,
          timestamp: new Date(log.created_at),
          type: isReturned ? 'management_returned' : 'management_decision',
          title: isReturned ? 'Executive Management Review - Reverted' : 'Executive Management Decision',
          subtitle: `${isReturned ? 'Returned' : 'Approved'} by ${actorName} (${actorDesignation})`,
          actor: {
            name: actorName,
            role: 'Head Management',
            tag: isReturned ? 'Returned to IMC' : 'Governance'
          },
          badgeColor: isReturned ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-violet-100 text-violet-800 border-violet-200',
          icon: isReturned ? Undo2 : Award,
          iconColor: isReturned ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-violet-600 bg-violet-50 border-violet-200',
          content: (
            <div className="text-xs space-y-2 text-slate-700">
              <div className={`font-semibold p-2 rounded-lg border ${
                isReturned ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-violet-50 border-violet-200 text-violet-900'
              }`}>
                Decision: <span className="uppercase font-bold">{decisionLabel}</span>
              </div>
              {matchedFb?.feedback_text ? (
                <blockquote className={`bg-white p-2.5 rounded-lg border-l-2 italic text-slate-700 shadow-2xs whitespace-pre-line ${
                  isReturned ? 'border-amber-400' : 'border-violet-400'
                }`}>
                  "{matchedFb.feedback_text}"
                </blockquote>
              ) : (
                incident.management_notes && (
                  <p className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {incident.management_notes}
                  </p>
                )
              )}
              <StageAttachments attachments={attachments} stage="md_decision" onViewAttachment={onViewAttachment} />
            </div>
          )
        });
      });

      // Include any management feedback not matched to an audit log
      mgmtFeedbacks.forEach((fb, idx) => {
        if (!matchedFbIds.has(fb.id)) {
          const isReturned = (fb.feedback_text || '').toLowerCase().includes('reject') || (fb.feedback_text || '').toLowerCase().includes('re-investigat');
          events.push({
            id: `management-fb-extra-${fb.id || idx}`,
            timestamp: new Date(fb.created_at),
            type: isReturned ? 'management_returned' : 'management_decision',
            title: isReturned ? 'Executive Management Review - Reverted' : 'Executive Management Decision',
            subtitle: `${isReturned ? 'Returned' : 'Approved'} by ${fb.full_name} (${fb.designation || 'Head Management'})`,
            actor: {
              name: fb.full_name,
              role: 'Head Management',
              tag: isReturned ? 'Returned to IMC' : 'Governance'
            },
            badgeColor: isReturned ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-violet-100 text-violet-800 border-violet-200',
            icon: isReturned ? Undo2 : Award,
            iconColor: isReturned ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-violet-600 bg-violet-50 border-violet-200',
            content: (
              <div className="text-xs space-y-2 text-slate-700">
                <blockquote className={`bg-white p-2.5 rounded-lg border-l-2 italic text-slate-700 shadow-2xs whitespace-pre-line ${
                  isReturned ? 'border-amber-400' : 'border-violet-400'
                }`}>
                  "{fb.feedback_text}"
                </blockquote>
                <StageAttachments attachments={attachments} stage="md_decision" onViewAttachment={onViewAttachment} />
              </div>
            )
          });
        }
      });
    } else if (mgmtFeedbacks.length > 0) {
      mgmtFeedbacks.forEach((fb, idx) => {
        const isReturned = (fb.feedback_text || '').toLowerCase().includes('reject') || (fb.feedback_text || '').toLowerCase().includes('re-investigat');
        events.push({
          id: `management-fb-${fb.id || idx}`,
          timestamp: new Date(fb.created_at),
          type: isReturned ? 'management_returned' : 'management_decision',
          title: isReturned ? 'Executive Management Review - Reverted' : 'Executive Management Decision',
          subtitle: `${isReturned ? 'Returned' : 'Approved'} by ${fb.full_name} (${fb.designation || 'Head Management'})`,
          actor: {
            name: fb.full_name,
            role: 'Head Management',
            tag: isReturned ? 'Returned to IMC' : 'Governance'
          },
          badgeColor: isReturned ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-violet-100 text-violet-800 border-violet-200',
          icon: isReturned ? Undo2 : Award,
          iconColor: isReturned ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-violet-600 bg-violet-50 border-violet-200',
          content: (
            <div className="text-xs space-y-2 text-slate-700">
              <blockquote className={`bg-white p-2.5 rounded-lg border-l-2 italic text-slate-700 shadow-2xs whitespace-pre-line ${
                isReturned ? 'border-amber-400' : 'border-violet-400'
              }`}>
                "{fb.feedback_text}"
              </blockquote>
              <StageAttachments attachments={attachments} stage="md_decision" onViewAttachment={onViewAttachment} />
            </div>
          )
        });
      });
    } else if (incident.management_decision) {
      const ts = incident.management_decision_at ? new Date(incident.management_decision_at) : new Date();
      const isReturned = incident.management_decision.startsWith('DISAGREE');
      events.push({
        id: 'management-decision-single',
        timestamp: ts,
        type: isReturned ? 'management_returned' : 'management_decision',
        title: isReturned ? 'Executive Management Review - Reverted' : 'Executive Management Decision',
        subtitle: `Decision recorded by Hospital Leadership`,
        actor: {
          name: 'Hospital Executive Leadership',
          role: 'Head Management',
          tag: isReturned ? 'Returned to IMC' : 'Governance'
        },
        badgeColor: isReturned ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-violet-100 text-violet-800 border-violet-200',
        icon: isReturned ? Undo2 : Award,
        iconColor: isReturned ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-violet-600 bg-violet-50 border-violet-200',
        content: (
          <div className="text-xs space-y-2 text-slate-700">
            <div className="font-semibold text-slate-800 bg-violet-50 p-2 rounded-lg border border-violet-100">
              Decision: <span className="uppercase text-violet-900 font-bold">{formatDecisionLabel(incident.management_decision)}</span>
            </div>
            {incident.management_notes && (
              <p className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-wrap">
                {incident.management_notes}
              </p>
            )}
            <StageAttachments attachments={attachments} stage="md_decision" onViewAttachment={onViewAttachment} />
          </div>
        )
      });
    }

    // 11. Final IMC Report Generated
    if (finalReport) {
      events.push({
        id: 'final-report',
        timestamp: new Date(finalReport.generated_at),
        type: 'final_report',
        title: 'Official Final Incident Report Generated',
        subtitle: `Fault Classification: ${finalReport.fault_type}`,
        actor: {
          name: 'Incident Management Committee',
          role: 'Quality Assurance',
          tag: 'Official Report'
        },
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
        icon: FileText,
        iconColor: 'text-slate-700 bg-slate-100 border-slate-300',
        content: (
          <div className="text-xs space-y-2 text-slate-700">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <strong className="block text-[11px] font-bold text-slate-800 mb-1">Root Cause / Corrective Actions:</strong>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {finalReport.corrective_actions}
              </p>
            </div>
            <StageAttachments attachments={attachments} stage="imc_report" onViewAttachment={onViewAttachment} />
          </div>
        )
      });
    }

    // 12. CAPA / Training Verification
    const trainingVerifiedLog = timelineEvents.find(e => e.action === 'TRAINING_VERIFIED' || e.action === 'EMPLOYEE_TRAINING_VERIFIED');
    if (trainingVerifiedLog || (incident.responsible_employees && incident.responsible_employees.some(e => e.training_completed))) {
      events.push({
        id: 'training-verified',
        timestamp: trainingVerifiedLog ? new Date(trainingVerifiedLog.created_at) : new Date(incident.updated_at || incident.created_at),
        type: 'training_verified',
        title: 'CAPA & Staff Training Completed',
        subtitle: 'Corrective training verified by HOD & Quality Lead',
        actor: {
          name: trainingVerifiedLog?.full_name || 'HOD / Quality Lead',
          role: 'Training & Development',
          tag: 'CAPA'
        },
        badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
        icon: GraduationCap,
        iconColor: 'text-teal-600 bg-teal-50 border-teal-200',
        content: (
          <div className="text-xs space-y-1.5 text-slate-700">
            <ul className="space-y-1">
              {(incident.responsible_employees || []).filter(e => e.needs_training).map(emp => (
                <li key={emp.employee_id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200">
                  <span className="font-medium text-slate-800">{emp.full_name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    emp.training_completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {emp.training_completed ? 'Training Verified' : 'Training Pending'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      });
    }

    // 12b. Formal Letters Generated & Dispatched
    if (letters && letters.length > 0) {
      const approvedLetters = letters.filter(l => l.status === 'approved');
      if (approvedLetters.length > 0) {
        events.push({
          id: 'letters-dispatched',
          timestamp: new Date(approvedLetters[0].approved_at || incident.updated_at),
          type: 'letters_dispatched',
          title: 'Formal Letter(s) Approved & Dispatched',
          subtitle: `${approvedLetters.length} official communication letter(s) dispatched to staff via email with IMS QR code`,
          actor: {
            name: approvedLetters[0].approved_by_name || 'Hospital Executive Management',
            role: 'Executive Management',
            tag: 'Official Letters'
          },
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          icon: Mail,
          iconColor: 'text-emerald-700 bg-emerald-100 border-emerald-300',
          content: (
            <div className="text-xs space-y-1.5 text-slate-700">
              <ul className="space-y-1">
                {approvedLetters.map(l => (
                  <li key={l.id} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">{l.employee_name}</span> ({l.ref_number})
                      <p className="text-[10px] text-slate-500">{l.subject}</p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Dispatched
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        });
      }
    }

    // 12c. Trainer Assignments & Session Verification
    if (trainers && trainers.length > 0) {
      trainers.forEach((t, idx) => {
        if (t.status === 'completed' || t.status === 'verified' || t.status === 'closed') {
          events.push({
            id: `trainer-report-${t.id || idx}`,
            timestamp: new Date(t.completed_at || t.assigned_at),
            type: 'training_completed',
            title: 'Dedicated Training Conducted & Documented',
            subtitle: `Trainer: ${t.trainer_name} (${t.duration_hours || '1.0'} hrs) — ${t.training_topic}`,
            actor: {
              name: t.trainer_name,
              role: 'Assigned Trainer',
              tag: 'Session Complete'
            },
            badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
            icon: GraduationCap,
            iconColor: 'text-teal-700 bg-teal-100 border-teal-300',
            content: (
              <div className="text-xs space-y-1.5 text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                <p><strong>Topic:</strong> {t.training_topic}</p>
                <p><strong>Methodology:</strong> {t.methodology}</p>
                {t.summary && <p className="italic text-slate-600">&quot;{t.summary}&quot;</p>}
                {t.verified_at && (
                  <p className="text-[10px] font-semibold text-emerald-700 mt-1">
                    ✓ Verified by IMC Convenor on {t.verified_at.split('T')[0]}
                  </p>
                )}
              </div>
            )
          });
        }
      });
    }

    // 13. Resolution / Closure
    if (['resolved', 'closed'].includes(incident.status)) {
      events.push({
        id: 'incident-closed',
        timestamp: new Date(incident.resolved_at || incident.updated_at || incident.created_at),
        type: 'closed',
        title: 'Incident Resolved & Closed',
        subtitle: 'All investigative and corrective actions finalized',
        actor: {
          name: 'Incident Management Committee',
          role: 'Quality Assurance',
          tag: 'Closed'
        },
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: CheckCircle2,
        iconColor: 'text-emerald-700 bg-emerald-100 border-emerald-300',
        content: (
          <div className="text-xs bg-emerald-50/80 p-3 rounded-lg border border-emerald-200 text-emerald-900">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-800">Total Resolution Lifecycle:</span>
              <span className="font-extrabold text-sm text-emerald-700">
                {formatTimeDelta(incident.created_at, incident.resolved_at || incident.updated_at) || 'Completed'}
              </span>
            </div>
          </div>
        )
      });
    }

    // 14. Withdrawn
    if (incident.status === 'withdrawn') {
      events.push({
        id: 'incident-withdrawn',
        timestamp: new Date(incident.withdrawn_at || incident.updated_at || incident.created_at),
        type: 'withdrawn',
        title: 'Incident Withdrawn',
        subtitle: `Withdrawn by reporter: ${incident.reporter_name}`,
        actor: {
          name: incident.reporter_name,
          role: 'Reporter',
          tag: 'Withdrawn'
        },
        badgeColor: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
        iconColor: 'text-red-600 bg-red-50 border-red-200',
        content: (
          <div className="text-xs bg-red-50 p-2.5 rounded-lg border border-red-200 text-red-800">
            <p className="italic">"{incident.withdrawn_reason || 'Withdrawn by user prior to review.'}"</p>
          </div>
        )
      });
    }

    // Sort all milestones strictly chronologically
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return events;
  }, [incident, feedbacks, attachments, finalReport, timelineEvents, onViewAttachment]);

  // Current In-Progress Stage descriptor
  const currentPendingStage = useMemo(() => {
    if (!incident || ['resolved', 'closed', 'withdrawn'].includes(incident.status)) {
      return null;
    }

    switch (incident.status) {
      case 'redirect_requested':
        return {
          title: 'Pending Redirection Review',
          description: 'IMC is currently reviewing the HOD’s request to redirect this incident to another department.',
          color: 'border-orange-300 bg-orange-50/50 text-orange-900',
          badge: 'Awaiting IMC Action'
        };
      case 'submitted':
      case 'with_hod':
      case 'with_hod_and_imc':
        return {
          title: 'Awaiting Department Feedback',
          description: incident.pending_hod_departments?.length > 0 
            ? `Pending review from HOD of: ${incident.pending_hod_departments.join(', ')}.`
            : 'Pending feedback from the responsible department HOD.',
          color: 'border-amber-300 bg-amber-50/50 text-amber-900',
          badge: 'HOD Action Required'
        };
      case 'with_investigator':
        return {
          title: 'Investigation In Progress',
          description: 'Appointed investigation team is performing on-ground root cause analysis.',
          color: 'border-indigo-300 bg-indigo-50/50 text-indigo-900',
          badge: 'Under Investigation'
        };
      case 'with_imc_review':
        return {
          title: 'Awaiting IMC Review of Investigator Report',
          description: 'Investigator report submitted. IMC Convenor is reviewing findings before forwarding to Management.',
          color: 'border-purple-300 bg-purple-50/50 text-purple-900',
          badge: 'IMC Review'
        };
      case 'with_imc':
        return {
          title: 'Awaiting IMC Quality Review',
          description: 'All HOD feedbacks received. IMC is assigning severity and proposed outcomes.',
          color: 'border-purple-300 bg-purple-50/50 text-purple-900',
          badge: 'IMC Quality Review'
        };
      case 'with_head_management':
        return {
          title: 'Awaiting Executive Management Decision',
          description: 'Case has been presented to Hospital Management for final governance action.',
          color: 'border-violet-300 bg-violet-50/50 text-violet-900',
          badge: 'Management Review'
        };
      case 'pending_imc_report':
        return {
          title: 'Awaiting Official IMC Report Generation',
          description: 'Management decision recorded. Official IMC summary report is being finalized.',
          color: 'border-slate-300 bg-slate-50/80 text-slate-800',
          badge: 'Report Generation'
        };
      case 'pending_training':
        return {
          title: 'Awaiting CAPA & Staff Training Verification',
          description: 'Corrective staff training has been mandated and awaits formal completion verification.',
          color: 'border-teal-300 bg-teal-50/50 text-teal-900',
          badge: 'CAPA Verification'
        };
      default:
        return {
          title: 'In Progress',
          description: 'Incident workflow is progressing through active review stages.',
          color: 'border-blue-300 bg-blue-50/50 text-blue-900',
          badge: 'Active'
        };
    }
  }, [incident]);

  const hasAnyExpanded = milestones.some(m => Boolean(expandedKeys[m.id]));
  const toggleAll = () => {
    if (hasAnyExpanded) {
      setExpandedKeys({});
    } else {
      const next = {};
      milestones.forEach(m => { next[m.id] = true; });
      setExpandedKeys(next);
    }
  };

  return (
    <div className="card p-5 border border-slate-200 bg-white rounded-xl shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Clock size={17} className="text-indigo-600" />
          Incident Dynamic Lifecycle
        </h2>
        <div className="flex items-center gap-2">
          {milestones.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors"
            >
              {hasAnyExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {milestones.length} Event{milestones.length !== 1 ? 's' : ''} Logged
          </span>
        </div>
      </div>

      {/* Dynamic Milestones Timeline */}
      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {milestones.map((m, idx) => {
          const Icon = m.icon;
          const isExpanded = Boolean(expandedKeys[m.id]); // Default collapsed initially
          const prevMilestone = idx > 0 ? milestones[idx - 1] : null;
          const timeDelta = prevMilestone ? formatTimeDelta(prevMilestone.timestamp, m.timestamp) : null;

          return (
            <div key={m.id} className="relative group">
              {/* Timeline Connector Dot */}
              <div
                className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  m.iconColor || 'bg-white border-slate-400 text-slate-600'
                }`}
              >
                <Icon size={11} className="flex-shrink-0" />
              </div>

              {/* Milestone Box */}
              <div className="bg-slate-50/60 hover:bg-slate-50 rounded-xl p-3.5 border border-slate-200 transition-colors shadow-2xs">
                {/* Header */}
                <div
                  onClick={() => toggleExpand(m.id)}
                  className="flex items-start justify-between gap-2 cursor-pointer select-none"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{m.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.badgeColor}`}>
                        {m.actor?.tag || 'Activity'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {m.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-semibold text-slate-600 block">
                        {formatDateTime(m.timestamp)}
                      </span>
                      {timeDelta && (
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {timeDelta}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Content */}
                {isExpanded && m.content && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/70 animate-fade-in">
                    {m.content}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Current Active Step Indicator (If still in progress) */}
        {currentPendingStage && (
          <div className="relative group">
            <div className="absolute -left-6 top-1 w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-500 text-white flex items-center justify-center animate-pulse">
              <Activity size={12} />
            </div>

            <div className={`rounded-xl p-3.5 border-2 ${currentPendingStage.color} shadow-xs`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold">{currentPendingStage.title}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                    {currentPendingStage.badge}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 animate-pulse">
                  Current Stage
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-1">
                {currentPendingStage.description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
