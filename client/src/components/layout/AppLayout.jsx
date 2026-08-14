import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Bell, Settings, LogOut,
  Users, BarChart3, ClipboardList,
  ChevronRight, Menu, X, Shield, Search, Paperclip, Send
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { notificationsApi, authApi } from '../../api';
import { useQuery } from '@tanstack/react-query';
import { timeAgo } from '../../utils/helpers';
import { Spinner } from '../ui';
import CommitteeLoginModal from '../auth/CommitteeLoginModal';
import logoImg from '../../assets/logo.webp';

const getRoleDashboard = (role) => {
  if (role === 'imc') return '/imc/dashboard';
  if (role === 'head_management') return '/management/dashboard';
  if (role === 'system_admin') return '/admin/dashboard';
  return '/dashboard';
};

const getNavItems = (role) => {
  const base = [
    { to: getRoleDashboard(role), icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/incidents', icon: FileText, label: 'Incidents' },
  ];
  if (role === 'imc') {
    base.push(
      { to: '/imc/dashboard?tab=analytics', icon: BarChart3, label: 'Dept. Analytics', matchSearch: '?tab=analytics' },
      { to: '/imc/dashboard?tab=members', icon: Users, label: 'IMC Members', matchSearch: '?tab=members' },
      { to: '/employees', icon: Users, label: 'Employee Directory' }
    );
  }
  if (role === 'head_management') {
    base.push(
      { to: '/management/dashboard?tab=analytics', icon: BarChart3, label: 'Dept. Analytics', matchSearch: '?tab=analytics' },
      { to: '/employees', icon: Users, label: 'Employee Directory' }
    );
  }
  if (role === 'system_admin') {
    base.push(
      { to: '/admin/users', icon: Users, label: 'Users & Roles' },
      { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/admin/audit', icon: Shield, label: 'Audit Logs' },
      { to: '/admin/attachments', icon: Paperclip, label: 'Attachments' },
      { to: '/admin/settings', icon: Settings, label: 'System Settings' },
    );
  }
  return base;
};

export default function AppLayout() {
  const { user, logout, refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);


  const { data: notifData, refetch: refetchNotifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ limit: 10 }).then(r => r.data),
    refetchInterval: 30000,
  });

  const unreadCount = notifData?.unreadCount || 0;
  const navItems = getNavItems(user?.role);
  const location = useLocation(); // reactive — re-renders on every navigation

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setAdminModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const markRead = async (id) => {
    await notificationsApi.markRead(id);
    refetchNotifs();
  };

  const RoleTag = () => {
    if (user?.role === 'imc') return null;
    const map = {
      employee: { label: 'Employee', cls: 'bg-slate-100 text-slate-600' },
      hod: { label: 'HOD', cls: 'bg-amber-100 text-amber-700' },
      imc: { label: 'IMC Member', cls: 'bg-indigo-100 text-indigo-700' },
      head_management: { label: 'Management', cls: 'bg-purple-100 text-purple-700' },
      system_admin: { label: 'System Admin', cls: 'bg-blue-100 text-blue-700' },
    };
    const { label, cls } = map[user?.role] || map.employee;
    return <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
  };

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminTargetRole, setAdminTargetRole] = useState('imc');

  const openAdminLogin = (role) => {
    setAdminTargetRole(role);
    setAdminModalOpen(true);
  };

  const renderSidebarContent = () => {
    const isHod = user?.role === 'hod' ||
      (user?.designation || '').toUpperCase() === 'HOD' ||
      (user?.designation || '').toUpperCase().includes('HEAD OF DEPT') ||
      (user?.designation || '').toUpperCase().includes('HEAD OF DEPARTMENT');

    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/20 bg-white/40 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="JPHRC Logo" className="w-9 h-9 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 leading-tight">JPHRC</p>
              <p className="text-[10px] text-slate-500 leading-tight">Incident Management</p>
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-green-700 font-bold text-xs">
                {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{user?.fullName}</p>
              <p className="text-xs text-slate-500 truncate">{user?.employeeId}</p>
            </div>
          </div>
          <div className="mt-2">
            <RoleTag />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label, matchSearch }) => {
            // For links with a query param (e.g. ?tab=analytics), use reactive location.search
            if (matchSearch) {
              const isActive = location.search === matchSearch;
              return (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setSidebarOpen(false)}
                  className={isActive ? 'nav-item-active' : 'nav-item-inactive'}
                >
                  <Icon size={17} className="flex-shrink-0" />
                  <span>{label}</span>
                </NavLink>
              );
            }
            // Deactivate the main dashboard link when a sub-tab parameter is active
            const isDashboardLink = ['/imc/dashboard', '/management/dashboard', '/admin/dashboard', '/dashboard'].includes(to);
            return (
              <NavLink
                key={to}
                to={to}
                end={isDashboardLink}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => {
                  if (isDashboardLink && location.search.includes('tab=')) {
                    return 'nav-item-inactive';
                  }
                  return isActive ? 'nav-item-active' : 'nav-item-inactive';
                }}
              >
                <Icon size={17} className="flex-shrink-0" />
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-3 border-t border-slate-200 space-y-0.5">
          {user?.isSystemAdmin && user?.role !== 'system_admin' && (
            <button onClick={() => openAdminLogin('system_admin')} className="nav-item-inactive w-full text-left text-red-700 hover:bg-red-50">
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to System Admin</span>
            </button>
          )}
          {user?.isImcMember && user?.role !== 'imc' && (
            <button onClick={() => openAdminLogin('imc')} className="nav-item-inactive w-full text-left text-indigo-700 hover:bg-indigo-50">
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to IMC</span>
            </button>
          )}
          {user?.isManagementMember && user?.role !== 'head_management' && (
            <button onClick={() => openAdminLogin('head_management')} className="nav-item-inactive w-full text-left text-purple-700 hover:bg-purple-50">
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to Management</span>
            </button>
          )}
          {user?.role !== 'employee' && user?.role !== 'hod' && (
            <button onClick={() => openAdminLogin(isHod ? 'hod' : 'employee')} className="nav-item-inactive w-full text-left text-green-700 hover:bg-green-50">
              <Shield size={17} className="flex-shrink-0" />
              <span>{isHod ? 'Switch to HOD Dashboard' : 'Switch to Employee View'}</span>
            </button>
          )}
          <NavLink to="/settings" className="nav-item-inactive">
            <Settings size={17} />
            <span>Settings</span>
          </NavLink>
          <button onClick={handleLogout} className="nav-item-inactive w-full text-left text-red-600 hover:bg-red-50 hover:text-red-700">
            <LogOut size={17} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:h-auto print:block print:overflow-visible">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white/80 backdrop-blur-xl border-r border-white/40 h-full flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] print:hidden">
        {renderSidebarContent()}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50">
            <div className="flex justify-end p-3">
              <button onClick={() => setSidebarOpen(false)} className="btn-icon">
                <X size={20} />
              </button>
            </div>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 flex-shrink-0 print:hidden">
          <button onClick={() => setSidebarOpen(true)} className="btn-icon lg:hidden">
            <Menu size={20} />
          </button>

          <div className="flex-1 min-w-0 flex items-center justify-between pr-4">
            <p className="text-xs text-slate-500 hidden lg:block">
              Jaiprakash Hospital & Research Centre · Quality Health Care at Affordable Price
            </p>
            <div className="flex-1" />
          </div>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="btn-icon relative"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] min-h-[18px] px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-modal border border-slate-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => { markRead('all'); setNotifOpen(false); }}
                      className="text-xs text-blue-600 hover:underline"
                    >Mark all read</button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {!notifData?.notifications?.length ? (
                    <div className="py-8 text-center text-sm text-slate-500">No notifications</div>
                  ) : notifData.notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { markRead(n.id); if (n.incident_id) navigate(`/incidents/${n.incident_id}`); setNotifOpen(false); }}
                      className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 leading-snug">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 border-t border-slate-200">
                  <NavLink
                    to="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >View all notifications <ChevronRight size={12} className="inline" /></NavLink>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-slate-50/50 p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-[1600px] mx-auto"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommitteeLoginModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        targetRole={adminTargetRole}
      />
    </div>
  );
}
