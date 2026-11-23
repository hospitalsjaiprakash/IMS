import { useState } from 'react';
import { Layers, Building, Users, AlertTriangle, FileText, CheckCircle, Paperclip } from 'lucide-react';
import { formatDate, formatDateTime, getStatusLabel, parseProposedOutcomes, getApiErrorMessage } from '../../utils/helpers';
import { attachmentsApi } from '../../api';
import toast from 'react-hot-toast';

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 flex justify-between gap-4 min-w-0">
        <span className="text-slate-500 flex-shrink-0">{label}</span>
        <span className="text-slate-800 text-right font-medium truncate">{value || '—'}</span>
      </div>
    </div>
  );
}

export default function IncidentDetailsCard({ incident, finalReport, feedbacks, attachments, onViewAttachment }) {
  const [openingId, setOpeningId] = useState(null);
  const submissionAtts = (attachments || []).filter(a => a.stage === 'submission');

  const categoriesList = Array.isArray(incident.categories) && incident.categories.length > 0
    ? incident.categories
    : (Array.isArray(incident.incident_categories) && incident.incident_categories.length > 0
      ? incident.incident_categories.map(name => ({ name, has_feedback: incident.all_hod_feedback_submitted }))
      : (incident.incident_category ? [{ name: incident.incident_category, has_feedback: incident.all_hod_feedback_submitted }] : []));

  const legacyDepts = Array.isArray(incident.departments) ? incident.departments : [];

  const handleOpenAttachment = async (att) => {
    if (onViewAttachment) {
      onViewAttachment(att);
      return;
    }
    if (!att?.id) return;
    setOpeningId(att.id);
    try {
      const res = await attachmentsApi.getDownloadUrl(att.id);
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Unable to open attachment.'));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      {/* Print Template Specific Content */}
      <div className="hidden print:block space-y-4 text-sm leading-relaxed mb-6">
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 mt-4">
          <p><strong>Status:</strong> {getStatusLabel(incident.status)}</p>
          <p><strong>Severity:</strong> {incident.severity || 'Pending'}</p>
          <p><strong>Incident Date &amp; Time:</strong> {formatDate(incident.incident_date)} at {incident.incident_time?.slice(0, 5)}</p>
          <p><strong>Location:</strong> {incident.main_location_name}{incident.sub_location_name ? ` - ${incident.sub_location_name}` : ''}</p>
          <p><strong>Reported By:</strong> {incident.reporter_name}</p>
          <p><strong>Occurred To:</strong> {incident.occurred_to}</p>
          <p className="col-span-2">
            <strong>Incident Categor(ies):</strong>{' '}
            {categoriesList.map(c => (typeof c === 'string' ? c : c.name)).join(', ') || 'N/A'}
          </p>
          <p className="col-span-2"><strong>Incident Type:</strong> {incident.incident_type}</p>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="font-bold text-base mb-2 uppercase tracking-wide">Description of the Incident</p>
          <p className="whitespace-pre-wrap">{incident.description}</p>
        </div>

        {incident.responsible_employees && incident.responsible_employees.length > 0 ? (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="font-bold text-base mb-2 uppercase tracking-wide">Responsible Personnel &amp; Mandated Outcomes</p>
            <div className="space-y-2">
              {incident.responsible_employees.map(emp => (
                <div key={emp.employee_id || emp.id} className="text-sm">
                  <p><strong>{emp.full_name}</strong> ({emp.emp_id || 'ID'}) — {emp.designation || 'Staff'} ({emp.department_name || ''})</p>
                  <p className="text-xs text-slate-600">
                    Mandated Outcome(s): {(Array.isArray(emp.outcomes) && emp.outcomes.length > 0 ? emp.outcomes : parseProposedOutcomes(incident.proposed_outcome)).join(', ') || 'N/A'}
                    {emp.penalty_amount ? ` | Penalty: ₹${emp.penalty_amount}` : ''}
                    {emp.needs_training ? ` | Training: ${emp.training_completed ? 'Completed' : 'Pending'}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : incident.has_responsible_person ? (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="font-bold text-base mb-2 uppercase tracking-wide">Responsible Personnel Details</p>
            <p><strong>Responsible Person:</strong> {incident.responsible_person_name}</p>
            {incident.training_completed ? (
              <p><strong>Mandatory Training Completed:</strong> Yes</p>
            ) : incident.status === 'pending_training' ? (
              <p><strong>Mandatory Training Completed:</strong> No (Pending)</p>
            ) : null}
          </div>
        ) : null}

        {finalReport && (
          <div className="mt-6 pt-4 border-t border-slate-200 bg-slate-50 p-4 border border-slate-300">
            <p className="font-bold text-base mb-2 uppercase tracking-wide">Management Final Report</p>
            <p className="mb-2"><strong>Fault Type:</strong> {finalReport.fault_type}</p>
            <p><strong>Corrective Actions:</strong></p>
            <p className="whitespace-pre-wrap mb-2">{finalReport.corrective_actions}</p>
            <p className="text-xs text-slate-500">Generated At: {formatDateTime(finalReport.generated_at)}</p>
          </div>
        )}

        {feedbacks?.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="font-bold text-base mb-4 uppercase tracking-wide">Review &amp; Feedback History</p>
            <div className="space-y-4">
              {feedbacks.map(fb => {
                const roleLabel = fb.role === 'hod' ? 'Department' : (fb.role?.replace('_', ' ').toUpperCase());
                return (
                  <div key={fb.id} className="pb-4 border-b border-slate-100 last:border-0">
                    <p className="mb-1">
                      <strong>{roleLabel} Review</strong> by {fb.full_name} ({fb.designation}) on {formatDateTime(fb.created_at)}
                    </p>
                    <p className="italic">&ldquo;{fb.feedback_text}&rdquo;</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Normal UI Content */}
      <div className="card p-5 print:hidden">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Incident Registration &amp; Reporting Details</h2>
        <div className="space-y-3 text-sm">
          {categoriesList.length > 1 ? (
            <div className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Layers size={14} className="text-slate-500" />
                  Incident Categories
                </span>
                <span className="text-[11px] font-bold text-slate-500">
                  {categoriesList.filter(c => typeof c === 'object' && c.has_feedback).length} of {categoriesList.length} Responded
                </span>
              </div>
              <div className="space-y-1.5">
                {categoriesList.map(c => {
                  const cName = typeof c === 'string' ? c : c.name;
                  const hasFb = typeof c === 'object' ? c.has_feedback : false;
                  return (
                    <div key={cName} className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-white border border-slate-200/80 text-xs">
                      <span className="font-medium text-slate-800">{cName}</span>
                      {hasFb ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
                          <CheckCircle size={12} className="text-emerald-600" /> Feedback Given
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold flex items-center gap-1 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Review
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <DetailRow
              icon={Layers}
              label="Incident Category"
              value={categoriesList.map(c => (typeof c === 'string' ? c : c.name)).join(', ') || '—'}
            />
          )}

          <DetailRow icon={FileText} label="Incident Type" value={incident.incident_type} />
          <DetailRow icon={Users} label="Occurred To" value={incident.occurred_to} />
          <DetailRow icon={AlertTriangle} label="Severity" value={incident.severity || 'Pending'} />

          {legacyDepts.length > 0 && (
            <DetailRow
              icon={Building}
              label="Legacy Involved Depts"
              value={legacyDepts.map(d => (typeof d === 'string' ? d : d.name)).join(', ')}
            />
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-2">Description</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
        </div>

        {submissionAtts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Attachments ({submissionAtts.length})</p>
            <div className="flex flex-wrap gap-2">
              {submissionAtts.map(att => (
                <button
                  type="button"
                  key={att.id}
                  disabled={openingId === att.id}
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenAttachment(att);
                  }}
                  title={att.original_filename}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-blue-700 font-medium hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm max-w-[200px]"
                >
                  <Paperclip size={12} className="flex-shrink-0" />
                  <span className="truncate">{att.original_filename}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
