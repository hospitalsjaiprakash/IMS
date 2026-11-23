import { create } from 'zustand';
import { authApi } from '../api';
import { resetQueryCache } from '../utils/queryClient';

const readInitialSession = () => {
  try {
    const token = sessionStorage.getItem('ims_token');
    const rawUser = sessionStorage.getItem('ims_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    if (!token || !user || typeof user !== 'object') {
      return { token: null, user: null, isAuthenticated: false };
    }
    return { token, user, isAuthenticated: true };
  } catch {
    return { token: null, user: null, isAuthenticated: false };
  }
};

const touchActivityTimestamp = () => {
  const now = String(Date.now());
  try {
    sessionStorage.setItem('ims_last_activity_at', now);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem('ims_last_activity_at', now);
  } catch {
    // ignore
  }
};

const initialSession = readInitialSession();

export const useAuthStore = create((set) => ({
  user: initialSession.user,
  token: initialSession.token,
  isAuthenticated: initialSession.isAuthenticated,
  loading: false,
  error: null,

  login: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.login(credentials);
      resetQueryCache();
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      touchActivityTimestamp();
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : errData?.message || 'Login failed. Please try again.';
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  requestRegistrationOtp: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await authApi.requestRegistrationOtp(data);
      set({ loading: false });
      return { success: true, message: response.data.message };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : errData?.message || 'Failed to request OTP. Please try again.';
      set({ error, loading: false });
      return {
        success: false,
        error,
        code: err.response?.data?.code,
        retryAfterSeconds: err.response?.data?.retryAfterSeconds,
      };
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
      const error = typeof errData === 'string' ? errData : errData?.message || 'Registration failed. Please try again.';
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  switchRole: async ({ targetRole }) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.switchRole({ targetRole });
      resetQueryCache();
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      touchActivityTimestamp();
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : errData?.message || 'Role switch failed.';
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  leaveRole: async (targetRole) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.leaveRole({ targetRole });
      resetQueryCache();
      sessionStorage.setItem('ims_token', data.token);
      sessionStorage.setItem('ims_user', JSON.stringify(data.user));
      touchActivityTimestamp();
      set({ user: data.user, token: data.token, isAuthenticated: true, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const errData = err.response?.data?.error;
      const error = typeof errData === 'string' ? errData : errData?.message || 'Failed to leave role.';
      set({ error, loading: false });
      return { success: false, error };
    }
  },

  clearLocalSession: ({ broadcast = true } = {}) => {
    resetQueryCache();
    sessionStorage.removeItem('ims_token');
    sessionStorage.removeItem('ims_user');
    sessionStorage.removeItem('ims_last_activity_at');
    try {
      localStorage.removeItem('ims_last_activity_at');
      if (broadcast) {
        localStorage.setItem('ims_logout_at', String(Date.now()));
      }
    } catch {
      // ignore
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  logout: async () => {
    const currentToken = sessionStorage.getItem('ims_token');
    if (currentToken) {
      try {
        await authApi.logout();
      } catch {
        // Best-effort server-side token revocation; always clear local session
      }
    }
    useAuthStore.getState().clearLocalSession({ broadcast: true });
  },

  updateUser: (user) => {
    sessionStorage.setItem('ims_user', JSON.stringify(user));
    set({ user });
  },

  updateSession: (token, user) => {
    if (token) sessionStorage.setItem('ims_token', token);
    if (user) sessionStorage.setItem('ims_user', JSON.stringify(user));
    set((state) => {
      const nextToken = token || state.token;
      const nextUser = user || state.user;
      return {
        token: nextToken,
        user: nextUser,
        isAuthenticated: Boolean(nextToken && nextUser),
      };
    });
  },

  refreshUser: async () => {
    try {
      const { data } = await authApi.getMe();
      sessionStorage.setItem('ims_user', JSON.stringify(data));
      set({ user: data });
    } catch {
      // Handled silently or by 401 response interceptor
    }
  },
}));

// Role helpers
export const isAdmin = (user) => user?.role === 'system_admin';
export const isImc = (user) => user?.role === 'imc';
export const isImcLead = (user) => user?.role === 'imc' && Boolean(user?.isImcLead || user?.is_imc_lead);
export const isHod = (user) => user?.role === 'hod';
export const isFeedbackReviewer = (user) => user?.role === 'hod' || Boolean(user?.isFeedbackReviewer);
export const isMd = (user) => user?.role === 'head_management';
export const isAsstCoo = (user) => user?.role === 'asst_coo';
export const isCoo = (user) => user?.role === 'coo';
export const isEmployee = (user) => user?.role === 'employee';
