import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Spinner, Alert, SeverityBadge, StatusBadge } from '../../components/ui';
import { AccountabilityPipelineStepper } from '../../components/dashboard/AccountabilityPipelineStepper';
import { MonthlySeverityCharts } from '../../components/dashboard/MonthlySeverityCharts';
import {
  FileText, CheckCircle, Clock, TrendingUp, Users,
  Shield, BarChart3, Settings, RefreshCw, AlertOctagon, Eye, ChevronRight, Paperclip, LayoutDashboard
} from 'lucide-react';
import { formatDate } from '../../utils/helpers';

export default function SystemAdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const {
    data: stats,
    isLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats', 'admin'],
    queryFn: () => incidentsApi.getStats().then(r => r.data),
  });

  const { data: recentData } = useQuery({
    queryKey: ['incidents', { page: 1, limit: 5, scope: 'admin-recent' }],
    queryFn: () => incidentsApi.list({ page: 1, limit: 5 }).then(r => r.data.incidents),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>;
  }

  if (isStatsError) {
    return (
      <div className="space-y-4">
        <Alert
          type="error"
          title="Unable to load system dashboard"
          message="There was a problem loading system analytics from the server."
        />
        <button onClick={() => refetchStats()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const totals = stats?.totals || {};
  const bySeverity = stats?.bySeverity || [];
  const monthly = stats?.monthly || [];
  const recent = Array.isArray(recentData) ? recentData : (recentData?.incidents || []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">System Administration</h1>
          <p className="page-subtitle">Welcome back, {user?.fullName?.split(' ')[0]} · {user?.department || 'Digital Department'}</p>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <LayoutDashboard size={16} className="text-indigo-600" />
            System Overview
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div onClick={() => navigate('/incidents')} className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">Total Incidents</p>
                  <p className="text-3xl font-extrabold text-blue-900 mt-1">{totals.total || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
                  <FileText size={24} className="text-blue-600" />
                </div>
              </div>
            </div>

            <div onClick={() => navigate('/incidents', { state: { status: 'active' } })} className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-amber-800/70 uppercase tracking-wide">Active</p>
                  <p className="text-3xl font-extrabold text-amber-900 mt-1">{totals.active || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
                  <Clock size={24} className="text-amber-600" />
                </div>
              </div>
            </div>

            <div onClick={() => navigate('/incidents', { state: { status: 'resolved' } })} className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-green-800/70 uppercase tracking-wide">Resolved</p>
                  <p className="text-3xl font-extrabold text-green-900 mt-1">{totals.resolved || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
                  <CheckCircle size={24} className="text-green-600" />
                </div>
              </div>
            </div>

            <div onClick={() => navigate('/incidents', { state: { status: 'withdrawn' } })} className="card p-5 bg-gradient-to-br from-slate-50 to-gray-100 border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-600 uppercase tracking-wide">Withdrawn</p>
                  <p className="text-3xl font-extrabold text-slate-800 mt-1">{totals.withdrawn || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
                  <AlertOctagon size={24} className="text-slate-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-sm">
              <TrendingUp size={14} className="text-indigo-600" /> This Month: {totals.this_month || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Accountability Pipeline Stepper */}
      <AccountabilityPipelineStepper totals={totals} title="Review & Accountability Pipeline" mgmtLabel="3. Mgmt Feedback" />

      {/* Quick Access tiles */}
      <div>
        <div className="flex items-center gap-2 mb-3 mt-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Access</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-3.5">
          <button onClick={() => navigate('/admin/users')} className="card p-4 text-left hover:shadow-md transition-all group border-l-4 border-l-blue-500">
            <Users size={20} className="text-blue-600 mb-2" />
            <p className="text-sm font-semibold text-slate-800">Users &amp; Roles</p>
            <p className="text-xs text-slate-500 mt-0.5">Manage employees and category mappings</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              Open <ChevronRight size={12} />
            </div>
          </button>
          <button onClick={() => navigate('/admin/analytics')} className="card p-4 text-left hover:shadow-md transition-all group border-l-4 border-l-green-500">
            <BarChart3 size={20} className="text-green-700 mb-2" />
            <p className="text-sm font-semibold text-slate-800">Analytics</p>
            <p className="text-xs text-slate-500 mt-0.5">SLA tracking and category reports</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              Open <ChevronRight size={12} />
            </div>
          </button>
          <button onClick={() => navigate('/admin/audit')} className="card p-4 text-left hover:shadow-md transition-all group border-l-4 border-l-violet-500">
            <Shield size={20} className="text-violet-600 mb-2" />
            <p className="text-sm font-semibold text-slate-800">Audit Logs</p>
            <p className="text-xs text-slate-500 mt-0.5">Complete history of all system actions</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              Open <ChevronRight size={12} />
            </div>
          </button>
          <button onClick={() => navigate('/admin/settings')} className="card p-4 text-left hover:shadow-md transition-all group border-l-4 border-l-slate-400">
            <Settings size={20} className="text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-800">System Settings</p>
            <p className="text-xs text-slate-500 mt-0.5">Configuration and SLA thresholds</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              Open <ChevronRight size={12} />
            </div>
          </button>
        </div>
      </div>

      {/* Charts */}
      <MonthlySeverityCharts
        monthly={monthly}
        bySeverity={bySeverity}
        barColor="#0e95ea"
        monthlyTitle="Monthly Incident Trend"
      />

      {/* Recent incidents */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Recent Incidents</h3>
          <button onClick={() => navigate('/incidents')} className="text-xs text-blue-600 hover:underline">View all →</button>
        </div>
        <div className="divide-y divide-slate-100">
          {recent.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No incidents yet</div>
          ) : recent.map(inc => {
            const attCount = Number(inc.attachment_count ?? inc.attachments?.length ?? 0);
            return (
              <div
                key={inc.id}
                onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors group"
              >
                <div
                  className={`w-1.5 h-10 rounded-full flex-shrink-0 ${
                    inc.severity === 'Grave'
                      ? 'bg-purple-400'
                      : inc.severity === 'Major'
                        ? 'bg-amber-400'
                        : 'bg-green-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-green-700">{inc.reference_id}</span>
                    {inc.severity && <SeverityBadge severity={inc.severity} />}
                    <StatusBadge status={inc.status} />
                    {attCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5" title={`${attCount} attachment(s)`}>
                        <Paperclip size={10} />
                        <span>{attCount}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 truncate">
                    {inc.incident_category || inc.incident_type} · {inc.reporter_name} · {formatDate(inc.incident_date)}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/incidents/${encodeURIComponent(inc.id)}`); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                >
                  <Eye size={13} /> View
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
