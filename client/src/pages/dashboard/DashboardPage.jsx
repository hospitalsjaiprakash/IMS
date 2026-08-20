import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { StatCard, EmptyState, Modal, Tabs, SkeletonCard, InsightSummary, StatusBadge, SLABadge } from '../../components/ui';
import { GlassTooltip } from '../../components/ui/GlassTooltip';
import { motion } from 'framer-motion';
import {
  FileText, AlertTriangle, CheckCircle, Clock, TrendingUp,
  FilePlus, ClipboardList, BarChart3, Eye, Inbox, UserCheck, Timer, XOctagon, LayoutDashboard,
  Activity, Paperclip, Flame, ShieldAlert, ChevronRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { getStatusLabel, getSeverityClass, getStatusClass, formatDate } from '../../utils/helpers';

const COLORS_SEVERITY = { Minor: '#22c55e', Major: '#f59e0b', Grave: '#d946ef' };
const COLORS_PIE = ['#0e95ea', '#22c55e', '#f59e0b', '#d946ef', '#ef4444', '#6366f1', '#14b8a6', '#f97316'];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [selectedInc, setSelectedInc] = useState(null);
  const [activeView, setActiveView] = useState(user?.role === 'hod' ? 'hod' : 'personal');

  // Always call hooks before any conditional rendering
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => incidentsApi.getStats().then(r => r.data),
  });

  const { data: recentData } = useQuery({
    queryKey: ['incidents', { page: 1, limit: 5, viewMode: activeView === 'personal' ? 'my_incidents' : undefined }],
    queryFn: () => incidentsApi.list({ page: 1, limit: 5, viewMode: activeView === 'personal' ? 'my_incidents' : undefined }).then(r => r.data.incidents),
  });

  const { data: allReceived = [] } = useQuery({
    queryKey: ['incidents', 'received-all'],
    queryFn: () => incidentsApi.list({ limit: 1000 }).then(r => r.data.incidents),
    enabled: user?.role === 'hod'
  });

  const hodQueue = allReceived.filter(i => i.status === 'with_hod' || i.status === 'with_hod_and_imc');
  const overdueCount = hodQueue.filter(i => ((new Date() - new Date(i.created_at)) / 3600000 > 48)).length;
  const escalatedCount = hodQueue.filter(i => !!i.priority_escalated_by).length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const totals = stats?.totals || {};
  const personalTotals = user?.role === 'hod' ? (stats?.hodReport?.myIncidents || {}) : totals;
  const monthly = stats?.monthly || [];
  const bySeverity = stats?.bySeverity || [];
  const byType = stats?.byType || [];

  const renderChartsSection = () => (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly trend */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Monthly Trend</h3>
          {monthly.length === 0 ? (
            <EmptyState icon={BarChart3} title="No Data Available" message="There are no incidents recorded for the monthly trend." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMonthly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="count" fill="url(#colorMonthly)" radius={[6, 6, 0, 0]} name="Incidents" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Severity breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">By Severity</h3>
          {bySeverity.length === 0 ? (
            <EmptyState icon={Activity} title="No Data Available" message="There are no incidents to categorize by severity." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={bySeverity}
                  cx="50%" cy="45%"
                  innerRadius={50} outerRadius={75}
                  dataKey="count"
                  nameKey="severity"
                  paddingAngle={3}
                >
                  {bySeverity.map((entry, i) => (
                    <Cell key={i} fill={COLORS_SEVERITY[entry.severity] || COLORS_PIE[i]} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(val) => <span style={{ fontSize: 11, color: '#64748b' }}>{val}</span>}
                />
                <Tooltip content={<GlassTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Incident type breakdown */}
      {byType.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Incidents by Type</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={byType}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 100, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorType" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} vertical={true} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="incident_type"
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={95}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Count">
                {byType.map((_, i) => (
                  <Cell key={i} fill={`url(#colorType)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header flex-col items-start sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, {user?.fullName} · {user?.department || 'Quality Management'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {user?.role === 'hod' && (
            <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto shadow-inner border border-slate-200">
              <button
                onClick={() => setActiveView('hod')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeView === 'hod' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
              >
                HOD View
              </button>
              <button
                onClick={() => setActiveView('personal')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeView === 'personal' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Personal View
              </button>
            </div>
          )}

          {(user?.role === 'employee' || activeView === 'personal') && (
            <button onClick={() => navigate('/incidents/new')} className="btn-primary flex-shrink-0 justify-center">
              <FilePlus size={16} />
              <span>Report Incident</span>
            </button>
          )}
        </div>
      </div>

      {(user?.role === 'hod' || user?.role === 'imc' || user?.role === 'system_admin') && activeView !== 'personal' && (
        <InsightSummary incidents={recentData} role={user?.role} />
      )}

      {/* OVERVIEW SECTION */}
      <div className="space-y-6">
        {/* Warnings Panel */}
        {user?.role === 'hod' && activeView === 'hod' && (overdueCount > 0 || escalatedCount > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-800">Escalation & SLA Warnings</h3>
              <ul className="mt-1 space-y-1 text-sm text-red-700">
                {escalatedCount > 0 && (
                  <li className="flex items-center gap-1.5 font-bold animate-pulse">
                    <Flame size={14} className="text-red-600" />
                    {escalatedCount} incident(s) in your queue have been ESCALATED for priority action!
                  </li>
                )}
                {overdueCount > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Clock size={14} className="text-red-600" />
                    {overdueCount} incident(s) have breached the 48-hour SLA.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Stat cards — visible for employees or personal view */}
        {(user?.role !== 'hod' || activeView === 'personal') && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <LayoutDashboard size={16} className="text-indigo-600" />
              My Incidents Overview
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div onClick={() => navigate('/incidents', { state: { viewMode: 'my_incidents' } })} className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">Total Incidents</p>
                    <p className="text-3xl font-extrabold text-blue-900 mt-1">{personalTotals.total || 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText size={24} className="text-blue-600" />
                  </div>
                </div>
              </div>

              <div onClick={() => navigate('/incidents', { state: { status: 'active', viewMode: 'my_incidents' } })} className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-amber-800/70 uppercase tracking-wide">Active</p>
                    <p className="text-3xl font-extrabold text-amber-900 mt-1">{personalTotals.active || 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Clock size={24} className="text-amber-600" />
                  </div>
                </div>
              </div>

              <div onClick={() => navigate('/incidents', { state: { status: 'resolved', viewMode: 'my_incidents' } })} className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-green-800/70 uppercase tracking-wide">Resolved</p>
                    <p className="text-3xl font-extrabold text-green-900 mt-1">{personalTotals.resolved || 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle size={24} className="text-green-600" />
                  </div>
                </div>
              </div>

              <div onClick={() => navigate('/incidents', { state: { status: 'withdrawn', viewMode: 'my_incidents' } })} className="card p-5 bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-600/70 uppercase tracking-wide">Withdrawn</p>
                    <p className="text-3xl font-extrabold text-slate-700 mt-1">{personalTotals.withdrawn || 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <XOctagon size={24} className="text-slate-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HOD extra stats */}
        {user?.role === 'hod' && activeView === 'hod' && (
          <div className="space-y-6">
            {/* Department Overview */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <LayoutDashboard size={16} className="text-blue-600" />
                Department Overview
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div onClick={() => navigate('/incidents', { state: { viewMode: 'department' } })} className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md transition-shadow cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">Received Incidents</p>
                      <p className="text-3xl font-extrabold text-blue-900 mt-1">{stats?.hodReport?.received || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Inbox size={24} className="text-blue-600" />
                    </div>
                  </div>
                </div>

                <div onClick={() => navigate('/incidents', { state: { status: 'active', viewMode: 'department' } })} className="card p-5 bg-gradient-to-br from-red-50 to-orange-50 border-red-100 hover:shadow-md transition-shadow cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-red-800/70 uppercase tracking-wide">Active</p>
                      <p className="text-3xl font-extrabold text-red-900 mt-1">{stats?.hodReport?.active || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Activity size={24} className="text-red-600" />
                    </div>
                  </div>
                </div>

                <div onClick={() => navigate('/incidents', { state: { status: 'resolved', viewMode: 'department' } })} className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 hover:shadow-md transition-shadow cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-green-800/70 uppercase tracking-wide">Resolved</p>
                      <p className="text-3xl font-extrabold text-green-900 mt-1">{stats?.hodReport?.resolved || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CheckCircle size={24} className="text-green-600" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 mt-3">
                <button onClick={() => navigate('/incidents', { state: { status: 'withdrawn', viewMode: 'department' } })} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                  <XOctagon size={14} className="text-slate-500" /> Withdrawn: {stats?.hodReport?.withdrawn || 0}
                </button>
              </div>
            </div>

            {/* HOD Feedback Action Required */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <UserCheck size={16} className="text-amber-600" />
                HOD Feedback Tracker
              </h3>

              <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm">
                <div className="flex items-center">
                  <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-bold text-sm text-slate-700">Action Required</span>
                      <CheckCircle size={16} className={(stats?.hodReport?.feedbackPending || 0) === 0 ? "text-green-500" : "text-slate-300"} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'hodPending', viewMode: 'department' } })}
                        className="flex-1 bg-white hover:bg-amber-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-amber-300 shadow-sm"
                      >
                        <span className="block text-2xl font-extrabold text-amber-600 leading-none">{stats?.hodReport?.feedbackPending || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending Feedback</span>
                      </div>
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'hodGiven', viewMode: 'department' } })}
                        className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
                      >
                        <span className="block text-xl font-bold text-slate-700 leading-none">{stats?.hodReport?.feedbackGiven || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Feedback Given</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Charts row */}
        {user?.role !== 'employee' && activeView !== 'personal' && renderChartsSection()}
      </div>

      {/* Recent incidents */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Recent Incidents</h3>
          <button onClick={() => navigate('/incidents')} className="text-xs text-blue-600 hover:underline">
            View all →
          </button>
        </div>
        <div className="table-wrapper rounded-none border-0">
          <table className="table">
            <thead>
              {user?.role === 'hod' && activeView === 'hod' ? (
                <tr>
                  <th>Reference ID</th>
                  <th>Reporter</th>
                  <th>Reporter Dept</th>
                  <th>Emp ID</th>
                  <th>Apply Date</th>
                  <th>Incident Date</th>
                  <th>Location</th>
                  <th>Target Depts</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              ) : (
                <tr>
                  <th>Reference ID</th>
                  <th>Target Depts</th>
                  <th>Apply Date</th>
                  <th>Incident Date & Time</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              )}
            </thead>
            <tbody>
              {!recentData?.length ? (
                <tr>
                  <td colSpan={user?.role === 'hod' ? 10 : 7} className="text-center py-8 text-slate-400">
                    No incidents yet
                  </td>
                </tr>
              ) : recentData.slice(0, 5).map((inc, i) => (
                <motion.tr
                  key={inc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-medium text-green-700">{inc.reference_id}</span>
                      {inc.attachments && inc.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5" title={`${inc.attachments.length} attachment(s)`}>
                          <Paperclip size={10} />
                          <span>{inc.attachments.length}</span>
                        </span>
                      )}
                      {inc.priority_escalated_by && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 rounded px-1 py-0.5 animate-pulse" title={`Escalated by ${inc.priority_escalated_by}`}>
                          <Flame size={10} />
                          <span>ESCALATED</span>
                        </span>
                      )}
                      <SLABadge createdAt={inc.created_at} status={inc.status} />
                    </div>
                  </td>
                  {user?.role === 'hod' && activeView === 'hod' ? (
                    <>
                      <td className="text-slate-700 text-xs font-medium">{inc.reporter_name || 'N/A'}</td>
                      <td className="text-slate-600 text-xs">{inc.reporter_department || 'N/A'}</td>
                      <td className="text-slate-600 text-xs font-mono">{inc.reporter_employee_id || 'N/A'}</td>
                      <td className="text-slate-500 text-xs">{formatDate(inc.created_at)}</td>
                      <td className="text-slate-500 text-xs">{formatDate(inc.incident_date)} {inc.incident_time?.slice(0, 5)}</td>
                      <td className="text-slate-600 text-xs font-mono truncate max-w-[120px]">
                        {inc.main_location_name || 'N/A'}
                        {inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''}
                      </td>
                      <td className="text-slate-600 text-xs font-medium">{(inc.departments || []).join(', ') || 'N/A'}</td>
                      <td>
                        <StatusBadge status={inc.status} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="text-slate-600 text-xs">{(inc.departments || []).join(', ') || 'N/A'}</td>
                      <td className="text-slate-500 text-xs">{formatDate(inc.created_at)}</td>
                      <td className="text-slate-500 text-xs">{formatDate(inc.incident_date)} {inc.incident_time?.slice(0, 5)}</td>
                      <td className="text-slate-600 text-xs">
                        {inc.main_location_name || 'N/A'}
                        {inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''}
                      </td>
                      <td>
                        <StatusBadge status={inc.status} />
                      </td>
                    </>
                  )}
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedInc(inc); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/incidents')}
          className="card p-4 text-left hover:shadow-card-hover transition-shadow group"
        >
          <FileText size={20} className="text-blue-600 mb-2" />
          <p className="text-sm font-semibold text-slate-800">All Incidents</p>
          <p className="text-xs text-slate-500 mt-0.5">Browse and filter all reported incidents</p>
        </button>

        {/* {(user?.role === 'imc' || user?.role === 'system_admin') && (
          <button
            onClick={() => navigate('/imc/queue')}
            className="card p-4 text-left hover:shadow-card-hover transition-shadow"
          >
            <ClipboardList size={20} className="text-indigo-600 mb-2" />
            <p className="text-sm font-semibold text-slate-800">IMC Queue</p>
            <p className="text-xs text-slate-500 mt-0.5">Review and claim pending incidents</p>
          </button>
        )} */}

        {(user?.role === 'system_admin' || user?.role === 'head_management') && (
          <button
            onClick={() => navigate('/admin/analytics')}
            className="card p-4 text-left hover:shadow-card-hover transition-shadow"
          >
            <BarChart3 size={20} className="text-green-700 mb-2" />
            <p className="text-sm font-semibold text-slate-800">Analytics</p>
            <p className="text-xs text-slate-500 mt-0.5">System-wide reports and SLA tracking</p>
          </button>
        )}
      </div>

      <Modal
        open={!!selectedInc}
        onClose={() => setSelectedInc(null)}
        title={`Incident Details - ${selectedInc?.reference_id}`}
        size="lg"
        footer={
          <>
            <button onClick={() => setSelectedInc(null)} className="btn-secondary">Close</button>
            <button onClick={() => navigate(`/incidents/${encodeURIComponent(selectedInc?.id)}`)} className="btn-primary">
              View or Feedback
            </button>
          </>
        }
      >
        {selectedInc && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div><span className="text-slate-500 block text-xs">Reference ID</span><span className="font-medium text-green-700">{selectedInc.reference_id}</span></div>
              <div><span className="text-slate-500 block text-xs">Target Depts</span><span className="font-medium">{(selectedInc.departments || []).join(', ') || 'N/A'}</span></div>
              <div><span className="text-slate-500 block text-xs">Apply Date</span><span className="font-medium">{formatDate(selectedInc.created_at)}</span></div>
              <div><span className="text-slate-500 block text-xs">Incident Date & Time</span><span className="font-medium">{formatDate(selectedInc.incident_date)} {selectedInc.incident_time?.slice(0, 5)}</span></div>
              <div className="col-span-2"><span className="text-slate-500 block text-xs">Location</span><span className="font-medium">{selectedInc.main_location_name || 'N/A'}{selectedInc.sub_location_name ? ` - ${selectedInc.sub_location_name}` : ''}</span></div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                <span className="text-slate-600 font-medium">Status</span>
                <StatusBadge status={selectedInc.status} />
              </div>
              {selectedInc.priority_escalated_by && (
                <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl animate-pulse">
                  <span className="text-red-700 font-bold flex items-center gap-1.5"><Flame size={16} /> PRIORITY ESCALATION</span>
                  <span className="text-red-700 text-xs font-bold bg-red-100 px-2 py-1 rounded border border-red-200">BY {selectedInc.priority_escalated_by.toUpperCase()}</span>
                </div>
              )}
              {selectedInc.status !== 'withdrawn' && (
                <>
                  <div>
                    <span className="text-slate-500 block text-xs font-semibold uppercase tracking-wider mb-1 px-1">Feedback by HOD</span>
                    <p className="text-slate-700 bg-amber-50 p-3 rounded-xl border border-amber-100 text-sm">{selectedInc.hod_feedback || 'No feedback yet'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs font-semibold uppercase tracking-wider mb-1 px-1">Feedback by IMC</span>
                    <p className="text-slate-700 bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-sm">{selectedInc.imc_feedback || 'No feedback yet'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs font-semibold uppercase tracking-wider mb-1 px-1">Feedback by Management</span>
                    <p className="text-slate-700 bg-purple-50 p-3 rounded-xl border border-purple-100 text-sm">{selectedInc.management_feedback || 'No feedback yet'}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
