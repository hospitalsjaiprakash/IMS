import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { StatCard, Spinner, Alert } from '../../components/ui';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  FileText, Clock, CheckCircle, AlertTriangle,
  Database, Users, BookOpen, TrendingUp
} from 'lucide-react';

const COLORS = ['#0e95ea', '#22c55e', '#f59e0b', '#d946ef', '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#8b5cf6', '#ec4899'];

export default function AdminAnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => adminApi.getAnalytics().then(r => r.data),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>;
  if (error) return <Alert type="error" title="Failed to load analytics" message={error.message} />;

  const {
    incidentsByMonth = [],
    avgResolutionHours,
    byDepartment = [],
    slaBreach = 0,
    stalledIncidents = [],
  } = data || {};

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Analytics</h1>
          <p className="page-subtitle">Hospital-wide incident management metrics</p>
        </div>
      </div>

      {/* SLA breach alert */}
      {slaBreach > 0 && (
        <Alert
          type="warning"
          title={`${slaBreach} SLA Breach${slaBreach > 1 ? 'es' : ''}`}
          message={`${slaBreach} incident${slaBreach > 1 ? 's' : ''} exceed the 7-day resolution SLA. Immediate attention required.`}
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard icon={Clock} label="Avg Resolution" value={`${avgResolutionHours}h`} color="bg-blue-50" iconColor="text-blue-600" />
        <StatCard icon={AlertTriangle} label="SLA Breaches" value={slaBreach} color="bg-red-50" iconColor="text-red-600" />
      </div>


      {/* Charts row */}
      <div className="grid grid-cols-1 gap-5">
        {/* Monthly bar chart */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Monthly Incident Trend (12 months)</h3>
          {incidentsByMonth.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={incidentsByMonth} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e8edf4', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                />
                <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
                  {incidentsByMonth.map((_, i) => (
                    <Cell key={i} fill={i === incidentsByMonth.length - 1 ? '#0e95ea' : '#bae1fd'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>


      {/* Department breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Top Departments by Incident Count</h3>
          {byDepartment.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No data</div>
          ) : (
            <div className="space-y-2.5">
              {byDepartment.slice(0, 10).map((d, i) => {
                const max = byDepartment[0]?.count || 1;
                const pct = Math.round((d.count / max) * 100);
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-4 font-mono">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-slate-700 truncate">{d.name}</span>
                        <span className="text-xs font-bold text-slate-600 ml-2">{d.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stalled incidents */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Stalled Incidents (&gt;7 days)</h3>
          {stalledIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <CheckCircle size={28} className="text-green-500 mb-2" />
              <p className="text-sm text-green-700 font-medium">All incidents are within SLA!</p>
              <p className="text-xs text-slate-400 mt-1">No stalled cases at this time</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stalledIncidents.map(s => (
                <div key={s.status} className="flex items-center justify-between p-3 bg-amber-50 border border-yellow-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-700" />
                    <span className="text-sm font-medium text-slate-800 capitalize">
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-amber-700 font-display">{s.count}</span>
                </div>
              ))}
              <p className="text-xs text-slate-500 mt-2">
                These incidents have not been updated in over 7 days. Consider escalating or assigning investigators.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
