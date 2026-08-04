import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { queryClient } from './utils/queryClient';

import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import SettingsPage from './pages/auth/SettingsPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import ImcDashboard from './pages/dashboard/ImcDashboard';
import ManagementDashboard from './pages/dashboard/ManagementDashboard';
import SystemAdminDashboard from './pages/dashboard/SystemAdminDashboard';
import IncidentsListPage from './pages/incidents/IncidentsListPage';
import IncidentDetailPage from './pages/incidents/IncidentDetailPage';
import NewIncidentPage from './pages/incidents/NewIncidentPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminAuditPage from './pages/admin/AdminAuditPage';
import CategoryDetailPage from './pages/dashboard/CategoryDetailPage';
import NotificationsPage from './pages/dashboard/NotificationsPage';

// Returns the home URL for a given role
const getRoleDashboard = (role) => {
  if (role === 'imc') return '/imc/dashboard';
  if (role === 'head_management') return '/management/dashboard';
  if (role === 'system_admin') return '/admin/dashboard';
  return '/dashboard';
};

// ── React Query client ──────────────────────────────────────────────────────
// Imported from ./utils/queryClient to allow clearing cache across auth sessions

// ── localStorage persister ──────────────────────────────────────────────────
// Saves the entire React Query cache to localStorage key 'ims_query_cache'
// maxAge: cache survives for 24 hours across page refreshes
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'ims_query_cache',
});


function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to={getRoleDashboard(user?.role)} replace />;
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated) return <Navigate to={getRoleDashboard(user?.role)} replace />;
  return children;
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: localStoragePersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
      }}
    >
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '12px', fontSize: '14px', fontFamily: 'Inter, sans-serif', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Employee & HOD dashboard */}
            <Route path="dashboard" element={<ProtectedRoute roles={['employee','hod']}><DashboardPage /></ProtectedRoute>} />

            {/* IMC Portal */}
            <Route path="imc/dashboard" element={<ProtectedRoute roles={['imc']}><ImcDashboard /></ProtectedRoute>} />

            {/* Management Portal */}
            <Route path="management/dashboard" element={<ProtectedRoute roles={['head_management']}><ManagementDashboard /></ProtectedRoute>} />
            <Route path="management/dashboard/category/:categoryName" element={<ProtectedRoute roles={['head_management', 'system_admin', 'imc']}><CategoryDetailPage /></ProtectedRoute>} />

            {/* System Office Portal */}
            <Route path="admin/dashboard" element={<ProtectedRoute roles={['system_admin']}><SystemAdminDashboard /></ProtectedRoute>} />

            <Route path="settings" element={<SettingsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="incidents" element={<IncidentsListPage />} />
            <Route path="incidents/new" element={<NewIncidentPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
            <Route path="admin/analytics" element={<ProtectedRoute roles={['system_admin','head_management']}><AdminAnalyticsPage /></ProtectedRoute>} />
            <Route path="admin/users" element={<ProtectedRoute roles={['system_admin']}><AdminUsersPage /></ProtectedRoute>} />
            <Route path="admin/settings" element={<ProtectedRoute roles={['system_admin']}><AdminSettingsPage /></ProtectedRoute>} />
            <Route path="admin/audit" element={<ProtectedRoute roles={['system_admin']}><AdminAuditPage /></ProtectedRoute>} />
            <Route path="*" element={<div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-4xl font-bold text-slate-200 font-display mb-3">404</p><p className="text-slate-500 mb-4">Page not found</p><a href="/dashboard" className="btn-primary">Go to Dashboard</a></div>} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}
