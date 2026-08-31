import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teamsApi, incidentsApi } from '../../api';
import { Spinner, EmptyState, StatusBadge, SeverityBadge } from '../../components/ui';
import { Users, User, Phone, Mail, ChevronRight, X, AlertCircle } from 'lucide-react';
import { getSeverityClass, getStatusClass, getStatusLabel, formatDate } from '../../utils/helpers';
import { Link } from 'react-router-dom';

export default function MyTeamPage() {
  const [selectedMember, setSelectedMember] = useState(null);

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['hodTeam'],
    queryFn: () => teamsApi.getHodTeam().then(res => res.data),
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">My Team</h1>
          <p className="text-sm text-slate-500">Manage your department members and view their incident reports.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner size="lg" /></div>
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

      {selectedMember && (
        <MemberIncidentsModal 
          member={selectedMember} 
          onClose={() => setSelectedMember(null)} 
        />
      )}
    </div>
  );
}

function MemberIncidentsModal({ member, onClose }) {
  const { data: incidentsData, isLoading } = useQuery({
    queryKey: ['memberIncidents', member.id],
    queryFn: () => incidentsApi.list({ teamMemberId: member.id, teamMemberName: member.full_name }).then(res => res.data),
  });

  const incidents = incidentsData?.incidents || [];
  
  // Separate into reported and responsible
  const reported = incidents.filter(i => i.reporter_id === member.id);
  const responsible = incidents.filter(i => i.reporter_id !== member.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center space-x-4">
            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold font-display">
              {member.full_name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-display">{member.full_name}'s Incidents</h2>
              <p className="text-sm text-slate-500">{member.designation}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
          {isLoading ? (
            <div className="flex justify-center p-12"><Spinner size="lg" /></div>
          ) : (
            <>
              {/* Reported Section */}
              <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 text-indigo-500 mr-2" />
                  Reported by {member.full_name}
                  <span className="ml-3 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{reported.length}</span>
                </h3>
                {reported.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">No incidents reported by this member.</p>
                ) : (
                  <IncidentSimpleTable incidents={reported} />
                )}
              </section>

              {/* Responsible Section */}
              <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                  <User className="w-5 h-5 text-emerald-500 mr-2" />
                  Assigned / Responsible
                  <span className="ml-3 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{responsible.length}</span>
                </h3>
                {responsible.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">No incidents assigned to this member.</p>
                ) : (
                  <IncidentSimpleTable incidents={responsible} />
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IncidentSimpleTable({ incidents }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 font-medium rounded-tl-lg">Reference</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Severity</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {incidents.map((inc) => (
            <tr key={inc.id} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800">{inc.reference_id}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(inc.created_at)}</td>
              <td className="px-4 py-3"><SeverityBadge severity={inc.severity} /></td>
              <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
              <td className="px-4 py-3 text-right">
                <Link to={`/incidents/${inc.id}`} className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
