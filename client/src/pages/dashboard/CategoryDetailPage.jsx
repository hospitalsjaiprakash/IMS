import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import {
  FileText, UserCheck, Clock, ArrowLeft, Eye, Calendar, Layers, RefreshCw
} from 'lucide-react';
import { formatDate, formatDuration, timeAgo } from '../../utils/helpers';
import { Spinner, Alert, SeverityBadge, StatusBadge, Pagination } from '../../components/ui';

export default function CategoryDetailPage() {
  const { categoryName } = useParams();
  const decodedCategory = decodeURIComponent(categoryName || '');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const limit = 20;

  const dateParams = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  // 1. Fetch server-computed category analytics
  const { data: statsData } = useQuery({
    queryKey: ['dashboard-stats', 'category-detail', dateParams],
    queryFn: () => incidentsApi.getStats(dateParams).then(r => r.data),
  });

  // 2. Fetch incidents matching this category via server filter (paginated)
  const {
    data: listData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['incidents', { incidentCategory: decodedCategory, page, limit, ...dateParams }],
    queryFn: () =>
      incidentsApi
        .list({ incidentCategory: decodedCategory, page, limit, ...dateParams })
        .then(r => r.data),
  });

  const getDashboardPath = () => {
    if (user?.role === 'head_management') return '/management/dashboard?tab=analytics';
    if (user?.role === 'imc') return '/imc/dashboard?tab=analytics';
    if (user?.role === 'system_admin') return '/admin/dashboard';
    return '/dashboard';
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Spinner size={32} />
        <p className="text-sm text-slate-500 font-medium">Loading category metrics…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4 p-4">
        <Alert
          type="error"
          title="Unable to load category analysis"
          message="We hit a problem loading incidents for this category."
        />
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const rawIncidents = listData?.incidents || [];
  const activeIncidents = rawIncidents.filter(inc => inc.status !== 'withdrawn');

  // Prefer authoritative server SQL aggregates when available
  const serverRow = (statsData?.categoryAnalytics || []).find(
    c => c.category?.trim().toLowerCase() === decodedCategory.trim().toLowerCase()
  );

  const totalReceived = serverRow ? serverRow.received : activeIncidents.length;
  const feedbackGivenCount = serverRow
    ? serverRow.feedbackGiven
    : activeIncidents.filter(inc => inc.has_hod_feedback || inc.hod_feedback).length;
  const pctFeedback = serverRow
    ? serverRow.pctFeedback
    : (totalReceived > 0 ? Math.round((feedbackGivenCount / totalReceived) * 100) : 0);

  // Compute fallback real timestamp average ONLY from incidents that have both created_at and hod_feedback_at
  const realDeptDurations = activeIncidents
    .filter(inc => inc.hod_feedback_at && inc.created_at)
    .map(inc => Math.max(0, (new Date(inc.hod_feedback_at) - new Date(inc.created_at)) / 3600000));
  const fallbackAvgReviewerHours = realDeptDurations.length > 0
    ? realDeptDurations.reduce((a, b) => a + b, 0) / realDeptDurations.length
    : null;
  const avgReviewerHours = serverRow?.avgReviewerHours ?? fallbackAvgReviewerHours;

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(getDashboardPath())}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg">
              <Layers size={18} />
            </span>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Category Analysis</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{decodedCategory}</h1>
          <p className="text-xs text-slate-500 font-medium">Detailed audit performance and feedback logs for incidents in this category</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-medium outline-none"
            />
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-medium outline-none"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
              className="text-xs font-bold text-indigo-600 hover:underline px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="card p-5 flex items-start gap-4 border border-slate-200/80 hover:shadow-md transition-shadow duration-300">
          <div className="p-3 bg-blue-50 border border-blue-100 text-blue-600 rounded-2xl flex-shrink-0">
            <FileText size={22} />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Received</p>
            <p className="text-2xl font-extrabold text-slate-800">{totalReceived}</p>
            <p className="text-[11px] text-slate-500 font-medium truncate">Incidents reported in this category</p>
          </div>
        </div>

        <div className="card p-5 flex items-start gap-4 border border-slate-200/80 hover:shadow-md transition-shadow duration-300">
          <div className="p-3 bg-green-50 border border-green-100 text-green-600 rounded-2xl flex-shrink-0">
            <UserCheck size={22} />
          </div>
          <div className="space-y-2 min-w-0 flex-1">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dept Feedback Rate</p>
              <p className="text-2xl font-extrabold text-slate-800">
                {feedbackGivenCount} / {totalReceived}{' '}
                <span className="text-sm font-semibold text-slate-500">({pctFeedback}%)</span>
              </p>
            </div>
            {totalReceived > 0 && (
              <div className="w-full h-1.5 bg-slate-100 border border-slate-200/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${pctFeedback === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                  style={{ width: `${pctFeedback}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="card p-5 flex items-start gap-4 border border-slate-200/80 hover:shadow-md transition-shadow duration-300">
          <div className="p-3 bg-amber-50 border border-amber-100 text-amber-600 rounded-2xl flex-shrink-0">
            <Clock size={22} />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Dept Response</p>
            <p className="text-2xl font-extrabold text-slate-800">{formatDuration(avgReviewerHours, 'N/A')}</p>
            <p className="text-[11px] text-slate-500 font-medium truncate">Average time to review incidents</p>
          </div>
        </div>
      </div>

      {/* Incidents List Container */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={15} className="text-indigo-600" />
            Category Incident Log
          </h2>
          <span className="text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-600 rounded px-2.5 py-1">
            {totalReceived} Incident{totalReceived !== 1 ? 's' : ''}
          </span>
        </div>

        {activeIncidents.length === 0 ? (
          <div className="card py-16 text-center border border-dashed border-slate-200 bg-white">
            <p className="text-sm text-slate-400 italic">No active incidents have been logged under this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeIncidents.map(inc => {
              const hasDept = !!(inc.has_hod_feedback || inc.hod_feedback);
              const hasImc = !!(inc.has_imc_feedback || inc.imc_feedback);
              const hasMgmt = !!(inc.has_management_feedback || inc.management_feedback);

              return (
                <div key={inc.id} className="card bg-white rounded-2xl border border-slate-200 p-4 md:p-5 hover:shadow-md transition-all duration-300">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-2.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-green-700 bg-green-50 border border-green-200/50 rounded px-2 py-0.5">{inc.reference_id}</span>
                        {inc.severity && <SeverityBadge severity={inc.severity} />}
                        <StatusBadge status={inc.status} />
                        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                          <Calendar size={12} />
                          Reported: {formatDate(inc.incident_date)}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-800">{inc.incident_type}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed italic">&ldquo;{inc.description}&rdquo;</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
                        <div className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${hasDept ? 'bg-green-50/20 border-green-200/70' : 'bg-red-50/20 border-red-100'}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${hasDept ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className={hasDept ? 'text-green-700' : 'text-red-700'}>Department Feedback</span>
                            </div>
                            <p className={`leading-relaxed italic ${hasDept ? 'text-slate-600' : 'text-slate-400'}`}>
                              {inc.hod_feedback ? `"${inc.hod_feedback}"` : hasDept ? 'Submitted' : 'Awaiting department feedback'}
                            </p>
                          </div>
                          {hasDept && <span className="text-[10px] text-slate-500 self-end">Given</span>}
                        </div>

                        <div className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${hasImc ? 'bg-indigo-50/20 border-indigo-200/70' : 'bg-red-50/20 border-red-100'}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${hasImc ? 'bg-indigo-500' : 'bg-red-500'}`} />
                              <span className={hasImc ? 'text-indigo-700' : 'text-red-700'}>IMC Feedback</span>
                            </div>
                            <p className={`leading-relaxed italic ${hasImc ? 'text-slate-600' : 'text-slate-400'}`}>
                              {inc.imc_feedback ? `"${inc.imc_feedback}"` : hasImc ? 'Submitted' : 'Awaiting feedback from IMC'}
                            </p>
                          </div>
                          {hasImc && <span className="text-[10px] text-slate-500 self-end">Given</span>}
                        </div>

                        <div className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${hasMgmt ? 'bg-purple-50/20 border-purple-200/70' : 'bg-red-50/20 border-red-100'}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${hasMgmt ? 'bg-purple-500' : 'bg-red-500'}`} />
                              <span className={hasMgmt ? 'text-purple-700' : 'text-red-700'}>Management Feedback</span>
                            </div>
                            <p className={`leading-relaxed italic ${hasMgmt ? 'text-slate-600' : 'text-slate-400'}`}>
                              {inc.management_feedback ? `"${inc.management_feedback}"` : hasMgmt ? 'Submitted' : 'Awaiting resolution'}
                            </p>
                          </div>
                          {hasMgmt && <span className="text-[10px] text-slate-500 self-end">Given</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex lg:flex-col items-center lg:items-end justify-between lg:justify-start gap-2.5 flex-shrink-0 self-stretch lg:self-auto lg:border-l lg:border-slate-100 lg:pl-5">
                      <span className="text-[10px] text-slate-400">{timeAgo(inc.created_at)}</span>
                      <button
                        onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                        className="flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-sm flex-shrink-0"
                      >
                        <Eye size={13} /> View Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination page={page} totalPages={listData?.totalPages || 1} onPageChange={setPage} />
      </div>
    </div>
  );
}
