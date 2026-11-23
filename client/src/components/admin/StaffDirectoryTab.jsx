import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, Pagination, ConfirmDialog } from '../ui';
import { Search, Users, Edit3, ShieldX, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate, formatDateTime, ROLE_CONFIG, getApiErrorMessage } from '../../utils/helpers';

const ROLES = [
  { value: '', label: 'All Roles & Access' },
  { value: 'employee', label: 'Regular Employee' },
  { value: 'hod', label: 'Dept Reviewer (Legacy)' },
  { value: 'imc', label: 'IMC Committee Member' },
  { value: 'head_management', label: 'Executive Management' },
  { value: 'system_admin', label: 'System Administrator' },
  { value: 'unregistered', label: 'Unregistered (No IMS)' },
];

const ROLE_BADGE_MAP = {
  employee: 'bg-slate-100 text-slate-700 border-slate-200',
  hod: 'bg-amber-50 text-amber-800 border-amber-300',
  imc: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  head_management: 'bg-purple-50 text-purple-700 border-purple-200',
  system_admin: 'bg-rose-50 text-rose-700 border-rose-200 font-extrabold',
};

const PAGE_SIZE = 50;

export default function StaffDirectoryTab({
  masterEmployees = [],
  isLoadingMaster = false,
  departments = [],
  syncStatusData,
  onSelectUser,
  onOpenConfigure,
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [toggleTarget, setToggleTarget] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleStatusMutation = useMutation({
    mutationFn: (userId) => adminApi.toggleUserStatus(userId),
    onSuccess: () => {
      const actionLabel = toggleTarget?.is_active ? 'deactivated' : 'activated';
      toast.success(`User account ${actionLabel} successfully.`);
      setToggleTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['master-employees'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update user account status')),
  });

  const filteredPersonnel = useMemo(() => {
    return (masterEmployees || []).filter((u) => {
      const term = debouncedSearch.toLowerCase().trim();
      if (term) {
        const matches =
          (u.full_name || '').toLowerCase().includes(term) ||
          (u.employee_id || '').toLowerCase().includes(term) ||
          (u.department || '').toLowerCase().includes(term) ||
          (u.designation || '').toLowerCase().includes(term) ||
          (u.email || '').toLowerCase().includes(term) ||
          (u.phone || '').toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (roleFilter) {
        const hasImcAccess = u.role === 'imc' || u.is_imc_member || u.is_imc_lead;
        const hasMgmtAccess = u.role === 'head_management' || u.is_management_member;
        const isSysAdmin = u.role === 'system_admin' || u.is_system_admin;

        if (roleFilter === 'system_admin' && !isSysAdmin) return false;
        if (roleFilter === 'imc' && !hasImcAccess) return false;
        if (roleFilter === 'head_management' && !hasMgmtAccess) return false;
        if (roleFilter === 'hod' && u.role !== 'hod') return false;
        if (roleFilter === 'employee' && (!u.is_registered || u.role !== 'employee' || isSysAdmin || hasImcAccess || hasMgmtAccess)) return false;
        if (roleFilter === 'unregistered' && u.is_registered) return false;
      }

      if (statusFilter !== 'all') {
        const hrmsStatus = u.status || 'active';
        if (hrmsStatus !== statusFilter) return false;
      }

      if (selectedDeptFilter !== 'all') {
        if ((u.department || '').toLowerCase() !== selectedDeptFilter.toLowerCase()) return false;
      }

      return true;
    });
  }, [masterEmployees, debouncedSearch, roleFilter, statusFilter, selectedDeptFilter]);

  const totalPages = Math.ceil(filteredPersonnel.length / PAGE_SIZE) || 1;
  const paginatedPersonnel = filteredPersonnel.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(search || roleFilter || selectedDeptFilter !== 'all' || statusFilter !== 'all');

  const handleRowClick = (u) => {
    if (!u.is_registered || !u.id) {
      toast('This employee has not registered an IMS account yet.');
      return;
    }
    onSelectUser(u);
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md overflow-hidden animate-in fade-in duration-200">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            <span>Hospital Personnel Directory</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Showing {filteredPersonnel.length} personnel ({masterEmployees.length || 0} total staff)
            {syncStatusData?.lastOfficePortalSync?.completed_at && (
              <span className="ml-2 font-medium text-indigo-600">
                (OfficePortal last synced: {formatDateTime(syncStatusData.lastOfficePortalSync.completed_at)})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:flex-initial min-w-[220px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, email, dept..."
              className="input pl-10 pr-8 bg-white text-xs py-2 rounded-xl border-slate-200 focus:border-blue-500 font-medium w-full"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={selectedDeptFilter}
            onChange={(e) => {
              setSelectedDeptFilter(e.target.value);
              setPage(1);
            }}
            className="select w-40 bg-white font-semibold text-xs py-2 rounded-xl border-slate-200"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id || d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="select w-36 bg-white font-semibold text-xs py-2 rounded-xl border-slate-200"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Staff</option>
            <option value="noticePeriod">Notice Period</option>
            <option value="inactive">Inactive</option>
            <option value="terminated">Terminated</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="select w-44 bg-white font-semibold text-xs py-2 rounded-xl border-slate-200"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRoleFilter('');
                setSelectedDeptFilter('all');
                setStatusFilter('all');
                setPage(1);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1 underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
              <th className="py-3.5 pl-6">Employee</th>
              <th className="py-3.5">ID Number</th>
              <th className="py-3.5">Department</th>
              <th className="py-3.5">Designation</th>
              <th className="py-3.5">Portal Access &amp; Roles</th>
              <th className="py-3.5">Status</th>
              <th className="py-3.5 pr-6 text-right">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoadingMaster ? (
              <tr>
                <td colSpan={7} className="text-center py-14">
                  <Spinner size={24} />
                </td>
              </tr>
            ) : filteredPersonnel.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-14 text-slate-400 font-medium">
                  No personnel found matching your filter criteria.
                </td>
              </tr>
            ) : (
              paginatedPersonnel.map((u) => {
                const hasImcAccess = u.role === 'imc' || u.is_imc_member || u.is_imc_lead;
                const hasMgmtAccess = u.role === 'head_management' || u.is_management_member;
                const isSysAdmin = u.role === 'system_admin' || u.is_system_admin;
                const isLockedOut = ['terminated', 'inactive', 'deleted'].includes(u.status);
                const isRootAccount = String(u.employee_id).trim() === '00000';
                const canModify = u.is_registered && !isRootAccount;
                const roleLabel = ROLE_CONFIG[u.role]?.label || u.role?.replace(/_/g, ' ') || 'Employee';

                return (
                  <tr
                    key={u.master_id || u.id || u.employee_id}
                    onClick={() => handleRowClick(u)}
                    className={`transition-colors group ${
                      u.is_registered && u.id ? 'hover:bg-blue-50/30 cursor-pointer' : 'cursor-default bg-slate-50/20'
                    }`}
                  >
                    <td className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300/80 flex items-center justify-center flex-shrink-0 font-bold text-slate-700">
                          {u.full_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {u.full_name}
                          </p>
                          <p className="text-[11px] text-slate-500">{u.email || 'No email registered'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="font-mono text-xs font-extrabold text-slate-800 py-4">
                      <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200">{u.employee_id}</span>
                    </td>

                    <td className="text-xs font-semibold text-slate-700 py-4">{u.department || '—'}</td>

                    <td className="text-xs text-slate-600 py-4">
                      <div>{u.designation || '—'}</div>
                      {u.employment_type_name && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {u.employment_type_name}
                        </span>
                      )}
                    </td>

                    <td className="py-4">
                      {u.is_registered ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${ROLE_BADGE_MAP[u.role] || 'bg-slate-100 text-slate-700'}`}>
                            {roleLabel.toUpperCase()}
                          </span>
                          {u.is_imc_lead && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-600 text-white">
                              IMC CONVENOR
                            </span>
                          )}
                          {isSysAdmin && u.role !== 'system_admin' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                              + SYSTEM ADMIN
                            </span>
                          )}
                          {hasImcAccess && u.role !== 'imc' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              + IMC COMMITTEE
                            </span>
                          )}
                          {hasMgmtAccess && u.role !== 'head_management' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              + MANAGEMENT
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-slate-100 text-slate-500 border-slate-200">
                          NO IMS ACCOUNT
                        </span>
                      )}
                    </td>

                    <td className="py-4">
                      <div className="flex flex-col gap-1 items-start">
                        {u.status === 'terminated' || u.status === 'deleted' ? (
                          <span
                            title={u.termination_date ? `Terminated on ${formatDate(u.termination_date)}` : 'Terminated in HRMS'}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
                          >
                            {u.status === 'deleted' ? 'Deleted' : 'Terminated'}
                          </span>
                        ) : u.status === 'inactive' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                            Inactive
                          </span>
                        ) : u.status === 'noticePeriod' ? (
                          <span
                            title={u.notice_period_end_date ? `Notice Period ends: ${formatDate(u.notice_period_end_date)}` : 'Staff is on Notice Period'}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                          >
                            Notice Period
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active Staff
                          </span>
                        )}

                        {u.portal_access_disable_date && (
                          <span className="text-[10px] font-semibold text-rose-600">
                            Portal off: {formatDate(u.portal_access_disable_date)}
                          </span>
                        )}

                        {!u.is_registered ? (
                          <span className="text-[10px] text-slate-400 font-medium">No IMS Account</span>
                        ) : u.is_active ? (
                          <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Portal Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-rose-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Portal Deactivated
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="pr-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {isLockedOut ? (
                        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 inline-block">
                          {u.status === 'inactive' ? 'Inactive in HRMS' : 'Terminated in HRMS'}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canModify}
                            onClick={() => onOpenConfigure(u)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 ${
                              !canModify
                                ? 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700'
                            }`}
                          >
                            <Edit3 size={13} /> Configure
                          </button>
                          <button
                            type="button"
                            disabled={!canModify}
                            onClick={() => setToggleTarget(u)}
                            className={`ml-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 ${
                              !canModify
                                ? 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
                                : u.is_active
                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-200'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200'
                            }`}
                          >
                            {u.is_active ? <ShieldX size={13} /> : <ShieldCheck size={13} />}
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filteredPersonnel.length)} of{' '}
            {filteredPersonnel.length} personnel
          </span>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => !toggleStatusMutation.isPending && setToggleTarget(null)}
        onConfirm={() => toggleTarget && toggleStatusMutation.mutate(toggleTarget.id)}
        title={toggleTarget?.is_active ? 'Deactivate User Account' : 'Reactivate User Account'}
        message={
          toggleTarget?.is_active
            ? `Deactivate IMS portal access for ${toggleTarget.full_name} (${toggleTarget.employee_id})? They will be unable to sign in until reactivated.`
            : `Restore IMS portal access for ${toggleTarget?.full_name} (${toggleTarget?.employee_id})?`
        }
        confirmLabel={
          toggleStatusMutation.isPending
            ? 'Updating...'
            : toggleTarget?.is_active
            ? 'Deactivate Account'
            : 'Activate Account'
        }
        danger={Boolean(toggleTarget?.is_active)}
      />
    </div>
  );
}
