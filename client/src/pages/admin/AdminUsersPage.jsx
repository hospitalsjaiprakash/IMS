import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, metaApi } from '../../api';
import { Spinner, Modal, Alert, Pagination } from '../../components/ui';
import {
  Search, Plus, ShieldCheck, UserMinus, AlertTriangle, ShieldX,
  Users, Award, Building2, CheckCircle2, Edit3, ShieldAlert,
  UserCheck, Briefcase, ChevronRight, Sparkles, Filter, Lock
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [activeCard, setActiveCard] = useState('employee'); // 'employee' | 'system_admin' | 'imc' | 'management' | 'mapping'

  const [search, setSearch] = useState('');
  const [tabSearch, setTabSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: '', targetRole: 'system_admin', departmentId: '' });

  const [showStopModal, setShowStopModal] = useState(false);
  const [stopTarget, setStopTarget] = useState({ id: '', employeeId: '', fullName: '', type: 'imc' });

  const [showMapModal, setShowMapModal] = useState(false);
  const [mapForm, setMapForm] = useState({ departmentId: '', leaderType: 'hod', employeeId: '' });

  // Queries
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin-users', search, roleFilter, page],
    queryFn: () => adminApi.getUsers({ search, role: roleFilter, page, limit: 20 }).then(r => r.data),
  });

  const { data: departments = [], isLoading: isLoadingDepts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => metaApi.departments().then(r => r.data),
  });

  const { data: systemAdmins = [], isLoading: isLoadingAdmins } = useQuery({
    queryKey: ['system-admins'],
    queryFn: () => adminApi.getSystemAdmins().then(r => r.data),
  });

  const { data: imcMembers = [], isLoading: isLoadingImc } = useQuery({
    queryKey: ['imc-members'],
    queryFn: () => adminApi.getImcMembers().then(r => r.data),
  });

  const { data: managementMembers = [], isLoading: isLoadingMgmt } = useQuery({
    queryKey: ['management-members'],
    queryFn: () => adminApi.getManagementMembers().then(r => r.data),
  });


  // Mutations
  const assignMutation = useMutation({
    mutationFn: (data) => adminApi.assignRole(data),
    onSuccess: () => {
      toast.success('User access and role permissions updated successfully!');
      setShowAssignModal(false);
      setAssignForm({ employeeId: '', targetRole: 'system_admin', departmentId: '' });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['system-admins'] });
      qc.invalidateQueries({ queryKey: ['imc-members'] });
      qc.invalidateQueries({ queryKey: ['management-members'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to update user role'),
  });

  const removeMutation = useMutation({
    mutationFn: (target) => {
      if (target.type === 'management') return adminApi.removeManagement(target.id);
      if (target.id) return adminApi.removeImc(target.id);
      return adminApi.stopImcAccess({ employeeId: target.employeeId });
    },
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Access revoked successfully.');
      setShowStopModal(false);
      setStopTarget({ id: '', employeeId: '', fullName: '', type: 'imc' });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['system-admins'] });
      qc.invalidateQueries({ queryKey: ['imc-members'] });
      qc.invalidateQueries({ queryKey: ['management-members'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to revoke access'),
  });

  const mapLeaderMutation = useMutation({
    mutationFn: (data) => adminApi.mapDepartmentLeader(data),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Department leadership assigned successfully.');
      setShowMapModal(false);
      setMapForm({ departmentId: '', leaderType: 'hod', employeeId: '' });
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to map department leader'),
  });

  const handleOpenStopModal = (user = null, type = 'imc') => {
    if (user) {
      setStopTarget({
        id: user.id || '',
        employeeId: user.employee_id || '',
        fullName: user.full_name || '',
        type,
      });
    } else {
      setStopTarget({ id: '', employeeId: '', fullName: '', type });
    }
    setShowStopModal(true);
  };

  const ROLES = [
    { value: '', label: 'All Roles & Access' },
    { value: 'employee', label: 'Regular Employee' },
    { value: 'hod', label: 'Department HOD' },
    { value: 'imc', label: 'IMC Committee Member' },
    { value: 'head_management', label: 'Executive Management' },
    { value: 'system_admin', label: 'System Administrator' },
  ];

  const roleColorMap = {
    employee: 'bg-slate-100 text-slate-700 border-slate-200',
    hod: 'bg-amber-50 text-amber-800 border-amber-300',
    imc: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    head_management: 'bg-purple-50 text-purple-700 border-purple-200',
    system_admin: 'bg-rose-50 text-rose-700 border-rose-200 font-extrabold',
  };

  return (
    <div className="space-y-6 pb-14 w-full">
      {/* Header Toolbar */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-2">
        {/* Simple Segmented Control for Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto w-full xl:w-auto max-w-full">
          <button
            onClick={() => { setActiveCard('employee'); setTabSearch(''); }}
            className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeCard === 'employee'
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <Users size={14} /> Staff Directory
          </button>
          <button
            onClick={() => { setActiveCard('system_admin'); setTabSearch(''); }}
            className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeCard === 'system_admin'
                ? 'bg-white text-rose-600 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <Lock size={14} /> System Admins
          </button>
          <button
            onClick={() => { setActiveCard('imc'); setTabSearch(''); }}
            className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeCard === 'imc'
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <ShieldCheck size={14} /> IMC Committee
          </button>
          <button
            onClick={() => { setActiveCard('management'); setTabSearch(''); }}
            className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeCard === 'management'
                ? 'bg-white text-purple-600 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <Award size={14} /> Management
          </button>
          <button
            onClick={() => { setActiveCard('mapping'); setTabSearch(''); }}
            className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeCard === 'mapping'
                ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <Building2 size={14} /> Dept Mapping
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
          <button
            onClick={() => {
              setMapForm({ departmentId: departments[0]?.id || '', leaderType: 'hod', employeeId: '' });
              setShowMapModal(true);
            }}
            className="px-4 py-2 rounded-lg font-bold text-xs bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm flex-1 xl:flex-none"
          >
            <Building2 size={14} className="text-amber-500" /> Map Department Leaders
          </button>
          <button
            onClick={() => {
              setAssignForm({ employeeId: '', targetRole: 'system_admin', departmentId: '' });
              setShowAssignModal(true);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 flex-1 xl:flex-none"
          >
            <Plus size={14} /> Configure User Role
          </button>
        </div>
      </div>

      {/* ─── DERIVED FILTERED LISTS ─── */}
      {(() => {
        const ts = tabSearch.toLowerCase();
        const filteredSysAdmins = systemAdmins.filter(m =>
          m.full_name?.toLowerCase().includes(ts) || m.employee_id?.toLowerCase().includes(ts)
        );
        const filteredImcMembers = imcMembers.filter(m =>
          m.full_name?.toLowerCase().includes(ts) || m.employee_id?.toLowerCase().includes(ts)
        );
        const filteredMgmtMembers = managementMembers.filter(m =>
          m.full_name?.toLowerCase().includes(ts) || m.employee_id?.toLowerCase().includes(ts)
        );
        const filteredDepts = departments.filter(d =>
          d.name?.toLowerCase().includes(ts) ||
          d.hod_name?.toLowerCase().includes(ts) ||
          d.incharge_name?.toLowerCase().includes(ts) ||
          d.asst_coo_name?.toLowerCase().includes(ts)
        );

        return (
          <>
            {/* ─── TAB 1: ALL EMPLOYEES DIRECTORY VIEW ─── */}
            {activeCard === 'employee' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md overflow-hidden animate-in fade-in duration-200">
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Users size={20} className="text-blue-600" />
                      <span>Hospital Personnel Directory</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Search, filter, and inspect governance permissions across all {usersData?.total || 0} registered staff members
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
                    <div className="relative flex-1 sm:flex-initial min-w-[240px]">
                      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search staff name or ID (e.g. 13574)…"
                        className="input pl-10 bg-white text-xs py-2.5 rounded-xl border-slate-200 focus:border-blue-500 font-medium"
                      />
                    </div>
                    <div className="relative">
                      <select
                        value={roleFilter}
                        onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
                        className="select w-44 bg-white font-semibold text-xs py-2.5 rounded-xl border-slate-200"
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {isLoadingUsers ? (
                  <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="table w-full">
                        <thead>
                          <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                            <th className="py-3.5 pl-6">Employee</th>
                            <th className="py-3.5">ID Number</th>
                            <th className="py-3.5">Department</th>
                            <th className="py-3.5">Designation</th>
                            <th className="py-3.5">Portal Access & Roles</th>
                            <th className="py-3.5">Status</th>
                            <th className="py-3.5 pr-6 text-right">Quick Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(usersData?.users || []).length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-14 text-slate-400 font-medium">No personnel found matching your filter criteria. Verify backend is running.</td></tr>
                          ) : (usersData?.users || []).map(u => {
                            const hasImcAccess = u.role === 'imc' || u.is_imc_member || u.is_imc_lead;
                            const hasMgmtAccess = u.role === 'head_management' || u.is_management_member;
                            const isSysAdmin = u.role === 'system_admin' || u.is_system_admin;
                            return (
                              <tr key={u.id} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="pl-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300/80 flex items-center justify-center flex-shrink-0 shadow-2xs font-bold text-slate-700">
                                      {u.full_name?.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{u.full_name}</p>
                                      <p className="text-[11px] text-slate-500">{u.email || 'No email registered'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="font-mono text-xs font-extrabold text-slate-800 py-4">
                                  <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200">{u.employee_id}</span>
                                </td>
                                <td className="text-xs font-semibold text-slate-700 py-4">{u.department || '—'}</td>
                                <td className="text-xs text-slate-600 py-4">{u.designation || '—'}</td>
                                <td className="py-4">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${roleColorMap[u.role] || 'bg-slate-100 text-slate-700'}`}>
                                      {u.role?.replace(/_/g, ' ').toUpperCase()}
                                    </span>
                                    {isSysAdmin && u.role !== 'system_admin' && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                                        ★ SYSTEM ADMIN
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
                                </td>
                                <td className="py-4">
                                  {u.is_active ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Deactivated
                                    </span>
                                  )}
                                </td>
                                <td className="pr-6 py-4 text-right">
                                  <button
                                    onClick={() => {
                                      setAssignForm({ employeeId: u.employee_id, targetRole: u.role !== 'employee' ? u.role : 'imc', departmentId: '' });
                                      setShowAssignModal(true);
                                    }}
                                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1"
                                  >
                                    <Edit3 size={13} /> Configure
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await adminApi.toggleUserStatus(u.id);
                                        toast.success(`User account ${u.is_active ? 'deactivated' : 'activated'} successfully.`);
                                        qc.invalidateQueries({ queryKey: ['admin-users'] });
                                      } catch (error) {
                                        toast.error(error.response?.data?.error || 'Failed to change user status');
                                      }
                                    }}
                                    className={`ml-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1 ${u.is_active
                                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-200'
                                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200'
                                      }`}
                                  >
                                    {u.is_active ? <ShieldX size={13} /> : <ShieldCheck size={13} />}
                                    {u.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50/40">
                      <Pagination page={page} totalPages={usersData?.totalPages || 1} onPageChange={setPage} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── TAB 2: SYSTEM ADMINISTRATORS VIEW ─── */}
            {activeCard === 'system_admin' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                        <Lock size={20} />
                      </div>
                      <h2 className="text-xl font-black text-slate-900">System Administrators</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Personnel holding full root administrative control over system parameters, portal roles, and audit trail oversight
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search administrators..."
                        value={tabSearch}
                        onChange={(e) => setTabSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setAssignForm({ employeeId: '', targetRole: 'system_admin', departmentId: '' });
                        setShowAssignModal(true);
                      }}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-rose-500/20 transition-all"
                    >
                      <Plus size={16} /> Assign Admin
                    </button>
                  </div>
                </div>

                {isLoadingAdmins ? (
                  <div className="py-16 flex justify-center"><Spinner size={32} /></div>
                ) : filteredSysAdmins.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm font-medium bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    No System Administrators found matching your search.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredSysAdmins.map(m => (
                      <div key={m.id} className="rounded-2xl p-5 bg-gradient-to-br from-rose-50/60 to-white border border-rose-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 font-black text-lg shadow-md shadow-rose-500/25">
                            {m.full_name?.charAt(0) || 'A'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-black text-slate-900 truncate group-hover:text-rose-600 transition-colors">{m.full_name}</p>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-600 text-white uppercase tracking-wider">ROOT ADMIN</span>
                            </div>
                            <p className="text-xs font-mono font-bold text-slate-700 mt-1">ID: <span className="bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded">{m.employee_id}</span></p>
                            <p className="text-xs text-slate-500 truncate mt-1">{m.designation || 'System Admin'} · {m.department || 'IT Administration'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-rose-100/80">
                          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Portal Active
                          </span>
                          <button
                            onClick={() => {
                              setAssignForm({ employeeId: m.employee_id, targetRole: 'system_admin', departmentId: '' });
                              setShowAssignModal(true);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-2xs"
                          >
                            <Edit3 size={13} /> Modify
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── TAB 3: IMC COMMITTEE PORTAL VIEW ─── */}
            {activeCard === 'imc' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <ShieldCheck size={20} />
                      </div>
                      <h2 className="text-xl font-black text-slate-900">Incident Management Committee (IMC)</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Quality Department & multi-disciplinary investigative committee empowered to claim, inspect, and verify hospital incidents
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search IMC members..."
                        value={tabSearch}
                        onChange={(e) => setTabSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setAssignForm({ employeeId: '', targetRole: 'imc', departmentId: '' });
                        setShowAssignModal(true);
                      }}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-500/20 transition-all"
                    >
                      <Plus size={16} /> Add IMC Member
                    </button>
                  </div>
                </div>

                {isLoadingImc ? (
                  <div className="py-16 flex justify-center"><Spinner size={32} /></div>
                ) : filteredImcMembers.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm font-medium bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    No IMC members found matching your search.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredImcMembers.map(m => (
                      <div key={m.id} className="rounded-2xl p-5 bg-gradient-to-br from-indigo-50/60 to-white border border-indigo-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 font-black text-lg shadow-md shadow-indigo-500/25">
                            {m.full_name?.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-black text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{m.full_name}</p>
                              {m.is_imc_lead ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-600 text-white uppercase tracking-wider">LEAD</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-700 uppercase">MEMBER</span>
                              )}
                            </div>
                            <p className="text-xs font-mono font-bold text-slate-600 mt-1">ID: {m.employee_id}</p>
                            <p className="text-xs text-slate-500 truncate mt-1">{m.designation || 'Staff'} · {m.department || 'Quality Department'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-indigo-100/80">
                          <span className="text-[11px] font-medium text-slate-400">Portal Access Active</span>
                          <button
                            onClick={() => handleOpenStopModal(m, 'imc')}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-2xs"
                          >
                            <UserMinus size={13} /> Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── TAB 4: MANAGEMENT TEAM VIEW ─── */}
            {activeCard === 'management' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                        <Award size={20} />
                      </div>
                      <h2 className="text-xl font-black text-slate-900">Executive Management & Leadership</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Executive directors, Assistant COOs, and senior leadership with final resolution approval and priority escalation authority
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search executives..."
                        value={tabSearch}
                        onChange={(e) => setTabSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setAssignForm({ employeeId: '', targetRole: 'head_management', departmentId: '' });
                        setShowAssignModal(true);
                      }}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-purple-500/20 transition-all"
                    >
                      <Plus size={16} /> Add Executive
                    </button>
                  </div>
                </div>

                {isLoadingMgmt ? (
                  <div className="py-16 flex justify-center"><Spinner size={32} /></div>
                ) : filteredMgmtMembers.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm font-medium bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    No executive personnel found matching your search.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredMgmtMembers.map(m => (
                      <div key={m.id} className="rounded-2xl p-5 bg-gradient-to-br from-purple-50/60 to-white border border-purple-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center flex-shrink-0 font-black text-lg shadow-md shadow-purple-500/25">
                            {m.full_name?.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-black text-slate-900 truncate group-hover:text-purple-600 transition-colors">{m.full_name}</p>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-600 text-white uppercase tracking-wider">EXECUTIVE</span>
                            </div>
                            <p className="text-xs font-mono font-bold text-slate-600 mt-1">ID: {m.employee_id}</p>
                            <p className="text-xs text-slate-500 truncate mt-1">{m.designation || 'Executive Leader'} · {m.department || 'Administration'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-purple-100/80">
                          <span className="text-[11px] font-medium text-slate-400">Executive Portal Active</span>
                          <button
                            onClick={() => handleOpenStopModal(m, 'management')}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-2xs"
                          >
                            <UserMinus size={13} /> Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── TAB 5: DEPARTMENT LEADERSHIP MATRIX VIEW ─── */}
            {activeCard === 'mapping' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Building2 size={20} />
                      </div>
                      <h2 className="text-xl font-black text-slate-900">Department Governance Matrix</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Establish clear accountability across all {departments.length} hospital departments by mapping HODs, Incharges, and Assistant COOs
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search departments..."
                        value={tabSearch}
                        onChange={(e) => setTabSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setMapForm({ departmentId: departments[0]?.id || '', leaderType: 'hod', employeeId: '' });
                        setShowMapModal(true);
                      }}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all"
                    >
                      <Plus size={16} /> Assign Leader
                    </button>
                  </div>
                </div>

                {isLoadingDepts ? (
                  <div className="py-16 flex justify-center"><Spinner size={32} /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table w-full">
                      <thead>
                        <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                          <th className="py-3.5 pl-6 w-1/4">Hospital Department</th>
                          <th className="py-3.5">HOD (Head of Dept)</th>
                          <th className="py-3.5">Operational Incharge</th>
                          <th className="py-3.5">Assistant COO</th>
                          <th className="py-3.5 pr-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDepts.map(d => (
                          <tr key={d.id} className="hover:bg-amber-50/20 transition-colors group">
                            <td className="pl-6 py-4 font-extrabold text-slate-900 text-sm">{d.name}</td>
                            <td className="py-4">
                              {d.hod_name ? (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center justify-center">
                                    {d.hod_name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">{d.hod_name}</p>
                                    {d.hod_employee_id && <p className="text-[10px] font-mono text-slate-400">ID: {d.hod_employee_id}</p>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic font-medium bg-slate-100 px-2.5 py-1 rounded-md">Unassigned</span>
                              )}
                            </td>
                            <td className="py-4">
                              {d.incharge_name ? (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 font-extrabold text-xs flex items-center justify-center">
                                    {d.incharge_name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">{d.incharge_name}</p>
                                    {d.incharge_employee_id && <p className="text-[10px] font-mono text-slate-400">ID: {d.incharge_employee_id}</p>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic font-medium bg-slate-100 px-2.5 py-1 rounded-md">Unassigned</span>
                              )}
                            </td>
                            <td className="py-4">
                              {d.asst_coo_name ? (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 font-extrabold text-xs flex items-center justify-center">
                                    {d.asst_coo_name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">{d.asst_coo_name}</p>
                                    {d.asst_coo_employee_id && <p className="text-[10px] font-mono text-slate-400">ID: {d.asst_coo_employee_id}</p>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic font-medium bg-slate-100 px-2.5 py-1 rounded-md">Unassigned</span>
                              )}
                            </td>
                            <td className="pr-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setMapForm({ departmentId: d.id, leaderType: 'hod', employeeId: '' });
                                  setShowMapModal(true);
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-slate-100 group-hover:bg-amber-600 group-hover:text-white text-slate-700 text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1"
                              >
                                <Edit3 size={12} /> Map Leader
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </>
        );
      })()}

      {/* ─── MODALS ─── */}

      {/* Map Department Leader Modal */}
      <Modal
        open={showMapModal}
        onClose={() => setShowMapModal(false)}
        title="Assign Department Leadership"
        footer={
          <>
            <button onClick={() => setShowMapModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => mapLeaderMutation.mutate(mapForm)}
              disabled={!mapForm.departmentId || !mapForm.employeeId.trim() || mapLeaderMutation.isPending}
              className="btn-primary"
            >
              {mapLeaderMutation.isPending ? <Spinner size={15} className="text-white" /> : <CheckCircle2 size={15} />}
              Confirm Leadership Assignment
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert type="info" message="Establish accountability for incident workflows by assigning department leadership." />

          <div>
            <label className="field-label field-required font-bold">Hospital Department</label>
            <select
              value={mapForm.departmentId}
              onChange={e => setMapForm(f => ({ ...f, departmentId: e.target.value }))}
              className="select w-full font-semibold"
            >
              <option value="">-- Choose Department --</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label field-required font-bold">Leadership Role Level</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { id: 'hod', label: 'HOD', desc: 'Head of Department' },
                { id: 'incharge', label: 'Incharge', desc: 'Operational Lead' },
                { id: 'asst_coo', label: 'Asst. COO', desc: 'Executive Oversight' }
              ].map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setMapForm(f => ({ ...f, leaderType: opt.id }))}
                  className={`p-3 rounded-xl border text-left transition-all ${mapForm.leaderType === opt.id
                      ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/20 font-bold text-amber-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                >
                  <p className="text-xs font-black">{opt.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label field-required font-bold">Hospital Employee ID</label>
            <input
              value={mapForm.employeeId}
              onChange={e => setMapForm(f => ({ ...f, employeeId: e.target.value }))}
              placeholder="e.g. 13574"
              className="input font-mono font-bold text-sm"
              autoFocus
            />
            <p className="text-[11px] text-slate-500 mt-1">Enter the exact Employee ID of the personnel taking this role.</p>
          </div>
        </div>
      </Modal>

      {/* Configure User Role Modal */}
      <Modal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Configure User Role & Portal Access"
        footer={
          <>
            <button onClick={() => setShowAssignModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => assignMutation.mutate(assignForm)}
              disabled={!assignForm.employeeId.trim() || assignMutation.isPending || (assignForm.targetRole === 'hod' && !assignForm.departmentId)}
              className="btn-primary"
            >
              {assignMutation.isPending ? <Spinner size={15} className="text-white" /> : <ShieldCheck size={15} />}
              Save Access Settings
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="field-label field-required font-bold">Hospital Employee ID</label>
            <input
              value={assignForm.employeeId}
              onChange={e => setAssignForm(f => ({ ...f, employeeId: e.target.value }))}
              placeholder="e.g. 13574"
              className="input font-mono font-bold text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label field-required font-bold">Portal Access Role</label>
            <div className="space-y-2 mt-1">
              {[
                { id: 'system_admin', label: 'System Administrator', desc: 'Full administrative root control over users, configs, and system audit' },
                { id: 'imc', label: 'IMC Committee Member', desc: 'Quality verification, claim investigation & review portal' },
                { id: 'head_management', label: 'Executive Management', desc: 'Final decision sign-off, executive oversight & priority escalation' },
                { id: 'hod', label: 'Department HOD', desc: 'Department incident reviews and mandatory employee training' },
                { id: 'employee', label: 'Regular Employee', desc: 'Standard access to report incidents and view own cases' }
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setAssignForm(f => ({ ...f, targetRole: opt.id }))}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${assignForm.targetRole === opt.id
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/15 font-bold text-slate-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                >
                  <div className={`w-4 h-4 rounded-full mt-0.5 border-2 flex items-center justify-center ${assignForm.targetRole === opt.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                    }`}>
                    {assignForm.targetRole === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-black">{opt.label}</p>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {assignForm.targetRole === 'hod' && (
            <div>
              <label className="field-label field-required font-bold">Select Department to Head</label>
              <select
                value={assignForm.departmentId}
                onChange={e => setAssignForm(f => ({ ...f, departmentId: e.target.value }))}
                className="select w-full font-semibold"
              >
                <option value="">-- Choose Department --</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Revoke Access Modal */}
      <Modal
        open={showStopModal}
        onClose={() => setShowStopModal(false)}
        title="Confirm Access Revocation"
        footer={
          <>
            <button onClick={() => setShowStopModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => removeMutation.mutate(stopTarget)}
              disabled={(!stopTarget.id && !stopTarget.employeeId.trim()) || removeMutation.isPending}
              className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
            >
              {removeMutation.isPending ? <Spinner size={15} className="text-white" /> : <ShieldX size={15} />}
              Confirm Revocation
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-black text-red-900 uppercase tracking-wide">Revoking Specialized Portal Access</h3>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                This will immediately revoke their privileges for {stopTarget.type === 'management' ? 'Executive Management' : 'the IMC Committee'}. They will return to standard staff access levels.
              </p>
            </div>
          </div>

          {stopTarget.fullName ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Target Staff Member</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-black text-slate-900">{stopTarget.fullName}</p>
                  <p className="text-xs font-mono text-slate-500 font-bold">Employee ID: {stopTarget.employeeId}</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-red-100 text-red-800 border border-red-200">
                  REVOKING
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label className="field-label field-required font-bold">Enter Employee ID</label>
              <input
                value={stopTarget.employeeId}
                onChange={e => setStopTarget(t => ({ ...t, employeeId: e.target.value }))}
                placeholder="e.g. 13574"
                className="input font-mono font-bold"
                autoFocus
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}