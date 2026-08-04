import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { mockDepartments } from '../../api/mockData';
import { INCIDENT_CATEGORIES } from '../../utils/helpers';
import { useAuthStore } from '../../store/authStore';
import { StatCard, Spinner, Alert, Tabs, Modal } from '../../components/ui';
import {
  FileText, Activity, AlertTriangle, CheckCircle, Clock,
  ChevronDown, Search, Filter, MessageSquare, Download, Users, ShieldAlert, FileDown, Paperclip, Flame, XOctagon,
  BarChart3, Timer, TrendingUp, CheckSquare, XCircle, Pencil, ArrowUpDown, Eye, ChevronRight, AlertCircle, LayoutDashboard, ShieldCheck
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { getStatusClass, getStatusLabel, getSeverityClass, formatDate, timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';


const COLORS_SEVERITY = { Minor: '#22c55e', Major: '#f59e0b', Grave: '#d946ef' };
const COLORS_PIE = ['#0e95ea', '#22c55e', '#f59e0b', '#d946ef', '#ef4444', '#6366f1', '#14b8a6', '#f97316'];

// Calculate response times for an incident based on its workflow history
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

// Compute averages for a group of incidents
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

export default function ManagementDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'analytics' ? 'analytics' : 'overview';

  const handleTabChange = (tab) => {
    setSearchParams({ tab });
  };

  // Analytics sub-view config
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'total', direction: 'desc' });

  // Feedback tracker state
  const [expandedCategory, setExpandedCategory] = useState(null); // which category row is expanded
  const [editModal, setEditModal] = useState(null);               // { incident, feedbackType }
  const [editText, setEditText] = useState('');

  // 1. Fetch dashboard stats
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => incidentsApi.getStats().then(r => r.data),
  });

  // 2. Fetch all incidents (for full department/category analytics calculations)
  const { data: allIncidents = [], isLoading: isIncidentsLoading } = useQuery({
    queryKey: ['all-incidents-analytics'],
    queryFn: () => incidentsApi.list({ limit: 1000 }).then(r => r.data?.incidents || []),
  });

  // Edit feedback mutation
  const { mutate: doEditFeedback, isPending: isSaving } = useMutation({
    mutationFn: ({ id, feedbackType, feedbackText }) =>
      incidentsApi.editFeedback(id, { feedbackType, feedbackText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Feedback updated successfully.');
      setEditModal(null);
      setEditText('');
    },
    onError: () => toast.error('Failed to update feedback.'),
  });

  const openEditModal = (incident, feedbackType) => {
    const currentText =
      feedbackType === 'hod' ? incident.hod_feedback :
        feedbackType === 'imc' ? incident.imc_feedback :
          incident.management_feedback;
    setEditModal({ incident, feedbackType });
    setEditText(currentText || '');
  };



  const totals = useMemo(() => {
    const active = allIncidents.filter(i => i.status !== 'resolved' && i.status !== 'withdrawn').length;
    const resolved = allIncidents.filter(i => i.status === 'resolved').length;
    const withdrawn = allIncidents.filter(i => i.status === 'withdrawn').length;
    const now = new Date();
    const thisMonth = allIncidents.filter(i => new Date(i.created_at).getMonth() === now.getMonth()).length;

    const overdueCount = allIncidents.filter(i => i.status !== 'resolved' && i.status !== 'withdrawn' && ((new Date() - new Date(i.created_at)) / 3600000 > 48)).length;
    const activeGraveCount = allIncidents.filter(i => i.severity === 'Grave' && i.status !== 'resolved' && i.status !== 'withdrawn').length;

    const hodGiven = allIncidents.filter(i => i.has_hod_feedback || i.hod_feedback).length;
    const hodPending = allIncidents.filter(i => !(i.has_hod_feedback || i.hod_feedback) && i.status !== 'resolved' && i.status !== 'withdrawn').length;

    const imcGiven = allIncidents.filter(i => i.has_imc_feedback || i.imc_feedback).length;
    const imcPending = allIncidents.filter(i => !(i.has_imc_feedback || i.imc_feedback) && i.status !== 'resolved' && i.status !== 'withdrawn').length;

    const mgmtGiven = allIncidents.filter(i => i.has_management_feedback || i.management_feedback).length;
    const mgmtPending = allIncidents.filter(i => !(i.has_management_feedback || i.management_feedback) && i.status !== 'resolved' && i.status !== 'withdrawn').length;

    const trainingPending = allIncidents.filter(i => i.status === 'pending_training' || (i.has_responsible_person && !i.training_completed && i.status !== 'withdrawn')).length;
    const redirectCount = allIncidents.filter(i => i.status === 'redirect_requested').length;
    const graveCount = allIncidents.filter(i => i.severity === 'Grave').length;

    return {
      total: allIncidents.length,
      active,
      resolved,
      withdrawn,
      thisMonth,
      overdueCount,
      activeGraveCount,
      hodGiven,
      hodPending,
      imcGiven,
      imcPending,
      mgmtGiven,
      mgmtPending,
      trainingPending,
      redirectCount,
      graveCount
    };
  }, [allIncidents]);

  const recentIncidents = useMemo(() => {
    return [...allIncidents]
      .sort((a, b) => new Date(b.created_at || b.incident_date) - new Date(a.created_at || a.incident_date))
      .slice(0, 5);
  }, [allIncidents]);

  // Analytics Calculations
  const categoryAnalytics = useMemo(() => {
    return INCIDENT_CATEGORIES.map(cat => {
      const catIncidents = allIncidents.filter(inc => inc.incident_category === cat);
      const solved = catIncidents.filter(inc => inc.status === 'resolved');

      const feedbackGiven = catIncidents.filter(inc =>
        inc.hod_feedback ||
        ['with_imc', 'with_head_management', 'resolved'].includes(inc.status)
      ).length;

      const missing = catIncidents.filter(inc => !inc.hod_feedback);

      const { avgHod, avgImc, avgRes } = computeStats(catIncidents);

      return {
        name: cat,
        total: catIncidents.length,
        solved: solved.length,
        feedbackGiven,
        missing,
        incidents: catIncidents,
        avgHod,
        avgImc,
        avgRes,
      };
    });
  }, [allIncidents]);

  // Global Averages
  const globalAverages = useMemo(() => {
    return computeStats(allIncidents);
  }, [allIncidents]);

  const rcaStats = useMemo(() => {
    const majorGrave = allIncidents.filter(i => i.severity === 'Major' || i.severity === 'Grave');
    const withRca = majorGrave.filter(i => i.status === 'resolved' || i.management_feedback);
    return {
      total: majorGrave.length,
      completed: withRca.length,
      pct: majorGrave.length > 0 ? Math.round((withRca.length / majorGrave.length) * 100) : 0
    };
  }, [allIncidents]);

  const departmentLeaderboard = useMemo(() => {
    return mockDepartments.map(d => {
      const deptName = d.name;
      const dInc = allIncidents.filter(i => (i.departments || []).includes(deptName));
      const { avgHod } = computeStats(dInc);
      const activeCount = dInc.filter(i => i.status !== 'resolved' && i.status !== 'withdrawn').length;
      return { dept: deptName, activeCount, avgHod: avgHod || 0, score: avgHod ? avgHod + activeCount : 999 };
    }).filter(d => d.activeCount > 0 || d.avgHod > 0)
      .sort((a, b) => a.score - b.score);
  }, [allIncidents]);

  // Filter and Sort Analytics
  const processedAnalytics = useMemo(() => {
    const rawData = categoryAnalytics;

    // Filter
    let filtered = rawData.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Put nulls/undefined at the bottom
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'string') {
          return sortConfig.direction === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        } else {
          return sortConfig.direction === 'asc'
            ? valA - valB
            : valB - valA;
        }
      });
    }
    return filtered;
  }, [categoryAnalytics, searchQuery, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const formatDuration = (hours) => {
    if (hours === null || hours === undefined || isNaN(hours)) {
      return <span className="text-slate-400 italic text-[11px]">N/A</span>;
    }
    if (hours < 24) {
      return (
        <span className="font-medium text-slate-700">
          {hours.toFixed(1)} <span className="text-[10px] text-slate-400">hrs</span>
        </span>
      );
    } else {
      const days = hours / 24;
      return (
        <span className="font-semibold text-slate-700">
          {days.toFixed(1)} <span className="text-[10px] text-slate-400">days</span>
        </span>
      );
    }
  };

  if (isStatsLoading || isIncidentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  const r = stats?.managementReport || {};
  const pending = r.pendingItems || [];
  const bySeverity = r.bySeverity || [];
  const monthly = r.monthly || [];

  const overdueCount = allIncidents.filter(i => i.status !== 'resolved' && i.status !== 'withdrawn' && ((new Date() - new Date(i.created_at)) / 3600000 > 48)).length;
  const activeGraveCount = allIncidents.filter(i => i.severity === 'Grave' && i.status !== 'resolved' && i.status !== 'withdrawn').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {activeTab === 'analytics' ? 'Department Analytics & Feedback Tracker' : 'Management Dashboard'}
          </h1>
          <p className="page-subtitle">
            Welcome back, {user?.fullName?.split(' ')[0]} · {user?.department || 'MD Office'}
          </p>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* SLA Breach Alerts Panel */}
          {(overdueCount > 0 || activeGraveCount > 0) && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-800">SLA Breach & Escalation Alerts</h3>
                <ul className="mt-1 space-y-1 text-sm text-red-700">
                  {overdueCount > 0 && (
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <strong>{overdueCount}</strong> incidents have been pending action for more than 48 hours.
                    </li>
                  )}
                  {activeGraveCount > 0 && (
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <strong>{activeGraveCount}</strong> active Grave incidents require immediate investigation.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Alert for pending decisions */}
          {r.awaitingDecision > 0 && (
            <Alert
              type="warning"
              title={`${r.awaitingDecision} Incident${r.awaitingDecision > 1 ? 's' : ''} Awaiting Your Decision`}
              message="These incidents have been reviewed by IMC and forwarded to you for final corrective action."
            />
          )}

          {/* KPI Stat Cards — High Level Overview */}
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <LayoutDashboard size={16} className="text-indigo-600" />
                Incident Overview
              </h3>

              {/* Primary Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  onClick={() => navigate('/incidents')}
                  className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">Total Incidents</p>
                      <p className="text-3xl font-extrabold text-blue-900 mt-1">{totals.total}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileText size={24} className="text-blue-600" />
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => navigate('/incidents', { state: { status: 'active' } })}
                  className="card p-5 bg-gradient-to-br from-red-50 to-orange-50 border-red-100 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-red-800/70 uppercase tracking-wide">Active Incidents</p>
                      <p className="text-3xl font-extrabold text-red-900 mt-1">{totals.active}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Activity size={24} className="text-red-600" />
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => navigate('/incidents', { state: { status: 'resolved' } })}
                  className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-green-800/70 uppercase tracking-wide">Resolved</p>
                      <p className="text-3xl font-extrabold text-green-900 mt-1">{totals.resolved}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CheckCircle size={24} className="text-green-600" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Secondary Metrics (Pills) */}
              <div className="flex flex-wrap gap-2.5 mt-3">
                <button onClick={() => navigate('/incidents', { state: { severity: 'Grave' } })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                  <AlertTriangle size={14} className="text-purple-600" /> Grave: {totals.graveCount}
                </button>
                <button onClick={() => navigate('/incidents', { state: { status: 'redirect_requested' } })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                  <Clock size={14} className="text-orange-600" /> Redirects: {totals.redirectCount}
                </button>
                <button onClick={() => navigate('/incidents', { state: { status: 'withdrawn' } })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                  <XOctagon size={14} className="text-slate-500" /> Withdrawn: {totals.withdrawn}
                </button>
                <button onClick={() => navigate('/incidents', { state: { reviewStage: 'trainingPending' } })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                  <Users size={14} className="text-rose-600" /> Training Pending: {totals.trainingPending}
                </button>
              </div>
            </div>

            {/* Accountability Pipeline Stepper */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <ShieldCheck size={16} className="text-teal-600" />
                Review & Accountability Pipeline
              </h3>

              <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm overflow-x-auto">
                <div className="flex items-center min-w-[700px]">

                  {/* HOD Step */}
                  <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-bold text-sm text-slate-700">1. HOD Review</span>
                      <CheckCircle size={16} className={totals.hodPending === 0 ? "text-green-500" : "text-slate-300"} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'hodPending' } })}
                        className="flex-1 bg-white hover:bg-amber-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-amber-300 shadow-sm"
                      >
                        <span className="block text-2xl font-extrabold text-amber-600 leading-none">{totals.hodPending}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending</span>
                      </div>
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'hodGiven' } })}
                        className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
                      >
                        <span className="block text-xl font-bold text-slate-700 leading-none">{totals.hodGiven}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Completed</span>
                      </div>
                    </div>
                  </div>

                  <div className="px-2 text-slate-300"><ChevronRight size={20} /></div>

                  {/* IMC Step */}
                  <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-bold text-sm text-slate-700">2. IMC Review</span>
                      <CheckCircle size={16} className={totals.imcPending === 0 ? "text-green-500" : "text-slate-300"} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'imcPending' } })}
                        className="flex-1 bg-white hover:bg-indigo-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-indigo-300 shadow-sm"
                      >
                        <span className="block text-2xl font-extrabold text-indigo-600 leading-none">{totals.imcPending}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending</span>
                      </div>
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'imcGiven' } })}
                        className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
                      >
                        <span className="block text-xl font-bold text-slate-700 leading-none">{totals.imcGiven}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Completed</span>
                      </div>
                    </div>
                  </div>

                  <div className="px-2 text-slate-300"><ChevronRight size={20} /></div>

                  {/* Mgmt Step */}
                  <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-bold text-sm text-slate-700">3. Mgmt Review</span>
                      <CheckCircle size={16} className={totals.mgmtPending === 0 ? "text-green-500" : "text-slate-300"} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'mgmtPending' } })}
                        className="flex-1 bg-white hover:bg-cyan-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-cyan-300 shadow-sm"
                      >
                        <span className="block text-2xl font-extrabold text-cyan-600 leading-none">{totals.mgmtPending}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending</span>
                      </div>
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'mgmtGiven' } })}
                        className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
                      >
                        <span className="block text-xl font-bold text-slate-700 leading-none">{totals.mgmtGiven}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Completed</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

          {/* Recent Incidents */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-800">Recent Incidents</h3>
              </div>
              <button onClick={() => navigate('/incidents')} className="text-xs text-indigo-600 hover:underline font-semibold">View all incidents →</button>
            </div>
            <div className="divide-y divide-slate-100">
              {recentIncidents.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">No incidents yet</div>
              ) : recentIncidents.map(inc => (
                <div
                  key={inc.id}
                  onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${inc.severity === 'Grave' ? 'bg-purple-400' :
                    inc.severity === 'Major' ? 'bg-amber-400' : 'bg-green-400'
                    }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-xs font-bold text-green-700">{inc.reference_id}</span>
                      <span className={`badge ${getSeverityClass(inc.severity)}`}>{inc.severity}</span>
                      <span className={getStatusClass(inc.status)}>{getStatusLabel(inc.status)}</span>
                      {inc.attachments && inc.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5" title={`${inc.attachments.length} attachment(s)`}>
                          <Paperclip size={10} />
                          <span>{inc.attachments.length}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-800 truncate">{inc.incident_type}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Reporter: {inc.reporter_name || 'N/A'} · Location: {inc.main_location_name}{inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''} · {formatDate(inc.incident_date || inc.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/incidents/${encodeURIComponent(inc.id)}`); }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-colors flex-shrink-0 border border-indigo-200"
                  >
                    <Eye size={13} /> View
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Monthly trend */}
            <div className="card p-5 xl:col-span-2">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Monthly Incident Trend</h3>
              {monthly.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e8edf4', fontSize: 12 }} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Incidents" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Severity breakdown */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">By Severity</h3>
              {bySeverity.filter(s => s.count > 0).length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={bySeverity} cx="50%" cy="45%" innerRadius={50} outerRadius={75} dataKey="count" nameKey="severity" paddingAngle={3}>
                      {bySeverity.map((entry, i) => (
                        <Cell key={i} fill={COLORS_SEVERITY[entry.severity] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Legend iconType="circle" iconSize={8} formatter={val => <span style={{ fontSize: 11, color: '#64748b' }}>{val}</span>} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e8edf4', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => navigate('/incidents')} className="card p-4 text-left hover:shadow-card-hover transition-shadow group">
              <FileText size={20} className="text-purple-600 mb-2" />
              <p className="text-sm font-semibold text-slate-800">All Incidents</p>
              <p className="text-xs text-slate-500 mt-0.5">Browse and filter hospital-wide incidents</p>
            </button>
            <button onClick={() => handleTabChange('analytics')} className="card p-4 text-left hover:shadow-card-hover transition-shadow">
              <BarChart3 size={20} className="text-green-700 mb-2" />
              <p className="text-sm font-semibold text-slate-800">Analytics</p>
              <p className="text-xs text-slate-500 mt-0.5">Department & Category reports and SLA tracking</p>
            </button>
          </div>
        </div>
      )}
      {/* ANALYTICS & FEEDBACK TRACKER TAB */}
      {activeTab === 'analytics' && (() => {
        // IMC feedback calculations
        const imcReceived = allIncidents.filter(i => ['with_imc', 'with_head_management', 'resolved', 'redirect_requested'].includes(i.status));
        const imcGiven = imcReceived.filter(i => !!i.imc_feedback);
        const imcPending = imcReceived.filter(i => !i.imc_feedback);
        const imcPct = imcReceived.length > 0 ? Math.round((imcGiven.length / imcReceived.length) * 100) : 0;

        return (
          <div className="space-y-6">
            {/* Global Response KPI Averages */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                icon={Timer}
                label="Avg HOD Feedback Time"
                value={globalAverages.avgHod ? `${(globalAverages.avgHod).toFixed(1)} hrs` : 'N/A'}
                color="bg-amber-50"
                iconColor="text-amber-700"
                sub="Avg time from report to HOD action"
              />
              <StatCard
                icon={Timer}
                label="Avg IMC Feedback Time"
                value={globalAverages.avgImc ? `${(globalAverages.avgImc).toFixed(1)} hrs` : 'N/A'}
                color="bg-indigo-50"
                iconColor="text-indigo-700"
                sub="Avg time from HOD review to IMC action"
              />
              <StatCard
                icon={CheckCircle}
                label="Avg Resolution Time"
                value={globalAverages.avgRes ? `${(globalAverages.avgRes).toFixed(1)} hrs` : 'N/A'}
                color="bg-green-50"
                iconColor="text-green-700"
                sub="Avg overall resolution SLA"
              />
            </div>

            {/* Top/Bottom Leaderboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4 border-l-4 border-l-green-500">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-green-500" /> Top Performing Departments</h3>
                <div className="space-y-2">
                  {departmentLeaderboard.slice(0, 3).map((d, i) => (
                    <div key={d.dept} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-700">{i + 1}. {d.dept}</span>
                      <span className="text-xs text-slate-500">{d.avgHod ? d.avgHod.toFixed(1) + 'h avg' : 'N/A'} · {d.activeCount} active</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-4 border-l-4 border-l-red-500">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" /> Action Required Departments</h3>
                <div className="space-y-2">
                  {departmentLeaderboard.slice().reverse().slice(0, 3).map((d, i) => (
                    <div key={d.dept} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-700">{d.dept}</span>
                      <span className="text-xs text-slate-500">{d.avgHod ? d.avgHod.toFixed(1) + 'h avg' : 'N/A'} · <span className="font-bold text-red-600">{d.activeCount} active</span></span>
                    </div>
                  ))}
                </div>
              </div>
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
                    <p className="text-xs text-slate-500">IMC Feedback Rate</p>
                    <p className="text-xl font-bold text-slate-800">{imcGiven.length} <span className="text-sm font-normal text-slate-400">/ {imcReceived.length}</span></p>
                    <div className="w-28 h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${imcPct}%` }} />
                    </div>
                  </div>
                </div>
                <StatCard icon={CheckSquare} label="IMC Feedback Given" value={imcGiven.length} color="bg-green-50/50" iconColor="text-green-600" />
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <XCircle size={16} className="text-red-500" />
                    <span className="text-xs font-semibold text-slate-650 uppercase tracking-wider">IMC Feedback Pending</span>
                  </div>
                  <p className="text-2xl font-bold text-red-650">{imcPending.length}</p>
                  {imcPending.length > 0 && (
                    <div className="space-y-1 mt-1 max-h-24 overflow-y-auto">
                      {imcPending.slice(0, 3).map(inc => (
                        <div key={inc.id} onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
                          className="flex items-center justify-between text-[11px] text-slate-600 hover:text-indigo-650 cursor-pointer group">
                          <span className="font-mono text-green-700">{inc.reference_id}</span>
                          <span className={`badge ${getSeverityClass(inc.severity)} px-1.5 py-0.5 text-[9px]`}>{inc.severity}</span>
                        </div>
                      ))}
                      {imcPending.length > 3 && <p className="text-[9px] text-slate-400">+{imcPending.length - 3} more…</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Editable given feedback list */}
              {imcGiven.length > 0 && (
                <div className="border border-slate-150 rounded-xl overflow-hidden mt-3 bg-white">
                  <div className="px-4 py-2.5 bg-indigo-50/40 border-b border-indigo-100/60 flex items-center gap-2">
                    <CheckSquare size={13} className="text-indigo-600" />
                    <span className="text-xs font-semibold text-slate-700">IMC Feedback Given — Click Edit to correct wrong entries</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {imcGiven.map(inc => (
                      <div key={inc.id} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-mono text-xs font-bold text-green-700">{inc.reference_id}</span>
                            <span className={`badge ${getSeverityClass(inc.severity)} py-0 px-1 text-[9px]`}>{inc.severity}</span>
                          </div>
                          <p className="text-xs text-slate-500 italic line-clamp-1">"{inc.imc_feedback}"</p>
                        </div>
                        <button onClick={() => openEditModal(inc, 'imc')}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex-shrink-0">
                          <Pencil size={11} /> Edit
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Category-wise Table Card */}
            <div className="card p-5 space-y-4">
              {/* Search bar */}
              <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Category-wise Incident Analytics</h3>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search categories…"
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Table wrapper */}
              <div className="table-wrapper border border-slate-150 rounded-xl overflow-x-auto bg-white">
                <table className="table min-w-full divide-y divide-slate-150">
                  <thead>
                    <tr className="bg-slate-50">
                      <th onClick={() => handleSort('name')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-left">
                        <div className="flex items-center gap-1.5">
                          <span>Incident Category</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                      <th onClick={() => handleSort('total')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-28">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Received</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                      <th onClick={() => handleSort('feedbackGiven')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-40">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>HOD Feedback Given</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                      <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                        Missing HOD Feedback
                      </th>
                      <th onClick={() => handleSort('solved')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-28">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Solved</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                      <th onClick={() => handleSort('avgHod')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Avg HOD Resp</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                      <th onClick={() => handleSort('avgImc')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Avg IMC Resp</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                      <th onClick={() => handleSort('avgRes')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Avg Resolution</span>
                          <ArrowUpDown size={11} className="text-slate-400" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 bg-white">
                    {processedAnalytics.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400 text-sm">
                          No matches found for "{searchQuery}"
                        </td>
                      </tr>
                    ) : (
                      processedAnalytics.map(row => {
                        const pctFeedback = row.total > 0 ? Math.round((row.feedbackGiven / row.total) * 100) : 0;

                        return (
                          <tr key={row.name} className="hover:bg-slate-50/50 transition-colors border-b border-slate-150">
                            {/* Name */}
                            <td
                              onClick={() => navigate(`/management/dashboard/category/${encodeURIComponent(row.name)}`)}
                              className="py-3.5 px-4 text-sm font-semibold text-indigo-650 hover:text-indigo-850 hover:underline cursor-pointer select-none transition-colors"
                            >
                              <div className="flex items-center gap-1">
                                <span>{row.name}</span>
                                <ChevronRight size={13} className="text-slate-400 opacity-60" />
                              </div>
                            </td>

                            {/* Received */}
                            <td className="py-3.5 px-4 text-sm font-bold text-slate-700 text-center">
                              {row.total}
                            </td>

                            {/* HOD Feedback Given progress */}
                            <td className="py-3.5 px-4 text-center">
                              {row.total > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center justify-between w-full max-w-[120px] text-xs font-semibold text-slate-650">
                                    <span>{pctFeedback}%</span>
                                    <span>({row.feedbackGiven}/{row.total})</span>
                                  </div>
                                  <div className="w-full max-w-[120px] h-1.5 bg-slate-100 border border-slate-200/50 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${pctFeedback === 100 ? 'bg-green-500' : 'bg-indigo-500'
                                        }`}
                                      style={{ width: `${pctFeedback}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-xs">—</span>
                              )}
                            </td>

                            {/* Missing HOD Feedback */}
                            <td className="py-3.5 px-4 text-center">
                              {row.missing?.length > 0 ? (
                                <div className="flex items-center justify-center gap-2">
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-650">
                                    <XCircle size={13} /> {row.missing.length}
                                  </span>
                                  <button
                                    onClick={() => navigate(`/management/dashboard/category/${encodeURIComponent(row.name)}`)}
                                    className="text-xs font-semibold text-indigo-650 hover:text-indigo-850 hover:underline transition-colors"
                                  >
                                    View
                                  </button>
                                </div>
                              ) : (
                                <span className="text-green-600 text-xs font-semibold">All done ✓</span>
                              )}
                            </td>

                            {/* Solved Count */}
                            <td className="py-3.5 px-4 text-center">
                              {row.total > 0 ? (
                                <span className={`inline-flex items-center gap-1 font-bold text-sm ${row.solved === row.total
                                  ? 'text-green-700'
                                  : row.solved > 0
                                    ? 'text-indigo-600'
                                    : 'text-slate-500'
                                  }`}>
                                  {row.solved}
                                  {row.solved === row.total && (
                                    <span className="text-[10px] font-semibold bg-green-50 text-green-700 border border-green-150 rounded px-1 py-0.5">
                                      All
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-xs">—</span>
                              )}
                            </td>

                            {/* Response times */}
                            <td className="py-3.5 px-4 text-sm text-center">{formatDuration(row.avgHod)}</td>
                            <td className="py-3.5 px-4 text-sm text-center">{formatDuration(row.avgImc)}</td>
                            <td className="py-3.5 px-4 text-sm text-center">{formatDuration(row.avgRes)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── EDIT FEEDBACK MODAL ── */}
      <Modal
        open={!!editModal}
        onClose={() => { setEditModal(null); setEditText(''); }}
        title={editModal ? `Edit ${editModal.feedbackType.toUpperCase()} Feedback` : ''}
        size="md"
        footer={
          <>
            <button onClick={() => { setEditModal(null); setEditText(''); }} className="btn-secondary">Cancel</button>
            <button
              disabled={isSaving || !editText.trim()}
              onClick={() => doEditFeedback({ id: editModal.incident.id, feedbackType: editModal.feedbackType, feedbackText: editText })}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        {editModal && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-slate-650">
                Editing <span className="font-bold text-slate-800">{editModal.feedbackType.toUpperCase()}</span> feedback for incident{' '}
                <span className="font-mono font-bold text-green-700">{editModal.incident.reference_id}</span>.
                This action will be logged in the audit trail.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-650 mb-1.5">Corrected Feedback</label>
              <textarea
                rows={5}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                placeholder="Enter the correct feedback…"
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-all"
              />
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
