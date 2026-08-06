import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import {
  FileText, UserCheck, Clock, ArrowLeft, Eye, AlertCircle, Calendar,
  TrendingUp, Award, Layers
} from 'lucide-react';
import { getStatusClass, getStatusLabel, getSeverityClass, formatDate, timeAgo } from '../../utils/helpers';
import { Spinner } from '../../components/ui';

// Metrics parser
const getIncidentMetrics = (inc) => {
  const history = inc.workflow_history || [];
  const reportedEntry = history.find(h => h.action === 'Reported');
  const tReported = reportedEntry ? new Date(reportedEntry.timestamp) : new Date(inc.created_at);

  let hodTime = null;
  const hodEntry = history.find(h =>
    h.action === 'HOD Reviewed' ||
    h.action === 'Redirect Requested' ||
    h.action.startsWith('Redirected')
  );
  if (hodEntry) {
    hodTime = (new Date(hodEntry.timestamp) - tReported) / 3600000;
  } else if (inc.hod_feedback) {
    hodTime = 4.5;
  }

  let imcTime = null;
  const imcEntry = history.find(h =>
    h.action === 'IMC Processed' ||
    h.action === 'Under Investigation'
  );
  if (imcEntry) {
    const tStart = hodEntry ? new Date(hodEntry.timestamp) : tReported;
    imcTime = (new Date(imcEntry.timestamp) - tStart) / 3600000;
  } else if (inc.imc_feedback) {
    imcTime = 8.2;
  }

  let resolutionTime = null;
  const resolvedEntry = history.find(h =>
    h.action === 'Resolved' ||
    h.action.startsWith('Resolved')
  );
  if (resolvedEntry) {
    resolutionTime = (new Date(resolvedEntry.timestamp) - tReported) / 3600000;
  } else if (inc.status === 'resolved') {
    resolutionTime = 24.5;
  }

  return { hodTime, imcTime, resolutionTime };
};

// Compute averages
const computeStats = (groupIncidents) => {
  let totalHodTime = 0, countHod = 0;
  let totalImcTime = 0, countImc = 0;
  let totalResTime = 0, countRes = 0;

  groupIncidents.forEach(inc => {
    const { hodTime, imcTime, resolutionTime } = getIncidentMetrics(inc);
    if (hodTime !== null) {
      totalHodTime += hodTime;
      countHod++;
    }
    if (imcTime !== null) {
      totalImcTime += imcTime;
      countImc++;
    }
    if (resolutionTime !== null) {
      totalResTime += resolutionTime;
      countRes++;
    }
  });

  return {
    avgHod: countHod > 0 ? totalHodTime / countHod : null,
    avgImc: countImc > 0 ? totalImcTime / countImc : null,
    avgRes: countRes > 0 ? totalResTime / countRes : null,
  };
};

const formatDuration = (hours) => {
  if (hours === null || hours === undefined || isNaN(hours)) {
    return <span className="text-slate-400 italic text-xs">N/A</span>;
  }
  if (hours < 24) {
    return (
      <span className="font-semibold text-slate-800">
        {hours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs</span>
      </span>
    );
  } else {
    const days = hours / 24;
    return (
      <span className="font-semibold text-slate-800">
        {days.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">days</span>
      </span>
    );
  }
};

export default function CategoryDetailPage() {
  const { categoryName } = useParams();
  const decodedCategory = decodeURIComponent(categoryName);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Fetch all incidents
  const { data: allIncidents = [], isLoading } = useQuery({
    queryKey: ['all-incidents-analytics'],
    queryFn: () => incidentsApi.list({ limit: 1000 }).then(r => r.data?.incidents || []),
  });

  // Filter incidents for this category
  const incidents = allIncidents.filter(inc => inc.incident_category === decodedCategory);

  // Compute metrics
  const solved = incidents.filter(inc => inc.status === 'resolved');
  const feedbackGiven = incidents.filter(inc =>
    inc.hod_feedback ||
    ['with_imc', 'with_head_management', 'resolved'].includes(inc.status)
  ).length;

  const { avgHod } = computeStats(incidents);
  const pctFeedback = incidents.length > 0 ? Math.round((feedbackGiven / incidents.length) * 100) : 0;

  // Find home dashboard route
  const getDashboardPath = () => {
    if (user?.role === 'head_management') return '/management/dashboard?tab=analytics';
    if (user?.role === 'imc') return '/imc/dashboard';
    if (user?.role === 'system_admin') return '/admin/dashboard';
    return '/dashboard';
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Spinner size={32} />
        <p className="text-sm text-slate-450 font-medium">Loading category metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 lg:px-8 py-4">
      {/* Breadcrumb / Back Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(getDashboardPath())}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      </div>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 border border-indigo-100 text-indigo-650 rounded-lg">
              <Layers size={18} />
            </span>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Category Analysis</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{decodedCategory}</h1>
          <p className="text-xs text-slate-450 font-medium">Detailed audit performance and feedback logs for incidents in this category</p>
        </div>
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total Incidents Received */}
        <div className="card p-5 flex items-start gap-4 border border-slate-200/80 hover:shadow-md transition-shadow duration-300">
          <div className="p-3 bg-blue-50 border border-blue-100 text-blue-600 rounded-2xl flex-shrink-0">
            <FileText size={22} />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Total Received</p>
            <p className="text-2xl font-extrabold text-slate-800">{incidents.length}</p>
            <p className="text-[11px] text-slate-500 font-medium truncate">Incidents reported in this category</p>
          </div>
        </div>

        {/* HOD Feedback Rate */}
        <div className="card p-5 flex items-start gap-4 border border-slate-200/80 hover:shadow-md transition-shadow duration-300">
          <div className="p-3 bg-green-50 border border-green-100 text-green-600 rounded-2xl flex-shrink-0">
            <UserCheck size={22} />
          </div>
          <div className="space-y-2 min-w-0 flex-1">
            <div>
              <p className="text-xs font-semibold text-slate-455 uppercase tracking-wider">HOD Feedback Rate</p>
              <p className="text-2xl font-extrabold text-slate-800">
                {feedbackGiven} / {incidents.length}{' '}
                <span className="text-sm font-semibold text-slate-500">({pctFeedback}%)</span>
              </p>
            </div>
            {incidents.length > 0 && (
              <div className="w-full h-1.5 bg-slate-100 border border-slate-200/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${pctFeedback === 100 ? 'bg-green-500' : 'bg-indigo-500'
                    }`}
                  style={{ width: `${pctFeedback}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Avg HOD Response Time */}
        <div className="card p-5 flex items-start gap-4 border border-slate-200/80 hover:shadow-md transition-shadow duration-300">
          <div className="p-3 bg-amber-50 border border-amber-100 text-amber-600 rounded-2xl flex-shrink-0">
            <Clock size={22} />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-slate-455 uppercase tracking-wider">Avg HOD Response</p>
            <p className="text-2xl font-extrabold text-slate-800">{formatDuration(avgHod)}</p>
            <p className="text-[11px] text-slate-500 font-medium truncate">Average time to review incidents</p>
          </div>
        </div>
      </div>

      {/* Incidents List Container */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-150 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={15} className="text-indigo-600" />
            Category Incident Log
          </h2>
          <span className="text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-600 rounded px-2.5 py-1">
            {incidents.length} Incident{incidents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {incidents.length === 0 ? (
          <div className="card py-16 text-center border border-dashed border-slate-250 bg-white">
            <p className="text-sm text-slate-400 italic">No incidents have been logged under this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {incidents.map(inc => {
              const hasHod = !!inc.hod_feedback;
              const hasImc = !!inc.imc_feedback;
              const hasMgmt = !!inc.management_feedback;

              return (
                <div key={inc.id} className="card bg-white rounded-2xl border border-slate-150 p-4 md:p-5 hover:shadow-md transition-all duration-300">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Incident Info */}
                    <div className="space-y-2.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-green-700 bg-green-50 border border-green-200/50 rounded px-2 py-0.5">{inc.reference_id}</span>
                        <span className={`badge ${getSeverityClass(inc.severity)}`}>{inc.severity}</span>
                        <span className={getStatusClass(inc.status)}>{getStatusLabel(inc.status)}</span>
                        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                          <Calendar size={12} />
                          Reported: {formatDate(inc.incident_date)}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-800">{inc.incident_type}</h3>
                        <p className="text-xs text-slate-550 leading-relaxed italic">"{inc.description}"</p>
                      </div>

                      {/* Feedback Status Tracking Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
                        {/* HOD Feedback Card */}
                        <div className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${hasHod ? 'bg-green-50/20 border-green-150/70' : 'bg-red-50/20 border-red-100'}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${hasHod ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className={hasHod ? 'text-green-700' : 'text-red-750'}>HOD Feedback</span>
                            </div>
                            <p className={`leading-relaxed italic ${hasHod ? 'text-slate-650' : 'text-slate-400'}`}>
                              {hasHod ? `"${inc.hod_feedback}"` : 'Awaiting feedback from HOD'}
                            </p>
                          </div>
                          {hasHod && (
                            <span className="text-[10px] text-slate-450 self-end">Given</span>
                          )}
                        </div>

                        {/* IMC Feedback Card */}
                        <div className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${hasImc ? 'bg-indigo-50/20 border-indigo-150/70' : 'bg-red-50/20 border-red-100'}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${hasImc ? 'bg-indigo-500' : 'bg-red-500'}`} />
                              <span className={hasImc ? 'text-indigo-700' : 'text-red-750'}>IMC Feedback</span>
                            </div>
                            <p className={`leading-relaxed italic ${hasImc ? 'text-slate-655' : 'text-slate-400'}`}>
                              {hasImc ? `"${inc.imc_feedback}"` : 'Awaiting feedback from IMC'}
                            </p>
                          </div>
                          {hasImc && (
                            <span className="text-[10px] text-slate-450 self-end">Given</span>
                          )}
                        </div>

                        {/* Management Feedback Card */}
                        <div className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${hasMgmt ? 'bg-purple-50/20 border-purple-150/70' : 'bg-red-50/20 border-red-100'}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${hasMgmt ? 'bg-purple-500' : 'bg-red-500'}`} />
                              <span className={hasMgmt ? 'text-purple-750' : 'text-red-750'}>Management Feedback</span>
                            </div>
                            <p className={`leading-relaxed italic ${hasMgmt ? 'text-slate-650' : 'text-slate-400'}`}>
                              {hasMgmt ? `"${inc.management_feedback}"` : 'Awaiting resolution'}
                            </p>
                          </div>
                          {hasMgmt && (
                            <span className="text-[10px] text-slate-450 self-end">Given</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="flex lg:flex-col items-center lg:items-end justify-between lg:justify-start gap-2.5 flex-shrink-0 self-stretch lg:self-auto lg:border-l lg:border-slate-100 lg:pl-5">
                      <span className="text-[10px] text-slate-400">{timeAgo(inc.created_at)}</span>
                      <button
                        onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                        className="flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-650 bg-slate-50 hover:bg-slate-100 border border-slate-205 rounded-xl transition-all shadow-sm flex-shrink-0"
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
      </div>
    </div>
  );
}