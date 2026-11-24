import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Bell, Settings, LogOut,
  Users, BarChart3, ChevronRight, Menu, X, Shield, Paperclip, Megaphone
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useIdleLogout } from '../../hooks/useIdleLogout';
import { useSocket } from '../../hooks/useSocket';
import { notificationsApi, attachmentsApi } from '../../api';
import { useQuery } from '@tanstack/react-query';
import { timeAgo, getRoleDashboard, ROLE_CONFIG } from '../../utils/helpers';
import { AttachmentViewerModal } from '../ui';
import toast from 'react-hot-toast';
import logoImg from '../../assets/logo.webp';

const getNavItems = (user) => {
  const role = user?.role;
  const base = [
    { to: getRoleDashboard(user), icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/incidents', icon: FileText, label: 'Incidents' },
  ];
  if (role === 'hod') {
    base.push({ to: '/my-team', icon: Users, label: 'My Team' });
  }
  if (role === 'imc') {
    base.push(
      { to: '/imc/dashboard?tab=analytics', icon: BarChart3, label: 'Category Analytics', matchSearch: '?tab=analytics' },
      { to: '/imc/dashboard?tab=members', icon: Users, label: 'IMC Members', matchSearch: '?tab=members' },
      { to: '/employees', icon: Users, label: 'Employee Directory' }
    );
  }
  if (role === 'head_management') {
    base.push(
      { to: '/management/dashboard?tab=analytics', icon: BarChart3, label: 'Category Analytics', matchSearch: '?tab=analytics' },
      { to: '/employees', icon: Users, label: 'Employee Directory' }
    );
  }
  if (role === 'system_admin') {
    base.push(
      { to: '/admin/users', icon: Users, label: 'Users & Mappings' },
      { to: '/admin/communications', icon: Megaphone, label: 'Communications' },
      { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/admin/audit', icon: Shield, label: 'Audit Logs' },
      { to: '/admin/attachments', icon: Paperclip, label: 'Attachments' },
      { to: '/admin/settings', icon: Settings, label: 'System Settings' }
    );
  }
  return base;
};

export default function AppLayout() {
  const { user, logout, refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);
  const notifRef = useRef(null);

  useIdleLogout();
  useSocket();

  const { data: notifData, refetch: refetchNotifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ limit: 10 }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const unreadCount = notifData?.unreadCount || 0;
  const navItems = getNavItems(user);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const markRead = async (id) => {
    try {
      await notificationsApi.markRead(id);
      refetchNotifs();
    } catch {
      // ignore
    }
  };

  const openSwitchRole = async (targetRole) => {
    const result = await useAuthStore.getState().switchRole({ targetRole });
    if (result.success) {
      navigate(getRoleDashboard(result.user));
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const renderRoleBadge = () => {
    const isConvenor = user?.role === 'imc' && Boolean(user?.isImcLead || user?.is_imc_lead);
    const label = isConvenor
      ? 'IMC Lead / Convenor'
      : ROLE_CONFIG[user?.role]?.label || user?.role || 'Employee';
    const cls = ROLE_CONFIG[user?.role]?.badgeClass || 'badge-gray';
    return (
      <span className={`${cls} text-[10px] font-bold uppercase tracking-wider`}>
        {label}
      </span>
    );
  };

  const renderSidebarContent = () => {
    const isRootSystemAccount = String(user?.employeeId || '').trim() === '00000';

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-4 border-b border-slate-100 bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoImg} alt="JPHRC Logo" className="w-9 h-9 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 leading-tight">JPHRC</p>
              <p className="text-[10px] text-slate-500 leading-tight">Incident Management</p>
            </div>
          </div>
          {sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="btn-icon lg:hidden"
              aria-label="Close navigation menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

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
          <div className="mt-2">{renderRoleBadge()}</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label, matchSearch }) => {
            if (matchSearch) {
              const isActive = location.search === matchSearch && location.pathname === to.split('?')[0];
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

        <div className="px-3 py-3 border-t border-slate-200 space-y-0.5">
          {user?.isSystemAdmin && user?.role !== 'system_admin' && (
            <button
              type="button"
              onClick={() => openSwitchRole('system_admin')}
              className="nav-item-inactive w-full text-left text-red-700 hover:bg-red-50"
            >
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to System Admin</span>
            </button>
          )}
          {user?.isImcMember && user?.role !== 'imc' && (
            <button
              type="button"
              onClick={() => openSwitchRole('imc')}
              className="nav-item-inactive w-full text-left text-indigo-700 hover:bg-indigo-50"
            >
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to IMC</span>
            </button>
          )}
          {user?.isManagementMember && user?.role !== 'head_management' && (
            <button
              type="button"
              onClick={() => openSwitchRole('head_management')}
              className="nav-item-inactive w-full text-left text-purple-700 hover:bg-purple-50"
            >
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to Management</span>
            </button>
          )}
          {!isRootSystemAccount && user?.role !== 'employee' && user?.role !== 'hod' && (
            <button
              type="button"
              onClick={() => openSwitchRole(user?.isHod ? 'hod' : 'employee')}
              className="nav-item-inactive w-full text-left text-green-700 hover:bg-green-50"
            >
              <Shield size={17} className="flex-shrink-0" />
              <span>Switch to Staff View</span>
            </button>
          )}
          <NavLink to="/settings" onClick={() => setSidebarOpen(false)} className="nav-item-inactive">
            <Settings size={17} />
            <span>Settings</span>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="nav-item-inactive w-full text-left text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={17} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 h-full flex overflow-hidden bg-slate-50 print:h-auto print:block print:overflow-visible">
      <aside className="hidden lg:flex w-64 bg-white/90 backdrop-blur-xl border-r border-slate-200/80 h-full flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] print:hidden">
        {renderSidebarContent()}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 flex-shrink-0 print:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="btn-icon lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 min-w-0 flex items-center justify-between pr-4">
            <p className="text-xs text-slate-500 hidden lg:block">
              Jaiprakash Hospital &amp; Research Centre · Quality Health Care at Affordable Price
            </p>
            <div className="flex-1" />
          </div>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="btn-icon relative"
              aria-label="Toggle notifications"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] min-h-[18px] px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        markRead('all');
                        setNotifOpen(false);
                      }}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {!notifData?.notifications?.length ? (
                    <div className="py-8 text-center text-sm text-slate-500">No notifications</div>
                  ) : (
                    notifData.notifications.map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={async () => {
                          markRead(n.id);
                          if (n.incident_id) {
                            navigate(`/incidents/${n.incident_id}`);
                          } else if (n.attachment_url) {
                            if (n.attachment_url.startsWith('http')) {
                              setViewerFile({ url: n.attachment_url, name: n.attachment_name });
                              setViewerOpen(true);
                            } else {
                              try {
                                const res = await attachmentsApi.getBroadcastDownloadUrl(n.attachment_url);
                                if (res.data?.url) {
                                  setViewerFile({ url: res.data.url, name: n.attachment_name });
                                  setViewerOpen(true);
                                }
                              } catch {
                                toast.error('Failed to open attachment');
                              }
                            }
                          }
                          setNotifOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors block ${
                          !n.is_read ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 leading-snug">{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-[10px] text-slate-400">{timeAgo(n.created_at)}</p>
                              {n.attachment_url && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                  <Paperclip size={10} /> Attachment
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-slate-200">
                  <NavLink
                    to="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    View all notifications <ChevronRight size={12} />
                  </NavLink>
                </div>
              </div>
            )}
          </div>
        </header>

        {user?.maintenanceMode && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-xs font-semibold text-amber-900 flex items-center justify-center gap-2 flex-shrink-0 print:hidden">
            <span>⚠️ SYSTEM MAINTENANCE MODE ACTIVE — Reporting of new incidents is temporarily paused for staff.</span>
          </div>
        )}

        <main className="flex-1 overflow-auto bg-slate-50/50 p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AttachmentViewerModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileUrl={viewerFile?.url}
        fileName={viewerFile?.name}
      />
    </div>
  );
}
