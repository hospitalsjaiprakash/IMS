import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teamsApi, incidentsApi } from '../../api';
import { EmptyState, SkeletonCard, SkeletonTable } from '../../components/ui';
import { Users, User, Phone, Mail, AlertCircle, ArrowLeft, Briefcase, Building, FileText } from 'lucide-react';
import { getStatusClass, getStatusLabel, formatDate } from '../../utils/helpers';
import { Link } from 'react-router-dom';

export default function MyTeamPage() {
  const [selectedMember, setSelectedMember] = useState(null);

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['hodTeam'],
    queryFn: () => teamsApi.getHodTeam().then(res => res.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">
            {selectedMember ? 'Team Member Profile' : 'My Team'}
          </h1>
          <p className="text-sm text-slate-500">
            {selectedMember ? 'View detailed profile and assigned incidents' : 'Manage your department members and view their incident reports.'}
          </p>
        </div>
        {selectedMember && (
          <button 
            onClick={() => setSelectedMember(null)}
            className="btn btn-secondary bg-white flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Team
          </button>
        )}
      </div>

      {selectedMember ? (
        <MemberProfileView member={selectedMember} />
      ) : (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : !teamMembers?.length ? (
            <EmptyState icon={Users} title="No Team Members Found" message="Your department currently has no registered users." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamMembers.map(member => (
                <div 
                  key={member.id} 
                  onClick={() => setSelectedMember(member)}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg font-display">
                      {member.full_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-slate-800 font-semibold group-hover:text-indigo-600 transition-colors">{member.full_name}</h3>
                      <p className="text-sm text-slate-500">{member.designation || 'Employee'}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center"><Mail className="w-4 h-4 mr-2 text-slate-400" /> {member.email || 'N/A'}</div>
                    <div className="flex items-center"><Phone className="w-4 h-4 mr-2 text-slate-400" /> {member.phone || 'N/A'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MemberProfileView({ member }) {
  const { data: incidentsData, isLoading } = useQuery({
    queryKey: ['memberIncidents', member.id],
    queryFn: () => incidentsApi.list({ teamMemberId: member.id, teamMemberName: member.full_name }).then(res => res.data),
  });

  const incidents = incidentsData?.incidents || [];
  
  // Separate into reported and responsible
  const reported = incidents.filter(i => i.reporter_id === member.id);
  const responsible = incidents.filter(i => i.reporter_id !== member.id);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Profile Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-2xl uppercase shadow-inner">
            {member.full_name?.charAt(0)}
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-slate-800">{member.full_name}</h3>
            <div className="text-sm font-mono text-slate-500 mb-4 inline-block bg-slate-100 px-2 py-0.5 rounded">{member.employee_id}</div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <Briefcase size={16} className="text-slate-400" />
                <span className="font-medium">{member.designation || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <Building size={16} className="text-slate-400" />
                <span className="font-medium">{member.department || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <Phone size={16} className="text-slate-400" />
                <span className="font-medium">{member.phone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-indigo-700 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                <FileText size={16} />
                Incidents Given: {reported.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-8">
          <SkeletonTable rows={3} />
          <SkeletonTable rows={3} />
        </div>
      ) : (
        <>
          {/* Reported Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <AlertCircle size={18} className="text-slate-400" />
                Reported Incidents ({reported.length})
              </h4>
            </div>
            
            {reported.length > 0 ? (
              <IncidentDetailedTable incidents={reported} />
            ) : (
              <div className="text-center p-12 bg-white">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                  <FileText size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-600">No incidents reported</p>
                <p className="text-xs text-slate-400 mt-1">This member has not submitted any incident reports yet.</p>
              </div>
            )}
          </div>

          {/* Responsible Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <User size={18} className="text-slate-400" />
                Assigned / Responsible Incidents ({responsible.length})
              </h4>
            </div>
            
            {responsible.length > 0 ? (
              <IncidentDetailedTable incidents={responsible} />
            ) : (
              <div className="text-center p-12 bg-white">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                  <User size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-600">No assigned incidents</p>
                <p className="text-xs text-slate-400 mt-1">This member is not marked as responsible for any incidents.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IncidentDetailedTable({ incidents }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ref ID</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category & Type</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Severity</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {incidents.map(inc => (
            <tr key={inc.id} className="hover:bg-slate-50 transition-colors group">
              <td className="py-3 px-6 text-sm font-mono text-slate-700">
                <Link to={`/incidents/${inc.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline">
                  {inc.reference_id}
                </Link>
              </td>
              <td className="py-3 px-6 text-sm text-slate-600 whitespace-nowrap">{formatDate(inc.incident_date || inc.created_at)}</td>
              <td className="py-3 px-6 text-sm text-slate-800">
                {inc.incident_category && <div className="font-medium text-slate-700">{inc.incident_category}</div>}
                <div className="text-xs text-slate-500 line-clamp-1" title={inc.incident_type}>{inc.incident_type}</div>
              </td>
              <td className="py-3 px-6">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  inc.severity === 'Grave' ? 'bg-purple-100 text-purple-700' :
                  inc.severity === 'Major' ? 'bg-orange-100 text-orange-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {inc.severity || 'Pending'}
                </span>
              </td>
              <td className="py-3 px-6">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusClass(inc.status)}`}>
                  {getStatusLabel(inc.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
