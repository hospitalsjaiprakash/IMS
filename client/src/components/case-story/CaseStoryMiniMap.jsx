import React, { useMemo } from 'react';
import {
  formatDate,
  formatTime,
  getSeverityClass,
  getStatusLabel,
  getStatusClass
} from '../../utils/helpers';
import {
  CheckCircle2,
  Clock,
  ArrowDown,
  Building,
  User,
  Shield,
  Award,
  Sparkles,
  Mail,
  GraduationCap,
  CheckCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CaseStoryMiniMap({
  incident,
  events = [],
  onScrollToNextAction
}) {
  const status = incident?.status || 'submitted';

  // Compute milestones from incident status & events
  const milestones = useMemo(() => {
    const hasEvent = (type) => events.some(e => e.event_type === type);
    const hasAnyEvent = (types) => events.some(e => types.includes(e.event_type));

    const isReported = true; // Always true
    const isHodDone = hasEvent('HOD_FEEDBACK_SUBMITTED') || incident?.all_hod_feedback_submitted || ![
      'submitted', 'with_hod', 'with_hod_and_imc', 'redirect_requested'
    ].includes(status);

    const hasInvestigator = hasAnyEvent(['INVESTIGATION_PANEL_ASSIGNED', 'INVESTIGATION_REPORT_SUBMITTED', 'INVESTIGATION_RETURNED']) || status === 'with_investigator' || status === 'with_imc_review';
    const isInvestigationDone = hasEvent('INVESTIGATION_REPORT_SUBMITTED') || (
      hasInvestigator && ![
        'submitted', 'with_hod', 'with_investigator', 'with_imc_review'
      ].includes(status)
    );

    const isImcDone = hasEvent('IMC_ASSESSMENT_SUBMITTED') || ![
      'submitted', 'with_hod', 'with_hod_and_imc', 'redirect_requested', 'with_investigator', 'with_imc_review', 'with_imc'
    ].includes(status);

    const isMgmtDone = hasAnyEvent(['MGMT_DECISION_MODIFIED', 'MGMT_DECISION_AGREED']) || ![
      'submitted', 'with_hod', 'with_hod_and_imc', 'redirect_requested', 'with_investigator', 'with_imc_review', 'with_imc', 'with_head_management'
    ].includes(status);

    const isActionsDone = hasAnyEvent(['LETTERS_APPROVED_DISPATCHED', 'TRAINING_VERIFIED_BY_IMC', 'MGMT_TRAINING_CLOSED']) || ['resolved', 'closed'].includes(status);
    const isClosed = ['resolved', 'closed'].includes(status) || hasAnyEvent(['INCIDENT_CLOSED', 'MGMT_TRAINING_CLOSED', 'FINAL_REPORT_GENERATED']);

    return [
      {
        id: 'reported',
        label: 'Incident Reported',
        completed: isReported,
        active: status === 'submitted',
        eventMatcher: e => e.event_type === 'INCIDENT_CREATED',
        icon: User
      },
      {
        id: 'hod_review',
        label: 'Department Feedback',
        completed: isHodDone,
        active: ['with_hod', 'with_hod_and_imc', 'redirect_requested'].includes(status),
        eventMatcher: e => e.event_type === 'HOD_FEEDBACK_SUBMITTED' || e.event_type === 'REDIRECT_REQUESTED',
        icon: Building
      },
      ...(hasInvestigator ? [{
        id: 'investigation',
        label: 'Formal Investigation',
        completed: isInvestigationDone,
        active: ['with_investigator', 'with_imc_review'].includes(status),
        eventMatcher: e => e.event_type.startsWith('INVESTIGATION_'),
        icon: Shield
      }] : []),
      {
        id: 'imc_assessment',
        label: 'IMC Quality Review',
        completed: isImcDone,
        active: status === 'with_imc',
        eventMatcher: e => e.event_type === 'IMC_ASSESSMENT_SUBMITTED',
        icon: Award
      },
      {
        id: 'mgmt_directive',
        label: 'Management Mandate',
        completed: isMgmtDone,
        active: status === 'with_head_management',
        eventMatcher: e => e.event_type.startsWith('MGMT_DECISION_'),
        icon: Sparkles
      },
      {
        id: 'corrective_actions',
        label: 'CAPA, Letters & Training',
        completed: isActionsDone,
        active: [
          'pending_letter_generation',
          'pending_management_letter_approval',
          'pending_trainer_assignment',
          'training_in_progress',
          'pending_imc_training_review',
          'pending_training'
        ].includes(status),
        eventMatcher: e => e.event_type.startsWith('LETTER_') || e.event_type.startsWith('LETTERS_') || e.event_type.startsWith('TRAIN'),
        icon: GraduationCap
      },
      {
        id: 'case_closed',
        label: 'Hospital Resolution',
        completed: isClosed,
        active: isClosed,
        eventMatcher: e => e.event_type === 'INCIDENT_CLOSED' || e.event_type === 'MGMT_TRAINING_CLOSED' || e.event_type === 'FINAL_REPORT_GENERATED',
        icon: CheckCircle
      }
    ];
  }, [status, events, incident]);

  const scrollToEventForMilestone = (milestone) => {
    const target = events.find(milestone.eventMatcher);
    if (target) {
      const el = document.getElementById(`event-${target.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-indigo-300');
        setTimeout(() => el.classList.remove('ring-4', 'ring-indigo-300'), 1500);
        return;
      }
    }

    // Fallback: if not found, jump to next action area
    if (onScrollToNextAction) {
      onScrollToNextAction();
    }
  };

  const copyRefId = () => {
    if (incident?.reference_id) {
      navigator.clipboard.writeText(incident.reference_id);
      toast.success('Incident Reference ID copied.');
    }
  };

  // Turnaround time calculation
  const turnaroundText = useMemo(() => {
    if (!incident?.created_at) return null;
    const start = new Date(incident.created_at);
    const end = incident.resolved_at ? new Date(incident.resolved_at) : new Date();
    const diffMs = end - start;
    if (diffMs < 0 || isNaN(diffMs)) return null;

    const totalMins = Math.round(diffMs / 60000);
    if (totalMins < 60) return `${totalMins} mins`;
    const hrs = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    if (hrs < 24) return `${hrs}h ${remMins}m`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h`;
  }, [incident]);

  return (
    <div className="space-y-4 sticky top-6">
      {/* QUICK STATUS HUD */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Incident Case File
            </span>
            <div className="flex items-center gap-1.5 font-mono text-sm font-black text-slate-900">
              <span>{incident?.reference_id || '—'}</span>
              <button
                type="button"
                onClick={copyRefId}
                className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 rounded"
                title="Copy reference number"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>

          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getStatusClass(status)}`}>
            {getStatusLabel(status)}
          </span>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Assigned Severity</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold inline-block ${getSeverityClass(incident?.severity)}`}>
              {incident?.severity || 'Minor'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Turnaround Time</span>
            <span className="font-extrabold text-slate-800 flex items-center gap-1">
              <Clock size={12} className="text-slate-400" />
              <span>{turnaroundText || 'In Progress'}</span>
            </span>
          </div>
        </div>

        {/* MILESTONE MINI-MAP PROGRESS */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Workflow Mini-Map
            </h4>
            <span className="text-[10px] font-bold text-slate-400">
              {milestones.filter(m => m.completed).length}/{milestones.length} Phases
            </span>
          </div>

          <div className="space-y-1.5 relative before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
            {milestones.map((m, idx) => {
              const MIcon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => scrollToEventForMilestone(m)}
                  className={`relative w-full flex items-center justify-between p-2 rounded-xl text-left transition-all group ${
                    m.active
                      ? 'bg-indigo-50/80 border border-indigo-200 shadow-xs'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 z-10 min-w-0">
                    {/* Milestone indicator bead */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                        m.completed
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : m.active
                          ? 'bg-indigo-600 text-white shadow-xs ring-4 ring-indigo-100 animate-pulse'
                          : 'bg-white border border-slate-300 text-slate-400'
                      }`}
                    >
                      {m.completed ? (
                        <CheckCircle2 size={15} strokeWidth={2.5} />
                      ) : (
                        <MIcon size={14} />
                      )}
                    </div>

                    <span
                      className={`text-xs truncate ${
                        m.active
                          ? 'font-bold text-indigo-950'
                          : m.completed
                          ? 'font-semibold text-slate-800'
                          : 'font-medium text-slate-400'
                      }`}
                    >
                      {m.label}
                    </span>
                  </div>

                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0">
                    {m.completed ? 'View' : m.active ? 'Active' : 'Pending'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM QUICK-ACTION TRIGGER */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onScrollToNextAction}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all"
          >
            <span>Jump to Next Action</span>
            <ArrowDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
