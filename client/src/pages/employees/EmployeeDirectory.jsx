import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { employeeApi, masterEmployeesApi } from '../../api';
import api from '../../api';
import { Spinner, EmptyState, Modal } from '../../components/ui';
import { Search, Users, Phone, Building, Briefcase, FileText, ArrowLeft, Plus, Upload, CheckCircle, XCircle } from 'lucide-react';
import { formatDate, getStatusClass, getStatusLabel } from '../../utils/helpers';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export default function EmployeeDirectory() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'system_admin';
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [selectedDept, setSelectedDept] = useState(searchParams.get('dept') || 'all');
  const [selectedStatus, setSelectedStatus] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(parseInt(searchParams.get('page'), 10) || 1);
  const [limit, setLimit] = useState(100);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({ employeeId: '', name: '', department: '', designation: '', phone: '', email: '' });

  // Debounce search term to reflect results smoothly and immediately
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on search change
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sync URL parameters
  React.useEffect(() => {
    const params = {};
    if (debouncedSearch) params.q = debouncedSearch;
    if (selectedDept !== 'all') params.dept = selectedDept;
    if (selectedStatus !== 'all') params.status = selectedStatus;
    if (page > 1) params.page = page;
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, selectedDept, selectedStatus, page, setSearchParams]);

  // Query for master employees (Paginated, Searchable, Filterable)
  const { data: directoryData, isLoading: isDirectoryLoading, isError: isDirectoryError, refetch } = useQuery({
    queryKey: ['master-employees', { page, limit, search: debouncedSearch, department: selectedDept, status: selectedStatus, sortBy, sortOrder }],
    queryFn: () => masterEmployeesApi.list({
      page,
      limit,
      search: debouncedSearch,
      department: selectedDept,
      is_registered: selectedStatus === 'all' ? undefined : selectedStatus === 'registered',
      sort_by: sortBy,
      sort_order: sortOrder
    }).then(res => res.data),
    enabled: !selectedEmpId,
    keepPreviousData: true
  });

  const employees = directoryData?.data || [];
  const totalEmployees = directoryData?.total || 0;
  const totalPages = directoryData?.totalPages || 1;
  const departmentsList = directoryData?.departments || [];

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // Query for selected employee details (Detail View)
  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ['employeeDetails', selectedEmpId],
    queryFn: () => employeeApi.search(selectedEmpId).then(res => res.data),
    enabled: !!selectedEmpId,
    retry: false,
    onError: (err) => {
      if (err.response?.status === 404) {
        toast.error('This employee has not created an IMS account yet so they have no profile or incidents.');
      } else {
        toast.error('Failed to load employee details.');
      }
      setSelectedEmpId('');
    }
  });

  // Admin Mutations
  const addMutation = useMutation({
    mutationFn: (data) => masterEmployeesApi.add(data),
    onSuccess: () => {
      toast.success('Employee added to Directory');
      queryClient.invalidateQueries({ queryKey: ['master-employees'] });
      setIsAddModalOpen(false);
      setFormData({ employeeId: '', name: '', department: '', designation: '', phone: '', email: '' });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to add employee');
    }
  });

  const bulkAddMutation = useMutation({
    mutationFn: (employees) => masterEmployeesApi.bulkAdd(employees),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Bulk upload successful');
      queryClient.invalidateQueries({ queryKey: ['master-employees'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to process upload');
    }
  });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const mappedEmployees = data.map(row => {
          const getVal = (key) => {
            const found = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === key.toLowerCase());
            return found ? row[found] : '';
          };
          return {
            employeeId: getVal('employeeid') || getVal('empid') || getVal('id'),
            name: getVal('name') || getVal('fullname'),
            department: getVal('department') || getVal('dept'),
            designation: getVal('designation') || getVal('desig'),
            phone: getVal('phone') || getVal('mobile') || getVal('contact'),
            email: getVal('email') || getVal('emailid')
          };
        }).filter(e => e.employeeId && e.name);

        if (mappedEmployees.length === 0) {
          toast.error("Could not parse employees. Ensure columns 'Employee ID' and 'Name' exist.");
          return;
        }

        bulkAddMutation.mutate(mappedEmployees);
      } catch (err) {
        console.error(err);
        toast.error('Error parsing Excel file');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const emp = detailData?.selectedEmployee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="text-indigo-600" /> 
            {selectedEmpId ? 'Employee Profile' : 'Hospital Personnel Directory'}
          </h1>
          <p className="page-subtitle">
            {selectedEmpId ? 'View detailed profile and reported incidents' : 'Search, filter, and browse all hospital staff members (100 per page)'}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedEmpId ? (
            <button 
              onClick={() => setSelectedEmpId('')}
              className="btn-secondary bg-white flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Directory
            </button>
          ) : isAdmin ? (
            <>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              />
              <button 
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current.click()}
                disabled={bulkAddMutation.isPending}
              >
                {bulkAddMutation.isPending ? <Spinner size={16} className="mr-2" /> : <Upload size={16} className="mr-2" />}
                Upload Excel
              </button>
              <button 
                type="button"
                className="btn-primary" 
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus size={16} className="mr-2" /> Add Employee
              </button>
            </>
          ) : null}
        </div>
      </div>

      {selectedEmpId ? (
        /* DETAIL VIEW */
        <div className="space-y-6 animate-fade-in">
          {isDetailLoading ? (
             <div className="flex justify-center items-center h-64 bg-white rounded-xl shadow-sm border border-slate-200">
               <Spinner size={32} />
             </div>
          ) : emp ? (
            <>
              {/* Profile Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-2xl uppercase shadow-inner">
                    {emp.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-800">{emp.full_name}</h3>
                    <div className="text-sm font-mono text-slate-500 mb-4 inline-block bg-slate-100 px-2 py-0.5 rounded">{emp.employee_id}</div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <Briefcase size={16} className="text-slate-400" />
                        <span className="font-medium">{emp.designation || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <Building size={16} className="text-slate-400" />
                        <span className="font-medium">{emp.department || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <Phone size={16} className="text-slate-400" />
                        <span className="font-medium">{emp.phone || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold text-indigo-700 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                        <FileText size={16} />
                        Incidents Given: {emp.totalIncidentsReported}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Incidents List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                  <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={18} className="text-slate-400" />
                    Reported Incidents ({emp.recentIncidents?.length || 0})
                  </h4>
                </div>
                
                {emp.recentIncidents && emp.recentIncidents.length > 0 ? (
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
                        {emp.recentIncidents.map(inc => (
                          <tr key={inc.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="py-3 px-6 text-sm font-mono text-slate-700">
                              <a href={`/incidents/${encodeURIComponent(inc.id)}`} className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline">
                                {inc.reference_id}
                              </a>
                            </td>
                            <td className="py-3 px-6 text-sm text-slate-600 whitespace-nowrap">{formatDate(inc.incident_date)}</td>
                            <td className="py-3 px-6 text-sm text-slate-800">
                              <div className="font-medium text-slate-700">{inc.incident_category}</div>
                              <div className="text-xs text-slate-500 line-clamp-1" title={inc.incident_type}>{inc.incident_type}</div>
                            </td>
                            <td className="py-3 px-6">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                inc.severity === 'Grave' ? 'bg-purple-100 text-purple-700' :
                                inc.severity === 'Major' ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {inc.severity}
                              </span>
                            </td>
                            <td className="py-3 px-6">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusClass(inc.status)}`}>
                                {getStatusLabel(inc.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center p-12 bg-white">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                      <FileText size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">No incidents reported</p>
                    <p className="text-xs text-slate-400 mt-1">This employee has not submitted any incident reports yet.</p>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        /* DIRECTORY VIEW */
        <div className="space-y-6 animate-fade-in">
          {/* Controls Bar: Search, Dept Filter, Status Filter, Page Size */}
          <div className="card p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Search Bar */}
              <div className="relative md:col-span-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by Name, Employee ID, Phone, Email..."
                  className="input pl-10 pr-8 bg-slate-50 border-slate-200 focus:bg-white w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold px-1 rounded"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Department Filter */}
              <div className="md:col-span-3">
                <select
                  value={selectedDept}
                  onChange={(e) => { setSelectedDept(e.target.value); setPage(1); }}
                  className="input bg-slate-50 border-slate-200 w-full text-sm"
                >
                  <option value="all">All Departments ({departmentsList.length})</option>
                  {departmentsList.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Account Status Filter */}
              <div className="md:col-span-2">
                <select
                  value={selectedStatus}
                  onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
                  className="input bg-slate-50 border-slate-200 w-full text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="registered">Registered Only</option>
                  <option value="unregistered">Not Registered</option>
                </select>
              </div>

              {/* Limit selector */}
              <div className="md:col-span-2 flex items-center justify-end gap-2 text-sm text-slate-600">
                <span className="text-xs text-slate-500 whitespace-nowrap">Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="input bg-slate-50 border-slate-200 py-1.5 px-2 text-sm w-20"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>

            {/* Active search/filter info bar */}
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong className="text-slate-800">{totalEmployees === 0 ? 0 : (page - 1) * limit + 1}</strong> to <strong className="text-slate-800">{Math.min(page * limit, totalEmployees)}</strong> of <strong className="text-slate-800">{totalEmployees}</strong> personnel
                </span>
                {(debouncedSearch || selectedDept !== 'all' || selectedStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedDept('all');
                      setSelectedStatus('all');
                      setPage(1);
                    }}
                    className="text-indigo-600 hover:text-indigo-800 font-medium underline ml-2"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
              <div className="text-slate-400">
                Page {page} of {totalPages}
              </div>
            </div>
          </div>

          {/* Directory Table */}
          <div className="card p-0 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
            {isDirectoryLoading ? (
              <div className="flex flex-col justify-center items-center h-64 gap-3">
                <Spinner size={32} />
                <span className="text-sm text-slate-500">Loading hospital staff directory...</span>
              </div>
            ) : isDirectoryError ? (
              <div className="p-8 text-center text-red-500">Failed to load employees. Please try again.</div>
            ) : employees.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No employees found"
                message={debouncedSearch || selectedDept !== 'all' || selectedStatus !== 'all' 
                  ? "No staff matching your search criteria. Try adjusting your filters." 
                  : "The hospital personnel directory is empty."}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th 
                        onClick={() => handleSort('name')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          Employee Name
                          {sortBy === 'name' && (
                            <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('employee_id')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          Employee ID
                          {sortBy === 'employee_id' && (
                            <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('department')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          Department
                          {sortBy === 'department' && (
                            <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Designation & Contact
                      </th>
                      <th 
                        onClick={() => handleSort('is_registered')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          IMS Account
                          {sortBy === 'is_registered' && (
                            <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                      <tr 
                        key={emp.master_id || emp.employee_id} 
                        onClick={() => {
                          if (!emp.is_registered) {
                            toast.error('This user has not created their IMS account yet. No profile or incident history to view.');
                          } else {
                            setSelectedEmpId(emp.employee_id);
                          }
                        }}
                        className={`hover:bg-slate-50/80 transition-colors ${emp.is_registered ? 'cursor-pointer group' : 'cursor-default opacity-85'}`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-sm uppercase">
                              {emp.full_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                {emp.full_name}
                              </div>
                              <div className="text-xs text-slate-400">{emp.email || 'No email provided'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-1 rounded">
                            {emp.employee_id}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-sm text-slate-700">
                            <Building size={14} className="text-slate-400 flex-shrink-0" />
                            <span className="font-medium">{emp.department || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-slate-700">{emp.designation || '—'}</div>
                          {emp.phone && (
                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                              <Phone size={11} /> {emp.phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {emp.is_registered ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle size={13} className="text-emerald-500" /> Registered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                              <XCircle size={13} className="text-slate-400" /> Not Registered
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls Footer */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                <div className="text-xs text-slate-500">
                  Showing page <span className="font-bold text-slate-700">{page}</span> of <span className="font-bold text-slate-700">{totalPages}</span> ({limit} items per page)
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1 || isDirectoryLoading}
                    className="px-2.5 py-1.5 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    « First
                  </button>
                  <button
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page === 1 || isDirectoryLoading}
                    className="px-3 py-1.5 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>

                  {/* Dynamic Page Buttons with Smart Range */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) {
                        acc.push(`ellipsis-${p}`);
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item) => {
                      if (typeof item === 'string') {
                        return (
                          <span key={item} className="px-2 py-1 text-slate-400 text-xs">
                            ...
                          </span>
                        );
                      }
                      const p = item;
                      const isActive = p === page;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          disabled={isDirectoryLoading}
                          className={`w-8 h-8 rounded text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}

                  <button
                    onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages || isDirectoryLoading}
                    className="px-3 py-1.5 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages || isDirectoryLoading}
                    className="px-2.5 py-1.5 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    Last »
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Single Employee Modal (Only accessible to Admins) */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Staff Member">
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Employee ID <span className="text-red-500">*</span></label>
              <input type="text" className="input" required value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
            </div>
            <div>
              <label className="label">Full Name <span className="text-red-500">*</span></label>
              <input type="text" className="input" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Department</label>
              <input type="text" className="input" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
            </div>
            <div>
              <label className="label">Designation</label>
              <input type="text" className="input" value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="text" className="input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
              {addMutation.isPending ? <Spinner size={16} /> : 'Save Employee'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
