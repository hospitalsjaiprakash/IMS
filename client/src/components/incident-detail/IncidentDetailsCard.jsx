import React from 'react';
import { Building, Users, AlertTriangle, FileText, User, CheckCircle } from 'lucide-react';
import { formatDate, formatDateTime, getStatusLabel } from '../../utils/helpers';

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

export default function IncidentDetailsCard({ incident, finalReport, feedbacks }) {
  return (
    <>
      {/* --- PRINT TEMPLATE SPECIFIC CONTENT --- */}
      <div className="hidden print:block space-y-4 text-sm leading-relaxed mb-6">
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 mt-4">
          <p><strong>Status:</strong> {getStatusLabel(incident.status)}</p>
          <p><strong>Severity:</strong> {incident.severity}</p>
          <p><strong>Incident Date & Time:</strong> {formatDate(incident.incident_date)} at {incident.incident_time?.slice(0, 5)}</p>
          <p><strong>Location:</strong> {incident.main_location_name} - {incident.sub_location_name}</p>
          <p><strong>Reported By:</strong> {incident.reporter_name}</p>
          <p><strong>Occurred To:</strong> {incident.occurred_to}</p>
          <p className="col-span-2"><strong>Department(s) Involved:</strong> {(incident.departments || []).map(d => typeof d === 'string' ? d : d.name).join(', ') || 'N/A'}</p>
          <p><strong>Incident Category:</strong> {incident.incident_category}</p>
          <p><strong>Incident Type:</strong> {incident.incident_type}</p>
        </div>
        
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="font-bold text-base mb-2 uppercase tracking-wide">Description of the Incident</p>
          <p className="whitespace-pre-wrap">{incident.description}</p>
        </div>
        
        {incident.has_responsible_person && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="font-bold text-base mb-2 uppercase tracking-wide">Responsible Personnel Details</p>
            <p><strong>Responsible Person:</strong> {incident.responsible_person_name}</p>
            {incident.training_completed ? (
              <p><strong>Mandatory Training Completed:</strong> Yes</p>
            ) : incident.status === 'pending_training' ? (
              <p><strong>Mandatory Training Completed:</strong> No (Pending)</p>
            ) : null}
          </div>
        )}

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
            <p className="font-bold text-base mb-4 uppercase tracking-wide">Review & Feedback History</p>
            <div className="space-y-4">
              {feedbacks.map(fb => (
                <div key={fb.id} className="pb-4 border-b border-slate-100 last:border-0">
                  <p className="mb-1">
                    <strong>{fb.role?.replace('_', ' ').toUpperCase()} Review</strong> by {fb.full_name} ({fb.designation}) on {formatDateTime(fb.created_at)}
                  </p>
                  <p className="italic">"{fb.feedback_text}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --- NORMAL UI CONTENT --- */}
      <div className="card p-5 print:hidden">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Incident Details</h2>
        <div className="space-y-3 text-sm">
          <DetailRow icon={Building} label="Departments" value={(incident.departments || []).map(d => typeof d === 'string' ? d : d.name).join(', ') || '—'} />
          <DetailRow icon={Users} label="Occurred To" value={incident.occurred_to} />
          <DetailRow icon={AlertTriangle} label="Severity" value={incident.severity} />
          <DetailRow icon={FileText} label="Category" value={incident.incident_category} />
          <DetailRow icon={FileText} label="Type" value={incident.incident_type} />
          {incident.has_responsible_person && (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <DetailRow icon={User} label="Responsible Person" value={incident.responsible_person_name || '—'} />
              {incident.training_completed ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                  <CheckCircle size={14} /> Training Completed & Verified
                </div>
              ) : incident.status === 'pending_training' ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                  <AlertTriangle size={14} /> Mandatory Training Pending
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-2">Description</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
        </div>
      </div>
    </>
  );
}
