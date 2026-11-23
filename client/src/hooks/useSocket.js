import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = RAW_API_URL.startsWith('http') ? RAW_API_URL.replace(/\/api\/?$/, '') : undefined;

export function useSocket() {
  const socketRef = useRef(null);
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      const msg = String(err?.message || '');
      if (msg === 'SESSION_REVOKED' || msg === 'ACCOUNT_DISABLED') {
        socket.disconnect();
        useAuthStore.getState().clearLocalSession({ broadcast: false });
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    });

    socket.on('incident_created', () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['system-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['category-analytics'] });
    });

    socket.on('incident_updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (data?.id) {
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'incident' && String(query.queryKey[1]) === String(data.id),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['system-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['category-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    socket.on('new_notification', (data) => {
      toast.success(data?.title || 'New Notification');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [queryClient, token]);

  return socketRef;
}
