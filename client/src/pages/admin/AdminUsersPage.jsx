import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi, metaApi, masterEmployeesApi } from '../../api';
import { Spinner, Modal, Alert, SeverityBadge, StatusBadge } from '../../components/ui';
import StaffDirectoryTab from '../../components/admin/StaffDirectoryTab';
import CommitteeRoleTab from '../../components/admin/CommitteeRoleTab';
import CategoryMappingTab from '../../components/admin/CategoryMappingTab';
import HrmsSyncTab from '../../components/admin/HrmsSyncTab';
import EmployeeAutocomplete from '../../components/admin/EmployeeAutocomplete';
import {
  Users, Lock, ShieldCheck, Award, Tag, Activity, RefreshCw, CloudDownload,
  ArrowLeft, Briefcase, Building, Phone, FileText, UserCheck, AlertCircle, User, Building2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate, formatDateTime, getApiErrorMessage } from '../../utils/helpers';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [activeCard, setActiveCard] = useState('employee'); // 'employee' | 'system_admin' | 'imc' | 'management' | 'mapping' | 'hrms'
  const [tabSearch, setTabSearch] = useState('');

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: '', targetRole: 'system_admin', departmentId: '' });

  const [selectedProfileUser, setSelectedProfileUser] = useState(null);
  const [profileViewTab, setProfileViewTab] = useState('personal'); // 'personal' | 'assigned_scope'

  const { data: masterEmployees = [], isLoading: isLoadingMaster } = useQuery({
    queryKey: ['master-employees', 'all'],
    queryFn: () =>
      masterEmployeesApi
        .list({ all: 'true' })
        .then((r) => r.data?.data || (Array.isArray(r.data) ? r.data : [])),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => metaApi.departments().then((r) => r.data || []),
  });

  const { data: systemAdmins = [], isLoading: isLoadingAdmins } = useQuery({
    queryKey: ['system-admins'],
    queryFn: () => adminApi.getSystemAdmins().then((r) => r.data || []),
  });

  const { data: imcMembers = [], isLoading: isLoadingImc } = useQuery({
    queryKey: ['imc-members'],
    queryFn: () => adminApi.getImcMembers().then((r) => r.data || []),
  });

  const { data: managementMembers = [], isLoading: isLoadingMgmt } = useQuery({
    queryKey: ['management-members'],
    queryFn: () => adminApi.getManagementMembers().then((r) => r.data || []),
  });

  const { data: syncStatusData } = useQuery({
    queryKey: ['hrms-sync-status'],
    queryFn: () => masterEmployeesApi.getSyncStatus().then((r) => r.data?.data || {}),
  });

  const { data: userProfileData, isLoading: isLoadingProfile, isError: isProfileError } = useQuery({
    queryKey: ['user-profile', selectedProfileUser?.id],
    queryFn: () => adminApi.getUserProfile(selectedProfileUser.id).then((r) => r.data),
    enabled: Boolean(selectedProfileUser?.id),
  });

  const assignMutation = useMutation({
    mutationFn: (data) => adminApi.assignRole(data),
    onSuccess: () => {
      toast.success('User access and role permissions updated successfully.');
      setShowAssignModal(false);
      setAssignForm({ employeeId: '', targetRole: 'system_admin', departmentId: '' });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['master-employees'] });
      qc.invalidateQueries({ queryKey: ['system-admins'] });
      qc.invalidateQueries({ queryKey: ['imc-members'] });
      qc.invalidateQueries({ queryKey: ['management-members'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update user role')),
  });

  const syncHrmsMutation = useMutation({
    mutationFn: (type = 'full') => masterEmployeesApi.syncHrms(type),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'HRMS directory synchronized successfully.');
      qc.invalidateQueries({ queryKey: ['master-employees'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['designations'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['hrms-sync-status'] });
      qc.invalidateQueries({ queryKey: ['hrms-webhook-logs'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to synchronize with OfficePortal HRMS API')),
  });

  const openConfigureForUser = (user) => {
    let initialRole = 'imc';
    if (user.is_imc_lead) initialRole = 'imc_convenor';
    else if (user.role === 'imc' || user.is_imc_member) initialRole = 'imc';
    else if (user.role && user.role !== 'employee') initialRole = user.role;
    setAssignForm({
      employeeId: String(user.employee_id || ''),
      targetRole: initialRole,
      departmentId: '',
    });
    setShowAssignModal(true);
  };

  const openAssignModalForRole = (targetRole) => {
    setAssignForm({ employeeId: '', targetRole, departmentId: '' });
    setShowAssignModal(true);
  };

  const editingSelectedEmp = masterEmployees.find(
    (e) => String(e.employee_id) === String(assignForm.employeeId)
  );
  const showLegacyHodOption =
    assignForm.targetRole === 'hod' || editingSelectedEmp?.role === 'hod';

  if (selectedProfileUser) {
    const scopeNames = userProfileData?.managedDepartments || [];
    const scopeIncidents = userProfileData?.departmentIncidents || [];

    return (
      <div className="space-y-6 pb-14 w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Personnel Profile &amp; Activity</h1>
            <p className="text-sm text-slate-500">View profile details, active permissions, and incident history.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedProfileUser(null);
              setProfileViewTab('personal');
            }}
            className="btn-secondary bg-white flex items-center gap-2 shadow-sm border-slate-200"
          >
            <ArrowLeft size={16} /> Back to Directory
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-2xl uppercase">
              {selectedProfileUser.full_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-bold text-slate-800 truncate">{selectedProfileUser.full_name}</h3>
              <div className="flex items-center gap-2 mb-4 flex-wrap mt-1">
                <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {selectedProfileUser.employee_id}
                </span>
                {selectedProfileUser.status === 'terminated' ? (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    Terminated {selectedProfileUser.termination_date ? `(${formatDate(selectedProfileUser.termination_date)})` : ''}
                  </span>
                ) : selectedProfileUser.status === 'noticePeriod' ? (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Notice Period{' '}
                    {selectedProfileUser.notice_period_end_date
                      ? `(Relieving: ${formatDate(selectedProfileUser.notice_period_end_date)})`
                      : ''}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Active Staff
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 truncate">
                  <Briefcase size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="font-medium truncate">{selectedProfileUser.designation || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 truncate">
                  <Building size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="font-medium truncate">{selectedProfileUser.department || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 truncate">
                  <Phone size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="font-medium truncate">{selectedProfileUser.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-indigo-700 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100 truncate">
                  <FileText size={16} className="flex-shrink-0" />
                  Incidents Reported: {userProfileData?.reportedIncidents?.length || 0}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isLoadingProfile ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : isProfileError || !userProfileData ? (
          <Alert type="error" title="Error" message="Failed to load user profile analytics." />
        ) : (
          <>
            {scopeNames.length > 0 && (
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto w-fit">
                <button
                  type="button"
                  onClick={() => setProfileViewTab('personal')}
                  className={`px-6 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${
                    profileViewTab === 'personal'
                      ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  <UserCheck size={14} /> Personal View
                </button>
                <button
                  type="button"
                  onClick={() => setProfileViewTab('assigned_scope')}
                  className={`px-6 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${
                    profileViewTab === 'assigned_scope'
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  <Building2 size={14} /> Assigned Review Scope ({scopeNames.length})
                </button>
              </div>
            )}

            {profileViewTab === 'personal' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                    <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <AlertCircle size={18} className="text-slate-400" />
                      Reported Incidents ({userProfileData.reportedIncidents?.length || 0})
                    </h4>
                  </div>
                  {userProfileData.reportedIncidents?.length > 0 ? (
                    <IncidentDetailedTable incidents={userProfileData.reportedIncidents} />
                  ) : (
                    <div className="text-center p-12 text-sm text-slate-500">
                      This staff member has not submitted any incident reports.
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                    <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <User size={18} className="text-slate-400" />
                      Assigned / Responsible Incidents ({userProfileData.responsibleIncidents?.length || 0})
                    </h4>
                  </div>
                  {userProfileData.responsibleIncidents?.length > 0 ? (
                    <IncidentDetailedTable incidents={userProfileData.responsibleIncidents} />
                  ) : (
                    <div className="text-center p-12 text-sm text-slate-500">
                      This staff member is not assigned as investigator or trainee on any incidents.
                    </div>
                  )}
                </div>
              </div>
            )}

            {profileViewTab === 'assigned_scope' && scopeNames.length > 0 && (
              <div className="space-y-6">
                {scopeNames.map((scopeName) => {
                  const scoped = scopeIncidents.filter((i) => i.dept_name === scopeName);
                  const activeCount = scoped.filter((i) => !['resolved', 'closed', 'withdrawn'].includes(i.status)).length;
                  const solvedCount = scoped.filter((i) => ['resolved', 'closed'].includes(i.status)).length;
                  return (
                    <div key={scopeName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                        <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                          <Tag size={17} className="text-indigo-500" />
                          {scopeName} — Mapped Review Incidents
                        </h4>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                            Total: {scoped.length}
                          </span>
                          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-md border border-rose-200">
                            Active: {activeCount}
                          </span>
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                            Closed: {solvedCount}
                          </span>
                        </div>
                      </div>
                      {scoped.length > 0 ? (
                        <IncidentDetailedTable incidents={scoped} />
                      ) : (
                        <div className="text-center p-10 text-sm text-slate-500">
                          No incidents mapped to {scopeName} yet.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-14 w-full">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-2">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto w-full xl:w-auto max-w-full">
          {[
            { id: 'employee', label: 'Staff Directory', icon: Users, activeCls: 'text-blue-600', minW: 'min-w-[120px]' },
            { id: 'system_admin', label: 'System Admins', icon: Lock, activeCls: 'text-rose-600', minW: 'min-w-[120px]' },
            { id: 'imc', label: 'IMC Committee', icon: ShieldCheck, activeCls: 'text-indigo-600', minW: 'min-w-[120px]' },
            { id: 'management', label: 'Management', icon: Award, activeCls: 'text-purple-600', minW: 'min-w-[120px]' },
            { id: 'mapping', label: 'Category Mapping', icon: Tag, activeCls: 'text-amber-600', minW: 'min-w-[130px]' },
            { id: 'hrms', label: 'HRMS Sync & API Health', icon: Activity, activeCls: 'text-emerald-700', minW: 'min-w-[150px]' },
          ].map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeCard === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setActiveCard(tab.id);
                  setTabSearch('');
                }}
                className={`flex-1 ${tab.minW} px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                  isActive
                    ? `bg-white ${tab.activeCls} shadow-sm border border-slate-200/50`
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                <TabIcon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeCard === 'employee' && (
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
            <button
              type="button"
              onClick={() => syncHrmsMutation.mutate('delta')}
              disabled={syncHrmsMutation.isPending}
              title={
                syncStatusData?.lastOfficePortalSync?.completed_at
                  ? `Last synced: ${formatDateTime(syncStatusData.lastOfficePortalSync.completed_at)}`
                  : 'Fetch incremental changes from OfficePortal HRMS'
              }
              className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw size={13} className={syncHrmsMutation.isPending ? 'animate-spin' : ''} />
              Delta Sync
            </button>
            <button
              type="button"
              onClick={() => syncHrmsMutation.mutate('full')}
              disabled={syncHrmsMutation.isPending}
              title="Run full OfficePortal bootstrap sync (employees, departments, job titles, employment types)"
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60"
            >
              <CloudDownload size={13} />
              {syncHrmsMutation.isPending ? 'Syncing...' : 'Full Sync'}
            </button>
          </div>
        )}
      </div>

      {activeCard === 'employee' && (
        <StaffDirectoryTab
          masterEmployees={masterEmployees}
          isLoadingMaster={isLoadingMaster}
          departments={departments}
          syncStatusData={syncStatusData}
          onSelectUser={(u) => {
            setSelectedProfileUser(u);
            setProfileViewTab('personal');
          }}
          onOpenConfigure={openConfigureForUser}
        />
      )}

      {activeCard === 'system_admin' && (
        <CommitteeRoleTab
          type="system_admin"
          members={systemAdmins}
          isLoading={isLoadingAdmins}
          tabSearch={tabSearch}
          onTabSearchChange={setTabSearch}
          onOpenAssign={openAssignModalForRole}
        />
      )}

      {activeCard === 'imc' && (
        <CommitteeRoleTab
          type="imc"
          members={imcMembers}
          isLoading={isLoadingImc}
          tabSearch={tabSearch}
          onTabSearchChange={setTabSearch}
          onOpenAssign={openAssignModalForRole}
        />
      )}

      {activeCard === 'management' && (
        <CommitteeRoleTab
          type="management"
          members={managementMembers}
          isLoading={isLoadingMgmt}
          tabSearch={tabSearch}
          onTabSearchChange={setTabSearch}
          onOpenAssign={openAssignModalForRole}
        />
      )}

      {activeCard === 'mapping' && (
        <CategoryMappingTab
          masterEmployees={masterEmployees}
          isLoadingMaster={isLoadingMaster}
          tabSearch={tabSearch}
          onTabSearchChange={setTabSearch}
        />
      )}

      {activeCard === 'hrms' && <HrmsSyncTab enabled={activeCard === 'hrms'} />}

      {/* Configure User Role Modal */}
      <Modal
        open={showAssignModal}
        onClose={() => !assignMutation.isPending && setShowAssignModal(false)}
        title="Configure User Role & Portal Access"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowAssignModal(false)}
              disabled={assignMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => assignMutation.mutate(assignForm)}
              disabled={
                !assignForm.employeeId.trim() ||
                assignMutation.isPending ||
                (assignForm.targetRole === 'hod' && !assignForm.departmentId)
              }
              className="btn-primary"
            >
              {assignMutation.isPending ? <Spinner size={15} className="text-white" /> : <ShieldCheck size={15} />}
              Save Access Settings
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <EmployeeAutocomplete
            employees={masterEmployees}
            isLoading={isLoadingMaster}
            value={assignForm.employeeId}
            onChange={(empId) => setAssignForm((f) => ({ ...f, employeeId: empId }))}
            showCurrentRole
            accentColor="blue"
          />

          <div>
            <label className="field-label field-required font-bold">Portal Access Role</label>
            <select
              value={['imc', 'imc_convenor'].includes(assignForm.targetRole) ? 'imc' : assignForm.targetRole}
              onChange={(e) => setAssignForm((f) => ({ ...f, targetRole: e.target.value }))}
              className="select w-full font-semibold mt-1"
            >
              <option value="system_admin">System Administrator</option>
              <option value="imc">IMC Committee</option>
              <option value="head_management">Executive Management</option>
              {showLegacyHodOption && <option value="hod">Legacy Department Reviewer (HOD)</option>}
              <option value="employee">Regular Employee</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              To assign Incident Category feedback reviewers without changing their role, use the Category Mapping tab.
            </p>
          </div>

          {['imc', 'imc_convenor'].includes(assignForm.targetRole) && (
            <div className="animate-in fade-in duration-200">
              <label className="field-label field-required font-bold">IMC Role Type</label>
              <select
                value={assignForm.targetRole}
                onChange={(e) => setAssignForm((f) => ({ ...f, targetRole: e.target.value }))}
                className="select w-full font-semibold mt-1"
              >
                <option value="imc">IMC Member Only</option>
                <option value="imc_convenor">IMC Lead / Convenor (Can Escalate Priority)</option>
              </select>
            </div>
          )}

          {assignForm.targetRole === 'hod' && (
            <div>
              <label className="field-label field-required font-bold">Legacy Department Assignment</label>
              <select
                value={assignForm.departmentId}
                onChange={(e) => setAssignForm((f) => ({ ...f, departmentId: e.target.value }))}
                className="select w-full font-semibold"
              >
                <option value="">-- Choose Department --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function IncidentDetailedTable({ incidents }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ref ID</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category &amp; Type</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Severity</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {incidents.map((inc) => (
            <tr key={`${inc.id}-${inc.role_type || ''}-${inc.dept_name || ''}`} className="hover:bg-slate-50 transition-colors">
              <td className="py-3 px-6 text-sm font-mono text-slate-700">
                <Link to={`/incidents/${inc.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline">
                  {inc.reference_id || 'Pending Ref'}
                </Link>
                {inc.role_type && (
                  <div className="mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      {inc.role_type}
                    </span>
                  </div>
                )}
                {inc.dept_name && (
                  <div className="mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {inc.dept_name}
                    </span>
                  </div>
                )}
              </td>
              <td className="py-3 px-6 text-sm text-slate-600 whitespace-nowrap">
                {formatDate(inc.incident_date || inc.created_at)}
              </td>
              <td className="py-3 px-6 text-sm text-slate-800">
                {inc.incident_category && <div className="font-medium text-slate-700">{inc.incident_category}</div>}
                <div className="text-xs text-slate-500 line-clamp-1" title={inc.incident_type}>
                  {inc.incident_type || 'Unknown'}
                </div>
              </td>
              <td className="py-3 px-6">
                {inc.severity ? (
                  <SeverityBadge severity={inc.severity} />
                ) : (
                  <span className="badge badge-gray">Pending</span>
                )}
              </td>
              <td className="py-3 px-6">
                <StatusBadge status={inc.status || 'submitted'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
