import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { StatCard, Spinner, EmptyState, Tabs, SearchableMultiSelect } from '../../components/ui';
import {
  FileText, Activity, Clock, ShieldAlert,
  ChevronRight, Inbox, Filter
} from 'lucide-react';
import { getStatusLabel, getSeverityClass, getStatusClass, formatDate, timeAgo } from '../../utils/helpers';

export default function AssistantCooDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('received');
  
  // For filtering multiple departments
  const [selectedDepts, setSelectedDepts] = useState([]);

  // Fetch Received Incidents (Mapped to their departments)
  const { data: receivedIncidents = [], isLoading: isLoadingReceived } = useQuery({
    queryKey: ['incidents', 'executive-received'],
    queryFn: () => incidentsApi.list({ limit: 500 }).then(r => r.data?.incidents || []),
  });

  // Fetch My Reported Incidents
  const { data: myIncidents = [], isLoading: isLoadingMy } = useQuery({
    queryKey: ['incidents', 'executive-my'],
    queryFn: () => incidentsApi.list({ viewMode: 'my_incidents', limit: 100 }).then(r => r.data?.incidents || []),
  });

  const isLoading = isLoadingReceived || isLoadingMy;

  // Extract unique departments for filter dropdown
  const availableDepts = useMemo(() => {
    const deptSet = new Set();
    receivedIncidents.forEach(inc => {
      if (inc.departments && Array.isArray(inc.departments)) {
        inc.departments.forEach(d => {
          if (d) deptSet.add(d);
        });
      }
    });
    return Array.from(deptSet).sort();
  }, [receivedIncidents]);

  // Filter received incidents by selected departments
  const filteredReceived = useMemo(() => {
    if (selectedDepts.length === 0) return receivedIncidents;
    return receivedIncidents.filter(inc => {
      if (!inc.departments) return false;
      return inc.departments.some(d => selectedDepts.includes(d));
    });
  }, [receivedIncidents, selectedDepts]);

  const pendingReview = filteredReceived.filter(i => i.status === 'with_hod' || i.status === 'submitted').length;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  const renderIncidentCard = (inc, isReceived = false) => (
    <div
      key={inc.id}
      onClick={() => navigate(`/incidents/${inc.id}`)}
      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              {inc.reference_id}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${getSeverityClass(inc.severity)}`}>
              {inc.severity}
            </span>
          </div>
          <h4 className="text-[15px] font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">
            {inc.incident_type || inc.incident_category}
          </h4>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap ${getStatusClass(inc.status)}`}>
          {getStatusLabel(inc.status)}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1.5">
          <Clock size={13} className="text-slate-400" />
          {formatDate(inc.incident_date)}
        </span>
        {isReceived && inc.departments && inc.departments.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Activity size={13} className="text-slate-400" />
            <span className="font-semibold text-slate-700 bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
              {inc.departments.join(', ')}
            </span>
          </span>
        )}
        {!isReceived && (
          <span className="flex items-center gap-1.5">
            <Activity size={13} className="text-slate-400" />
            {inc.departments?.[0] || 'Unknown Dept'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {inc.has_hod_feedback && <span className="w-2 h-2 rounded-full bg-green-500" title="HOD Reviewed" />}
          {inc.has_imc_feedback && <span className="w-2 h-2 rounded-full bg-blue-500" title="IMC Processed" />}
          {inc.has_management_feedback && <span className="w-2 h-2 rounded-full bg-purple-500" title="Management Reviewed" />}
          <span className="text-[11px] font-medium text-slate-400">
            Reported {timeAgo(inc.created_at)}
          </span>
        </div>
        <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome, {user?.full_name}. Oversee departmental incidents and your reported issues.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Received"
          value={receivedIncidents.length}
          icon={Inbox}
          color="blue"
        />
        <StatCard
          title="Pending Action"
          value={pendingReview}
          icon={Clock}
          color="amber"
          trend={pendingReview > 0 ? { value: 'Requires Attention', isPositive: false } : undefined}
        />
        <StatCard
          title="My Reports"
          value={myIncidents.length}
          icon={FileText}
          color="indigo"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200">
          <Tabs
            tabs={[
              { id: 'received', label: 'Received Incidents', count: receivedIncidents.length },
              { id: 'my_reports', label: 'My Incidents', count: myIncidents.length }
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="p-5 bg-slate-50/50 min-h-[400px]">
          {activeTab === 'received' && (
            <div className="space-y-4">
              {availableDepts.length > 0 && (
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Filter size={16} className="text-indigo-500" />
                    Filter by Department:
                  </div>
                  <div className="w-[300px]">
                    <SearchableMultiSelect
                      options={availableDepts}
                      value={selectedDepts}
                      onChange={setSelectedDepts}
                      placeholder="All Managed Departments"
                    />
                  </div>
                </div>
              )}

              {filteredReceived.length === 0 ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="No incidents found"
                  description={selectedDepts.length > 0 ? "No incidents match the selected departments." : "Your departments currently have no incidents."}
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredReceived.map(inc => renderIncidentCard(inc, true))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'my_reports' && (
            <div className="space-y-4">
              {myIncidents.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No reported incidents"
                  description="You haven't reported any incidents yet."
                  action={{ label: "Report Incident", onClick: () => navigate('/incidents/new') }}
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {myIncidents.map(inc => renderIncidentCard(inc, false))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
