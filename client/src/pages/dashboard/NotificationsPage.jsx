import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, attachmentsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Spinner, Alert, Pagination, AttachmentViewerModal } from '../../components/ui';
import {
  Bell, Check, Clock, CheckCheck, MailOpen, Mail, FileText,
  LayoutDashboard, FilePlus, ChevronRight, Info, RefreshCw, Users, Paperclip
} from 'lucide-react';
import { timeAgo, getRoleDashboard, getApiErrorMessage } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', 'page', page],
    queryFn: () => notificationsApi.list({ page, limit: 25 }).then(r => r.data),
  });

  const notifications = data?.notifications || [];
  const totalCount = data?.total ?? notifications.length;
  const unreadCount = data?.unreadCount ?? notifications.filter(n => !n.is_read).length;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(totalCount / 25));
  const readCount = Math.max(0, totalCount - unreadCount);

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to mark notification as read.')),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markRead('all'),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to mark notifications as read.')),
  });

  const handleOpenAttachment = async (notif) => {
    if (!notif?.attachment_url) return;
    if (notif.attachment_url.startsWith('http')) {
      setViewerFile({ url: notif.attachment_url, name: notif.attachment_name || 'Attachment' });
      setViewerOpen(true);
      return;
    }
    try {
      const res = await attachmentsApi.getBroadcastDownloadUrl(notif.attachment_url);
      if (res.data?.url) {
        setViewerFile({ url: res.data.url, name: notif.attachment_name || 'Attachment' });
        setViewerOpen(true);
      }
    } catch {
      toast.error('Failed to open attachment');
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.incident_id) {
      navigate(`/incidents/${encodeURIComponent(notif.incident_id)}`);
    } else if (notif.attachment_url) {
      await handleOpenAttachment(notif);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>;
  if (error) {
    return (
      <div className="space-y-4">
        <Alert type="error" title="Error" message={getApiErrorMessage(error, 'Failed to load notifications.')} />
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const quickLinks = [
    { label: 'Dashboard', icon: LayoutDashboard, to: getRoleDashboard(user), color: 'text-green-600 bg-green-50' },
    { label: 'Incidents', icon: FileText, to: '/incidents', color: 'text-blue-600 bg-blue-50' },
    user?.role === 'system_admin'
      ? { label: 'Users & Mappings', icon: Users, to: '/admin/users', color: 'text-indigo-600 bg-indigo-50' }
      : ['imc', 'head_management'].includes(user?.role)
        ? { label: 'Employee Directory', icon: Users, to: '/employees', color: 'text-indigo-600 bg-indigo-50' }
        : { label: 'Report Incident', icon: FilePlus, to: '/incidents/new', color: 'text-indigo-600 bg-indigo-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Bell size={24} className="text-blue-600" />
            Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up — no unread notifications'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {notifications.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Bell size={32} className="text-slate-300" />
                </div>
                <p className="font-medium text-slate-700">No notifications yet</p>
                <p className="text-sm text-slate-400 mt-1">You&apos;ll be notified when something happens to your incidents.</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 flex items-start gap-4 transition-colors ${notif.incident_id || notif.attachment_url ? 'cursor-pointer' : ''} ${!notif.is_read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'}`}
                >
                  <div className="mt-1.5 flex-shrink-0">
                    {!notif.is_read ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm shadow-blue-200" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className={`text-sm ${!notif.is_read ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {notif.title}
                        </h3>
                        <p className={`text-sm mt-0.5 ${!notif.is_read ? 'text-slate-700' : 'text-slate-500'}`}>
                          {notif.message}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Clock size={12} />
                            {timeAgo(notif.created_at)}
                          </p>
                          {notif.attachment_url && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!notif.is_read) markReadMutation.mutate(notif.id);
                                handleOpenAttachment(notif);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                            >
                              <Paperclip size={11} /> {notif.attachment_name || 'Attachment'}
                            </button>
                          )}
                        </div>
                      </div>
                      {!notif.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markReadMutation.mutate(notif.id);
                          }}
                          disabled={markReadMutation.isPending}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors whitespace-nowrap flex-shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Info size={15} className="text-slate-400" />
              Summary
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Bell size={15} className="text-slate-500" />
                  </div>
                  <span className="text-sm text-slate-600">Total</span>
                </div>
                <span className="text-sm font-bold text-slate-800">{totalCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Mail size={15} className="text-blue-600" />
                  </div>
                  <span className="text-sm text-slate-600">Unread</span>
                </div>
                <span className={`text-sm font-bold ${unreadCount > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                  {unreadCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                    <MailOpen size={15} className="text-green-600" />
                  </div>
                  <span className="text-sm text-slate-600">Read</span>
                </div>
                <span className="text-sm font-bold text-slate-800">{readCount}</span>
              </div>
            </div>

            {totalCount > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">Read progress</span>
                  <span className="text-xs font-semibold text-slate-600">
                    {Math.round((readCount / totalCount) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${(readCount / totalCount) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 py-2 rounded-lg transition-colors"
              >
                {markAllReadMutation.isPending ? <Spinner size={14} /> : <Check size={14} />}
                Mark all as read
              </button>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <ChevronRight size={15} className="text-slate-400" />
              Quick Links
            </h2>
            <div className="space-y-2">
              {quickLinks.map(({ label, icon: Icon, to, color }) => (
                <button
                  key={to}
                  onClick={() => navigate(to)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left group"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon size={15} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{label}</span>
                  <ChevronRight size={14} className="ml-auto text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AttachmentViewerModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileUrl={viewerFile?.url}
        fileName={viewerFile?.name}
      />
    </div>
  );
}
