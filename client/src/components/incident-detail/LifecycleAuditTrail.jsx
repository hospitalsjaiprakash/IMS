import React from 'react';
import { Paperclip, Clock, Calendar, CheckCircle, ClipboardList, Building, Layers, UserCircle2, GraduationCap, Timer, Activity } from 'lucide-react';
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

function StageAttachments({ attachments, stage }) {
  const list = (attachments || []).filter(a => a.stage === stage);
  if (!list.length) return (
    <span className="text-[11px] text-slate-400 italic">No attachments</span>
  );
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {list.map(att => (
        <a
          key={att.id}
          href={`${UPLOADS_URL}/${att.stored_filename}`}
          download={att.original_filename}
          title={att.original_filename}
          className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-blue-700 font-medium hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm truncate max-w-[180px]"
        >
          <Paperclip size={10} className="flex-shrink-0" />
          <span className="truncate">{att.original_filename}</span>
        </a>
      ))}
    </div>
  );
}

export default function LifecycleAuditTrail({ incident, feedbacks, attachments, finalReport }) {
  const submittedAt = incident?.created_at;
  const hodFb = feedbacks?.find(f => f.role === 'hod');
  const imcFb = feedbacks?.find(f => f.role === 'imc');
  const mgmtFb = feedbacks?.find(f => f.role === 'head_management');

  const submissionAtts = (attachments || []).filter(a => a.stage === 'submission');
  const hodAtts = (attachments || []).filter(a => a.stage === 'hod_feedback');
  const imcAtts = (attachments || []).filter(a => a.stage === 'imc_feedback');
  const mdAtts = (attachments || []).filter(a => a.stage === 'md_decision');

  const stages = [
    {
      key: 'submission',
      icon: ClipboardList,
      color: 'blue',
      label: 'Incident Submitted',
      done: true,
      timestamp: submittedAt,
      elapsedFrom: null,
      body: (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Reported By</p>
              <p className="text-slate-800 font-semibold mt-0.5">{incident.reporter_name}</p>
              <p className="text-slate-500">{incident.reporter_designation}</p>
              {incident.reporter_employee_id && <p className="text-slate-400">ID: {incident.reporter_employee_id}</p>}
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Department(s) Targeted</p>
              <p className="text-slate-800 font-medium mt-0.5">
                {(incident.departments || []).map(d => typeof d === 'string' ? d : d.name).join(', ') || '—'}
              </p>
              <p className="text-slate-500 mt-0.5">
                {(incident.departments || []).length} dept{(incident.departments || []).length !== 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Severity</p>
              <p className="text-slate-800 font-medium mt-0.5">{incident.severity}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Occurred To</p>
              <p className="text-slate-800 font-medium mt-0.5">{incident.occurred_to}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Category</p>
              <p className="text-slate-800 font-medium mt-0.5">{incident.incident_category}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Type</p>
              <p className="text-slate-800 font-medium mt-0.5">{incident.incident_type}</p>
            </div>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1" style={{fontSize:'10px'}}>Attachments ({submissionAtts.length})</p>
            <StageAttachments attachments={attachments} stage="submission" />
          </div>
        </div>
      )
    },
    {
      key: 'hod',
      icon: Building,
      color: hodFb ? 'green' : 'amber',
      label: 'HOD Feedback',
      done: !!hodFb,
      pending: !hodFb,
      timestamp: hodFb?.created_at,
      elapsedFrom: submittedAt,
      body: hodFb ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">{hodFb.full_name?.charAt(0)}</div>
            <div>
              <p className="text-xs font-semibold text-slate-800">{hodFb.full_name}</p>
              <p className="text-[10px] text-slate-500">{hodFb.designation} · HOD</p>
            </div>
          </div>
          <blockquote className="text-xs text-slate-700 bg-slate-50 border-l-2 border-green-300 pl-3 pr-2 py-2 rounded-r-lg leading-relaxed italic">
            "{hodFb.feedback_text}"
          </blockquote>
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1" style={{fontSize:'10px'}}>Attachments ({hodAtts.length})</p>
            <StageAttachments attachments={attachments} stage="hod_feedback" />
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-700 italic">HOD has not yet submitted feedback.</p>
      )
    },
    {
      key: 'imc',
      icon: Layers,
      color: imcFb ? 'green' : 'indigo',
      label: 'IMC Review',
      done: !!imcFb,
      pending: !imcFb,
      timestamp: imcFb?.created_at,
      elapsedFrom: submittedAt,
      body: imcFb ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">{imcFb.full_name?.charAt(0)}</div>
            <div>
              <p className="text-xs font-semibold text-slate-800">{imcFb.full_name}</p>
              <p className="text-[10px] text-slate-500">{imcFb.designation} · IMC</p>
            </div>
          </div>
          <blockquote className="text-xs text-slate-700 bg-slate-50 border-l-2 border-indigo-300 pl-3 pr-2 py-2 rounded-r-lg leading-relaxed italic">
            "{imcFb.feedback_text}"
          </blockquote>
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1" style={{fontSize:'10px'}}>Attachments ({imcAtts.length})</p>
            <StageAttachments attachments={attachments} stage="imc_feedback" />
          </div>
        </div>
      ) : (
        <p className="text-xs text-indigo-700 italic">IMC review is pending.</p>
      )
    },
    {
      key: 'mgmt',
      icon: UserCircle2,
      color: finalReport ? 'green' : 'orange',
      label: 'Management Decision',
      done: !!finalReport,
      pending: !finalReport,
      timestamp: finalReport?.generated_at,
      elapsedFrom: submittedAt,
      body: finalReport ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Fault Type</p>
              <p className="text-slate-800 font-semibold mt-0.5">{finalReport.fault_type}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide font-semibold" style={{fontSize:'10px'}}>Training Required</p>
              <p className="mt-0.5">
                {incident.has_responsible_person
                  ? <span className="font-semibold text-amber-700">Yes — {incident.responsible_person_name}</span>
                  : <span className="text-slate-500">No</span>
                }
              </p>
            </div>
          </div>
          <div className="text-xs">
            <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1" style={{fontSize:'10px'}}>Corrective Actions</p>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-2 rounded-lg border border-slate-100">{finalReport.corrective_actions}</p>
          </div>
          {mgmtFb && (
            <blockquote className="text-xs text-slate-700 bg-slate-50 border-l-2 border-orange-300 pl-3 pr-2 py-2 rounded-r-lg leading-relaxed italic">
              "{mgmtFb.feedback_text}"
            </blockquote>
          )}
          <div>
            <p className="text-slate-400 uppercase tracking-wide font-semibold mb-1" style={{fontSize:'10px'}}>Attachments ({mdAtts.length})</p>
            <StageAttachments attachments={attachments} stage="md_decision" />
          </div>
        </div>
      ) : (
        <p className="text-xs text-orange-700 italic">Management decision is pending.</p>
      )
    },
    ...( incident.has_responsible_person ? [{
      key: 'training',
      icon: GraduationCap,
      color: incident.training_completed ? 'green' : 'amber',
      label: 'Mandatory Training',
      done: !!incident.training_completed,
      pending: !incident.training_completed,
      timestamp: incident.training_completed_at,
      elapsedFrom: finalReport?.generated_at,
      elapsedLabel: 'after mgmt decision',
      body: incident.training_completed ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-600" />
            <p className="text-xs font-semibold text-green-800">Training completed & verified by IMC</p>
          </div>
          <p className="text-xs text-slate-600">Employee: <strong>{incident.responsible_person_name}</strong></p>
          {incident.training_completed_at && (
            <p className="text-xs text-slate-500">Completed: <strong>{formatDateTime(incident.training_completed_at)}</strong></p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-amber-600 animate-pulse" />
            <p className="text-xs font-semibold text-amber-800">Mandatory training pending</p>
          </div>
          <p className="text-xs text-slate-600">Employee: <strong>{incident.responsible_person_name}</strong></p>
        </div>
      )
    }] : []),
    {
      key: 'resolution',
      icon: Timer,
      color: incident.status === 'resolved' ? 'green' : incident.status === 'withdrawn' ? 'red' : 'slate',
      label: incident.status === 'resolved' ? 'Incident Resolved' : incident.status === 'withdrawn' ? 'Incident Withdrawn' : 'Resolution',
      done: incident.status === 'resolved' || incident.status === 'withdrawn',
      pending: !['resolved','withdrawn'].includes(incident.status),
      timestamp: incident.resolved_at || incident.withdrawn_at,
      elapsedFrom: null,
      body: incident.status === 'resolved' || incident.status === 'withdrawn' ? (
        <div className="space-y-2">
          {incident.status === 'withdrawn' && incident.withdrawn_reason && (
            <p className="text-xs text-red-700 italic">Withdrawal reason: "{incident.withdrawn_reason}"</p>
          )}
          {incident.status === 'resolved' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-green-800 uppercase tracking-wide mb-1">Total Resolution Time</p>
              <p className="text-2xl font-extrabold text-green-700">
                {calcDays(submittedAt, incident.resolved_at) || '—'}
              </p>
              <p className="text-[11px] text-green-600 mt-0.5">from submission to resolution</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">This incident is still in progress.</p>
      )
    }
  ];

  const colorMap = {
    blue:   { dot: 'bg-blue-500 ring-blue-100',   badge: 'bg-blue-50 text-blue-800 border-blue-200',   title: 'text-blue-900',   line: 'bg-blue-200' },
    green:  { dot: 'bg-green-500 ring-green-100',  badge: 'bg-green-50 text-green-800 border-green-200',  title: 'text-green-900',  line: 'bg-green-300' },
    amber:  { dot: 'bg-amber-400 ring-amber-100 animate-pulse',  badge: 'bg-amber-50 text-amber-800 border-amber-200',  title: 'text-amber-900',  line: 'bg-slate-200' },
    indigo: { dot: 'bg-indigo-400 ring-indigo-100 animate-pulse', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200', title: 'text-indigo-900', line: 'bg-slate-200' },
    orange: { dot: 'bg-orange-400 ring-orange-100 animate-pulse', badge: 'bg-orange-50 text-orange-800 border-orange-200', title: 'text-orange-900', line: 'bg-slate-200' },
    red:    { dot: 'bg-red-400 ring-red-100',    badge: 'bg-red-50 text-red-800 border-red-200',    title: 'text-red-900',    line: 'bg-slate-200' },
    slate:  { dot: 'bg-slate-300 ring-slate-100', badge: 'bg-slate-50 text-slate-600 border-slate-200', title: 'text-slate-700',  line: 'bg-slate-200' },
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Activity size={16} className="text-indigo-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Full Lifecycle Audit Trail</h2>
          <p className="text-[11px] text-slate-500">Complete timeline from submission to resolution — visible to Admin, IMC & Management</p>
        </div>
      </div>

      <div className="p-5 space-y-0">
        {stages.map((stage, idx) => {
          const c = colorMap[stage.color] || colorMap.slate;
          const StageIcon = stage.icon;
          const elapsed = stage.timestamp && stage.elapsedFrom ? calcDays(stage.elapsedFrom, stage.timestamp) : null;
          const isLast = idx === stages.length - 1;
          return (
            <div key={stage.key} className="relative flex gap-4">
              {!isLast && (
                <div className={`absolute left-4 top-10 bottom-0 w-0.5 ${c.line}`} />
              )}
              <div className="flex-shrink-0 relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ring-4 ${c.dot}`}>
                  <StageIcon size={14} className="text-white" />
                </div>
              </div>
              <div className={`flex-1 mb-5 rounded-xl border p-4 ${c.badge}`}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <p className={`text-xs font-bold uppercase tracking-wider ${c.title}`}>{stage.label}</p>
                  {stage.timestamp && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-white/70 border border-slate-200 rounded-full px-2 py-0.5">
                      <Calendar size={10} />
                      {formatDateTime(stage.timestamp)}
                    </span>
                  )}
                  {elapsed && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                      <Clock size={10} />
                      {elapsed} {stage.elapsedLabel || 'after submission'}
                    </span>
                  )}
                  {stage.pending && !stage.done && (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 animate-pulse">
                      Pending
                    </span>
                  )}
                </div>
                {stage.body}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
