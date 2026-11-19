import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { useAuthStore } from '../store/authStore';

// Make sure you have your VITE_API_URL pointing to the backend root (not /api)
// E.g., if VITE_API_URL is 'http://localhost:5000/api', the socket should connect to 'http://localhost:5000'
const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000';

export function useSocket() {
  const socketRef = useRef(null);
  const queryClient = useQueryClient();
  const { token } = useAuthStore();

  useEffect(() => {
    // Only connect when an authenticated Bearer JWT is present; pass via handshake auth (never query string)
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
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
    });

    // When an incident is created, invalidate the incident list to trigger a refetch
    socket.on('incident_created', () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
    });

    // When an incident is updated (withdrawn, feedback, status change, letters forwarded), invalidate it
    socket.on('incident_updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ['incident', String(data.id)] });
        queryClient.invalidateQueries({ queryKey: ['incident', Number(data.id)] });
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'incident' &&
            String(query.queryKey[1]) === String(data.id)
        });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    socket.on('new_notification', (data) => {
      toast.success(data.title || 'New Notification');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [queryClient, token]);

  return socketRef.current;
}
