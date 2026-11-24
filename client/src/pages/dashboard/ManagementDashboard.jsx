import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { StatCard, Spinner, Alert, Tabs, SeverityBadge, StatusBadge } from '../../components/ui';
import { IncidentOverviewCards } from '../../components/dashboard/IncidentOverviewCards';
import { AccountabilityPipelineStepper } from '../../components/dashboard/AccountabilityPipelineStepper';
import { MonthlySeverityCharts } from '../../components/dashboard/MonthlySeverityCharts';
import { CategoryAnalyticsTable } from '../../components/dashboard/CategoryAnalyticsTable';
import {
  FileText, Clock, MessageSquare, ShieldAlert, Paperclip,
  BarChart3, Timer, CheckCircle, CheckSquare, XCircle, Eye,
  LayoutDashboard, ShieldCheck, Mail, RefreshCw
} from 'lucide-react';
import { Search } from 'lucide-react';
import { formatDate, formatDuration, timeAgo } from '../../utils/helpers';

export default function ManagementDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'analytics' ? 'analytics' : 'overview';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const dateParams = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const handleTabChange = (tab) => {
    setSearchParams({ tab });
  };

  // 1. Authoritative SQL dashboard stats
  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats', 'management', dateParams],
    queryFn: () => incidentsApi.getStats(dateParams).then(r => r.data),
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const totals = stats?.totals || {};
  const needLettersCount = totals.pendingLettersApproval || 0;
  const needDecisionsCount = totals.pendingMgmtDecisions || 0;

  // 2. Fetch pending action queues only when needed on Overview tab
  const { data: pendingLettersApproval = [] } = useQuery({
    queryKey: ['incidents', { status: 'pending_management_letter_approval', limit: 20 }],
    queryFn: () => incidentsApi.list({ status: 'pending_management_letter_approval', limit: 20 }).then(r => r.data?.incidents || []),
    enabled: activeTab === 'overview' && needLettersCount > 0,
    staleTime: 10000,
  });

  const { data: pendingMgmtDecisions = [] } = useQuery({
    queryKey: ['incidents', { status: 'with_head_management', limit: 20 }],
    queryFn: () => incidentsApi.list({ status: 'with_head_management', limit: 20 }).then(r => r.data?.incidents || []),
    enabled: activeTab === 'overview' && needDecisionsCount > 0,
    staleTime: 10000,
  });

  // 3. Recent 5 incidents for Overview
  const { data: recentIncidents = [] } = useQuery({
    queryKey: ['incidents', { page: 1, limit: 5, scope: 'mgmt-recent' }],
    queryFn: () => incidentsApi.list({ page: 1, limit: 5 }).then(r => r.data?.incidents || []),
    enabled: activeTab === 'overview',
    staleTime: 10000,
  });

  // 4. Analytics tab IMC feedback tracker queries (paginated, lightweight)
  const { data: imcGivenData } = useQuery({
    queryKey: ['incidents', { reviewStage: 'imcGiven', limit: 25 }],
    queryFn: () => incidentsApi.list({ reviewStage: 'imcGiven', limit: 25 }).then(r => r.data),
    enabled: activeTab === 'analytics',
    staleTime: 10000,
  });

  const { data: imcPendingData } = useQuery({
    queryKey: ['incidents', { reviewStage: 'imcPending', limit: 5 }],
    queryFn: () => incidentsApi.list({ reviewStage: 'imcPending', limit: 5 }).then(r => r.data),
    enabled: activeTab === 'analytics',
    staleTime: 10000,
  });

  if (isStatsLoading) {
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
          title="Unable to load management dashboard"
          message="There was a problem loading executive analytics from the server."
        />
        <button onClick={() => refetchStats()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const dm = stats?.durationMetrics || {};
  const bySeverity = stats?.bySeverity || [];
  const monthly = stats?.monthly || [];
  const categoryAnalytics = stats?.categoryAnalytics || [];

  const imcGivenList = imcGivenData?.incidents || [];
  const imcPendingList = imcPendingData?.incidents || [];
  const imcGivenCount = totals.imcGiven || 0;
  const imcPendingCount = totals.imcPending || 0;
  const imcTotalScope = imcGivenCount + imcPendingCount;
  const imcPct = imcTotalScope > 0 ? Math.round((imcGivenCount / imcTotalScope) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">
            {activeTab === 'analytics' ? 'Category Analytics & Feedback Tracker' : 'Management Dashboard'}
          </h1>
          <p className="page-subtitle">
            Welcome back, {user?.fullName?.split(' ')[0]} · {user?.department || 'MD Office'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
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

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200">
        <Tabs
          tabs={[
            { id: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
            { id: 'analytics', label: 'Category Analytics & Feedback Tracker', icon: BarChart3 },
          ]}
          active={activeTab}
          onChange={handleTabChange}
        />
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="space-y-5">
            <IncidentOverviewCards totals={totals} mode="all" showSecondaryPills={true} />
          </div>

          {/* Executive Action Center */}
          {(pendingLettersApproval.length > 0 || pendingMgmtDecisions.length > 0) && (
            <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-amber-50 border-2 border-indigo-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                    <ShieldAlert size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                      Action Required by Executive Management
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-sm">
                        {needLettersCount + needDecisionsCount} Action{(needLettersCount + needDecisionsCount) !== 1 ? 's' : ''} Needed
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      The incidents below are awaiting your formal review, letter authorization, or sanction decisions.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {needLettersCount > 0 && (
                    <button
                      onClick={() => navigate('/incidents', { state: { status: 'pending_management_letter_approval' } })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 transition-colors cursor-pointer shadow-sm"
                    >
                      <Mail size={13} className="text-purple-700" /> {needLettersCount} Letter Approval{needLettersCount !== 1 ? 's' : ''}
                    </button>
                  )}
                  {needDecisionsCount > 0 && (
                    <button
                      onClick={() => navigate('/incidents', { state: { status: 'with_head_management' } })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition-colors cursor-pointer shadow-sm"
                    >
                      <Clock size={13} className="text-amber-700" /> {needDecisionsCount} Decision{needDecisionsCount !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>

              {pendingLettersApproval.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <Mail size={14} className="text-purple-600" />
                      Letters Forwarded by IMC — Awaiting Approval & Dispatch ({needLettersCount})
                    </span>
                    <button
                      onClick={() => navigate('/incidents', { state: { status: 'pending_management_letter_approval' } })}
                      className="text-purple-700 hover:text-purple-900 hover:underline font-semibold text-[11px]"
                    >
                      View in Incidents List →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingLettersApproval.map(inc => (
                      <div
                        key={inc.id}
                        onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                        className="bg-white border-2 border-purple-200 hover:border-purple-400 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                {inc.reference_id}
                              </span>
                              {inc.severity && <SeverityBadge severity={inc.severity} className="text-[10px]" />}
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">{timeAgo(inc.updated_at || inc.created_at)}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-purple-700 transition-colors">
                            {inc.incident_type}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                            Category: {inc.incident_category || 'General'} · Reporter: {inc.reporter_name || 'N/A'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-[11px] font-semibold text-purple-700 flex items-center gap-1">
                            <ShieldCheck size={13} className="text-purple-600" /> Letter drafts ready for dispatch
                          </span>
                          <span className="btn-primary btn-sm text-[11px] py-1 px-2.5 bg-purple-600 hover:bg-purple-700 flex items-center gap-1 shadow-sm">
                            Review & Approve →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingMgmtDecisions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <Clock size={14} className="text-amber-600" />
                      IMC Reviewed — Awaiting Executive Decisions ({needDecisionsCount})
                    </span>
                    <button
                      onClick={() => navigate('/incidents', { state: { status: 'with_head_management' } })}
                      className="text-amber-700 hover:text-amber-900 hover:underline font-semibold text-[11px]"
                    >
                      View in Incidents List →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingMgmtDecisions.map(inc => (
                      <div
                        key={inc.id}
                        onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                        className="bg-white border-2 border-amber-200 hover:border-amber-400 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {inc.reference_id}
                              </span>
                              {inc.severity && <SeverityBadge severity={inc.severity} className="text-[10px]" />}
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">{timeAgo(inc.updated_at || inc.created_at)}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-amber-700 transition-colors">
                            {inc.incident_type}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                            Category: {inc.incident_category || 'General'} · Reporter: {inc.reporter_name || 'N/A'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                            <Clock size={13} className="text-amber-600" /> Findings submitted by IMC
                          </span>
                          <span className="btn-primary btn-sm text-[11px] py-1 px-2.5 bg-amber-600 hover:bg-amber-700 flex items-center gap-1 shadow-sm">
                            Provide Decision →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <AccountabilityPipelineStepper
            totals={totals}
            title="Review & Accountability Pipeline"
            mgmtLabel="3. Mgmt Review & Letter Approval"
          />

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
              {recentIncidents.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">No incidents yet</div>
              ) : recentIncidents.map(inc => {
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
            barColor="#7c3aed"
            monthlyTitle="Monthly Incident Trend"
          />

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => navigate('/incidents')} className="card p-4 text-left hover:shadow-md transition-shadow group">
              <FileText size={20} className="text-purple-600 mb-2" />
              <p className="text-sm font-semibold text-slate-800">All Incidents</p>
              <p className="text-xs text-slate-500 mt-0.5">Browse and filter hospital-wide incidents</p>
            </button>
            <button onClick={() => handleTabChange('analytics')} className="card p-4 text-left hover:shadow-md transition-shadow">
              <BarChart3 size={20} className="text-green-700 mb-2" />
              <p className="text-sm font-semibold text-slate-800">Analytics</p>
              <p className="text-xs text-slate-500 mt-0.5">Category reports and SLA tracking</p>
            </button>
          </div>
        </div>
      )}

      {/* ANALYTICS & FEEDBACK TRACKER TAB */}
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

          {/* IMC Feedback Summary Section */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MessageSquare size={16} className="text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">IMC Feedback Status</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center bg-indigo-50 border-4 border-indigo-200">
                  <span className="text-indigo-700 font-bold text-sm">{imcPct}%</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">IMC Feedback Completion</p>
                  <p className="text-xl font-bold text-slate-800">
                    {imcGivenCount} <span className="text-sm font-normal text-slate-400">/ {imcTotalScope}</span>
                  </p>
                  <div className="w-28 h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${imcPct}%` }} />
                  </div>
                </div>
              </div>
              <StatCard icon={CheckSquare} label="IMC Feedback Given" value={imcGivenCount} color="bg-green-50/50" iconColor="text-green-600" />
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <XCircle size={16} className="text-red-500" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">IMC Feedback Pending</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{imcPendingCount}</p>
                {imcPendingList.length > 0 && (
                  <div className="space-y-1 mt-1 max-h-24 overflow-y-auto">
                    {imcPendingList.slice(0, 3).map(inc => (
                      <div
                        key={inc.id}
                        onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                        className="flex items-center justify-between text-[11px] text-slate-600 hover:text-indigo-600 cursor-pointer group"
                      >
                        <span className="font-mono text-green-700">{inc.reference_id}</span>
                        {inc.severity && <SeverityBadge severity={inc.severity} className="px-1.5 py-0.5 text-[9px]" />}
                      </div>
                    ))}
                    {imcPendingCount > 3 && <p className="text-[9px] text-slate-400">+{imcPendingCount - 3} more…</p>}
                  </div>
                )}
              </div>
            </div>

            {imcGivenList.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mt-3 bg-white">
                <div className="px-4 py-2.5 bg-indigo-50/40 border-b border-indigo-100/60 flex items-center gap-2">
                  <CheckSquare size={13} className="text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-700">Recent IMC Feedback Given</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {imcGivenList.map(inc => (
                    <div
                      key={inc.id}
                      onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                      className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono text-xs font-bold text-green-700">{inc.reference_id}</span>
                          {inc.severity && <SeverityBadge severity={inc.severity} className="py-0 px-1 text-[9px]" />}
                        </div>
                        <p className="text-xs text-slate-500 italic line-clamp-1">&ldquo;{inc.imc_feedback}&rdquo;</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/incidents/${encodeURIComponent(inc.id)}`);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Eye size={11} /> View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <CategoryAnalyticsTable
            categories={categoryAnalytics}
            title="Category-wise Incident Analytics"
            detailBasePath="/management/dashboard/category"
          />
        </div>
      )}
    </div>
  );
}
