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
  index,
  totalEvents,
  prevEvent,
  isExpanded = true,
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

  return (
    <div
      id={`event-${event.id}`}
      className={`relative rounded-2xl border transition-all duration-200 ${visuals.cardBg} ${
        event.is_system_event ? 'opacity-90' : 'shadow-xs'
      }`}
    >
      {/* CARD HEADER */}
      <div
        onClick={toggle}
        className="p-4 sm:p-5 flex items-start justify-between gap-3 cursor-pointer select-none"
      >
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Step Icon Badge */}
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ring-4 ${visuals.ringColor} ${visuals.badgeBg}`}
          >
            <Icon size={20} strokeWidth={2.2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-black tracking-wider text-slate-400 font-mono">
                #{index + 1}
              </span>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                {event.title}
              </h3>

              {event.round_no > 1 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                  Round {event.round_no}
                </span>
              )}

              {event.is_system_event && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  System Activity
                </span>
              )}
            </div>

            {/* Actor & Role Details */}
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
              <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border ${roleBadge.bg}`}>
                {roleBadge.label}
              </span>
              <span className="font-bold text-slate-800">{event.actor_name}</span>
              {event.actor_designation && (
                <span className="text-slate-400">· {event.actor_designation}</span>
              )}
              {event.actor_department && (
                <span className="text-slate-400">({event.actor_department})</span>
              )}
            </div>
          </div>
        </div>

        {/* Timestamp & Accordion Toggle */}
        <div className="flex flex-col items-end shrink-0 pl-2">
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 justify-end">
              <Clock size={13} className="text-slate-400" />
              <span>{formatDateTime(event.occurred_at)}</span>
            </div>
            {timeDelta && (
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                {timeDelta}
              </span>
            )}
          </div>

          <button
            type="button"
            className="mt-2 text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100/70 transition-colors"
            aria-label="Toggle details"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* CARD BODY (EXPANDABLE) */}
      {expanded && (
        <div className="px-4 pb-5 sm:px-5 pt-0 space-y-4 border-t border-slate-100/80 mt-1">
          {/* Summary paragraph */}
          {event.summary && (
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pt-3">
              {event.summary}
            </p>
          )}

          {/* STATUS TRANSITION BADGE */}
          {event.status_before && event.status_after && event.status_before !== event.status_after && (
            <div className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80 w-fit flex-wrap">
              <span className="text-slate-500 font-medium">Status transition:</span>
              <span className="font-semibold text-slate-600">{getStatusLabel(event.status_before)}</span>
              <ArrowRight size={13} className="text-slate-400" />
              <span className="font-bold text-slate-900">{getStatusLabel(event.status_after)}</span>
            </div>
          )}

          {/* RICH PAYLOAD RENDERERS */}
          {renderEventPayload(event, payload, onViewAttachment)}

          {/* ATTACHMENTS SECTION */}
          {attachments.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                <Paperclip size={13} className="text-slate-400" />
                <span>Attached Files & Evidence ({attachments.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => {
                  const filename = att.original_filename || att.stored_filename || 'Attachment';
                  const isImage = (att.mime_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(filename);
                  return (
                    <div
                      key={att.id || filename}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs hover:border-indigo-300 hover:shadow-xs transition-all group"
                    >
                      <FileText size={14} className="text-indigo-500 shrink-0" />
                      <span className="font-medium text-slate-700 max-w-[180px] sm:max-w-[240px] truncate" title={filename}>
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
                            className="p-1 hover:text-indigo-600 rounded text-slate-400 hover:bg-slate-100"
                            title="Preview file"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                        <a
                          href={`${UPLOADS_URL}/${att.stored_filename}`}
                          download
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 hover:text-indigo-600 rounded text-slate-400 hover:bg-slate-100"
                          title="Download file"
                        >
                          <Download size={13} />
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
 * Specialized sub-renderers based on event_type
 */
function renderEventPayload(event, payload, onViewAttachment) {
  const type = event.event_type;

  // 1. INCIDENT REPORTED
  if (type === 'INCIDENT_CREATED') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200/90 text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Incident Date</span>
          <span className="font-semibold text-slate-800">{formatDate(payload.incident_date)}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Incident Time</span>
          <span className="font-semibold text-slate-800">{payload.incident_time ? formatTime(`1970-01-01T${payload.incident_time}`) : '—'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Reported Severity</span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold inline-block ${getSeverityClass(payload.reported_severity)}`}>
            {payload.reported_severity || '—'}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Category</span>
          <span className="font-semibold text-slate-800 truncate block" title={payload.incident_category}>
            {payload.incident_category || '—'}
          </span>
        </div>
        {payload.description && (
          <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-100 mt-1">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Reporter Narrative / Description</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
              {payload.description}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 2. REDIRECTION (REQUEST, APPROVED, REJECTED)
  if (type === 'REDIRECT_REQUESTED') {
    return (
      <div className="bg-white p-3.5 rounded-xl border border-orange-200 space-y-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-700">Routing Request:</span>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">{payload.fromDepartment || 'Current Department'}</span>
          <ArrowRight size={13} className="text-orange-500" />
          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded font-bold">
            {Array.isArray(payload.targetDepartments) ? payload.targetDepartments.join(', ') : 'Target Department'}
          </span>
          {payload.retainRequestingDept && (
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded border border-indigo-200">
              Joint Involvement Retained
            </span>
          )}
        </div>
        {payload.reason && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">HOD Justification</span>
            <p className="text-slate-800 italic bg-orange-50/40 p-2 rounded border border-orange-100">
              "{payload.reason}"
            </p>
          </div>
        )}
      </div>
    );
  }

  if (type === 'REDIRECT_APPROVED') {
    return (
      <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 text-xs space-y-1">
        <div className="flex items-center gap-2 font-bold text-emerald-800">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span>Department Reassignment Endorsed</span>
        </div>
        <p className="text-emerald-900">
          Incident successfully routed to: <strong>{Array.isArray(payload.newDepartments) ? payload.newDepartments.join(', ') : 'Reassigned Department'}</strong>.
        </p>
      </div>
    );
  }

  if (type === 'REDIRECT_REJECTED') {
    return (
      <div className="bg-red-50/60 p-3 rounded-xl border border-red-200 text-xs space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-red-800">
          <AlertCircle size={14} className="text-red-600" />
          <span>Redirection Request Rejected by IMC</span>
        </div>
        {payload.reason && (
          <div>
            <span className="text-[10px] font-bold uppercase text-red-500 block mb-0.5">IMC Rejection Directive</span>
            <p className="text-red-950 bg-white/80 p-2 rounded border border-red-200 font-medium">
              "{payload.reason}"
            </p>
          </div>
        )}
      </div>
    );
  }

  // SYSTEM ACTIVITY: HOD FEEDBACK REMINDER
  if (type === 'HOD_REMINDER_SENT') {
    return (
      <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-amber-900">
          <Bell size={14} className="text-amber-600" />
          <span>Department Feedback Reminder Dispatched</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-amber-950 bg-white/80 p-2.5 rounded-lg border border-amber-200">
          <div>
            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">Dispatched By</span>
            <span className="font-semibold text-slate-800">{payload.reminded_by || 'IMC Quality Committee'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">Recipient Scope</span>
            <span className="font-semibold text-slate-800">
              {payload.hod_count || 1} Concerned HOD(s) via In-App Alert & Email
            </span>
          </div>
        </div>
      </div>
    );
  }

  // SYSTEM ACTIVITY: CONCURRENCY CLAIM LOCK
  if (type === 'IMC_CLAIMED') {
    return (
      <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-200 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-indigo-900">
          <Lock size={14} className="text-indigo-600" />
          <span>Active Review Concurrency Lock Acquired</span>
        </div>
        <p className="text-indigo-950 text-[11px] bg-white/80 p-2.5 rounded-lg border border-indigo-200 leading-relaxed">
          Case review exclusive lock granted to <strong>{event.actor_name}</strong> for <strong>{payload.lock_minutes || 30} mins</strong>. This ensures consistent decision-making and prevents overlapping evaluations during active investigation review.
        </p>
      </div>
    );
  }

  // SYSTEM ACTIVITY: AUTOMATED NOTIFICATION & EMAIL DISPATCH
  if (type === 'NOTIFICATION_DISPATCHED' || type === 'EMAIL_DISPATCHED') {
    return (
      <div className="bg-sky-50/60 p-3.5 rounded-xl border border-sky-200 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-sky-900">
          <Mail size={14} className="text-sky-600" />
          <span>Automated Hospital Dispatch</span>
        </div>
        <p className="text-sky-950 text-[11px] bg-white/80 p-2.5 rounded-lg border border-sky-200">
          {event.summary || 'Official notification dispatched to designated stakeholders.'}
        </p>
      </div>
    );
  }

  // 3. DEPARTMENT FEEDBACK
  if (type === 'HOD_FEEDBACK_SUBMITTED') {
    return (
      <div className="bg-white p-3.5 rounded-xl border border-teal-200 space-y-2 text-xs">
        <div className="flex items-center justify-between border-b border-teal-100 pb-2">
          <span className="font-bold text-teal-900">Department: {payload.departmentName || 'Asset / Operations'}</span>
          {payload.submittedAt && (
            <span className="text-[11px] text-slate-400">{formatDateTime(payload.submittedAt)}</span>
          )}
        </div>
        {payload.feedbackText && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Department Observations & Assessment</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-teal-50/30 p-2.5 rounded-lg border border-teal-100">
              {payload.feedbackText}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 4. INVESTIGATION PANEL ASSIGNED
  if (type === 'INVESTIGATION_PANEL_ASSIGNED') {
    const investigators = Array.isArray(payload.investigators) ? payload.investigators : [];
    return (
      <div className="bg-white p-3.5 rounded-xl border border-cyan-200 space-y-2.5 text-xs">
        <div className="flex items-center justify-between border-b border-cyan-100 pb-2">
          <span className="font-bold text-cyan-900">Investigation Panel Composition (Round {event.round_no})</span>
          {payload.deadline && (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Target Deadline: {formatDate(payload.deadline)}
            </span>
          )}
        </div>

        {investigators.length > 0 ? (
          <div className="space-y-1.5">
            {investigators.map((inv, idx) => (
              <div
                key={inv.id || idx}
                className="flex items-center justify-between p-2 rounded-lg bg-cyan-50/50 border border-cyan-100"
              >
                <div className="flex items-center gap-2">
                  <User size={14} className="text-cyan-600" />
                  <span className="font-bold text-slate-800">{inv.name}</span>
                  {inv.department && <span className="text-slate-500">({inv.department})</span>}
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white text-cyan-800 border border-cyan-200">
                  {inv.role || 'Investigator'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-600">Assigned investigation committee to determine root causes and operational liabilities.</p>
        )}
      </div>
    );
  }

  // 5. INVESTIGATION REPORT SUBMITTED
  if (type === 'INVESTIGATION_REPORT_SUBMITTED') {
    return (
      <div className="bg-white p-3.5 rounded-xl border border-blue-200 space-y-2 text-xs">
        <div className="font-bold text-blue-900 border-b border-blue-100 pb-1.5 flex items-center justify-between">
          <span>Joint Investigation Report (Round {event.round_no})</span>
          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold uppercase">
            Submitted for IMC Evaluation
          </span>
        </div>
        {payload.reportText && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Findings & Root Cause Analysis</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-blue-50/30 p-2.5 rounded-lg border border-blue-100">
              {payload.reportText}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 6. INVESTIGATION RETURNED / REWORK
  if (type === 'INVESTIGATION_RETURNED') {
    return (
      <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-300 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-amber-900 border-b border-amber-200 pb-1.5">
          <RotateCcw size={15} className="text-amber-700" />
          <span>Investigation Returned for Re-investigation / Re-assignment</span>
        </div>
        {payload.remarks && (
          <div>
            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">IMC Convenor Remarks & Instructions</span>
            <p className="text-amber-950 bg-white p-2.5 rounded-lg border border-amber-200 font-medium whitespace-pre-wrap">
              "{payload.remarks}"
            </p>
          </div>
        )}
      </div>
    );
  }

  // 7. IMC QUALITY ASSESSMENT SUBMITTED
  if (type === 'IMC_ASSESSMENT_SUBMITTED') {
    const outcomes = parseProposedOutcomes(payload.proposedOutcome);
    const respEmps = Array.isArray(payload.responsibleEmployees) ? payload.responsibleEmployees : [];

    return (
      <div className="bg-white p-3.5 rounded-xl border border-indigo-200 space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-indigo-50/40 p-3 rounded-lg border border-indigo-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-indigo-900 block mb-0.5">IMC Evaluated Severity</span>
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold inline-block ${getSeverityClass(payload.severity)}`}>
              {payload.severity || 'Minor'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-indigo-900 block mb-0.5">IMC Recommended Outcome(s)</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {outcomes.length > 0 ? (
                outcomes.map(o => (
                  <span key={o} className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[11px] border border-indigo-200">
                    {o}
                  </span>
                ))
              ) : (
                <span className="font-semibold text-slate-700">No Action</span>
              )}
            </div>
          </div>
        </div>

        {payload.feedbackText && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">IMC Findings & Recommendations</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              {payload.feedbackText}
            </p>
          </div>
        )}

        {respEmps.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">
              Identified Responsible Staff & Disciplinary Recommendation(s)
            </span>
            <div className="space-y-1">
              {respEmps.map((emp, i) => (
                <div
                  key={emp.id || emp.employee_id || i}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 flex-wrap gap-2"
                >
                  <div className="flex items-center gap-2">
                    <User size={13} className="text-indigo-500" />
                    <span className="font-bold text-slate-800">{emp.name || emp.full_name}</span>
                    {emp.department && <span className="text-slate-500">({emp.department})</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Array.isArray(emp.outcomes) && emp.outcomes.map(o => (
                      <span key={o} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px] border border-indigo-200">
                        {o}
                      </span>
                    ))}
                    {emp.needs_training && (
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-300">
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
    const isModified = type === 'MGMT_DECISION_MODIFIED' || payload.isModified;
    const origOutcomes = parseProposedOutcomes(payload.originalOutcome);
    const modOutcomes = parseProposedOutcomes(payload.modifiedOutcome || payload.finalOutcome);

    return (
      <div className="bg-white p-4 rounded-xl border border-purple-200 space-y-3 text-xs">
        {/* Comparison Callout for Modified Decision (Exactly fixes JPHRC/IMS/2026/0009!) */}
        {isModified ? (
          <div className="p-3 bg-gradient-to-r from-amber-50 via-purple-50 to-indigo-50 rounded-xl border-2 border-purple-300 space-y-2">
            <div className="flex items-center gap-1.5 text-purple-900 font-extrabold text-xs uppercase tracking-wide">
              <Sparkles size={14} className="text-purple-600" />
              <span>Executive Management Modified the Outcome Directive</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Original IMC Proposal
                </span>
                <div className="flex flex-wrap gap-1">
                  {origOutcomes.length > 0 ? (
                    origOutcomes.map(o => (
                      <span key={o} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px] line-through">
                        {o}
                      </span>
                    ))
                  ) : (
                    <span className="font-semibold text-slate-500 line-through">No Action</span>
                  )}
                </div>
              </div>

              <div className="bg-purple-100/70 p-2.5 rounded-lg border border-purple-300">
                <span className="text-[10px] font-black uppercase text-purple-900 block mb-1">
                  Final Management Mandate
                </span>
                <div className="flex flex-wrap gap-1">
                  {modOutcomes.length > 0 ? (
                    modOutcomes.map(o => (
                      <span key={o} className="px-2 py-0.5 rounded bg-purple-600 text-white font-extrabold text-[11px] shadow-xs">
                        {o}
                      </span>
                    ))
                  ) : (
                    <span className="font-extrabold text-purple-900">Executive Discretion</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2.5 bg-purple-50 rounded-lg border border-purple-200 font-semibold text-purple-900">
            <CheckCircle2 size={16} className="text-purple-600" />
            <span>Executive Management Concurred and Approved IMC Recommendations</span>
          </div>
        )}

        {payload.actions && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Management Mandate & Directives</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-medium">
              {payload.actions}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Assessed Liability</span>
            <span className="font-bold text-slate-800">{payload.faultType || 'Hospital Process'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Mandatory Training</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block ${
              payload.requireTraining ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {payload.requireTraining ? 'Mandated' : 'Not Required'}
            </span>
          </div>
          {payload.penaltyAmount && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Assigned Penalty</span>
              <span className="font-bold text-rose-700">₹{Number(payload.penaltyAmount).toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 9. TRAINER APPOINTED
  if (type === 'TRAINER_ASSIGNED') {
    const trainer = payload.trainer || {};
    const trainees = Array.isArray(payload.trainees) ? payload.trainees : [];
    return (
      <div className="bg-white p-3.5 rounded-xl border border-blue-200 space-y-2.5 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-blue-50/40 p-2.5 rounded-lg border border-blue-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">Appointed Trainer</span>
            <span className="font-bold text-slate-900">{trainer.name || 'Designated Trainer'}</span>
            {trainer.department && <span className="text-[11px] text-slate-500 block">{trainer.department}</span>}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">Training Module / Topic</span>
            <span className="font-semibold text-slate-800">{payload.topic || 'Protocol Refresh'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">Target Completion Date</span>
            <span className="font-semibold text-amber-800">{formatDate(payload.targetDate)}</span>
          </div>
        </div>

        {payload.instructions && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">IMC Instructions to Trainer</span>
            <p className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">
              {payload.instructions}
            </p>
          </div>
        )}

        {trainees.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Enrolled Trainee(s)</span>
            <div className="flex flex-wrap gap-1.5">
              {trainees.map((t, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold border border-blue-200 text-[11px]">
                  {t.name} {t.department ? `(${t.department})` : ''}
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
    return (
      <div className="bg-white p-3.5 rounded-xl border border-blue-200 space-y-2.5 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-blue-50/40 p-2.5 rounded-lg border border-blue-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Conducted On</span>
            <span className="font-semibold text-slate-800">{formatDate(payload.conductedAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Duration</span>
            <span className="font-black text-blue-800">
              {payload.durationMinutes ? `${payload.durationMinutes} mins` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Venue</span>
            <span className="font-semibold text-slate-800">{payload.venue || 'On-site'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Evaluation Status</span>
            <span className="font-bold text-emerald-700">{payload.postAssessment || 'Completed'}</span>
          </div>
        </div>

        {payload.reportSummary && (
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Session Summary & Methodology</span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              {payload.reportSummary}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 11. FORMAL DISCIPLINARY LETTERS
  if (type === 'LETTER_DRAFTED' || type === 'LETTER_REVISED') {
    return (
      <div className="bg-white p-3.5 rounded-xl border border-indigo-200 space-y-2 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-indigo-50/30 p-2.5 rounded-lg border border-indigo-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Recipient Staff</span>
            <span className="font-bold text-slate-800">{payload.recipientName}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Notice Type</span>
            <span className="font-semibold text-indigo-700 capitalize">{payload.templateType?.replace(/_/g, ' ')}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Reference No</span>
            <span className="font-mono text-[11px] font-bold text-slate-700">{payload.referenceNumber}</span>
          </div>
          {payload.penaltyAmount && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Penalty Deduction</span>
              <span className="font-bold text-rose-700">₹{Number(payload.penaltyAmount).toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'LETTERS_APPROVED_DISPATCHED') {
    const letters = Array.isArray(payload.letters) ? payload.letters : [];
    return (
      <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-emerald-900 border-b border-emerald-200 pb-1.5">
          <CheckCircle2 size={15} className="text-emerald-600" />
          <span>Dispatched Official Letters with QR Verification ({letters.length})</span>
        </div>
        {letters.length > 0 && (
          <div className="space-y-1">
            {letters.map((l, i) => (
              <div key={l.id || i} className="flex items-center justify-between p-2 rounded bg-white border border-emerald-100">
                <span className="font-bold text-slate-800">{l.recipientName}</span>
                <span className="text-slate-500 font-mono text-[11px]">{l.referenceNumber}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold uppercase">
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
    return (
      <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-300 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-emerald-900">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>Hospital Incident Concluded & Resolution Archived</span>
        </div>
        {payload.closureNotes && (
          <p className="text-emerald-950 bg-white p-2.5 rounded-lg border border-emerald-200 leading-relaxed">
            {payload.closureNotes}
          </p>
        )}
      </div>
    );
  }

  return null;
}
