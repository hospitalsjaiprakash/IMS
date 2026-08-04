import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, Pagination } from '../../components/ui';
import { ShieldCheck, Activity, Users, Lock } from 'lucide-react';
import { formatDateTime, formatDate } from '../../utils/helpers';

const ACTION_COLORS = {
  LOGIN: 'badge-green',
  INCIDENT_CREATED: 'badge-blue',
  INCIDENT_RESOLVED: 'badge-green',
  INCIDENT_WITHDRAWN: 'badge-gray',
  INCIDENT_REOPENED: 'badge-yellow',
  HOD_FEEDBACK_SUBMITTED: 'badge-yellow',
  IMC_FEEDBACK_SUBMITTED: 'badge-blue',
  IMC_CLAIM: 'badge-blue',
  ROLE_ASSIGNED: 'badge-purple',
  ROLE_ASSIGNED_IMC: 'badge-purple',
  IMC_ACCESS_STOPPED: 'badge-red',
  CONFIG_UPDATED: 'badge-red',
};

export default function AdminAuditPage() {
  const [activeTab, setActiveTab] = useState('system'); // 'system' | 'role_audit'
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [action, setAction] = useState('');

  const { data: systemAuditData, isLoading: isLoadingSystem } = useQuery({
    queryKey: ['audit-logs', page, dateFrom, dateTo, action],
    queryFn: () => adminApi.getAuditLogs({ page, limit: 50, dateFrom, dateTo, action }).then(r => r.data),
    enabled: activeTab === 'system',
  });

  const { data: roleAuditData = [], isLoading: isLoadingRoleAudit } = useQuery({
    queryKey: ['role-audit'],
    queryFn: () => adminApi.getRoleAudit().then(r => r.data),
    enabled: activeTab === 'role_audit',
  });

  const ACTIONS = [
    'LOGIN', 'INCIDENT_CREATED', 'INCIDENT_RESOLVED', 'INCIDENT_WITHDRAWN',
    'HOD_FEEDBACK_SUBMITTED', 'IMC_FEEDBACK_SUBMITTED', 'IMC_CLAIM',
    'ROLE_ASSIGNED', 'ROLE_ASSIGNED_IMC', 'IMC_ACCESS_STOPPED', 'CONFIG_UPDATED',
  ];

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold mb-3">
              <ShieldCheck size={14} className="text-amber-300" />
              <span>Enterprise Compliance & Security Audit</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">System Audit & Governance Logs</h1>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">
              Complete historical ledger of all user logins, incident operations, administrative role assignments, and permission changes.
            </p>
          </div>
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700 self-start sm:self-center">
            <button
              onClick={() => { setActiveTab('system'); setPage(1); }}
              className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
                activeTab === 'system'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity size={14} /> System Activity Ledger
            </button>
            <button
              onClick={() => setActiveTab('role_audit')}
              className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
                activeTab === 'role_audit'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock size={14} /> Role Governance History
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: SYSTEM ACTIVITY LEDGER */}
      {activeTab === 'system' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center gap-3">
            <select
              value={action}
              onChange={e => { setAction(e.target.value); setPage(1); }}
              className="select w-56 font-semibold text-xs py-2"
            >
              <option value="">All Event Actions</option>
              {ACTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500">From</span>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="bg-transparent text-xs font-medium outline-none" />
            </div>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500">To</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="bg-transparent text-xs font-medium outline-none" />
            </div>
            {systemAuditData?.total && (
              <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                {systemAuditData.total.toLocaleString()} logged events
              </span>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden">
            {isLoadingSystem ? (
              <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table w-full">
                    <thead>
                      <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                        <th className="py-3.5 pl-6">Timestamp</th>
                        <th className="py-3.5">User</th>
                        <th className="py-3.5">Action Type</th>
                        <th className="py-3.5">Reference ID</th>
                        <th className="py-3.5">IP Address</th>
                        <th className="py-3.5 pr-6">Payload Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(systemAuditData?.logs || []).length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-14 text-slate-400 font-medium">No system audit logs match your filter criteria.</td></tr>
                      ) : (systemAuditData?.logs || []).map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="pl-6 py-4 text-xs font-mono font-medium text-slate-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                          <td className="py-4">
                            <div>
                              <p className="text-xs font-bold text-slate-900">{log.full_name || 'System Account'}</p>
                              <p className="text-[10px] font-mono text-slate-400">ID: {log.employee_id || 'N/A'}</p>
                            </div>
                          </td>
                          <td className="py-4">
                            <span className={`badge font-bold text-[10px] ${ACTION_COLORS[log.action] || 'badge-gray'}`}>
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="font-mono text-xs font-bold text-blue-600 py-4">{log.reference_id || '—'}</td>
                          <td className="font-mono text-xs text-slate-500 py-4">{log.ip_address || '—'}</td>
                          <td className="pr-6 py-4 max-w-64">
                            {log.details && Object.keys(log.details).length > 0 ? (
                              <details className="group">
                                <summary className="text-xs font-bold text-blue-600 cursor-pointer hover:underline">Inspect Payload</summary>
                                <pre className="text-[10px] font-mono text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl mt-1.5 overflow-auto max-h-32 shadow-2xs">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            ) : <span className="text-slate-400 text-xs">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-slate-200 bg-slate-50/40">
                  <Pagination page={page} totalPages={systemAuditData?.totalPages || 1} onPageChange={setPage} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ROLE & ACCESS GOVERNANCE HISTORY */}
      {activeTab === 'role_audit' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Users size={20} className="text-indigo-600" />
                <span>Recent System Governance & Access Modifications</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Historical record of all user role reassignments, IMC authorizations, management appointments, and privilege revocations
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200">
              {roleAuditData.length} Governance Records
            </span>
          </div>

          {isLoadingRoleAudit ? (
            <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
          ) : roleAuditData.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm font-medium bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              No governance or role modification records found in the audit ledger.
            </div>
          ) : (
            <div className="space-y-3">
              {roleAuditData.map(a => (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs p-4 bg-gradient-to-r from-slate-50/80 to-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                      {a.employee_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">{a.employee_name}</span>
                        <span className="text-slate-500 font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ID: {a.employee_id}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[10px] font-bold border border-slate-300">
                          {a.previous_role || 'employee'}
                        </span>
                        <span className="text-slate-400 font-bold">→</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black shadow-2xs">
                          {a.new_role}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end text-[11px] text-slate-500 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <span>Authorized by <strong className="text-slate-800 font-bold">{a.changed_by_name || 'System Admin'}</strong></span>
                    <span className="font-mono text-slate-400 text-[10px] mt-0.5">{formatDateTime(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
