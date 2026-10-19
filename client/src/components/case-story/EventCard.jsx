import React, { useState } from 'react';
import {
  formatDateTime,
  formatDate,
  formatTime,
  getSeverityClass,
  getStatusLabel,
  parseProposedOutcomes
} from '../../utils/helpers';
import { UPLOADS_URL } from '../../api';
import {
  FileText,
  User,
  Users,
  Building,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowRight,
  ArrowRightLeft,
  Shield,
  ShieldCheck,
  Award,
  GraduationCap,
  Mail,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  CornerDownRight,
  RotateCcw,
  Sparkles,
  Info,
  Lock,
  Bell
} from 'lucide-react';

/**
 * Format elapsed time between two events into compact string e.g. "+15 mins" or "+2 hrs"
 */
function formatTimeDelta(currentDate, prevDate) {
  if (!currentDate || !prevDate) return null;
  const d1 = new Date(currentDate);
  const d2 = new Date(prevDate);
  const diffMs = d1 - d2;
  if (diffMs < 0 || isNaN(diffMs)) return null;

  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return '< 1 min';
  if (diffMins < 60) return `+${diffMins} mins`;
  const diffHrs = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  if (diffHrs < 24) {
    return remMins > 0 ? `+${diffHrs}h ${remMins}m` : `+${diffHrs} hrs`;
  }
  const diffDays = Math.floor(diffHrs / 24);
  return `+${diffDays}d ${diffHrs % 24}h`;
}

/**
 * Role badge styling
 */
function getRoleBadge(role) {
  switch (role) {
    case 'head_management':
    case 'management':
      return { label: 'Executive Management', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
    case 'imc':
      return { label: 'IMC Quality Committee', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    case 'hod':
    case 'asst_coo':
    case 'coo':
      return { label: 'Department Head (HOD)', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'investigator':
      return { label: 'Appointed Investigator', bg: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
    case 'trainer':
      return { label: 'Designated Trainer', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'system':
      return { label: 'System Automated', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    default:
      return { label: 'Staff / Reporter', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
}

/**
 * Event-type visual accents & icons
 */
function getEventVisuals(eventType) {
  switch (eventType) {
    case 'INCIDENT_CREATED':
      return {
        icon: FileText,
        color: 'emerald',
        badgeBg: 'bg-emerald-500 text-white',
        ringColor: 'ring-emerald-200',
        cardBg: 'bg-gradient-to-br from-emerald-50/40 via-white to-slate-50/30 border-emerald-200'
      };
    case 'HOD_REMINDER_SENT':
      return {
        icon: Bell,
        color: 'amber',
        badgeBg: 'bg-amber-500 text-white',
        ringColor: 'ring-amber-200',
        cardBg: 'bg-amber-50/30 border-amber-200'
      };
    case 'IMC_CLAIMED':
      return {
        icon: Lock,
        color: 'indigo',
        badgeBg: 'bg-indigo-600 text-white',
        ringColor: 'ring-indigo-200',
        cardBg: 'bg-indigo-50/30 border-indigo-200'
      };
    case 'NOTIFICATION_DISPATCHED':
    case 'EMAIL_DISPATCHED':
      return {
        icon: Mail,
        color: 'sky',
        badgeBg: 'bg-sky-500 text-white',
        ringColor: 'ring-sky-200',
        cardBg: 'bg-sky-50/30 border-sky-200'
      };
    case 'REDIRECT_REQUESTED':
      return {
        icon: ArrowRightLeft,
        color: 'orange',
        badgeBg: 'bg-orange-500 text-white',
        ringColor: 'ring-orange-200',
        cardBg: 'bg-orange-50/40 border-orange-200'
      };
    case 'REDIRECT_APPROVED':
      return {
        icon: CheckCircle2,
        color: 'emerald',
        badgeBg: 'bg-emerald-600 text-white',
        ringColor: 'ring-emerald-200',
        cardBg: 'bg-emerald-50/30 border-emerald-200'
      };
    case 'REDIRECT_REJECTED':
      return {
        icon: AlertCircle,
        color: 'red',
        badgeBg: 'bg-red-500 text-white',
        ringColor: 'ring-red-200',
        cardBg: 'bg-red-50/40 border-red-200'
      };
    case 'HOD_FEEDBACK_SUBMITTED':
      return {
        icon: Building,
        color: 'teal',
        badgeBg: 'bg-teal-600 text-white',
        ringColor: 'ring-teal-200',
        cardBg: 'bg-gradient-to-br from-teal-50/30 via-white to-slate-50/20 border-teal-200'
      };
    case 'INVESTIGATION_PANEL_ASSIGNED':
      return {
        icon: Users,
        color: 'cyan',
        badgeBg: 'bg-cyan-600 text-white',
        ringColor: 'ring-cyan-200',
        cardBg: 'bg-cyan-50/40 border-cyan-200'
      };
    case 'INVESTIGATION_REPORT_SUBMITTED':
      return {
        icon: ShieldCheck,
        color: 'blue',
        badgeBg: 'bg-blue-600 text-white',
        ringColor: 'ring-blue-200',
        cardBg: 'bg-gradient-to-br from-blue-50/40 via-white to-slate-50/20 border-blue-200'
      };
    case 'INVESTIGATION_RETURNED':
      return {
        icon: RotateCcw,
        color: 'amber',
        badgeBg: 'bg-amber-600 text-white',
        ringColor: 'ring-amber-200',
        cardBg: 'bg-amber-50/50 border-amber-300'
      };
    case 'IMC_ASSESSMENT_SUBMITTED':
      return {
        icon: Award,
        color: 'indigo',
        badgeBg: 'bg-indigo-600 text-white',
        ringColor: 'ring-indigo-200',
        cardBg: 'bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/20 border-indigo-200'
      };
    case 'MGMT_DECISION_MODIFIED':
      return {
        icon: Sparkles,
        color: 'purple',
        badgeBg: 'bg-purple-600 text-white',
        ringColor: 'ring-purple-200',
        cardBg: 'bg-gradient-to-br from-purple-50/60 via-white to-indigo-50/30 border-purple-300 shadow-sm'
      };
    case 'MGMT_DECISION_AGREED':
      return {
        icon: CheckCircle2,
        color: 'purple',
        badgeBg: 'bg-purple-600 text-white',
        ringColor: 'ring-purple-200',
        cardBg: 'bg-purple-50/30 border-purple-200'
      };
    case 'MGMT_RETURNED_FOR_REINVESTIGATION':
    case 'MGMT_RETURNED_FOR_REVISION':
      return {
        icon: RotateCcw,
        color: 'amber',
        badgeBg: 'bg-amber-600 text-white',
        ringColor: 'ring-amber-200',
        cardBg: 'bg-amber-50/50 border-amber-300'
      };
    case 'TRAINER_ASSIGNED':
      return {
        icon: GraduationCap,
        color: 'blue',
        badgeBg: 'bg-blue-600 text-white',
        ringColor: 'ring-blue-200',
        cardBg: 'bg-blue-50/40 border-blue-200'
      };
    case 'TRAINING_REPORT_SUBMITTED':
      return {
        icon: CheckCircle2,
        color: 'blue',
        badgeBg: 'bg-blue-600 text-white',
        ringColor: 'ring-blue-200',
        cardBg: 'bg-gradient-to-br from-blue-50/30 via-white to-slate-50/20 border-blue-200'
      };
    case 'TRAINING_REWORK_REQUESTED':
      return {
        icon: RotateCcw,
        color: 'amber',
        badgeBg: 'bg-amber-600 text-white',
        ringColor: 'ring-amber-200',
        cardBg: 'bg-amber-50/40 border-amber-300'
      };
    case 'TRAINING_VERIFIED_BY_IMC':
    case 'EMPLOYEE_TRAINING_VERIFIED':
      return {
        icon: ShieldCheck,
        color: 'emerald',
        badgeBg: 'bg-emerald-600 text-white',
        ringColor: 'ring-emerald-200',
        cardBg: 'bg-emerald-50/30 border-emerald-200'
      };
    case 'LETTER_DRAFTED':
    case 'LETTER_REVISED':
      return {
        icon: Mail,
        color: 'indigo',
        badgeBg: 'bg-indigo-600 text-white',
        ringColor: 'ring-indigo-200',
        cardBg: 'bg-indigo-50/30 border-indigo-200'
      };
    case 'LETTER_DELETED':
      return {
        icon: AlertTriangle,
        color: 'slate',
        badgeBg: 'bg-slate-500 text-white',
        ringColor: 'ring-slate-200',
        cardBg: 'bg-slate-50/50 border-slate-200'
      };
    case 'LETTERS_SUBMITTED_TO_MGMT':
      return {
        icon: Mail,
        color: 'purple',
        badgeBg: 'bg-purple-600 text-white',
        ringColor: 'ring-purple-200',
        cardBg: 'bg-purple-50/30 border-purple-200'
      };
    case 'LETTERS_RETURNED_FOR_REVISION':
      return {
        icon: RotateCcw,
        color: 'amber',
        badgeBg: 'bg-amber-600 text-white',
        ringColor: 'ring-amber-200',
        cardBg: 'bg-amber-50/50 border-amber-300'
      };
    case 'LETTERS_APPROVED_DISPATCHED':
      return {
        icon: CheckCircle2,
        color: 'emerald',
        badgeBg: 'bg-emerald-600 text-white',
        ringColor: 'ring-emerald-200',
        cardBg: 'bg-emerald-50/40 border-emerald-200'
      };
    case 'FINAL_REPORT_GENERATED':
    case 'INCIDENT_CLOSED':
    case 'MGMT_TRAINING_CLOSED':
      return {
        icon: CheckCircle2,
        color: 'emerald',
        badgeBg: 'bg-emerald-700 text-white',
        ringColor: 'ring-emerald-300',
        cardBg: 'bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/30 border-emerald-300 shadow-sm'
      };
    case 'INCIDENT_REOPENED':
      return {
        icon: RotateCcw,
        color: 'rose',
        badgeBg: 'bg-rose-600 text-white',
        ringColor: 'ring-rose-200',
        cardBg: 'bg-rose-50/40 border-rose-200'
      };
    default:
      return {
        icon: Info,
        color: 'slate',
        badgeBg: 'bg-slate-600 text-white',
        ringColor: 'ring-slate-200',
        cardBg: 'bg-white border-slate-200'
      };
  }
}

export default function EventCard({
  event,
  incident,
  index,
  totalEvents,
  prevEvent,
  isExpanded = false,
  onToggleExpand,
  onViewAttachment
}) {
  const [internalExpanded, setInternalExpanded] = useState(isExpanded);
  const expanded = onToggleExpand ? isExpanded : internalExpanded;
  const toggle = () => {
    if (onToggleExpand) onToggleExpand();
    else setInternalExpanded(v => !v);
  };

  const visuals = getEventVisuals(event.event_type);
  const Icon = visuals.icon;
  const roleBadge = getRoleBadge(event.actor_role);
  const timeDelta = formatTimeDelta(event.occurred_at, prevEvent?.occurred_at);
  const payload = event.payload || {};
  const attachments = Array.isArray(event.attachments) ? event.attachments : [];

  // Concise 1-line preview snippet for collapsed state
  const previewSnippet = event.summary ||
    payload.report_text ||
    payload.reportText ||
    payload.findings ||
    payload.feedback_text ||
    payload.feedbackText ||
    payload.management_notes ||
    payload.actions ||
    payload.notes ||
    '';

  return (
    <div
      id={`event-${event.id}`}
      className={`relative rounded-xl border transition-all duration-150 ${visuals.cardBg} ${
        event.is_system_event ? 'opacity-85' : 'shadow-2xs'
      }`}
    >
      {/* CARD HEADER / ACCORDION TRIGGER */}
      <div
        onClick={toggle}
        className={`px-3 sm:px-3.5 py-2 sm:py-2.5 flex items-center justify-between gap-2.5 cursor-pointer select-none transition-colors hover:bg-black/[0.015] ${
          expanded ? 'border-b border-slate-100/90' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Step Icon Badge */}
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ring-2 ${visuals.ringColor} ${visuals.badgeBg}`}
          >
            <Icon size={14} strokeWidth={2.4} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                #{index + 1}
              </span>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-none truncate max-w-[200px] sm:max-w-md">
                {event.title}
              </h3>

              {event.round_no > 1 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                  R{event.round_no}
                </span>
              )}

              {event.is_system_event && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  System
                </span>
              )}

              <span className={`px-1.5 py-0.2 rounded font-semibold text-[10px] border ${roleBadge.bg}`}>
                {roleBadge.label}
              </span>
              <span className="text-[11px] font-bold text-slate-700 truncate">
                {event.actor_name}
              </span>
              {event.actor_department && (
                <span className="text-[10px] text-slate-400 hidden md:inline">
                  ({event.actor_department})
                </span>
              )}
            </div>

            {/* In collapsed state: 1-line clean preview */}
            {!expanded && previewSnippet && (
              <p className="text-[11px] text-slate-500 truncate mt-0.5 max-w-[280px] sm:max-w-2xl leading-tight">
                {previewSnippet}
              </p>
            )}
          </div>
        </div>

        {/* Timestamp & Accordion Toggle */}
        <div className="flex items-center gap-2 shrink-0 pl-1">
          <div className="text-right flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
              {formatDateTime(event.occurred_at)}
            </span>
            {timeDelta && (
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-100 hidden sm:inline-block">
                {timeDelta}
              </span>
            )}
          </div>

          <div
            className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100/80 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </div>

      {/* CARD BODY (EXPANDABLE) */}
      {expanded && (
        <div className="px-3 sm:px-3.5 pb-3 pt-1 space-y-2 border-t border-slate-100/90 mt-0.5">
          {/* Summary paragraph */}
          {event.summary && (
            <p className="text-xs text-slate-700 leading-relaxed pt-1.5">
              {event.summary}
            </p>
          )}

          {/* STATUS TRANSITION BADGE */}
          {event.status_before && event.status_after && event.status_before !== event.status_after && (
            <div className="flex items-center gap-1.5 text-[11px] py-1 px-2.5 rounded-md bg-slate-50 border border-slate-200/80 w-fit flex-wrap">
              <span className="text-slate-500 font-medium">Status transition:</span>
              <span className="font-semibold text-slate-600">{getStatusLabel(event.status_before)}</span>
              <ArrowRight size={11} className="text-slate-400" />
              <span className="font-bold text-slate-900">{getStatusLabel(event.status_after)}</span>
            </div>
          )}

          {/* RICH PAYLOAD RENDERERS */}
          {renderEventPayload(event, payload, onViewAttachment, incident)}

          {/* ATTACHMENTS SECTION */}
          {attachments.length > 0 && (
            <div className="pt-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Paperclip size={12} className="text-slate-400" />
                <span>Attached Files & Evidence ({attachments.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((att) => {
                  const filename = att.original_filename || att.stored_filename || 'Attachment';
                  return (
                    <div
                      key={att.id || filename}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs hover:border-indigo-300 hover:shadow-2xs transition-all group"
                    >
                      <FileText size={13} className="text-indigo-500 shrink-0" />
                      <span className="font-medium text-slate-700 max-w-[160px] sm:max-w-[220px] truncate text-[11px]" title={filename}>
                        {filename}
                      </span>
                      {att.file_size && (
                        <span className="text-[10px] text-slate-400">
                          ({(att.file_size / 1024).toFixed(0)} KB)
                        </span>
                      )}

                      <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
                        {onViewAttachment && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewAttachment(att);
                            }}
                            className="p-0.5 hover:text-indigo-600 rounded text-slate-400 hover:bg-slate-100"
                            title="Preview file"
                          >
                            <Eye size={12} />
                          </button>
                        )}
                        <a
                          href={`${UPLOADS_URL}/${att.stored_filename}`}
                          download
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 hover:text-indigo-600 rounded text-slate-400 hover:bg-slate-100"
                          title="Download file"
                        >
                          <Download size={12} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Specialized sub-renderers based on event_type with complete data fidelity
 */
function renderEventPayload(event, payload, onViewAttachment, incident) {
  const type = event.event_type;

  // 1. INCIDENT REPORTED
  if (type === 'INCIDENT_CREATED') {
    const incDate = payload.incident_date || payload.incidentDate;
    const incTime = payload.incident_time || payload.incidentTime;
    const severity = payload.reported_severity || payload.reportedSeverity || payload.severity;
    const category = payload.incident_category || payload.incidentCategory || payload.category;
    const description = payload.description || payload.details;
    const respPerson = payload.responsible_person_name || payload.responsiblePersonName || (incident && (incident.responsible_person_name || incident.responsiblePersonName));
    const hasResp = payload.has_responsible_person ?? incident?.has_responsible_person;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Incident Date</span>
          <span className="font-semibold text-slate-800">{formatDate(incDate)}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Incident Time</span>
          <span className="font-semibold text-slate-800">{incTime ? formatTime(`1970-01-01T${incTime}`) : '—'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Reported Severity</span>
          <span className={`px-2 py-0.2 rounded text-[11px] font-bold inline-block ${getSeverityClass(severity)}`}>
            {severity || '—'}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Category</span>
          <span className="font-semibold text-slate-800 truncate block" title={category}>
            {category || '—'}
          </span>
        </div>
        <div className="col-span-2 sm:col-span-4 bg-slate-50/80 p-2 rounded border border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-slate-500">Responsible Employee(s):</span>
            <span className="font-bold text-slate-800 text-xs">
              {respPerson || (hasResp ? 'Identified in report' : 'None identified / Not applicable')}
            </span>
          </div>
          {hasResp && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Staff Accountability Flagged
            </span>
          )}
        </div>
        {description && (
          <div className="col-span-2 sm:col-span-4 pt-1.5 border-t border-slate-100 mt-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Reporter Narrative / Description</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2 rounded border border-slate-100 text-xs">
              {description}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 2. REDIRECTION (REQUEST, APPROVED, REJECTED)
  if (type === 'REDIRECT_REQUESTED') {
    const fromDept = payload.from_department || payload.fromDepartment || 'Current Department';
    const targetDepts = payload.target_departments || payload.targetDepartments || [];
    const retainReq = payload.retain_requesting_dept ?? payload.retainRequestingDept;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-orange-200 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-slate-700">Routing Request:</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded font-semibold text-[11px]">{fromDept}</span>
          <ArrowRight size={12} className="text-orange-500" />
          <span className="px-1.5 py-0.2 bg-orange-100 text-orange-800 rounded font-bold text-[11px]">
            {Array.isArray(targetDepts) ? targetDepts.join(', ') : targetDepts}
          </span>
          {retainReq && (
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-1.5 py-0.2 rounded border border-indigo-200">
              Joint Involvement Retained
            </span>
          )}
        </div>
        {payload.reason && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">HOD Justification</span>
            <p className="text-slate-800 italic bg-orange-50/40 p-2 rounded border border-orange-100 text-xs">
              "{payload.reason}"
            </p>
          </div>
        )}
      </div>
    );
  }

  if (type === 'REDIRECT_APPROVED') {
    const newDepts = payload.new_departments || payload.newDepartments || payload.departments || [];
    return (
      <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-emerald-800">
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span>Department Reassignment Endorsed</span>
        </div>
        <p className="text-emerald-900 text-xs">
          Incident successfully routed to: <strong>{Array.isArray(newDepts) ? newDepts.join(', ') : newDepts}</strong>.
        </p>
      </div>
    );
  }

  if (type === 'REDIRECT_REJECTED') {
    return (
      <div className="bg-red-50/60 p-2.5 rounded-lg border border-red-200 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-red-800">
          <AlertCircle size={13} className="text-red-600" />
          <span>Redirection Request Rejected by IMC</span>
        </div>
        {payload.reason && (
          <p className="text-red-950 bg-white/80 p-2 rounded border border-red-200 font-medium italic text-xs">
            "{payload.reason}"
          </p>
        )}
      </div>
    );
  }

  // SYSTEM ACTIVITY: HOD FEEDBACK REMINDER
  if (type === 'HOD_REMINDER_SENT') {
    const remindedBy = payload.reminded_by || payload.remindedBy || 'IMC Quality Committee';
    const hodCount = payload.hod_count || payload.hodCount || 1;

    return (
      <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-200 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-amber-900">
          <Bell size={13} className="text-amber-600" />
          <span>Department Feedback Reminder Dispatched</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-amber-950 bg-white/80 p-2 rounded border border-amber-200">
          <div>
            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">Dispatched By</span>
            <span className="font-semibold text-slate-800">{remindedBy}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">Recipient Scope</span>
            <span className="font-semibold text-slate-800">
              {hodCount} Concerned HOD(s) via In-App Alert & Email
            </span>
          </div>
        </div>
      </div>
    );
  }

  // SYSTEM ACTIVITY: CONCURRENCY CLAIM LOCK
  if (type === 'IMC_CLAIMED') {
    const lockMins = payload.lock_minutes || payload.lockMinutes || 30;
    return (
      <div className="bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-200 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-indigo-900">
          <Lock size={13} className="text-indigo-600" />
          <span>Active Review Concurrency Lock Acquired</span>
        </div>
        <p className="text-indigo-950 text-[11px] bg-white/80 p-2 rounded border border-indigo-200 leading-relaxed">
          Case review exclusive lock granted to <strong>{event.actor_name}</strong> for <strong>{lockMins} mins</strong>.
        </p>
      </div>
    );
  }

  // SYSTEM ACTIVITY: AUTOMATED NOTIFICATION & EMAIL DISPATCH
  if (type === 'NOTIFICATION_DISPATCHED' || type === 'EMAIL_DISPATCHED') {
    return (
      <div className="bg-sky-50/60 p-2.5 rounded-lg border border-sky-200 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-sky-900">
          <Mail size={13} className="text-sky-600" />
          <span>Automated Hospital Dispatch</span>
        </div>
        <p className="text-sky-950 text-[11px] bg-white/80 p-2 rounded border border-sky-200">
          {event.summary || 'Official notification dispatched to designated stakeholders.'}
        </p>
      </div>
    );
  }

  // 3. DEPARTMENT FEEDBACK
  if (type === 'HOD_FEEDBACK_SUBMITTED') {
    const deptName = payload.department_name || payload.departmentName || payload.dept_name || 'Asset / Operations';
    const feedbackText = payload.feedback_text || payload.feedbackText || payload.feedback;
    const submittedAt = payload.submitted_at || payload.submittedAt || event.occurred_at;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-teal-200 space-y-1.5 text-xs">
        <div className="flex items-center justify-between border-b border-teal-100 pb-1.5">
          <span className="font-bold text-teal-900">Department: {deptName}</span>
          {submittedAt && (
            <span className="text-[10px] text-slate-400">{formatDateTime(submittedAt)}</span>
          )}
        </div>
        {feedbackText && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Department Observations & Assessment</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-teal-50/30 p-2 rounded border border-teal-100 text-xs">
              {feedbackText}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 4. INVESTIGATION PANEL ASSIGNED
  if (type === 'INVESTIGATION_PANEL_ASSIGNED') {
    const investigators = Array.isArray(payload.panel)
      ? payload.panel
      : (Array.isArray(payload.investigators) ? payload.investigators : []);

    return (
      <div className="bg-white p-2.5 rounded-lg border border-cyan-200 space-y-2 text-xs">
        <div className="flex items-center justify-between border-b border-cyan-100 pb-1.5">
          <span className="font-bold text-cyan-900">Investigation Panel Composition (Round {event.round_no || 1})</span>
          {payload.deadline && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
              Deadline: {formatDate(payload.deadline)}
            </span>
          )}
        </div>

        {investigators.length > 0 ? (
          <div className="space-y-1">
            {investigators.map((inv, idx) => {
              const invName = inv.full_name || inv.name || 'Investigator';
              const invCode = inv.employee_id || inv.employeeId || inv.emp_id;
              const invDept = [inv.designation, inv.department].filter(Boolean).join(' • ');
              const invRole = inv.role || (inv.is_primary ? 'Primary Lead' : 'Panel Member');

              return (
                <div
                  key={inv.id || idx}
                  className="flex items-center justify-between p-1.5 rounded-md bg-cyan-50/50 border border-cyan-100 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User size={13} className="text-cyan-600 shrink-0" />
                    <span className="font-bold text-slate-800 truncate">{invName}</span>
                    {invCode && (
                      <span className="text-[10px] font-mono text-cyan-800 bg-cyan-100/60 px-1 rounded">
                        {invCode}
                      </span>
                    )}
                    {invDept && <span className="text-[11px] text-slate-500 truncate hidden sm:inline">({invDept})</span>}
                  </div>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-white text-cyan-800 border border-cyan-200 shrink-0">
                    {invRole}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-600 text-xs">Assigned investigation committee to determine root causes and operational liabilities.</p>
        )}
      </div>
    );
  }

  // 5. INVESTIGATION REPORT SUBMITTED (Fixes missing Joint Investigation Report data!)
  if (type === 'INVESTIGATION_REPORT_SUBMITTED') {
    const reportText = payload.report_text || payload.reportText || payload.findings || payload.feedback_text || payload.feedbackText;
    const submittedBy = payload.submitted_by || payload.submittedBy || event.actor_name;
    const attCount = payload.attachments_count || payload.attachmentsCount || 0;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-blue-200 space-y-2 text-xs">
        <div className="font-bold text-blue-900 border-b border-blue-100 pb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span>Joint Investigation Report (Round {event.round_no || 1})</span>
            {submittedBy && (
              <span className="text-[10px] font-normal text-slate-500">by {submittedBy}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {attCount > 0 && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                {attCount} file{attCount > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold uppercase">
              Submitted for Evaluation
            </span>
          </div>
        </div>

        {reportText ? (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Findings & Root Cause Analysis</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-blue-50/30 p-2 rounded border border-blue-100 text-xs">
              {reportText}
            </p>
          </div>
        ) : (
          <p className="text-slate-500 italic text-xs">Investigation findings submitted to the Incident Management Committee.</p>
        )}

        {payload.recommendations && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Investigator Recommendations</span>
            <p className="text-slate-800 whitespace-pre-wrap bg-slate-50 p-2 rounded border border-slate-100 text-xs">
              {payload.recommendations}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 6. INVESTIGATION RETURNED / REWORK
  if (type === 'INVESTIGATION_RETURNED') {
    const remarks = payload.remarks || payload.feedback_text || payload.notes || payload.instructions;
    return (
      <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-300 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-amber-900 border-b border-amber-200 pb-1">
          <RotateCcw size={13} className="text-amber-700" />
          <span>Investigation Returned for Re-investigation / Re-assignment</span>
        </div>
        {remarks && (
          <div>
            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">IMC Convenor Remarks & Instructions</span>
            <p className="text-amber-950 bg-white p-2 rounded border border-amber-200 font-medium whitespace-pre-wrap text-xs">
              "{remarks}"
            </p>
          </div>
        )}
      </div>
    );
  }

  // 7. IMC QUALITY ASSESSMENT SUBMITTED
  if (type === 'IMC_ASSESSMENT_SUBMITTED') {
    const outcomes = parseProposedOutcomes(payload.proposed_outcome || payload.proposedOutcome);
    const respEmps = Array.isArray(payload.responsible_employees)
      ? payload.responsible_employees
      : (Array.isArray(payload.responsibleEmployees) ? payload.responsibleEmployees : []);
    const feedbackText = payload.feedback_text || payload.feedbackText || payload.notes;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-indigo-200 space-y-2 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-indigo-50/40 p-2 rounded border border-indigo-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-indigo-900 block mb-0.5">IMC Evaluated Severity</span>
            <span className={`px-2 py-0.2 rounded text-[11px] font-bold inline-block ${getSeverityClass(payload.severity)}`}>
              {payload.severity || 'Minor'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-indigo-900 block mb-0.5">IMC Recommended Outcome(s)</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {outcomes.length > 0 ? (
                outcomes.map(o => (
                  <span key={o} className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] border border-indigo-200">
                    {o}
                  </span>
                ))
              ) : (
                <span className="font-semibold text-slate-700 text-xs">No Action</span>
              )}
            </div>
          </div>
        </div>

        {feedbackText && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">IMC Findings & Recommendations</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2 rounded border border-slate-100 text-xs">
              {feedbackText}
            </p>
          </div>
        )}

        {respEmps.length > 0 && (
          <div className="pt-1.5 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              Identified Responsible Staff & Disciplinary Actions ({respEmps.length})
            </span>
            <div className="space-y-1">
              {respEmps.map((emp, i) => (
                <div
                  key={emp.id || emp.employee_id || i}
                  className="flex items-center justify-between p-1.5 rounded-md bg-slate-50 border border-slate-200 flex-wrap gap-1.5 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <User size={12} className="text-indigo-500" />
                    <span className="font-bold text-slate-800">{emp.name || emp.full_name}</span>
                    {(emp.department || emp.department_name) && (
                      <span className="text-[11px] text-slate-500">({emp.department || emp.department_name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {Array.isArray(emp.outcomes) && emp.outcomes.map(o => (
                      <span key={o} className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px] border border-indigo-200">
                        {o}
                      </span>
                    ))}
                    {emp.penalty_amount && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                        ₹{Number(emp.penalty_amount).toLocaleString('en-IN')}
                      </span>
                    )}
                    {emp.needs_training && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-300">
                        Training Required
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 8. MANAGEMENT DIRECTIVE (AGREED OR MODIFIED)
  if (type === 'MGMT_DECISION_MODIFIED' || type === 'MGMT_DECISION_AGREED') {
    const isModified = type === 'MGMT_DECISION_MODIFIED' || payload.isModified || payload.decision === 'DISAGREE_MODIFY';
    const origOutcomes = parseProposedOutcomes(payload.imc_proposed_outcome || payload.originalOutcome || payload.original_outcome);
    const modOutcomes = parseProposedOutcomes(payload.final_mandated_outcome || payload.modifiedOutcome || payload.finalOutcome || payload.endorsed_outcome || payload.proposed_outcome);
    const actions = payload.management_notes || payload.actions || payload.notes;
    const penaltyAmt = payload.penalty_amount || payload.penaltyAmount;
    const penaltyWords = payload.penalty_amount_words || payload.penaltyAmountWords;
    const respEmps = Array.isArray(payload.responsible_employees)
      ? payload.responsible_employees
      : (Array.isArray(payload.responsibleEmployees) ? payload.responsibleEmployees : []);

    return (
      <div className="bg-white p-2.5 rounded-lg border border-purple-200 space-y-2 text-xs">
        {/* Comparison Callout for Modified Decision */}
        {isModified ? (
          <div className="p-2 bg-gradient-to-r from-amber-50 via-purple-50 to-indigo-50 rounded-lg border border-purple-300 space-y-1.5">
            <div className="flex items-center gap-1.5 text-purple-900 font-extrabold text-[11px] uppercase tracking-wide">
              <Sparkles size={13} className="text-purple-600" />
              <span>Executive Management Modified Directive</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
              <div className="bg-white/80 p-2 rounded border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                  Original IMC Proposal
                </span>
                <div className="flex flex-wrap gap-1">
                  {origOutcomes.length > 0 ? (
                    origOutcomes.map(o => (
                      <span key={o} className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold text-[10px] line-through">
                        {o}
                      </span>
                    ))
                  ) : (
                    <span className="font-semibold text-slate-500 line-through text-[11px]">No Action</span>
                  )}
                </div>
              </div>

              <div className="bg-purple-100/70 p-2 rounded border border-purple-300">
                <span className="text-[10px] font-black uppercase text-purple-900 block mb-0.5">
                  Final Management Mandate
                </span>
                <div className="flex flex-wrap gap-1">
                  {modOutcomes.length > 0 ? (
                    modOutcomes.map(o => (
                      <span key={o} className="px-1.5 py-0.2 rounded bg-purple-600 text-white font-extrabold text-[10px] shadow-2xs">
                        {o}
                      </span>
                    ))
                  ) : (
                    <span className="font-extrabold text-purple-900 text-[11px]">Executive Discretion</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 p-2 bg-purple-50 rounded-lg border border-purple-200 font-semibold text-purple-900 text-xs">
            <CheckCircle2 size={14} className="text-purple-600" />
            <span>Executive Management Concurred and Approved IMC Recommendations</span>
          </div>
        )}

        {actions && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Management Mandate & Directives</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2 rounded border border-slate-200 font-medium text-xs">
              {actions}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1.5 border-t border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Assessed Liability</span>
            <span className="font-bold text-slate-800">{payload.fault_type || payload.faultType || 'Hospital Process'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Mandatory Training</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold inline-block ${
              (payload.require_training ?? payload.requireTraining) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {(payload.require_training ?? payload.requireTraining) ? 'Mandated' : 'Not Required'}
            </span>
          </div>
          {penaltyAmt && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Assigned Penalty</span>
              <span className="font-bold text-rose-700">₹{Number(penaltyAmt).toLocaleString('en-IN')}</span>
              {penaltyWords && <span className="text-[9px] text-slate-400 block truncate">({penaltyWords})</span>}
            </div>
          )}
          {respEmps.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Personnel Scope</span>
              <span className="font-bold text-indigo-700">{respEmps.length} staff member{respEmps.length > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 9. TRAINER APPOINTED
  if (type === 'TRAINER_ASSIGNED') {
    const trainer = payload.trainer || {};
    const trainees = Array.isArray(payload.trainees)
      ? payload.trainees
      : (Array.isArray(payload.traineesRoster) ? payload.traineesRoster : []);
    const topic = payload.topic || payload.training_topic || 'Protocol Refresh';
    const targetDate = payload.targetDate || payload.target_date;
    const instructions = payload.instructions || payload.training_instructions;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-blue-200 space-y-2 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-blue-50/40 p-2 rounded border border-blue-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">Appointed Trainer</span>
            <span className="font-bold text-slate-900">{trainer.name || trainer.full_name || 'Designated Trainer'}</span>
            {trainer.department && <span className="text-[11px] text-slate-500 block">{trainer.department}</span>}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">Training Module / Topic</span>
            <span className="font-semibold text-slate-800">{topic}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">Target Completion Date</span>
            <span className="font-semibold text-amber-800">{formatDate(targetDate)}</span>
          </div>
        </div>

        {instructions && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">IMC Instructions to Trainer</span>
            <p className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 text-xs">
              {instructions}
            </p>
          </div>
        )}

        {trainees.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Enrolled Trainee(s)</span>
            <div className="flex flex-wrap gap-1">
              {trainees.map((t, idx) => (
                <span key={idx} className="px-2 py-0.2 rounded bg-blue-50 text-blue-800 font-semibold border border-blue-200 text-[10px]">
                  {t.name || t.full_name} {t.department ? `(${t.department})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 10. TRAINING REPORT SUBMITTED
  if (type === 'TRAINING_REPORT_SUBMITTED') {
    const conductedAt = payload.conductedAt || payload.conducted_at;
    const duration = payload.durationMinutes || payload.duration_minutes;
    const postAssessment = payload.postAssessment || payload.post_assessment;
    const reportSummary = payload.reportSummary || payload.report_summary || payload.methodology || payload.capaRecommendations;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-blue-200 space-y-2 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-blue-50/40 p-2 rounded border border-blue-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Conducted On</span>
            <span className="font-semibold text-slate-800">{formatDate(conductedAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Duration</span>
            <span className="font-black text-blue-800">
              {duration ? `${duration} mins` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Venue</span>
            <span className="font-semibold text-slate-800">{payload.venue || 'On-site'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Evaluation Status</span>
            <span className="font-bold text-emerald-700">{postAssessment || 'Completed'}</span>
          </div>
        </div>

        {reportSummary && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Session Summary & Methodology</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2 rounded border border-slate-100 text-xs">
              {reportSummary}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 11. FORMAL DISCIPLINARY LETTERS
  if (type === 'LETTER_DRAFTED' || type === 'LETTER_REVISED') {
    const recipient = payload.recipientName || payload.recipient_name;
    const template = payload.templateType || payload.template_type;
    const refNo = payload.referenceNumber || payload.reference_number;
    const penaltyAmt = payload.penaltyAmount || payload.penalty_amount;

    return (
      <div className="bg-white p-2.5 rounded-lg border border-indigo-200 space-y-1.5 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-indigo-50/30 p-2 rounded border border-indigo-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Recipient Staff</span>
            <span className="font-bold text-slate-800">{recipient}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Notice Type</span>
            <span className="font-semibold text-indigo-700 capitalize">{template?.replace(/_/g, ' ')}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Reference No</span>
            <span className="font-mono text-[10px] font-bold text-slate-700">{refNo}</span>
          </div>
          {penaltyAmt && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Penalty Deduction</span>
              <span className="font-bold text-rose-700">₹{Number(penaltyAmt).toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'LETTERS_APPROVED_DISPATCHED') {
    const letters = Array.isArray(payload.letters) ? payload.letters : [];
    return (
      <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-200 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-emerald-900 border-b border-emerald-200 pb-1">
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span>Dispatched Official Letters with QR Verification ({letters.length})</span>
        </div>
        {letters.length > 0 && (
          <div className="space-y-1">
            {letters.map((l, i) => (
              <div key={l.id || i} className="flex items-center justify-between p-1.5 rounded bg-white border border-emerald-100 text-xs">
                <span className="font-bold text-slate-800">{l.recipientName || l.recipient_name}</span>
                <span className="text-slate-500 font-mono text-[10px]">{l.referenceNumber || l.reference_number}</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold uppercase">
                  Dispatched via Email
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 12. INCIDENT CLOSED / FINAL RESOLUTION
  if (type === 'INCIDENT_CLOSED' || type === 'MGMT_TRAINING_CLOSED' || type === 'FINAL_REPORT_GENERATED') {
    const notes = payload.closureNotes || payload.closure_notes || payload.notes;
    return (
      <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-300 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-emerald-900">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span>Hospital Incident Concluded & Resolution Archived</span>
        </div>
        {notes && (
          <p className="text-emerald-950 bg-white p-2 rounded border border-emerald-200 leading-relaxed text-xs">
            {notes}
          </p>
        )}
      </div>
    );
  }

  return null;
}
