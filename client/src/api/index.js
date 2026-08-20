import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const UPLOADS_URL = API_BASE_URL.replace(/\/api$/, '/uploads');

// ─── Axios instances ──────────────────────────────────────────────────────────
// Standard instance (30s timeout) for regular requests
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Long-timeout instance (60s) for login — Render free-tier can take 30-50s to cold start
const authApi_axios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

// Attach JWT token on every request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('ims_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
authApi_axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('ims_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — clear token and redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      if (
        url.includes('/auth/login') ||
        url.includes('/auth/committee-login') ||
        url.includes('/auth/switch-role') ||
        url.includes('/auth/leave-role') ||
        url.includes('/auth/register')
      ) {
        return Promise.reject(err);
      }
      sessionStorage.removeItem('ims_token');
      sessionStorage.removeItem('ims_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────
export const authApi = {
  // Use 60s-timeout instance for login/register — Render cold start can take up to 50s
  register: (data) => authApi_axios.post('/auth/register', data),
  login: (data) => authApi_axios.post('/auth/login', data),
  committeeLogin: (data) => authApi_axios.post('/auth/committee-login', data),
  switchRole: (data) => api.post('/auth/switch-role', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  employeeForgotPassword: (data) => api.post('/auth/employee-forgot-password', data),
  employeeResetPassword: (data) => api.post('/auth/employee-reset-password', data),
  changePasswordOtp: () => api.post('/auth/change-password-otp'),
  getMe: () => api.get('/auth/me'),
  getCommitteeMembers: () => api.get('/auth/committee-members'),
  leaveRole: (data) => api.post('/auth/leave-role', data),
  updateNotificationPrefs: (data) => api.put('/auth/notification-prefs', data),
  updateContactInfo: (data) => api.put('/auth/contact-info', data),
};

// ── Server wake-up ping (call on app load to avoid cold-start delays on login) ──
export const pingServer = () =>
  axios.get(`${API_BASE_URL.replace(/\/api$/, '')}/ping`, { timeout: 8000 }).catch(() => {});

// ── Incidents ─────────────────────────────────────
export const incidentsApi = {
  list: (params) => api.get('/incidents', { params }),
  exportReport: (params) => api.get('/incidents/export', { params }),
  get: (id) => api.get(`/incidents/${id}`),
  create: (data) => api.post('/incidents', data),
  updateIncident: (id, data) => api.put(`/incidents/${id}`, data),
  getStats: () => api.get('/incidents/stats'),
  withdraw: (id, data) => api.post(`/incidents/${id}/withdraw`, data),
  hodFeedback: (id, data) => api.post(`/incidents/${id}/hod-feedback`, data),
  imcFeedback: (id, data) => api.post(`/incidents/${id}/imc-feedback`, data),
  mdDecision: (id, data) => api.post(`/incidents/${id}/md-decision`, data),
  reopen: (id, data) => api.post(`/incidents/${id}/reopen`, data),
  assignInvestigator: (id, data) => api.post(`/incidents/${id}/assign-investigator`, data),
  requestRedirect: (id, data) => api.post(`/incidents/${id}/request-redirect`, data),
  approveRedirect: (id, data) => api.post(`/incidents/${id}/approve-redirect`, data),
  rejectRedirect: (id, data) => api.post(`/incidents/${id}/reject-redirect`, data),
  verifyTraining: (id) => api.post(`/incidents/${id}/verify-training`),
  editFeedback: (id, data) => api.put(`/incidents/${id}/feedback`, data),
  escalatePriority: (id) => api.post(`/incidents/${id}/escalate-priority`),
  claim: (id) => api.post(`/incidents/${id}/claim`),
  remindHod: (id) => api.post(`/incidents/${id}/remind-hod`),
};

// ── Notifications ─────────────────────────────────
export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
};

// ── Locations, Departments ────────────────────────
export const metaApi = {
  locations: () => api.get('/locations'),
  departments: () => api.get('/departments'),
  designations: () => Promise.resolve({ data: [
    'Medical Officer', 'Nursing Staff', 'Pharmacist', 'Lab Technician',
    'Radiologist', 'Administrative Officer', 'Finance Officer', 'HR Manager',
    'Security Officer', 'Housekeeping Staff', 'HOD', 'Senior Coordinator',
    'Junior Coordinator', 'Supervisor', 'Consultant', 'Intern'
  ] }),
};

// ── IMC ───────────────────────────────────────────
export const imcApi = {
  queue: () => api.get('/imc/queue'),
};


// ── Training ──────────────────────────────────────
export const trainingApi = {
  list: () => api.get('/training'),
  complete: (id) => api.post(`/training/${id}/complete`),
};

// ── Admin ─────────────────────────────────────────
export const adminApi = {
  getConfig: () => api.get('/admin/config'),
  updateConfig: (data) => api.put('/admin/config', data),
  getAllAttachments: () => api.get('/admin/attachments'),
  requestRolePasswordOtp: () => api.post('/admin/role-credentials/otp'),
  updateRoleCredentials: (data) => api.put('/admin/role-credentials', data),
  getImcMembers: () => api.get('/admin/imc-members'),
  assignImc: (data) => api.post('/admin/assign-imc', data),
  assignRole: (data) => api.post('/admin/assign-role', data),
  removeImc: (id) => api.delete(`/admin/imc-members/${id}`),
  stopImcAccess: (data) => api.post('/admin/stop-imc', data),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getAnalytics: () => api.get('/admin/analytics'),
  getUsers: (params) => api.get('/admin/users', { params }),
  getRoleAudit: () => api.get('/admin/role-audit'),
  getManagementMembers: () => api.get('/admin/management-members'),
  removeManagement: (id) => api.delete(`/admin/management-members/${id}`),
  mapDepartmentLeader: (data) => api.post('/admin/map-department-leader', data),
  getSystemAdmins: () => api.get('/admin/system-admins'),
  toggleUserStatus: (id) => api.post(`/admin/users/${id}/toggle-status`),
  getCommunicationLogs: (params) => api.get('/admin/communication-logs', { params }),
};

// ── Attachment Download (presigned) ────────────────
export const attachmentsApi = {
  getDownloadUrl: (id) => api.get(`/attachments/${id}/download`),
};

// ── Employee Search ─────────────────────────────────
export const employeeApi = {
  search: (q) => api.get('/employee/search', { params: { q } }),
  getDirectory: (params) => api.get('/employees/directory', { params }),
};

export default api;
