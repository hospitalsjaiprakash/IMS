import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi, attachmentsApi } from '../../api';
import { Spinner, Modal, Alert, Pagination, AttachmentViewerModal, EmptyState } from '../../components/ui';
import { Send, Megaphone, Search, Paperclip, Mail, Bell, AlertCircle, Info, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeAgo, formatDateTime, getApiErrorMessage } from '../../utils/helpers';

const TYPE_ICONS = {
  EMAIL: <Mail size={14} className="text-blue-500" />,
  IN_APP_NOTIFICATION: <Bell size={14} className="text-amber-500" />,
};

const LOG_STATUS_COLORS = {
  SENT: 'badge-blue',
  DELIVERED: 'badge-green',
  READ: 'badge-purple',
  FAILED: 'badge-red',
};

export default function AdminCommunicationsPage() {
  const [activeTab, setActiveTab] = useState('broadcasts'); // 'broadcasts' | 'logs'

  // Broadcasts state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', attachment: null });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);

  // Delivery logs state
  const [logPage, setLogPage] = useState(1);
  const [logType, setLogType] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logSearchInput, setLogSearchInput] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => {
      setLogSearch(logSearchInput);
      setLogPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [logSearchInput]);

  const {
    data: broadcastsData,
    isLoading: isLoadingBroadcasts,
    isError: isBroadcastsError,
    refetch: refetchBroadcasts,
  } = useQuery({
    queryKey: ['communication-logs', 'BROADCAST', page, debouncedSearch],
    queryFn: () =>
      adminApi.getCommunicationLogs({ page, limit: 20, search: debouncedSearch, type: 'BROADCAST' }).then((r) => r.data),
    enabled: activeTab === 'broadcasts',
  });

  const {
    data: allLogsData,
    isLoading: isLoadingLogs,
    isError: isLogsError,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['communication-logs', 'ALL', logPage, logType, logStatus, logSearch],
    queryFn: () =>
      adminApi
        .getCommunicationLogs({ page: logPage, limit: 50, type: logType, status: logStatus, search: logSearch })
        .then((r) => r.data),
    enabled: activeTab === 'logs',
  });

  const broadcastMutation = useMutation({
    mutationFn: (formData) => adminApi.broadcastNotification(formData),
    onSuccess: (res) => {
      toast.success(`Broadcast sent successfully to ${res?.data?.count || 0} active users.`);
      setShowBroadcastModal(false);
      setBroadcastForm({ title: '', message: '', attachment: null });
      refetchBroadcasts();
      refetchLogs();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to send broadcast')),
  });

  const handleOpenAttachment = async (details) => {
    if (!details?.attachmentUrl) return;
    try {
      if (details.attachmentUrl.startsWith('http')) {
        setViewerFile({ url: details.attachmentUrl, name: details.attachmentName });
        setViewerOpen(true);
      } else {
        const res = await attachmentsApi.getBroadcastDownloadUrl(details.attachmentUrl);
        if (res.data?.url) {
          setViewerFile({ url: res.data.url, name: details.attachmentName });
          setViewerOpen(true);
        }
      }
    } catch {
      toast.error('Failed to load attachment preview');
    }
  };

  return (
    <div className="space-y-6 pb-14 w-full animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 font-display flex items-center gap-2">
            <Megaphone size={22} className="text-indigo-600" />
            System Communications
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Broadcast announcements to active staff and monitor email &amp; notification delivery logs
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setBroadcastForm({ title: '', message: '', attachment: null });
            setShowBroadcastModal(true);
          }}
          className="px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center gap-2 shadow-md shadow-indigo-500/20 whitespace-nowrap"
        >
          <Send size={15} /> New Broadcast
        </button>
      </div>

      {/* Unified Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('broadcasts')}
          className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
            activeTab === 'broadcasts'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
          }`}
        >
          <Megaphone size={14} /> System Broadcasts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
          }`}
        >
          <Mail size={14} /> Email &amp; Delivery Logs
        </button>
      </div>

      {activeTab === 'broadcasts' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search past broadcasts..."
                className="input pl-10 pr-8 bg-slate-50 text-xs py-2 rounded-xl border-slate-200 font-medium w-full"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {isBroadcastsError && (
            <Alert type="error" title="Error" message="Failed to load broadcast history." />
          )}

          <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-bold text-slate-800 text-sm">Past Broadcasts</h2>
            </div>
            {isLoadingBroadcasts ? (
              <div className="py-16 flex justify-center">
                <Spinner size={32} />
              </div>
            ) : (broadcastsData?.logs || []).length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Megaphone}
                  title="No broadcasts found"
                  message={debouncedSearch ? 'No broadcasts match your search query.' : 'Send a broadcast to notify active hospital users.'}
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {broadcastsData.logs.map((log) => (
                  <div key={log.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{log.subject}</p>
                        <p className="text-sm text-slate-600 mt-1">{log.content}</p>
                        <div className="flex flex-wrap items-center gap-2.5 mt-3">
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                            {timeAgo(log.created_at)}
                          </span>
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium border border-indigo-100">
                            {log.status}
                          </span>
                          {log.details?.attachmentName && (
                            <button
                              type="button"
                              onClick={() => handleOpenAttachment(log.details)}
                              className="hover:bg-emerald-100 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                            >
                              <Paperclip size={10} /> {log.details.attachmentName}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-slate-700">{log.full_name || 'System'}</p>
                        <p className="text-[10px] text-slate-400">{log.employee_id || ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="p-4 border-t border-slate-100 bg-slate-50/30">
                  <Pagination page={page} totalPages={broadcastsData?.totalPages || 1} onPageChange={setPage} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search email, recipient, subject..."
                value={logSearchInput}
                onChange={(e) => setLogSearchInput(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-sm outline-none"
              />
              {logSearchInput && (
                <button
                  type="button"
                  onClick={() => setLogSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={logType}
              onChange={(e) => {
                setLogType(e.target.value);
                setLogPage(1);
              }}
              className="select w-full sm:w-48 text-sm py-2"
            >
              <option value="">All Types</option>
              <option value="EMAIL">Email</option>
              <option value="IN_APP_NOTIFICATION">In-App Notification</option>
              <option value="BROADCAST">Broadcast</option>
            </select>

            <select
              value={logStatus}
              onChange={(e) => {
                setLogStatus(e.target.value);
                setLogPage(1);
              }}
              className="select w-full sm:w-48 text-sm py-2"
            >
              <option value="">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
            </select>

            {typeof allLogsData?.total === 'number' && (
              <div className="sm:ml-auto">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 whitespace-nowrap">
                  {allLogsData.total.toLocaleString()} records
                </span>
              </div>
            )}
          </div>

          {isLogsError && (
            <Alert type="error" title="Error" message="Failed to load communication logs." />
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden">
            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size={32} />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table w-full">
                    <thead>
                      <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                        <th className="py-3.5 pl-6">Date &amp; Time</th>
                        <th className="py-3.5">Type</th>
                        <th className="py-3.5">Recipient</th>
                        <th className="py-3.5">Subject</th>
                        <th className="py-3.5">Status</th>
                        <th className="py-3.5 pr-6">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(allLogsData?.logs || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-14 text-slate-400 font-medium">
                            No logs found matching criteria.
                          </td>
                        </tr>
                      ) : (
                        allLogsData.logs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="pl-6 py-3 text-xs font-mono font-medium text-slate-500 whitespace-nowrap">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1.5">
                                {TYPE_ICONS[log.type] || <Mail size={14} className="text-slate-400" />}
                                <span className="text-xs font-bold text-slate-700">
                                  {(log.type || '').replace(/_/g, ' ')}
                                </span>
                              </div>
                            </td>
                            <td className="py-3">
                              <p className="text-xs font-medium text-slate-900 break-all">{log.recipient_contact}</p>
                              {log.full_name && (
                                <p className="text-[10px] text-slate-500">
                                  {log.full_name} ({log.employee_id})
                                </p>
                              )}
                            </td>
                            <td className="py-3 max-w-[260px] truncate" title={log.subject}>
                              <span className="text-xs text-slate-700">{log.subject}</span>
                            </td>
                            <td className="py-3">
                              <span className={`badge font-bold text-[10px] ${LOG_STATUS_COLORS[log.status] || 'badge-gray'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="pr-6 py-3">
                              {log.status === 'FAILED' && log.error_message ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedLogDetails({ title: 'Delivery Error', content: log.error_message })}
                                  className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded border border-red-200 transition-colors inline-flex items-center gap-1"
                                >
                                  <AlertCircle size={12} /> View Error
                                </button>
                              ) : log.content ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedLogDetails({ title: log.subject || 'Message Content', content: log.content })}
                                  className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border border-blue-200 transition-colors inline-flex items-center gap-1"
                                >
                                  <Info size={12} /> View Message
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-slate-200 bg-slate-50/40">
                  <Pagination page={logPage} totalPages={allLogsData?.totalPages || 1} onPageChange={setLogPage} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* New Broadcast Modal */}
      <Modal
        open={showBroadcastModal}
        onClose={() => !broadcastMutation.isPending && setShowBroadcastModal(false)}
        title="Broadcast Notification"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowBroadcastModal(false)}
              disabled={broadcastMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) {
                  toast.error('Title and message are required.');
                  return;
                }
                const fd = new FormData();
                fd.append('title', broadcastForm.title.trim());
                fd.append('message', broadcastForm.message.trim());
                if (broadcastForm.attachment) {
                  fd.append('attachment', broadcastForm.attachment);
                }
                broadcastMutation.mutate(fd);
              }}
              disabled={broadcastMutation.isPending || !broadcastForm.title.trim() || !broadcastForm.message.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs disabled:opacity-50 transition-colors"
            >
              {broadcastMutation.isPending ? 'Sending...' : 'Send Broadcast'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert
            type="info"
            message="This message will be sent immediately as an in-app notification to all active users in the system."
          />
          <div>
            <label className="field-label field-required font-bold">Title</label>
            <input
              type="text"
              className="input bg-slate-50 font-medium"
              placeholder="e.g. System Maintenance Notice"
              value={broadcastForm.title}
              onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="field-label field-required font-bold">Message</label>
            <textarea
              className="input min-h-[100px] resize-none bg-slate-50 font-medium"
              placeholder="Enter the broadcast message..."
              value={broadcastForm.message}
              onChange={(e) => setBroadcastForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div>
            <label className="field-label font-bold">Attachment (Optional PDF/Image)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setBroadcastForm((f) => ({ ...f, attachment: e.target.files[0] }));
                }
              }}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(selectedLogDetails)}
        onClose={() => setSelectedLogDetails(null)}
        title={selectedLogDetails?.title || 'Log Details'}
        size="md"
        footer={
          <button type="button" onClick={() => setSelectedLogDetails(null)} className="btn-secondary">
            Close
          </button>
        }
      >
        <div className="p-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl font-mono whitespace-pre-wrap break-words max-h-[60vh] overflow-auto">
          {selectedLogDetails?.content}
        </div>
      </Modal>

      <AttachmentViewerModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileUrl={viewerFile?.url}
        fileName={viewerFile?.name}
      />
    </div>
  );
}
