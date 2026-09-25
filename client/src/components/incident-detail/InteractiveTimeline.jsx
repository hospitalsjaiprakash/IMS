import React, { useState } from 'react';
import { Clock, Calendar, CheckCircle, Paperclip } from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';
import { UPLOADS_URL } from '../../api';

function calcDays(from, to) {
  if (!from || !to) return null;
  try {
    const a = typeof from === 'string' ? new Date(from) : from;
    const b = typeof to === 'string' ? new Date(to) : to;
    const diffMs = b - a;
    if (isNaN(diffMs) || diffMs < 0) return null;
    const totalMins = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  } catch { return null; }
}

function StageAttachments({ attachments, stage, onViewAttachment }) {
  const list = (attachments || []).filter(a => a.stage === stage);
  if (!list.length) return (
    <span className="text-[11px] text-slate-400 italic">No attachments</span>
  );
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {list.map(att => (
        <button
          type="button"
          key={att.id}
          onClick={(e) => {
            e.preventDefault();
            if (onViewAttachment) onViewAttachment(att);
            else window.open(`${UPLOADS_URL}/${att.stored_filename}`, '_blank');
          }}
          title={att.original_filename}
          className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-blue-700 font-medium hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm truncate max-w-[180px]"
        >
          <Paperclip size={10} className="flex-shrink-0" />
          <span className="truncate">{att.original_filename}</span>
        </button>
      ))}
    </div>
  );
}

const TIMELINE_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'with_hod', label: 'Awaiting HOD Feedback' },
  { key: 'with_imc', label: 'HOD Reviewed - Awaiting IMC' },
  { key: 'with_head_management', label: 'IMC Reviewed - Awaiting Mgmt' },
  { key: 'pending_imc_report', label: 'Mgmt Decided - Awaiting IMC Report' },
  { key: 'pending_training', label: 'Awaiting CAPA / Training' },
  { key: 'closed', label: 'Closed' },
];

const statusOrder = {
  submitted: 0, with_hod: 1, with_hod_and_imc: 1, with_imc: 2,
  redirect_requested: 2, with_head_management: 3, pending_imc_report: 4, pending_training: 5, resolved: 6, closed: 6, withdrawn: 6
};

export default function InteractiveTimeline({ incident, feedbacks, attachments, finalReport, onViewAttachment }) {
  const [activeTimelineStage, setActiveTimelineStage] = useState(null);

  const submittedAt = incident?.created_at;
  const hodFb = feedbacks?.find(f => f.role === 'hod');
  const imcFb = feedbacks?.find(f => f.role === 'imc');
  const mgmtFb = feedbacks?.find(f => f.role === 'head_management');

  const submissionAtts = (attachments || []).filter(a => a.stage === 'submission');
  const hodAtts = (attachments || []).filter(a => a.stage === 'hod_feedback');
  const imcAtts = (attachments || []).filter(a => a.stage === 'imc_feedback');
  const mdAtts = (attachments || []).filter(a => a.stage === 'md_decision');

  const bodies = {
    0: (
      <div className="space-y-3 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="grid grid-cols-1 gap-y-2 text-xs">
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px]">Reported By</p>
            <p className="text-slate-800 font-semibold">{incident.reporter_name}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px]">Department(s) Targeted</p>
            <p className="text-slate-800 font-medium">
              {(incident.departments || []).map(d => typeof d === 'string' ? d : d.name).join(', ') || '—'}
            </p>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px]">Severity / Category</p>
            <p className="text-slate-800 font-medium">{incident.severity} / {incident.incident_category}</p>
          </div>
        </div>
        <div>
          <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px] mb-1">Attachments ({submissionAtts.length})</p>
          <StageAttachments onViewAttachment={onViewAttachment} attachments={attachments} stage="submission" />
        </div>
      </div>
    ),
    1: hodFb ? (
      <div className="space-y-2 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">{hodFb.full_name?.charAt(0)}</div>
          <div>
            <p className="text-xs font-semibold text-slate-800">{hodFb.full_name}</p>
            <p className="text-[10px] text-slate-500">{hodFb.designation} · HOD</p>
          </div>
        </div>
        <blockquote className="text-xs text-slate-700 bg-white border-l-2 border-green-300 pl-3 pr-2 py-2 rounded-r-lg shadow-sm italic">
          "{hodFb.feedback_text}"
        </blockquote>
        <div>
          <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px] mb-1">Attachments ({hodAtts.length})</p>
          <StageAttachments onViewAttachment={onViewAttachment} attachments={attachments} stage="hod_feedback" />
        </div>
      </div>
    ) : (
      <p className="text-xs text-amber-700 italic mt-2">HOD has not yet submitted feedback.</p>
    ),
    2: imcFb ? (
      <div className="space-y-2 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">{imcFb.full_name?.charAt(0)}</div>
          <div>
            <p className="text-xs font-semibold text-slate-800">{imcFb.full_name}</p>
            <p className="text-[10px] text-slate-500">{imcFb.designation} · IMC</p>
          </div>
        </div>
        <blockquote className="text-xs text-slate-700 bg-white border-l-2 border-indigo-300 pl-3 pr-2 py-2 rounded-r-lg shadow-sm italic">
          "{imcFb.feedback_text}"
        </blockquote>
        <div>
          <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px] mb-1">Attachments ({imcAtts.length})</p>
          <StageAttachments onViewAttachment={onViewAttachment} attachments={attachments} stage="imc_feedback" />
        </div>
      </div>
    ) : (
      <p className="text-xs text-indigo-700 italic mt-2">IMC review is pending.</p>
    ),
    3: incident.management_decision ? (
      <div className="space-y-2 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="text-xs">
          <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px]">Decision</p>
          <p className="text-slate-800 font-semibold">{incident.management_decision.replace('_', ' ')}</p>
        </div>
        {incident.management_notes && (
          <div className="text-xs mt-2">
            <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1 text-[10px]">Notes</p>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap bg-white p-2 rounded-lg border border-slate-200">{incident.management_notes}</p>
          </div>
        )}
        {mgmtFb && (
          <blockquote className="text-xs text-slate-700 bg-white border-l-2 border-orange-300 pl-3 pr-2 py-2 rounded-r-lg shadow-sm italic mt-2">
            "{mgmtFb.feedback_text}"
          </blockquote>
        )}
      </div>
    ) : (
      <p className="text-xs text-orange-700 italic mt-2">Management decision is pending.</p>
    ),
    4: finalReport ? (
      <div className="space-y-2 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="grid grid-cols-1 gap-y-2 text-xs">
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px]">Fault Type</p>
            <p className="text-slate-800 font-semibold">{finalReport.fault_type}</p>
          </div>
        </div>
        <div className="text-xs mt-2">
          <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1 text-[10px]">Corrective Actions</p>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap bg-white p-2 rounded-lg border border-slate-200">{finalReport.corrective_actions}</p>
        </div>
        <div className="mt-2">
          <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px] mb-1">Official IMC Report</p>
          <StageAttachments onViewAttachment={onViewAttachment} attachments={attachments} stage="imc_report" />
        </div>
      </div>
    ) : (
      <p className="text-xs text-orange-700 italic mt-2">Pending IMC Report Generation.</p>
    ),
    5: incident.responsible_employees?.some(e => e.needs_training) ? (
      <div className="space-y-2 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="text-xs text-slate-600">
          <p className="text-slate-400 uppercase tracking-wide font-semibold text-[10px] mb-1">Mandatory Training Status</p>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            {incident.responsible_employees.filter(e => e.needs_training).map(e => (
              <li key={e.employee_id}>
                <strong>{e.full_name}</strong>
                {e.training_completed ? (
                  <span className="text-green-600 ml-1">(Verified)</span>
                ) : (
                  <span className="text-amber-600 ml-1">(Pending)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    ) : (
      <p className="text-xs text-slate-500 italic mt-2">No mandatory training required.</p>
    ),
    6: (incident.status === 'resolved' || incident.status === 'closed') ? (
      <div className="space-y-2 mt-3 bg-green-50 p-3 rounded-xl border border-green-200">
        <p className="text-[11px] font-bold text-green-800 uppercase tracking-wide mb-1">Total Resolution Time</p>
        <p className="text-xl font-extrabold text-green-700">
          {calcDays(submittedAt, incident.resolved_at) || '—'}
        </p>
        <p className="text-[10px] text-green-600 mt-0.5">from submission to resolution</p>
      </div>
    ) : incident.status === 'withdrawn' ? (
      <div className="space-y-2 mt-3 bg-red-50 p-3 rounded-xl border border-red-200">
        <p className="text-xs font-bold text-red-800 uppercase tracking-wide mb-1">Incident Withdrawn</p>
        {incident.withdrawn_reason && (
          <p className="text-xs text-red-700 italic">"{incident.withdrawn_reason}"</p>
        )}
      </div>
    ) : (
      <p className="text-xs text-slate-500 italic mt-2">This incident is still in progress.</p>
    )
  };

  return (
    <div className="card p-5 border border-indigo-100 bg-white shadow-sm">
      <h2 className="text-sm font-semibold text-indigo-900 mb-5 flex items-center gap-2">
        <Clock size={16} className="text-indigo-600" /> Lifecycle Progress
      </h2>
      <div className="space-y-0 relative">
        {TIMELINE_STAGES.map((stage, i) => {
          let done = false;
          let active = false;
          
          if (i === 0) {
            done = true;
          } else if (i === 1) {
            done = statusOrder[incident.status] > 1 || feedbacks?.some(f => f.role === 'hod');
            active = !done && ['submitted', 'with_hod', 'with_hod_and_imc'].includes(incident.status);
          } else if (i === 2) {
            done = statusOrder[incident.status] > 2 || feedbacks?.some(f => f.role === 'imc');
            active = !done && ['with_imc', 'with_hod_and_imc', 'redirect_requested'].includes(incident.status);
          } else if (i === 3) {
            done = statusOrder[incident.status] > 3;
            active = !done && incident.status === 'with_head_management';
          } else if (i === 4) {
            done = statusOrder[incident.status] > 4;
            active = !done && incident.status === 'pending_imc_report';
          } else if (i === 5) {
            done = statusOrder[incident.status] > 5;
            active = !done && incident.status === 'pending_training';
          } else if (i === 6) {
            done = ['resolved', 'closed', 'withdrawn'].includes(incident.status);
            active = false;
          }

          if (statusOrder[incident.status] > i && i < 6) done = true;
          
          let stageLabel = stage.label;
          if (i === 1) {
            stageLabel = done 
              ? (feedbacks?.some(f => f.role === 'hod') ? 'HOD Reviewed' : 'HOD Bypassed') 
              : 'Awaiting HOD Feedback';
          } else if (i === 2) {
            stageLabel = done 
              ? (feedbacks?.some(f => f.role === 'imc') ? 'IMC Reviewed' : 'IMC Bypassed') 
              : 'Awaiting IMC Feedback';
          } else if (i === 3) {
            stageLabel = done ? 'Mgmt Reviewed' : 'Awaiting Mgmt Decision';
          } else if (i === 4) {
            stageLabel = done ? 'IMC Report Generated' : 'Awaiting IMC Report';
          } else if (i === 5) {
            stageLabel = done ? 'Training Completed' : 'Awaiting Training';
          } else if (i === 6) {
            stageLabel = incident.status === 'withdrawn' ? 'Withdrawn' : done ? 'Resolved' : 'Closed';
          }

          if (incident.status === 'withdrawn' && i > statusOrder['withdrawn']) {
            done = false;
            active = false;
          }

          let reviewDate = null;
          if (done) {
            if (i === 0) reviewDate = incident.created_at;
            else if (i === 1) reviewDate = feedbacks?.find(f => f.role === 'hod')?.created_at;
            else if (i === 2) reviewDate = feedbacks?.find(f => f.role === 'imc')?.created_at;
            else if (i === 3) reviewDate = mgmtFb?.created_at || incident.updated_at;
            else if (i === 4) reviewDate = finalReport?.generated_at;
            else if (i === 6) reviewDate = incident.resolved_at || incident.withdrawn_at;
          }

          const isExpanded = activeTimelineStage === i;
          const isExpandable = done || active || (i === 6 && (incident.status === 'withdrawn' || incident.status === 'resolved' || incident.status === 'closed'));

          return (
            <div key={stage.key} className="relative flex gap-4 pb-6 last:pb-0 group">
              {i < TIMELINE_STAGES.length - 1 && (
                <div className={`absolute left-3.5 top-8 bottom-[-4px] w-[2px] transition-colors duration-500 ${done ? 'bg-indigo-300' : 'bg-slate-100'}`} />
              )}
              
              <button 
                onClick={() => isExpandable ? setActiveTimelineStage(isExpanded ? null : i) : null}
                className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${isExpandable ? 'cursor-pointer group-hover:scale-110 shadow-sm' : ''} ${
                  done ? 'bg-indigo-600 text-white ring-2 ring-indigo-100' : active ? 'bg-indigo-50 text-indigo-600 ring-4 ring-indigo-100 animate-pulse border border-indigo-300' : 'bg-white text-slate-300 border-2 border-slate-200'
                }`}
                title={isExpandable ? "Click to view details" : ""}
              >
                {done ? <CheckCircle size={14} /> : i + 1}
              </button>
              
              <div className="pt-1 flex-1">
                <div 
                  className={`transition-colors duration-200 ${isExpandable ? 'cursor-pointer group-hover:opacity-80' : ''}`}
                  onClick={() => isExpandable ? setActiveTimelineStage(isExpanded ? null : i) : null}
                >
                  <p className={`text-sm tracking-wide ${active ? 'text-indigo-700 font-bold' : done ? 'text-slate-800 font-semibold' : 'text-slate-400 font-medium'}`}>
                    {stageLabel}
                  </p>
                  
                  {active && <p className="text-[11px] font-semibold text-indigo-500 mt-0.5 flex items-center gap-1 uppercase"><Clock size={10} /> In progress</p>}
                  
                  {!isExpanded && done && reviewDate && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Calendar size={10} /> {formatDateTime(reviewDate)}
                    </p>
                  )}
                </div>

                {isExpanded && (
                  <div className="animate-fade-in origin-top mt-1">
                    {reviewDate && (
                      <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mb-2">
                        <Calendar size={10} /> {formatDateTime(reviewDate)}
                      </p>
                    )}
                    {bodies[i]}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
