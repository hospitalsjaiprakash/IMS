import React from 'react';
import { Download, Flame, Calendar, MapPin, User } from 'lucide-react';
import { StatusBadge, SeverityBadge, SLABadge } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import logo from '../../assets/logo.webp';

export default function IncidentHeader({ incident }) {
  return (
    <>
      {/* --- PRINT TEMPLATE HEADER --- */}
      <div className="hidden print:block p-8 bg-white text-black w-full max-w-none m-0">
        <div className="flex items-center gap-6 border-b-2 border-slate-800 pb-6 mb-6">
          <img src={logo} alt="JPHRC Logo" className="w-24 h-24 object-contain" />
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Jaiprakash Hospital & Research Centre Pvt. Ltd.</h1>
            <p className="text-sm font-semibold text-slate-600 mt-1 uppercase tracking-widest">Incident Management System - Official Report</p>
          </div>
        </div>
        <div className="flex justify-between items-start text-sm mb-4">
          <p><strong>Incident Reference ID:</strong> {incident.reference_id}</p>
          <p><strong>Generated On:</strong> {formatDate(new Date())}</p>
        </div>
      </div>

      {/* --- NORMAL UI HEADER --- */}
      <div className="card p-5 mb-5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-base font-bold text-green-700">{incident.reference_id}</span>
              <StatusBadge status={incident.status} />
              <SLABadge createdAt={incident.created_at} status={incident.status} />
              {incident.priority_escalated_by && (
                <span className="badge bg-red-100 text-red-700 font-bold border border-red-200 animate-pulse">
                  <Flame size={12} className="inline mr-1" />
                  ESCALATED BY {incident.priority_escalated_by.toUpperCase()}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 font-display">{incident.incident_type}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {formatDate(incident.incident_date)} at {incident.incident_time?.slice(0, 5)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} />
                {incident.main_location_name} › {incident.sub_location_name}
              </span>
              <span className="flex items-center gap-1.5">
                <User size={13} />
                {incident.reporter_name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="btn-secondary btn-sm print:hidden shadow-sm mr-2 border-slate-200">
              <Download size={14} />
              Generate PDF
            </button>
            <SeverityBadge severity={incident.severity} />
          </div>
        </div>
      </div>
    </>
  );
}
