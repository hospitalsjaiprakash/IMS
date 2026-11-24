import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi, authApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { StatCard, Spinner, EmptyState, Alert, SeverityBadge, StatusBadge } from '../../components/ui';
import { IncidentOverviewCards } from '../../components/dashboard/IncidentOverviewCards';
import { AccountabilityPipelineStepper } from '../../components/dashboard/AccountabilityPipelineStepper';
import { MonthlySeverityCharts } from '../../components/dashboard/MonthlySeverityCharts';
import { CategoryAnalyticsTable } from '../../components/dashboard/CategoryAnalyticsTable';
import {
  CheckCircle, Timer, Paperclip, Search, Users, ShieldCheck, FileText, Eye, RefreshCw
} from 'lucide-react';
import { formatDate, formatDuration } from '../../utils/helpers';

export default function ImcDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'analytics' ? 'analytics' : tabParam === 'members' ? 'members' : 'overview';

  const [memberSearch, setMemberSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const dateParams = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  // 1. Fetch authoritative SQL dashboard & analytics stats
  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats', 'imc', dateParams],
    queryFn: () => incidentsApi.getStats(dateParams).then(r => r.data),
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // 2. Fetch recent 5 incidents for Overview tab
  const { data: recentData = [], isLoading: isRecentLoading } = useQuery({
    queryKey: ['incidents', { page: 1, limit: 5, scope: 'imc-recent' }],
    queryFn: () => incidentsApi.list({ page: 1, limit: 5 }).then(r => r.data?.incidents || []),
    enabled: activeTab === 'overview',
    staleTime: 10000,
  });

  // 3. Fetch committee members when on Members tab
  const { data: committeeMembers = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ['committee-members'],
    queryFn: () => authApi.getCommitteeMembers().then(r => r.data),
    enabled: activeTab === 'members',
  });

  const imcOnlyList = useMemo(() => {
    return committeeMembers.filter(m => m.is_imc_member || m.role === 'imc' || m.is_imc_lead);
  }, [committeeMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return imcOnlyList.filter(m =>
      !q ||
      m.full_name?.toLowerCase().includes(q) ||
      m.employee_id?.toLowerCase().includes(q) ||
      m.department?.toLowerCase().includes(q)
    );
  }, [imcOnlyList, memberSearch]);

  if (isStatsLoading || (activeTab === 'overview' && isRecentLoading) || (activeTab === 'members' && isMembersLoading)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  if (isStatsError) {
    return (
      <div className="space-y-4">
        <Alert
          type="error"
          title="Unable to load IMC dashboard"
          message="There was a problem loading incident statistics from the server."
        />
        <button onClick={() => refetchStats()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const totals = stats?.totals || {};
  const dm = stats?.durationMetrics || {};
  const monthly = stats?.monthly || [];
  const bySeverity = stats?.bySeverity || [];
  const categoryAnalytics = stats?.categoryAnalytics || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">
            {activeTab === 'analytics'
              ? 'Category Analytics & Feedback Tracker'
              : activeTab === 'members'
                ? 'IMC Members'
                : 'IMC Dashboard'}
          </h1>
          <p className="page-subtitle">
            Welcome back, Incident Management Committee
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {activeTab !== 'members' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-xs font-bold text-slate-500">From</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent text-xs font-medium outline-none"
                />
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-xs font-bold text-slate-500">To</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent text-xs font-medium outline-none"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-xs font-bold text-indigo-600 hover:underline px-1.5"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const query = new FormData(e.target).get('q');
              if (query) navigate(`/employees?q=${encodeURIComponent(query)}`);
            }}
            className="relative w-full sm:w-64 flex-shrink-0"
          >
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              name="q"
              type="text"
              className="input pl-9 w-full bg-white shadow-sm text-sm"
              placeholder="Search employee…"
            />
          </form>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="space-y-5">
            <IncidentOverviewCards totals={totals} mode="all" showSecondaryPills={true} />
            <AccountabilityPipelineStepper totals={totals} title="Review & Accountability" mgmtLabel="3. Mgmt Feedback" />
          </div>

          {/* Recent Incidents */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-800">Recent Incidents</h3>
              </div>
              <button onClick={() => navigate('/incidents')} className="text-xs text-indigo-600 hover:underline font-semibold">
                View all incidents →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {recentData.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">No incidents yet</div>
              ) : recentData.map(inc => {
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
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {inc.incident_category || inc.incident_type || 'Incident Report'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Reporter: {inc.reporter_name || 'N/A'} · Location: {inc.main_location_name || 'N/A'}{inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''} · {formatDate(inc.incident_date || inc.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/incidents/${encodeURIComponent(inc.id)}`); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-colors flex-shrink-0 border border-indigo-200"
                    >
                      <Eye size={13} /> View
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <MonthlySeverityCharts
            monthly={monthly}
            bySeverity={bySeverity}
            barColor="#4f46e5"
            monthlyTitle="Monthly Trend (All Incidents)"
          />
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              icon={Timer}
              label="Avg Dept Feedback Time"
              value={formatDuration(dm.avgReviewerResponseHours, 'N/A')}
              color="bg-amber-50"
              iconColor="text-amber-700"
              sub="Avg time from report to department feedback"
            />
            <StatCard
              icon={Timer}
              label="Avg IMC Feedback Time"
              value={formatDuration(dm.avgImcResponseHours, 'N/A')}
              color="bg-indigo-50"
              iconColor="text-indigo-700"
              sub="Avg time from prior stage to IMC action"
            />
            <StatCard
              icon={CheckCircle}
              label="Avg Resolution Time"
              value={formatDuration(dm.avgResolutionHours, 'N/A')}
              color="bg-green-50"
              iconColor="text-green-700"
              sub="Avg overall resolution time"
            />
          </div>

          <CategoryAnalyticsTable
            categories={categoryAnalytics}
            title="Category-wise Incident Feedback Tracking"
            detailBasePath="/management/dashboard/category"
          />
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={Users}
              label="Total IMC Committee Members"
              value={imcOnlyList.length}
              color="bg-indigo-50"
              iconColor="text-indigo-600"
            />
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Users size={18} className="text-indigo-600" />
                  <span>IMC Committee Directory</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Directory of all IMC Committee members. Membership and role assignment are exclusively managed by System Administrators.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search name, ID or dept…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs input"
                  />
                </div>
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No members found"
                message="No IMC committee members match your search."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75">
                      <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4">Member Name</th>
                      <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4">Employee ID</th>
                      <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4">Department</th>
                      <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4">Designation</th>
                      <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredMembers.map(m => {
                      const isMe = m.id === user?.id || m.employee_id === user?.employeeId;

                      return (
                        <tr key={m.id} className={`hover:bg-slate-50/75 transition-colors ${isMe ? 'bg-indigo-50/30' : ''}`}>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-xs">
                                {m.full_name?.charAt(0) || 'U'}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-800">{m.full_name}</span>
                                {isMe && <span className="badge bg-indigo-600 text-white font-bold text-[9px]">YOU</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono text-slate-600">{m.employee_id}</td>
                          <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">{m.department || 'N/A'}</td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">{m.designation || 'Member'}</td>
                          <td className="py-3.5 px-4">
                            <span className="badge bg-blue-100 text-blue-800 border border-blue-200 font-semibold text-[11px]">
                              <ShieldCheck size={11} className="mr-1 inline" /> {m.is_imc_lead ? 'IMC Convenor' : 'IMC Member'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
