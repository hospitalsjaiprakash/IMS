import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, metaApi, masterEmployeesApi } from '../../api';
import api from '../../api';
import { Spinner, Modal, Alert, Pagination } from '../../components/ui';
import {
  Search, Plus, ShieldCheck, UserMinus, AlertTriangle, ShieldX,
  Users, Award, Building2, CheckCircle2, Edit3, ShieldAlert,
  UserCheck, Briefcase, ChevronRight, Sparkles, Filter, Lock, Send, Upload, Copy, FileUp, ArrowLeft,
  Mail, Phone, User, FileText, AlertCircle, Building, RefreshCw, Trash2, UserX
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { getStatusClass, getStatusLabel, formatDate } from '../../utils/helpers';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [activeCard, setActiveCard] = useState('employee'); // 'employee' | 'system_admin' | 'imc' | 'management' | 'mapping'

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tabSearch, setTabSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Debounce search input for immediate responsive feedback
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Modal States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: '', targetRole: 'system_admin', departmentId: '' });
  const [assignSearchTerm, setAssignSearchTerm] = useState('');

  const [showStopModal, setShowStopModal] = useState(false);
  const [stopTarget, setStopTarget] = useState({ id: '', employeeId: '', fullName: '', type: 'imc' });

  const [showMapModal, setShowMapModal] = useState(false);
  const [mapForm, setMapForm] = useState({ departmentId: '', employeeId: '' });
  const [mapSearchTerm, setMapSearchTerm] = useState('');
  const [showRemoveLeaderModal, setShowRemoveLeaderModal] = useState(false);
  const [leaderToRemove, setLeaderToRemove] = useState(null);

  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [newDeptForm, setNewDeptForm] = useState({ name: '', employeeId: '' });
  const [newDeptSearchTerm, setNewDeptSearchTerm] = useState('');
  const [showDeleteDeptModal, setShowDeleteDeptModal] = useState(false);
  const [deptToDelete, setDeptToDelete] = useState(null);

  const [selectedProfileUser, setSelectedProfileUser] = useState(null);
  const [profileViewTab, setProfileViewTab] = useState('personal'); // 'personal' | 'department'

  // Queries
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin-users', search, roleFilter, page],
    queryFn: () => adminApi.getUsers({ search, role: roleFilter, page, limit: 20 }).then(r => r.data),
    enabled: activeCard !== 'employee',
  });

  const { data: masterEmployees = [], isLoading: isLoadingMaster } = useQuery({
    queryKey: ['master-employees'],
    queryFn: () => api.get('/master-employees', { params: { all: 'true' } }).then(r => r.data?.data || (Array.isArray(r.data) ? r.data : [])),
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [addForm, setAddForm] = useState({ employeeId: '', name: '', department: '', designation: '', phone: '', email: '' });

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
  const { data: userProfileData, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['user-profile', selectedProfileUser?.id],
    queryFn: () => adminApi.getUserProfile(selectedProfileUser.id).then(r => r.data),
    enabled: !!selectedProfileUser?.id,
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

  const addMutation = useMutation({
    mutationFn: (data) => api.post('/master-employees', data),
    onSuccess: () => {
      toast.success('Employee added to Directory');
      qc.invalidateQueries({ queryKey: ['master-employees'] });
      setIsAddModalOpen(false);
      setAddForm({ employeeId: '', name: '', department: '', designation: '', phone: '', email: '' });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add employee')
  });

  const bulkAddMutation = useMutation({
    mutationFn: (employees) => api.post('/master-employees/bulk', { employees }),
    onSuccess: (res) => {
      const msgs = [];
      if (res.data.alreadyExists && res.data.alreadyExists.length > 0) {
        msgs.push(`Skipped existing: ${res.data.alreadyExists.join(', ')}`);
      }
      if (res.data.invalidData && res.data.invalidData.length > 0) {
        msgs.push(`Skipped invalid formats: ${res.data.invalidData.join(', ')}`);
      }
      
      if (msgs.length > 0) {
        toast.error(`Upload complete with skips.\n${msgs.join('\n')}`, { duration: 8000 });
      } else {
        toast.success(res.data.message || 'Bulk upload successful');
      }
      qc.invalidateQueries({ queryKey: ['master-employees'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to process upload')
  });

  const { data: syncStatusData } = useQuery({
    queryKey: ['hrms-sync-status'],
    queryFn: () => masterEmployeesApi.getSyncStatus().then(r => r.data.data),
  });

  const syncHrmsMutation = useMutation({
    mutationFn: () => masterEmployeesApi.syncHrms(),
    onSuccess: (res) => {
      toast.success(res.data.message || 'HRMS Google Sheet synchronized successfully!');
      qc.invalidateQueries({ queryKey: ['master-employees'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['hrms-sync-status'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to synchronize with HRMS sheet');
    }
  });

  const handleFileUpload = (e) => {

    e.preventDefault();
    const file = e.target?.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;

    const validExts = ['csv', 'xlsx', 'xls'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext)) {
      toast.error('Only CSV or Excel files are allowed.');
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length === 0) {
          toast.error("Excel sheet is empty.");
          return;
        }

        const requiredHeaders = ['employee name', 'employee id', 'designation', 'department', 'mobile number', 'email'];
        const actualHeaders = Object.keys(data[0]).map(k => k.toLowerCase().trim());
        
        const hasAll = requiredHeaders.every(h => actualHeaders.includes(h));
        if (!hasAll) {
          toast.error("This excel sheet is not complete show read the congiguartion first then upload exact data");
          return;
        }

        const mappedEmployees = data.map(row => {
          const getVal = (key) => row[Object.keys(row).find(k => k.toLowerCase().trim() === key)] || '';
          return {
            employeeId: getVal('employee id'),
            name: getVal('employee name'),
            department: getVal('department'),
            designation: getVal('designation'),
            phone: getVal('mobile number'),
            email: getVal('email')
          };
        }).filter(e => e.employeeId && e.name);

        if (mappedEmployees.length === 0) return toast.error("Could not parse employees. Data might be empty.");
        bulkAddMutation.mutate(mappedEmployees);
        setShowBulkUploadModal(false);
      } catch (err) { toast.error('Error parsing Excel file'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

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
      toast.success(res?.data?.message || 'Department feedback staff assigned successfully.');
      setShowMapModal(false);
      setMapForm({ departmentId: '', employeeId: '' });
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to assign department feedback staff'),
  });

  const removeLeaderMutation = useMutation({
    mutationFn: (data) => adminApi.removeDepartmentLeader(data),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Department feedback staff removed successfully.');
      setShowRemoveLeaderModal(false);
      setLeaderToRemove(null);
      setShowMapModal(false);
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to remove department feedback staff'),
  });

  const createDeptMutation = useMutation({
    mutationFn: (data) => adminApi.createDepartment(data),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Department created successfully');
      setShowAddDeptModal(false);
      setNewDeptForm({ name: '', employeeId: '' });
      setNewDeptSearchTerm('');
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create department'),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: (id) => adminApi.deleteDepartment(id),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Department deleted successfully');
      setShowDeleteDeptModal(false);
      setDeptToDelete(null);
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete department'),
  });

  const handleOpenMapModal = (departmentId = '', employeeId = '') => {
    setMapForm({
      departmentId: departmentId || departments[0]?.id || '',
      employeeId: employeeId || '',
    });
    setMapSearchTerm('');
    setShowMapModal(true);
  };

  const handleOpenRemoveLeaderModal = (departmentId, deptName, staffName, employeeId) => {
    setLeaderToRemove({
      departmentId,
      deptName,
      staffName,
      employeeId,
    });
    setShowRemoveLeaderModal(true);
  };

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
    { value: 'unregistered', label: 'Unregistered (No IMS)' },
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
      {selectedProfileUser ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Personnel Profile & Analytics</h1>
              <p className="text-sm text-slate-500">View detailed profile, active permissions, and incident history.</p>
            </div>
            <button 
              onClick={() => { setSelectedProfileUser(null); setProfileViewTab('personal'); }}
              className="btn btn-secondary bg-white flex items-center gap-2 shadow-sm border-slate-200"
            >
              <ArrowLeft size={16} /> Back to Directory
            </button>
          </div>
          
          {/* Profile Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-2xl uppercase shadow-inner">
                {selectedProfileUser.full_name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-bold text-slate-800 truncate">{selectedProfileUser.full_name}</h3>
                <div className="text-sm font-mono text-slate-500 mb-4 inline-block bg-slate-100 px-2 py-0.5 rounded">{selectedProfileUser.employee_id}</div>
                
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
                    Incidents Given: {userProfileData?.reportedIncidents?.length || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isLoadingProfile ? (
             <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
          ) : userProfileData ? (
            <>
              {/* Tab Toggle (Only visible if they manage departments) */}
              {userProfileData?.managedDepartments?.length > 0 && (
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto w-fit">
                  <button
                    onClick={() => setProfileViewTab('personal')}
                    className={`px-6 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${profileViewTab === 'personal'
                        ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                      }`}
                  >
                    <UserCheck size={14} /> Personal View
                  </button>
                  <button
                    onClick={() => setProfileViewTab('department')}
                    className={`px-6 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${profileViewTab === 'department'
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                      }`}
                  >
                    <Building2 size={14} /> Department / HOD View
                  </button>
                </div>
              )}

              {profileViewTab === 'personal' && (
                <>
                  {/* Reported Section */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                      <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <AlertCircle size={18} className="text-slate-400" />
                        Reported Incidents ({userProfileData.reportedIncidents?.length || 0})
                      </h4>
                    </div>
                    
                    {userProfileData.reportedIncidents?.length > 0 ? (
                      <IncidentDetailedTable incidents={userProfileData.reportedIncidents} />
                    ) : (
                      <div className="text-center p-12 bg-white">
                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                          <FileText size={24} className="text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-600">No incidents reported</p>
                        <p className="text-xs text-slate-400 mt-1">This personnel has not submitted any incident reports.</p>
                      </div>
                    )}
                  </div>

                  {/* Responsible Section */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                      <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <User size={18} className="text-slate-400" />
                        Assigned / Responsible Incidents ({userProfileData.responsibleIncidents?.length || 0})
                      </h4>
                    </div>
                    
                    {userProfileData.responsibleIncidents?.length > 0 ? (
                      <IncidentDetailedTable incidents={userProfileData.responsibleIncidents} />
                    ) : (
                      <div className="text-center p-12 bg-white">
                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                          <User size={24} className="text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-600">No assigned incidents</p>
                        <p className="text-xs text-slate-400 mt-1">This personnel is not marked as responsible for any incidents.</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Department Section (Only if they manage departments) */}
              {profileViewTab === 'department' && userProfileData.managedDepartments && userProfileData.managedDepartments.length > 0 && (
                <div className="space-y-6 mt-6">
                  {userProfileData.managedDepartments.map((deptName) => {
                    const deptIncidents = (userProfileData.departmentIncidents || []).filter(i => i.dept_name === deptName);
                    const activeCount = deptIncidents.filter(i => i.status !== 'resolved' && i.status !== 'withdrawn').length;
                    const solvedCount = deptIncidents.filter(i => i.status === 'resolved').length;
                    
                    return (
                      <div key={deptName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                          <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <Building size={18} className="text-slate-400" />
                            {deptName} Received Incidents
                          </h4>
                          <div className="flex items-center gap-3 text-xs font-bold">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">Total: {deptIncidents.length}</span>
                            <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-md border border-rose-200">Active: {activeCount}</span>
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">Solved: {solvedCount}</span>
                          </div>
                        </div>
                        
                        {deptIncidents.length > 0 ? (
                           <IncidentDetailedTable incidents={deptIncidents} />
                        ) : (
                          <div className="text-center p-12 bg-white">
                            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                              <Building size={24} className="text-slate-300" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">No incidents received</p>
                            <p className="text-xs text-slate-400 mt-1">This department has not received any incidents yet.</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="py-16 text-center text-red-500 text-sm font-bold">Failed to load analytics</div>
          )}
        </div>
      ) : (
          <>
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
        {activeCard === 'employee' && (
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
            <button onClick={() => setShowBulkUploadModal(true)} disabled={bulkAddMutation.isPending} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2">
              {bulkAddMutation.isPending ? <Spinner size={14} /> : <Upload size={14} />} Bulk Upload
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2">
              <Plus size={14} /> Add Employee
            </button>
            <button
              onClick={() => syncHrmsMutation.mutate()}
              disabled={syncHrmsMutation.isPending}
              title={syncStatusData?.last_hrms_sync_at ? `Last synced: ${new Date(syncStatusData.last_hrms_sync_at).toLocaleString()}` : 'Sync all staff from HRMS Google Sheet'}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw size={14} className={syncHrmsMutation.isPending ? 'animate-spin' : ''} />
              {syncHrmsMutation.isPending ? 'Syncing...' : 'Sync with HR Sheet'}
            </button>
          </div>
        )}
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
        const filteredDepts = departments.filter(d => {
          const staffName = d.assigned_staff_name || d.hod_name || '';
          const staffId = d.assigned_employee_id || d.hod_employee_id || '';
          return (
            d.name?.toLowerCase().includes(ts) ||
            staffName.toLowerCase().includes(ts) ||
            staffId.toLowerCase().includes(ts)
          );
        });

        const filteredPersonnel = (masterEmployees || []).filter(u => {
          const term = (debouncedSearch || '').toLowerCase().trim();
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

            if (roleFilter === 'system_admin') {
              if (!isSysAdmin) return false;
            } else if (roleFilter === 'imc') {
              if (!hasImcAccess) return false;
            } else if (roleFilter === 'head_management') {
              if (!hasMgmtAccess) return false;
            } else if (roleFilter === 'hod') {
              if (u.role !== 'hod') return false;
            } else if (roleFilter === 'employee') {
              if (!u.is_registered || u.role !== 'employee' || isSysAdmin || hasImcAccess || hasMgmtAccess) return false;
            } else if (roleFilter === 'unregistered') {
              if (u.is_registered) return false;
            }
          }

          if (selectedDeptFilter && selectedDeptFilter !== 'all') {
            if ((u.department || '').toLowerCase() !== selectedDeptFilter.toLowerCase()) return false;
          }

          return true;
        });

        const PAGE_SIZE = 50;
        const personnelTotalPages = Math.ceil(filteredPersonnel.length / PAGE_SIZE) || 1;
        const paginatedPersonnel = filteredPersonnel.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
                      Showing {filteredPersonnel.length} personnel ({masterEmployees.length || 0} total staff)
                      {syncStatusData?.last_hrms_sync_at && (
                        <span className="ml-2 font-medium text-indigo-600">
                          (HR Sheet last synced: {new Date(syncStatusData.last_hrms_sync_at).toLocaleDateString()} {new Date(syncStatusData.last_hrms_sync_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
                    <div className="relative flex-1 sm:flex-initial min-w-[220px]">
                      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search name, ID, email, dept…"
                        className="input pl-10 pr-8 bg-white text-xs py-2.5 rounded-xl border-slate-200 focus:border-blue-500 font-medium w-full"
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => { setSearch(''); setPage(1); }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <select
                        value={selectedDeptFilter}
                        onChange={e => { setSelectedDeptFilter(e.target.value); setPage(1); }}
                        className="select w-40 bg-white font-semibold text-xs py-2.5 rounded-xl border-slate-200"
                      >
                        <option value="all">All Departments</option>
                        {departments.map(d => (
                          <option key={d.id || d.name} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="relative">
                      <select
                        value={roleFilter}
                        onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
                        className="select w-40 bg-white font-semibold text-xs py-2.5 rounded-xl border-slate-200"
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    {(search || roleFilter || selectedDeptFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setRoleFilter('');
                          setSelectedDeptFilter('all');
                          setPage(1);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1 underline"
                      >
                        Reset
                      </button>
                    )}
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
                          {isLoadingMaster ? <tr><td colSpan={7} className="text-center py-14"><Spinner size={24} /></td></tr> : (
                            filteredPersonnel.length === 0 ? (
                              <tr><td colSpan={7} className="text-center py-14 text-slate-400 font-medium">No personnel found matching your filter criteria.</td></tr>
                            ) : paginatedPersonnel.map(u => {
                            const hasImcAccess = u.role === 'imc' || u.is_imc_member || u.is_imc_lead;
                            const hasMgmtAccess = u.role === 'head_management' || u.is_management_member;
                            const isSysAdmin = u.role === 'system_admin' || u.is_system_admin;
                            return (
                              <tr key={u.master_id || u.id || u.employee_id} onClick={() => { setSelectedProfileUser(u); setProfileViewTab('personal'); }} className="hover:bg-blue-50/30 transition-colors group cursor-pointer">
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
                                  {u.is_registered ? (
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
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-slate-100 text-slate-500 border-slate-200">
                                      NO IMS ACCOUNT
                                    </span>
                                  )}
                                </td>
                                <td className="py-4">
                                  {!u.is_registered ? (
                                    <span className="text-xs text-slate-400 font-medium">Unregistered</span>
                                  ) : u.is_active ? (
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
                                    disabled={!u.is_registered}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAssignForm({ employeeId: u.employee_id, targetRole: u.role !== 'employee' ? u.role : 'imc', departmentId: '' });
                                      setShowAssignModal(true);
                                    }}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1 ${!u.is_registered ? 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed' : 'bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700'}`}
                                  >
                                    <Edit3 size={13} /> Configure
                                  </button>
                                  <button
                                    disabled={!u.is_registered}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await adminApi.toggleUserStatus(u.id);
                                        toast.success(`User account ${u.is_active ? 'deactivated' : 'activated'} successfully.`);
                                        qc.invalidateQueries({ queryKey: ['admin-users'] });
                                        qc.invalidateQueries({ queryKey: ['master-employees'] });
                                      } catch (error) {
                                        toast.error(error.response?.data?.error || 'Failed to change user status');
                                      }
                                    }}
                                    className={`ml-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1 ${!u.is_registered ? 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed' : u.is_active
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
                          }))}
                        </tbody>
                      </table>
                    </div>
                    {personnelTotalPages > 1 && (
                      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">
                          Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filteredPersonnel.length)} of {filteredPersonnel.length} personnel
                        </span>
                        <Pagination page={page} totalPages={personnelTotalPages} onPageChange={setPage} />
                      </div>
                    )}
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
                    {filteredImcMembers.map((m, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 15 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        key={m.id} 
                        className="rounded-2xl p-5 bg-gradient-to-br from-indigo-50/60 to-white border border-indigo-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
                      >
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
                      </motion.div>
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

            {/* ─── TAB 5: DEPARTMENT FEEDBACK MAPPING ─── */}
            {activeCard === 'mapping' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Building2 size={20} />
                      </div>
                      <h2 className="text-xl font-black text-slate-900">Department Feedback Mapping</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Designate the single employee authorized to submit incident feedback for each department. The same employee can be assigned to multiple departments.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:min-w-[220px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search departments or staff..."
                        value={tabSearch}
                        onChange={(e) => setTabSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setNewDeptForm({ name: '', employeeId: '' });
                        setNewDeptSearchTerm('');
                        setShowAddDeptModal(true);
                      }}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all"
                    >
                      <Plus size={16} /> Add Department
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
                          <th className="py-3.5 pl-6 w-1/3">Hospital Department</th>
                          <th className="py-3.5 w-5/12">Assigned Feedback Staff</th>
                          <th className="py-3.5 text-center">Feedback Authority Status</th>
                          <th className="py-3.5 pr-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDepts.map(d => {
                          const staffName = d.assigned_staff_name || d.hod_name;
                          const staffId = d.assigned_employee_id || d.hod_employee_id;
                          const staffDesig = d.assigned_designation;
                          const staffDept = d.assigned_department;

                          return (
                            <tr key={d.id} className="hover:bg-amber-50/20 transition-colors group">
                              <td className="pl-6 py-4">
                                <p className="font-extrabold text-slate-900 text-sm">{d.name}</p>
                                <span className="text-[10px] text-slate-400 font-mono">Dept ID: {d.id}</span>
                              </td>
                              
                              {/* Assigned Feedback Staff Column */}
                              <td className="py-4">
                                {staffName ? (
                                  <div className="flex items-center justify-between gap-3 bg-slate-50/80 hover:bg-amber-50/40 border border-slate-200/80 hover:border-amber-200 p-2.5 rounded-xl transition-all shadow-2xs group/cell max-w-[340px]">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                                        {staffName.charAt(0)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 truncate" title={staffName}>{staffName}</p>
                                        <p className="text-[11px] font-mono text-slate-500 font-semibold">ID: {staffId}</p>
                                        {(staffDesig || staffDept) && (
                                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                            {[staffDesig, staffDept].filter(Boolean).join(' · ')}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => handleOpenMapModal(d.id, staffId)}
                                        title="Change feedback staff"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-100/70 transition-colors"
                                      >
                                        <Edit3 size={13} />
                                      </button>
                                      <button
                                        onClick={() => handleOpenRemoveLeaderModal(d.id, d.name, staffName, staffId)}
                                        title="Unassign feedback staff"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-100/70 transition-colors"
                                      >
                                        <UserMinus size={13} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleOpenMapModal(d.id, '')}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 hover:border-amber-400 text-slate-500 hover:text-amber-800 bg-slate-50/50 hover:bg-amber-50/50 text-xs font-semibold transition-all"
                                  >
                                    <Plus size={13} /> Assign Feedback Staff
                                  </button>
                                )}
                              </td>

                              {/* Feedback Authority Status Column */}
                              <td className="py-4 text-center">
                                {staffName ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 size={12} className="text-emerald-600" /> Authorized Assignee
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <AlertTriangle size={12} className="text-amber-600" /> Pending Assignee
                                  </span>
                                )}
                              </td>

                              <td className="pr-6 py-4 text-right">
                                {staffName ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenMapModal(d.id, staffId)}
                                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-600 hover:text-white text-slate-700 text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1.5"
                                    >
                                      <Edit3 size={12} /> Change
                                    </button>
                                    <button
                                      onClick={() => handleOpenRemoveLeaderModal(d.id, d.name, staffName, staffId)}
                                      title="Unassign feedback staff"
                                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1.5"
                                    >
                                      <UserMinus size={12} /> Unassign
                                    </button>
                                    <button
                                      onClick={() => {
                                        setDeptToDelete({ id: d.id, name: d.name, staffName });
                                        setShowDeleteDeptModal(true);
                                      }}
                                      title="Delete Department"
                                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-all shadow-2xs inline-flex items-center justify-center"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenMapModal(d.id, '')}
                                      className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1.5"
                                    >
                                      <Plus size={12} /> Assign Staff
                                    </button>
                                    <button
                                      onClick={() => {
                                        setDeptToDelete({ id: d.id, name: d.name, staffName: null });
                                        setShowDeleteDeptModal(true);
                                      }}
                                      title="Delete Department"
                                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-all shadow-2xs inline-flex items-center justify-center"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
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

      {/* Map / Edit Department Feedback Staff Modal */}
      <Modal
        open={showMapModal}
        onClose={() => setShowMapModal(false)}
        title={(() => {
          const selectedDept = departments.find(d => String(d.id) === String(mapForm.departmentId));
          const currentStaff = selectedDept?.assigned_staff_name || selectedDept?.hod_name;
          return currentStaff ? `Change Feedback Staff — ${selectedDept.name}` : `Assign Feedback Staff — ${selectedDept?.name || 'Department'}`;
        })()}
        footer={
          <>
            <button onClick={() => setShowMapModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => mapLeaderMutation.mutate(mapForm)}
              disabled={!mapForm.departmentId || !mapForm.employeeId.trim() || mapLeaderMutation.isPending}
              className="btn-primary"
            >
              {mapLeaderMutation.isPending ? <Spinner size={15} className="text-white" /> : <CheckCircle2 size={15} />}
              {(() => {
                const selectedDept = departments.find(d => String(d.id) === String(mapForm.departmentId));
                const currentStaff = selectedDept?.assigned_staff_name || selectedDept?.hod_name;
                return currentStaff ? 'Update Feedback Assignment' : 'Confirm Assignment';
              })()}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert type="info" message="Designate the single employee who will give feedback for this department. Any employee can be assigned, and the same employee can be assigned to multiple departments." />

          {/* Currently Assigned Notice (if any) */}
          {(() => {
            const selectedDept = departments.find(d => String(d.id) === String(mapForm.departmentId));
            if (!selectedDept) return null;
            const currentName = selectedDept.assigned_staff_name || selectedDept.hod_name;
            const currentId = selectedDept.assigned_employee_id || selectedDept.hod_employee_id;
            if (!currentName) return null;

            return (
              <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-900 font-black text-xs flex items-center justify-center flex-shrink-0">
                    {currentName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Currently Assigned Staff:</span>
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {currentName} {currentId && <span className="font-mono text-slate-500 font-normal">(ID: {currentId})</span>}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleOpenRemoveLeaderModal(
                      mapForm.departmentId,
                      selectedDept.name,
                      currentName,
                      currentId
                    );
                  }}
                  className="px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs flex-shrink-0"
                >
                  <Trash2 size={12} /> Remove Staff
                </button>
              </div>
            );
          })()}

          <div>
            <label className="field-label field-required font-bold">Hospital Department</label>
            <select
              value={mapForm.departmentId}
              onChange={e => {
                const newDeptId = e.target.value;
                setMapForm(f => ({ ...f, departmentId: newDeptId, employeeId: '' }));
                setMapSearchTerm('');
              }}
              className="select w-full font-semibold"
            >
              <option value="">-- Choose Department --</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            {!mapForm.employeeId ? (
              <>
                <label className="field-label field-required font-bold">Search & Select Staff Member</label>
                <div className="relative mt-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={mapSearchTerm}
                    onChange={e => setMapSearchTerm(e.target.value)}
                    placeholder="Search by name, Employee ID, or department..."
                    className="input pl-9 font-bold text-sm w-full"
                    autoFocus
                  />
                  
                  {mapSearchTerm.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {(() => {
                        const term = mapSearchTerm.toLowerCase().trim();
                        const matches = (masterEmployees || []).filter(e => {
                          const fullName = String(e.full_name || e.name || '').toLowerCase();
                          const empId = String(e.employee_id || '').toLowerCase();
                          const dept = String(e.department || '').toLowerCase();
                          const desig = String(e.designation || '').toLowerCase();
                          return fullName.includes(term) || empId.includes(term) || dept.includes(term) || desig.includes(term);
                        }).slice(0, 50);

                        if (matches.length === 0) {
                          return (
                            <div className="p-4 text-sm text-slate-500 text-center font-medium">
                              No employees found matching &quot;{mapSearchTerm}&quot;
                            </div>
                          );
                        }

                        return matches.map(emp => (
                          <div 
                            key={emp.employee_id || emp.master_id || emp.id} 
                            className="p-3 hover:bg-amber-50/70 cursor-pointer transition-colors"
                            onClick={() => {
                              setMapForm(f => ({ ...f, employeeId: String(emp.employee_id) }));
                              setMapSearchTerm('');
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-sm text-slate-800">{emp.full_name || emp.name}</p>
                              <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold whitespace-nowrap">
                                ID: {emp.employee_id}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {emp.designation || 'Staff'} • <span className="text-slate-700 font-medium">{emp.department || 'No Dept'}</span>
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Search and select the hospital staff member to give feedback for this department.</p>
              </>
            ) : (
              <div>
                <label className="field-label field-required font-bold">Selected Feedback Staff</label>
                {(() => {
                  const emp = (masterEmployees || []).find(e => String(e.employee_id) === String(mapForm.employeeId));
                  if (emp) {
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-1 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-black text-lg flex-shrink-0">
                              {(emp.full_name || emp.name)?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 leading-tight">{emp.full_name || emp.name}</p>
                              <p className="text-xs font-mono font-bold text-slate-600 mt-0.5">ID: {emp.employee_id}</p>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {emp.designation || 'Staff'} • {emp.department || 'No Dept'}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setMapForm(f => ({ ...f, employeeId: '' }));
                              setMapSearchTerm('');
                            }}
                            className="text-xs text-slate-600 hover:text-slate-900 font-bold px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Edit3 size={13} /> Change
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-1 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-red-900">Selected Staff</p>
                        <p className="text-xs text-red-700 font-mono mt-0.5">ID: {mapForm.employeeId}</p>
                      </div>
                      <button
                        onClick={() => {
                          setMapForm(f => ({ ...f, employeeId: '' }));
                          setMapSearchTerm('');
                        }}
                        className="text-xs text-red-700 hover:text-red-900 font-bold px-2.5 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Edit3 size={13} /> Change
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Remove Department Feedback Staff Confirmation Modal */}
      <Modal
        open={showRemoveLeaderModal}
        onClose={() => {
          if (!removeLeaderMutation.isPending) {
            setShowRemoveLeaderModal(false);
            setLeaderToRemove(null);
          }
        }}
        title="Remove Department Feedback Staff"
        footer={
          <>
            <button
              onClick={() => {
                setShowRemoveLeaderModal(false);
                setLeaderToRemove(null);
              }}
              disabled={removeLeaderMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (leaderToRemove) {
                  removeLeaderMutation.mutate({
                    departmentId: leaderToRemove.departmentId,
                  });
                }
              }}
              disabled={removeLeaderMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-red-500/20 transition-all disabled:opacity-60"
            >
              {removeLeaderMutation.isPending ? <Spinner size={14} className="text-white" /> : <Trash2 size={14} />}
              Confirm Removal
            </button>
          </>
        }
      >
        {leaderToRemove && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
              <div className="text-xs text-red-900 leading-relaxed">
                <p className="font-bold text-sm mb-1 text-red-950">Remove feedback staff assignment?</p>
                <p>
                  You are about to remove <strong className="font-extrabold">{leaderToRemove.staffName}</strong>{' '}
                  {leaderToRemove.employeeId && <span>(ID: {leaderToRemove.employeeId})</span>} as the designated feedback provider for{' '}
                  <strong className="font-extrabold">{leaderToRemove.deptName}</strong>.
                </p>
                <p className="mt-2 text-red-700">
                  This department will not have anyone authorized to submit feedback on incidents until a new staff member is assigned.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── ADD DEPARTMENT MODAL ─── */}
      <Modal
        open={showAddDeptModal}
        onClose={() => {
          if (!createDeptMutation.isPending) {
            setShowAddDeptModal(false);
          }
        }}
        title="Add New Hospital Department"
        footer={
          <>
            <button
              onClick={() => setShowAddDeptModal(false)}
              disabled={createDeptMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => createDeptMutation.mutate(newDeptForm)}
              disabled={!newDeptForm.name.trim() || createDeptMutation.isPending}
              className="btn-primary"
            >
              {createDeptMutation.isPending ? <Spinner size={15} className="text-white" /> : <Plus size={15} />}
              Create Department
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert
            type="info"
            message="Add a hospital department to the system directory. You can optionally designate an employee authorized to provide incident feedback."
          />

          <div>
            <label className="field-label field-required font-bold">Department Name</label>
            <input
              type="text"
              placeholder="e.g. Cardiology, Radiology, Pharmacy..."
              value={newDeptForm.name}
              onChange={(e) => setNewDeptForm((f) => ({ ...f, name: e.target.value }))}
              className="input font-bold text-sm w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label font-bold">Assign Initial Feedback Staff (Optional)</label>
            {!newDeptForm.employeeId ? (
              <div className="relative mt-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={newDeptSearchTerm}
                  onChange={(e) => setNewDeptSearchTerm(e.target.value)}
                  placeholder="Search by staff name, ID, or department..."
                  className="input pl-9 text-xs font-semibold w-full"
                />
                {newDeptSearchTerm.trim() && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {(() => {
                      const term = newDeptSearchTerm.toLowerCase().trim();
                      const matches = (masterEmployees || []).filter((e) => {
                        const fullName = String(e.full_name || e.name || '').toLowerCase();
                        const empId = String(e.employee_id || '').toLowerCase();
                        const dept = String(e.department || '').toLowerCase();
                        return fullName.includes(term) || empId.includes(term) || dept.includes(term);
                      }).slice(0, 30);

                      if (matches.length === 0) {
                        return (
                          <div className="p-3 text-xs text-slate-500 text-center font-medium">
                            No employees found matching &quot;{newDeptSearchTerm}&quot;
                          </div>
                        );
                      }

                      return matches.map((emp) => (
                        <div
                          key={emp.employee_id || emp.id}
                          className="p-2.5 hover:bg-amber-50 cursor-pointer transition-colors"
                          onClick={() => {
                            setNewDeptForm((f) => ({ ...f, employeeId: String(emp.employee_id) }));
                            setNewDeptSearchTerm('');
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-xs text-slate-800">{emp.full_name || emp.name}</p>
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                              ID: {emp.employee_id}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {emp.designation || 'Staff'} · {emp.department || 'Hospital Personnel'}
                          </p>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {(() => {
                  const emp = (masterEmployees || []).find((e) => String(e.employee_id) === String(newDeptForm.employeeId));
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between mt-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                          {(emp?.full_name || emp?.name || 'E').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{emp?.full_name || emp?.name || newDeptForm.employeeId}</p>
                          <p className="text-[10px] font-mono text-slate-500">ID: {newDeptForm.employeeId}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewDeptForm((f) => ({ ...f, employeeId: '' }))}
                        className="text-xs text-slate-600 hover:text-slate-900 font-bold px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ─── DELETE DEPARTMENT CONFIRMATION MODAL ─── */}
      <Modal
        open={showDeleteDeptModal}
        onClose={() => {
          if (!deleteDeptMutation.isPending) {
            setShowDeleteDeptModal(false);
            setDeptToDelete(null);
          }
        }}
        title="Delete Hospital Department"
        footer={
          <>
            <button
              onClick={() => {
                setShowDeleteDeptModal(false);
                setDeptToDelete(null);
              }}
              disabled={deleteDeptMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (deptToDelete?.id) {
                  deleteDeptMutation.mutate(deptToDelete.id);
                }
              }}
              disabled={deleteDeptMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-red-500/20 transition-all disabled:opacity-60"
            >
              {deleteDeptMutation.isPending ? <Spinner size={14} className="text-white" /> : <Trash2 size={14} />}
              Confirm Deletion
            </button>
          </>
        }
      >
        {deptToDelete && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
              <div className="text-xs text-red-900 leading-relaxed">
                <p className="font-bold text-sm mb-1 text-red-950">
                  Delete &quot;{deptToDelete.name}&quot;?
                </p>
                <p>
                  Are you sure you want to permanently delete <strong className="font-extrabold">{deptToDelete.name}</strong> from the hospital department directory?
                </p>
                {deptToDelete.staffName && (
                  <p className="mt-1 text-red-800">
                    Currently assigned feedback staff ({deptToDelete.staffName}) will also be unmapped.
                  </p>
                )}
                <p className="mt-2 text-red-700">
                  Note: If this department has recorded incidents or historical feedback, deletion is prevented by system integrity rules to preserve audit trails.
                </p>
              </div>
            </div>
          </div>
        )}
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
            {!assignForm.employeeId ? (
              <>
                <label className="field-label field-required font-bold">Search Employee</label>
                <div className="relative mt-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={assignSearchTerm}
                    onChange={e => setAssignSearchTerm(e.target.value)}
                    placeholder="Search by name, Employee ID, or department..."
                    className="input pl-9 font-bold text-sm w-full"
                    autoFocus
                  />
                  
                  {assignSearchTerm.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {(() => {
                        const term = assignSearchTerm.toLowerCase().trim();
                        const matches = (masterEmployees || []).filter(e => {
                          const fullName = String(e.full_name || e.name || '').toLowerCase();
                          const empId = String(e.employee_id || '').toLowerCase();
                          const dept = String(e.department || '').toLowerCase();
                          const desig = String(e.designation || '').toLowerCase();
                          return fullName.includes(term) || empId.includes(term) || dept.includes(term) || desig.includes(term);
                        }).slice(0, 50);

                        if (matches.length === 0) {
                          return (
                            <div className="p-4 text-sm text-slate-500 text-center font-medium">
                              No employees found matching &quot;{assignSearchTerm}&quot;
                            </div>
                          );
                        }

                        return matches.map(emp => (
                          <div 
                            key={emp.employee_id || emp.master_id || emp.id} 
                            className="p-3 hover:bg-blue-50/70 cursor-pointer transition-colors"
                            onClick={() => {
                              setAssignForm(f => ({ ...f, employeeId: String(emp.employee_id) }));
                              setAssignSearchTerm('');
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-sm text-slate-800">{emp.full_name || emp.name}</p>
                              <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold whitespace-nowrap">
                                ID: {emp.employee_id}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {emp.designation || 'Staff'} • <span className="text-slate-700 font-medium">{emp.department || 'No Dept'}</span>
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="field-label field-required font-bold">Selected Employee</label>
                {(() => {
                  const emp = (masterEmployees || []).find(e => String(e.employee_id) === String(assignForm.employeeId));
                  if (emp) {
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-1 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-lg flex-shrink-0">
                              {(emp.full_name || emp.name)?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 leading-tight">{emp.full_name || emp.name}</p>
                              <p className="text-xs font-mono font-bold text-slate-600 mt-0.5">ID: {emp.employee_id}</p>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {emp.designation || 'Staff'} • {emp.department || 'No Dept'}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Role:</span> 
                                <span className="font-black text-blue-700 uppercase px-2 py-0.5 bg-blue-100 border border-blue-200 rounded-md text-[10px]">
                                  {emp.role?.replace(/_/g, ' ') || 'EMPLOYEE'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setAssignForm(f => ({ ...f, employeeId: '' }));
                              setAssignSearchTerm('');
                            }}
                            className="text-xs text-slate-600 hover:text-slate-900 font-bold px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Edit3 size={13} /> Change
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-1 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-amber-900">Selected Employee</p>
                        <p className="text-xs text-amber-700 font-mono mt-0.5">ID: {assignForm.employeeId}</p>
                      </div>
                      <button
                        onClick={() => {
                          setAssignForm(f => ({ ...f, employeeId: '' }));
                          setAssignSearchTerm('');
                        }}
                        className="text-xs text-amber-700 hover:text-amber-900 font-bold px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Edit3 size={13} /> Change
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div>
            <label className="field-label field-required font-bold">Portal Access Role</label>
            <select
              value={['imc', 'imc_convenor'].includes(assignForm.targetRole) ? 'imc' : assignForm.targetRole}
              onChange={e => setAssignForm(f => ({ ...f, targetRole: e.target.value }))}
              className="select w-full font-semibold mt-1"
            >
              <option value="system_admin">System Administrator</option>
              <option value="imc">IMC Committee</option>
              <option value="head_management">Executive Management</option>
              <option value="hod">Department HOD</option>
              <option value="employee">Regular Employee</option>
            </select>
          </div>

          {['imc', 'imc_convenor'].includes(assignForm.targetRole) && (
            <div className="animate-in fade-in duration-200">
              <label className="field-label field-required font-bold">IMC Role Type</label>
              <select
                value={assignForm.targetRole}
                onChange={e => setAssignForm(f => ({ ...f, targetRole: e.target.value }))}
                className="select w-full font-semibold mt-1"
              >
                <option value="imc">IMC Member Only</option>
                <option value="imc_convenor">IMC Convenor</option>
              </select>
            </div>
          )}

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

      {/* Bulk Upload Instructions Modal */}
      <Modal open={showBulkUploadModal} onClose={() => setShowBulkUploadModal(false)} title="Bulk Upload Employees">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-blue-900 flex items-center gap-2">
                <Upload size={16} /> Data Formatting Guide
              </h3>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText("Employee Name\tEmployee ID\tDesignation\tDepartment\tMobile Number\tEmail");
                  toast.success("Headers copied to clipboard!");
                }}
                className="text-xs flex items-center gap-1.5 font-bold bg-white text-blue-600 px-2.5 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
              >
                <Copy size={14} /> Copy Headers
              </button>
            </div>
            <p className="text-xs text-blue-800 mb-3 leading-relaxed">
              Please ensure your CSV or Excel file contains the exact headers listed below (case-insensitive).
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-blue-900">
              <div className="bg-white/60 p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Employee Name
              </div>
              <div className="bg-white/60 p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Employee ID
              </div>
              <div className="bg-white/60 p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Designation
              </div>
              <div className="bg-white/60 p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Department
              </div>
              <div className="bg-white/60 p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Mobile Number
              </div>
              <div className="bg-white/60 p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Email
              </div>
            </div>
          </div>
          
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { 
              e.preventDefault(); 
              setIsDragging(false); 
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileUpload(e);
              }
            }}
            onClick={() => fileInputRef.current.click()}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
              isDragging ? 'border-blue-500 bg-blue-50 scale-[0.98]' : 'border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-slate-100/50'
            }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${isDragging ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
              <FileUp size={24} />
            </div>
            <p className="text-sm font-bold text-slate-700 mb-1">
              {isDragging ? 'Drop your Excel file here' : 'Click or drag file to this area to upload'}
            </p>
            <p className="text-xs text-slate-500">Supports .csv and .xlsx files</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowBulkUploadModal(false)} className="px-4 py-2 rounded-lg font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Add Single Employee Modal */}
      <Modal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Staff Member to Master DB">
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(addForm); }} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-bold text-slate-700 mb-1 block">Employee ID <span className="text-red-500">*</span></label>
              <input type="text" pattern="[0-9]{5}" title="Exactly 5 digits" className="input bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 w-full" required value={addForm.employeeId} onChange={e => setAddForm({...addForm, employeeId: e.target.value})} />
            </div>
            <div>
              <label className="label text-xs font-bold text-slate-700 mb-1 block">Full Name <span className="text-red-500">*</span></label>
              <input type="text" className="input bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 w-full" required value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-bold text-slate-700 mb-1 block">Department</label>
              <input type="text" className="input bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 w-full" value={addForm.department} onChange={e => setAddForm({...addForm, department: e.target.value})} />
            </div>
            <div>
              <label className="label text-xs font-bold text-slate-700 mb-1 block">Designation</label>
              <input type="text" className="input bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 w-full" value={addForm.designation} onChange={e => setAddForm({...addForm, designation: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-bold text-slate-700 mb-1 block">Email</label>
              <input type="email" className="input bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 w-full" value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})} />
            </div>
            <div>
              <label className="label text-xs font-bold text-slate-700 mb-1 block">Mobile Number</label>
              <input type="text" pattern="[0-9]{10}" title="Exactly 10 digits" className="input bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 w-full" value={addForm.phone} onChange={e => setAddForm({...addForm, phone: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" className="px-4 py-2 rounded-lg font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2" disabled={addMutation.isPending}>
              {addMutation.isPending ? <Spinner size={14} /> : 'Save Employee'}
            </button>
          </div>
        </form>
      </Modal>
        </>
      )}
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
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category & Type</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Severity</th>
            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {incidents.map(inc => (
            <tr key={inc.id + (inc.role_type || '')} className="hover:bg-slate-50 transition-colors group">
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
              <td className="py-3 px-6 text-sm text-slate-600 whitespace-nowrap">{formatDate(inc.incident_date || inc.created_at)}</td>
              <td className="py-3 px-6 text-sm text-slate-800">
                {inc.incident_category && <div className="font-medium text-slate-700">{inc.incident_category}</div>}
                <div className="text-xs text-slate-500 line-clamp-1" title={inc.incident_type}>{inc.incident_type || 'Unknown'}</div>
              </td>
              <td className="py-3 px-6">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  inc.severity === 'Grave' ? 'bg-purple-100 text-purple-700' :
                  inc.severity === 'Major' ? 'bg-orange-100 text-orange-700' :
                  inc.severity === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                  inc.severity === 'Minor' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {inc.severity || 'Pending'}
                </span>
              </td>
              <td className="py-3 px-6">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusClass(inc.status || 'unknown')}`}>
                  {getStatusLabel(inc.status || 'unknown')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}