import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api';
import { Spinner, Alert } from '../../components/ui';
import { Bell, Check, Clock } from 'lucide-react';
import { timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const qc = useQueryClient();

  const { data: notifications = [], isLoading, error } = useQuery({
    queryKey: ['notifications', 'page'],
    queryFn: () => notificationsApi.list().then(r => r.data?.notifications || []),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => Promise.all(notifications.filter(n => !n.is_read).map(n => notificationsApi.markRead(n.id))),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>;
  if (error) return <Alert type="error" title="Error" message="Failed to load notifications." />;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Bell size={24} className="text-blue-600" />
            Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            You have {unreadCount} unread notification{unreadCount !== 1 && 's'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="btn-secondary btn-sm"
          >
            <Check size={16} />
            Mark all as read
          </button>
        )}
      </div>

      <div className="card divide-y divide-slate-100 overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Bell size={48} className="mx-auto text-slate-300 mb-3" />
            <p>You have no notifications yet.</p>
          </div>
        ) : (
          notifications.map(notif => (
            <div 
              key={notif.id} 
              className={`p-4 flex items-start gap-4 transition-colors ${!notif.is_read ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
            >
              <div className="mt-1">
                {!notif.is_read ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-1 shadow-sm shadow-blue-200" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 mt-1" />
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
                    <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
                      <Clock size={12} />
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>
                  {!notif.is_read && (
                    <button 
                      onClick={() => markReadMutation.mutate(notif.id)}
                      disabled={markReadMutation.isPending}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors whitespace-nowrap"
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
    </div>
  );
}
