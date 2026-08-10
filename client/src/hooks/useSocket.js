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
  const { user } = useAuthStore();

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      query: { userId: user?.id },
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
    });

    // When an incident is created, invalidate the incident list to trigger a refetch
    socket.on('incident_created', (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    });

    // When an incident is updated (withdrawn, feedback, status change), invalidate it
    socket.on('incident_updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ['incident', data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    });

    socket.on('new_notification', (data) => {
      toast.success(data.title || 'New Notification');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [queryClient, user?.id]);

  return socketRef.current;
}
