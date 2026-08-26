import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, Modal, Alert, Pagination, AttachmentViewerModal } from '../../components/ui';
import { Send, Megaphone, Search, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeAgo } from '../../utils/helpers';
import { attachmentsApi } from '../../api';

export default function AdminCommunicationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', attachment: null });

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);

  // Get communication logs specifically for broadcasts, or all
  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['communication-logs', page, search],
    queryFn: () => adminApi.getCommunicationLogs({ page, limit: 20, search, type: 'BROADCAST' }).then(r => r.data),
  });

  const broadcastMutation = useMutation({
    mutationFn: (formData) => adminApi.broadcastNotification(formData),
    onSuccess: (res) => {
      toast.success(`Broadcast sent successfully to ${res?.data?.count || 0} users!`);
      setShowBroadcastModal(false);
      setBroadcastForm({ title: '', message: '', attachment: null });
      refetch();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send broadcast'),
  });

  return (
    <div className="space-y-6 pb-14 w-full animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Megaphone size={22} className="text-indigo-600" />
            System Communications
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Broadcast messages and manage system-wide notifications
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search past broadcasts..."
              className="input pl-10 bg-white text-xs py-2 rounded-xl border-slate-200 focus:border-indigo-500 font-medium w-full"
            />
          </div>
          <button
            onClick={() => {
              setBroadcastForm({ title: '', message: '', attachment: null });
              setShowBroadcastModal(true);
            }}
            className="px-5 py-2 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 whitespace-nowrap"
          >
            <Send size={15} /> New Broadcast
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">Past Broadcasts</h3>
        </div>
        {isLoading ? (
          <div className="py-16 flex justify-center"><Spinner size={32} /></div>
        ) : (logsData?.logs?.length === 0) ? (
          <div className="py-16 text-center text-slate-400 text-sm font-medium">
            No broadcast history found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logsData?.logs?.map(log => (
              <div key={log.id} className="p-6 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{log.subject}</p>
                    <p className="text-sm text-slate-600 mt-1">{log.content}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                        {timeAgo(log.created_at)}
                      </span>
                      <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium border border-indigo-100">
                        {log.status}
                      </span>
                      {log.details?.attachmentName && (
                        <span 
                          onClick={async () => {
                            if (!log.details.attachmentUrl) return;
                            try {
                              if (log.details.attachmentUrl.startsWith('http')) {
                                setViewerFile({ url: log.details.attachmentUrl, name: log.details.attachmentName });
                                setViewerOpen(true);
                              } else {
                                const res = await attachmentsApi.getBroadcastDownloadUrl(log.details.attachmentUrl);
                                if (res.data?.url) {
                                  setViewerFile({ url: res.data.url, name: log.details.attachmentName });
                                  setViewerOpen(true);
                                }
                              }
                            } catch (e) {
                              toast.error('Failed to load attachment');
                            }
                          }}
                          className="cursor-pointer hover:bg-emerald-100 flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 transition-colors"
                        >
                          <Paperclip size={10} /> {log.details.attachmentName}
                        </span>
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
              <Pagination page={page} totalPages={logsData?.totalPages || 1} onPageChange={setPage} />
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        title="Broadcast Notification"
        size="md"
        footer={
          <>
            <button onClick={() => setShowBroadcastModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => {
                if (!broadcastForm.title || !broadcastForm.message) {
                  toast.error('Title and message are required.');
                  return;
                }
                const fd = new FormData();
                fd.append('title', broadcastForm.title);
                fd.append('message', broadcastForm.message);
                if (broadcastForm.attachment) {
                  fd.append('attachment', broadcastForm.attachment);
                }
                broadcastMutation.mutate(fd);
              }}
              disabled={broadcastMutation.isPending || !broadcastForm.title || !broadcastForm.message}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs disabled:opacity-50 transition-colors"
            >
              {broadcastMutation.isPending ? 'Sending...' : 'Send Broadcast'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert variant="info" icon={<Send size={16} />}>
            This message will be sent as an in-app notification to ALL active users in the system instantly.
          </Alert>
          <div>
            <label className="field-label field-required font-bold">Title</label>
            <input
              type="text"
              className="input bg-slate-50 font-medium"
              placeholder="e.g. System Maintenance Notice"
              value={broadcastForm.title}
              onChange={e => setBroadcastForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="field-label field-required font-bold">Message</label>
            <textarea
              className="input min-h-[100px] resize-none bg-slate-50 font-medium"
              placeholder="Enter the broadcast message..."
              value={broadcastForm.message}
              onChange={e => setBroadcastForm(f => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div>
            <label className="field-label font-bold">Attachment (Optional PDF/Image)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2.5 file:px-4 file:rounded-xl
                file:border-0 file:text-sm file:font-semibold
                file:bg-indigo-50 file:text-indigo-700
                hover:file:bg-indigo-100 transition-all cursor-pointer"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  setBroadcastForm(f => ({ ...f, attachment: e.target.files[0] }));
                }
              }}
            />
          </div>
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
