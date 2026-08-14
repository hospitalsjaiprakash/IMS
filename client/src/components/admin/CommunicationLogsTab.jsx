import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, Pagination, Alert } from '../ui';
import { formatDateTime } from '../../utils/helpers';
import { Mail, MessageSquare, Bell, Search, AlertCircle, Info } from 'lucide-react';

const TYPE_ICONS = {
  EMAIL: <Mail size={14} className="text-blue-500" />,
  WHATSAPP: <MessageSquare size={14} className="text-emerald-500" />,
  IN_APP_NOTIFICATION: <Bell size={14} className="text-amber-500" />
};

const STATUS_COLORS = {
  SENT: 'badge-blue',
  DELIVERED: 'badge-green',
  READ: 'badge-purple',
  FAILED: 'badge-red'
};

export default function CommunicationLogsTab() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [errorDetails, setErrorDetails] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['communication-logs', page, type, status, search],
    queryFn: () => adminApi.getCommunicationLogs({ page, limit: 50, type, status, search }).then(r => r.data)
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search email, phone, subject..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-sm outline-none"
          />
        </form>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="select w-full sm:w-48 text-sm py-2"
        >
          <option value="">All Types</option>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="IN_APP_NOTIFICATION">In-App Notification</option>
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="select w-full sm:w-48 text-sm py-2"
        >
          <option value="">All Statuses</option>
          <option value="SENT">Sent</option>
          <option value="DELIVERED">Delivered</option>
          <option value="FAILED">Failed</option>
        </select>
        {data?.total !== undefined && (
          <div className="sm:ml-auto">
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 whitespace-nowrap">
              {data.total.toLocaleString()} records
            </span>
          </div>
        )}
      </div>

      {isError && (
        <Alert type="error" title="Error" message="Failed to load communication logs." />
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden relative">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-3.5 pl-6">Date & Time</th>
                    <th className="py-3.5">Type</th>
                    <th className="py-3.5">Recipient</th>
                    <th className="py-3.5">Subject</th>
                    <th className="py-3.5">Status</th>
                    <th className="py-3.5 pr-6">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.logs || []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-14 text-slate-400 font-medium">No logs found matching criteria.</td></tr>
                  ) : (data?.logs || []).map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="pl-6 py-3 text-xs font-mono font-medium text-slate-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          {TYPE_ICONS[log.type]}
                          <span className="text-xs font-bold text-slate-700">{log.type.replace(/_/g, ' ')}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <div>
                          <p className="text-xs font-medium text-slate-900 break-all">{log.recipient_contact}</p>
                          {log.full_name && <p className="text-[10px] text-slate-500">{log.full_name} ({log.employee_id})</p>}
                        </div>
                      </td>
                      <td className="py-3 max-w-[250px] truncate" title={log.subject}>
                        <span className="text-xs text-slate-700">{log.subject}</span>
                      </td>
                      <td className="py-3">
                        <span className={`badge font-bold text-[10px] ${STATUS_COLORS[log.status] || 'badge-gray'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="pr-6 py-3">
                        {log.status === 'FAILED' && log.error_message && (
                          <button
                            onClick={() => setErrorDetails(log.error_message)}
                            className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded border border-red-200 transition-colors flex items-center gap-1"
                          >
                            <AlertCircle size={12} /> View Error
                          </button>
                        )}
                        {log.status !== 'FAILED' && log.content && (
                           <button
                             onClick={() => setErrorDetails(log.content)}
                             className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border border-blue-200 transition-colors flex items-center gap-1"
                           >
                             <Info size={12} /> View Message
                           </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50/40">
              <Pagination page={page} totalPages={data?.totalPages || 1} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Error Details Modal */}
      {errorDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                Log Details
              </h3>
              <button onClick={() => setErrorDetails(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                ✕
              </button>
            </div>
            <div className="p-5 overflow-auto text-sm text-slate-700 bg-slate-50 font-mono whitespace-pre-wrap break-words">
              {errorDetails}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setErrorDetails(null)} className="btn-secondary btn-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
