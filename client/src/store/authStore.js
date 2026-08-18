import { create } from 'zustand';
import { authApi } from '../api';
import { queryClient } from '../utils/queryClient';

export const useAuthStore = create((set) => ({
  user: (() => {
    try { return JSON.parse(sessionStorage.getItem('ims_user')); } catch { return null; }
  })(),
  token: sessionStorage.getItem('ims_token'),
  isAuthenticated: !!sessionStorage.getItem('ims_token'),
  loading: false,
  error: null,

  login: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.login(credentials);
      queryClient.clear();
      sessionStorage.removeItem('ims_query_cache');
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : (errData?.message || 'Login failed. Please try again.');
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await authApi.register(data);
      set({ loading: false });
      return { success: true, message: response.data.message, employeeId: response.data.employeeId };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : (errData?.message || 'Registration failed. Please try again.');
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  committeeLogin: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.committeeLogin(credentials);
      queryClient.clear();
      sessionStorage.removeItem('ims_query_cache');
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : (errData?.message || 'Login failed. Please try again.');
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  switchRole: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.switchRole(credentials);
      queryClient.clear();
      sessionStorage.removeItem('ims_query_cache');
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : (errData?.message || 'Role switch failed. Incorrect password.');
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  leaveRole: async (targetRole) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.leaveRole({ targetRole });
      queryClient.clear();
      sessionStorage.removeItem('ims_query_cache');
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : (errData?.message || 'Failed to leave role.');
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  logout: () => {
    queryClient.clear();
    sessionStorage.removeItem('ims_token');
    sessionStorage.removeItem('ims_user');
    // Clear cached query data so a new user doesn't see stale data from previous session
    sessionStorage.removeItem('ims_query_cache');
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateUser: (user) => {
    sessionStorage.setItem('ims_user', JSON.stringify(user));
    set({ user });
  },

  refreshUser: async () => {
    try {
      const { data } = await authApi.getMe();
      sessionStorage.setItem('ims_user', JSON.stringify(data));
      set({ user: data });
    } catch (e) {
      console.debug('Failed to refresh user:', e.message);
    }
  },
}));

// Role helpers
export const isAdmin = (user) => user?.role === 'system_admin';
export const isImc = (user) => user?.role === 'imc';
export const isHod = (user) => user?.role === 'hod';
export const isMd = (user) => user?.role === 'head_management';
export const isAsstCoo = (user) => user?.role === 'asst_coo';
export const isCoo = (user) => user?.role === 'coo';
export const isEmployee = (user) => user?.role === 'employee';
