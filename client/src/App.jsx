import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { queryClient, QUERY_CACHE_KEY, QUERY_CACHE_BUSTER } from './utils/queryClient';
import { getRoleDashboard } from './utils/helpers';
import { pingServer } from './api';

import AppLayout from './components/layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen } from './components/ui';
import LoginPage from './pages/auth/LoginPage';

const SettingsPage = lazy(() => import('./pages/auth/SettingsPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const ImcDashboard = lazy(() => import('./pages/dashboard/ImcDashboard'));
const ManagementDashboard = lazy(() => import('./pages/dashboard/ManagementDashboard'));
const SystemAdminDashboard = lazy(() => import('./pages/dashboard/SystemAdminDashboard'));
const CategoryDetailPage = lazy(() => import('./pages/dashboard/CategoryDetailPage'));
const MyTeamPage = lazy(() => import('./pages/dashboard/MyTeamPage'));
const NotificationsPage = lazy(() => import('./pages/dashboard/NotificationsPage'));
const IncidentsListPage = lazy(() => import('./pages/incidents/IncidentsListPage'));
const IncidentDetailPage = lazy(() => import('./pages/incidents/IncidentDetailPage'));
const NewIncidentPage = lazy(() => import('./pages/incidents/NewIncidentPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminAttachmentsPage = lazy(() => import('./pages/admin/AdminAttachmentsPage'));
const AdminCommunicationsPage = lazy(() => import('./pages/admin/AdminCommunicationsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage'));
const EmployeeDirectory = lazy(() => import('./pages/employees/EmployeeDirectory'));

const sessionStoragePersister = createSyncStoragePersister({
  storage: window.sessionStorage,
  key: QUERY_CACHE_KEY,
});

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isRootAdmin = String(user?.employeeId || '').trim() === '00000';
  if (isRootAdmin && roles && !roles.includes('system_admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to={getRoleDashboard(user)} replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated) return <Navigate to={getRoleDashboard(user)} replace />;
  return children;
}

export default function App() {
  useEffect(() => {
    pingServer();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: sessionStoragePersister,
        maxAge: 1000 * 60 * 60 * 24,
        buster: QUERY_CACHE_BUSTER,
      }}
    >
      <BrowserRouter>
        <div className="flex flex-col h-screen overflow-hidden print:h-auto print:overflow-visible">
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              },
              success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
          {import.meta.env.VITE_APP_ENV === 'staging' && (
            <div className="bg-amber-500 text-slate-900 text-xs font-bold py-1.5 px-4 text-center tracking-wide flex items-center justify-center gap-2 shadow-sm flex-shrink-0 z-50 print:hidden">
              <span>STAGING / TEST ENVIRONMENT</span>
              <span className="text-amber-950 font-normal">
                | Data entered here is isolated and will NOT affect Production
              </span>
            </div>
          )}

          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <PublicRoute>
                      <LoginPage />
                    </PublicRoute>
                  }
                />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />

                  {/* Employee & Feedback Reviewer Dashboard */}
                  <Route
                    path="dashboard"
                    element={
                      <ProtectedRoute roles={['employee', 'hod']}>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="my-team"
                    element={
                      <ProtectedRoute roles={['hod']}>
                        <MyTeamPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* IMC Portal */}
                  <Route
                    path="imc/dashboard"
                    element={
                      <ProtectedRoute roles={['imc']}>
                        <ImcDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Management Portal */}
                  <Route
                    path="management/dashboard"
                    element={
                      <ProtectedRoute roles={['head_management']}>
                        <ManagementDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="management/dashboard/category/:categoryName"
                    element={
                      <ProtectedRoute roles={['head_management', 'system_admin', 'imc']}>
                        <CategoryDetailPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* System Admin Portal */}
                  <Route
                    path="admin/dashboard"
                    element={
                      <ProtectedRoute roles={['system_admin']}>
                        <SystemAdminDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/analytics"
                    element={
                      <ProtectedRoute roles={['system_admin', 'head_management']}>
                        <AdminAnalyticsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/users"
                    element={
                      <ProtectedRoute roles={['system_admin']}>
                        <AdminUsersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/attachments"
                    element={
                      <ProtectedRoute roles={['system_admin']}>
                        <AdminAttachmentsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/communications"
                    element={
                      <ProtectedRoute roles={['system_admin']}>
                        <AdminCommunicationsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/settings"
                    element={
                      <ProtectedRoute roles={['system_admin']}>
                        <AdminSettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/audit"
                    element={
                      <ProtectedRoute roles={['system_admin']}>
                        <AdminAuditPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Shared Workspace Routes */}
                  <Route path="settings" element={<SettingsPage />} />
                  <Route
                    path="employees"
                    element={
                      <ProtectedRoute roles={['imc', 'head_management', 'system_admin']}>
                        <EmployeeDirectory />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="incidents" element={<IncidentsListPage />} />
                  <Route
                    path="incidents/new"
                    element={
                      <ProtectedRoute roles={['employee', 'hod']}>
                        <NewIncidentPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="incidents/:id" element={<IncidentDetailPage />} />

                  <Route
                    path="*"
                    element={
                      <div className="flex flex-col items-center justify-center h-64 text-center">
                        <p className="text-4xl font-bold text-slate-300 font-display mb-3">404</p>
                        <p className="text-slate-500 mb-4">Page not found</p>
                        <Link to="/" className="btn-primary">
                          Go to Dashboard
                        </Link>
                      </div>
                    }
                  />
                </Route>
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}
