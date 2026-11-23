import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { BarChart3, Activity } from 'lucide-react';
import { EmptyState } from '../ui';
import { GlassTooltip } from '../ui/GlassTooltip';

const COLORS_SEVERITY = { Minor: '#22c55e', Major: '#f59e0b', Grave: '#d946ef' };
const COLORS_PIE = ['#0e95ea', '#22c55e', '#f59e0b', '#d946ef', '#ef4444', '#6366f1', '#14b8a6', '#f97316'];

export function MonthlySeverityCharts({
  monthly = [],
  bySeverity = [],
  byType = [],
  barColor = '#10b981',
  monthlyTitle = 'Monthly Trend',
  showTypeChart = false,
}) {
  const nonZeroSeverity = bySeverity.filter(s => (s.count || 0) > 0);
  const typeChartHeight = Math.max(200, Math.min(420, byType.length * 36 + 24));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">{monthlyTitle}</h3>
          {monthly.length === 0 ? (
            <EmptyState icon={BarChart3} title="No Data Available" message="There are no incidents recorded for the monthly trend." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMonthlyTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={barColor} stopOpacity={0.85} />
                    <stop offset="95%" stopColor={barColor} stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="count" fill="url(#colorMonthlyTrend)" radius={[6, 6, 0, 0]} name="Incidents" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">By Severity</h3>
          {nonZeroSeverity.length === 0 ? (
            <EmptyState icon={Activity} title="No Data Available" message="There are no incidents to categorize by severity." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={nonZeroSeverity}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={75}
                  dataKey="count"
                  nameKey="severity"
                  paddingAngle={3}
                >
                  {nonZeroSeverity.map((entry, i) => (
                    <Cell key={entry.severity || i} fill={COLORS_SEVERITY[entry.severity] || COLORS_PIE[i % COLORS_PIE.length]} />
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

      {showTypeChart && byType.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Incidents by Type</h3>
          <ResponsiveContainer width="100%" height={typeChartHeight}>
            <BarChart
              data={byType}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorTypeBreakdown" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.85} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} vertical={true} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="incident_type"
                tick={{ fontSize: 11, fill: '#475569' }}
                width={150}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="count" fill="url(#colorTypeBreakdown)" radius={[0, 6, 6, 0]} name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
