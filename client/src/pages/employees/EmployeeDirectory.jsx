import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { employeeApi, masterEmployeesApi } from '../../api';
import { Spinner, EmptyState, Pagination, SeverityBadge, StatusBadge, Alert } from '../../components/ui';
import {
  Search, Users, Phone, Building, Briefcase, FileText, ArrowLeft,
  CheckCircle, XCircle, MapPin, UserCheck, ShieldAlert
} from 'lucide-react';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

function renderHrmsStatusBadge(emp) {
  const status = emp?.status || 'active';
  if (status === 'terminated' || status === 'deleted') {
    return (
      <span
        title={emp.termination_date ? `Terminated on ${formatDate(emp.termination_date)}` : 'Terminated in OfficePortal HRMS'}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
      >
        {status === 'deleted' ? 'Deleted' : 'Terminated'}
      </span>
    );
  }
  if (status === 'inactive') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
        Inactive
      </span>
    );
  }
  if (status === 'noticePeriod') {
    return (
      <span
        title={emp.notice_period_end_date ? `Notice Period ends: ${formatDate(emp.notice_period_end_date)}` : 'Serving Notice Period'}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
      >
        Notice Period
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
      Active
    </span>
  );
}

export default function EmployeeDirectory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [selectedDept, setSelectedDept] = useState(searchParams.get('dept') || 'all');
  const [selectedHrmsStatus, setSelectedHrmsStatus] = useState(searchParams.get('hrmsStatus') || 'all');
  const [selectedStatus, setSelectedStatus] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(parseInt(searchParams.get('page'), 10) || 1);
  const [limit, setLimit] = useState(100);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedEmpId, setSelectedEmpId] = useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  React.useEffect(() => {
    const params = {};
    if (debouncedSearch) params.q = debouncedSearch;
    if (selectedDept !== 'all') params.dept = selectedDept;
    if (selectedHrmsStatus !== 'all') params.hrmsStatus = selectedHrmsStatus;
    if (selectedStatus !== 'all') params.status = selectedStatus;
    if (page > 1) params.page = page;
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, selectedDept, selectedHrmsStatus, selectedStatus, page, setSearchParams]);

  const { data: directoryData, isLoading: isDirectoryLoading, isError: isDirectoryError, refetch } = useQuery({
    queryKey: ['master-employees', { page, limit, search: debouncedSearch, department: selectedDept, status: selectedHrmsStatus, accountStatus: selectedStatus, sortBy, sortOrder }],
    queryFn: () =>
      masterEmployeesApi
        .list({
          page,
          limit,
          search: debouncedSearch,
          department: selectedDept,
          status: selectedHrmsStatus === 'all' ? undefined : selectedHrmsStatus,
          is_registered: selectedStatus === 'all' ? undefined : selectedStatus === 'registered',
          sort_by: sortBy,
          sort_order: sortOrder,
        })
        .then((res) => res.data),
    enabled: !selectedEmpId,
    placeholderData: keepPreviousData,
  });

  const employees = directoryData?.data || [];
  const totalEmployees = directoryData?.total || 0;
  const totalPages = directoryData?.totalPages || 1;
  const departmentsList = directoryData?.departments || [];

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const { data: detailData, isLoading: isDetailLoading, isError: isDetailError } = useQuery({
    queryKey: ['employeeDetails', selectedEmpId],
    queryFn: () => employeeApi.search(selectedEmpId, { include_terminated: 'true' }).then((res) => res.data),
    enabled: Boolean(selectedEmpId),
    retry: false,
  });

  const emp = detailData?.selectedEmployee;
  const selectedRowMeta = employees.find((e) => e.employee_id === selectedEmpId);

  return (
    <div className="space-y-6 pb-12">
      <div className="page-header flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="text-indigo-600" />
            {selectedEmpId ? 'Employee Profile' : 'Hospital Personnel Directory'}
          </h1>
          <p className="page-subtitle">
            {selectedEmpId
              ? 'View detailed HRMS profile and reported incidents'
              : 'Synced read-only directory powered by OfficePortal HRMS'}
          </p>
        </div>
        {selectedEmpId && (
          <button
            type="button"
            onClick={() => setSelectedEmpId('')}
            className="btn-secondary bg-white flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Directory
          </button>
        )}
      </div>

      {selectedEmpId ? (
        <div className="space-y-6 animate-fade-in">
          {isDetailLoading ? (
            <div className="flex justify-center items-center h-64 bg-white rounded-xl shadow-sm border border-slate-200">
              <Spinner size={32} />
            </div>
          ) : emp ? (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-2xl uppercase">
                    {emp.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <h2 className="text-2xl font-bold text-slate-800">{emp.full_name}</h2>
                      {renderHrmsStatusBadge(selectedRowMeta || emp)}
                    </div>
                    <div className="text-sm font-mono text-slate-500 mb-4 inline-block bg-slate-100 px-2 py-0.5 rounded">
                      {emp.employee_id}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <Briefcase size={16} className="text-slate-400 shrink-0" />
                        <span className="font-medium truncate">{emp.designation || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <Building size={16} className="text-slate-400 shrink-0" />
                        <span className="font-medium truncate">{emp.department || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <Phone size={16} className="text-slate-400 shrink-0" />
                        <span className="font-medium truncate">{emp.phone || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold text-indigo-700 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                        <FileText size={16} className="shrink-0" />
                        Incidents Reported: {emp.totalIncidentsReported || 0}
                      </div>
                      {(selectedRowMeta?.employment_type_name || emp.employment_type_name) && (
                        <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <UserCheck size={16} className="text-slate-400 shrink-0" />
                          <span className="font-medium truncate">
                            Type: {selectedRowMeta?.employment_type_name || emp.employment_type_name}
                          </span>
                        </div>
                      )}
                      {(selectedRowMeta?.office_location || emp.office_location) && (
                        <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <MapPin size={16} className="text-slate-400 shrink-0" />
                          <span className="font-medium truncate">
                            {selectedRowMeta?.office_location || emp.office_location}
                          </span>
                        </div>
                      )}
                      {(selectedRowMeta?.manager_name || emp.manager_name) && (
                        <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <Users size={16} className="text-slate-400 shrink-0" />
                          <span className="font-medium truncate">
                            Reports to: {selectedRowMeta?.manager_name || emp.manager_name}
                          </span>
                        </div>
                      )}
                      {(selectedRowMeta?.portal_access_disable_date || emp.portal_access_disable_date) && (
                        <div className="flex items-center gap-2 text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                          <ShieldAlert size={16} className="shrink-0" />
                          <span className="font-medium truncate">
                            Portal Disable:{' '}
                            {formatDate(selectedRowMeta?.portal_access_disable_date || emp.portal_access_disable_date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={18} className="text-slate-400" />
                    Reported Incidents ({emp.recentIncidents?.length || 0})
                  </h3>
                </div>

                {emp.recentIncidents?.length > 0 ? (
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
                        {emp.recentIncidents.map((inc) => (
                          <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-6 text-sm font-mono text-slate-700">
                              <Link
                                to={`/incidents/${encodeURIComponent(inc.id)}`}
                                className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                              >
                                {inc.reference_id}
                              </Link>
                            </td>
                            <td className="py-3 px-6 text-sm text-slate-600 whitespace-nowrap">
                              {formatDate(inc.incident_date)}
                            </td>
                            <td className="py-3 px-6 text-sm text-slate-800">
                              <div className="font-medium text-slate-700">{inc.incident_category}</div>
                              <div className="text-xs text-slate-500 line-clamp-1" title={inc.incident_type}>
                                {inc.incident_type}
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
                              <StatusBadge status={inc.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8">
                    <EmptyState
                      icon={FileText}
                      title="No incidents reported"
                      message="This employee has not submitted any incident reports yet."
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                {isDetailError ? 'Failed to load employee details.' : 'Employee profile not found.'}
              </p>
              <button
                type="button"
                onClick={() => setSelectedEmpId('')}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <ArrowLeft size={15} /> Back to Directory
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <div className="card p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="relative md:col-span-4">
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
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="md:col-span-3">
                <select
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setPage(1);
                  }}
                  className="input bg-slate-50 border-slate-200 w-full text-sm"
                >
                  <option value="all">All Departments ({departmentsList.length})</option>
                  {departmentsList.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={selectedHrmsStatus}
                  onChange={(e) => {
                    setSelectedHrmsStatus(e.target.value);
                    setPage(1);
                  }}
                  className="input bg-slate-50 border-slate-200 w-full text-sm"
                >
                  <option value="all">All HRMS Status</option>
                  <option value="active">Active</option>
                  <option value="noticePeriod">Notice Period</option>
                  <option value="inactive">Inactive</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  className="input bg-slate-50 border-slate-200 w-full text-sm"
                >
                  <option value="all">All Accounts</option>
                  <option value="registered">Registered Only</option>
                  <option value="unregistered">Not Registered</option>
                </select>
              </div>

              <div className="md:col-span-1 flex items-center justify-end">
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="input bg-slate-50 border-slate-200 py-1.5 px-2 text-sm w-full"
                  title="Rows per page"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span>
                  Showing{' '}
                  <strong className="text-slate-800">{totalEmployees === 0 ? 0 : (page - 1) * limit + 1}</strong> to{' '}
                  <strong className="text-slate-800">{Math.min(page * limit, totalEmployees)}</strong> of{' '}
                  <strong className="text-slate-800">{totalEmployees}</strong> personnel
                </span>
                {(debouncedSearch || selectedDept !== 'all' || selectedHrmsStatus !== 'all' || selectedStatus !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedDept('all');
                      setSelectedHrmsStatus('all');
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

          <div className="card p-0 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
            {isDirectoryLoading ? (
              <div className="flex flex-col justify-center items-center h-64 gap-3">
                <Spinner size={32} />
                <span className="text-sm text-slate-500">Loading hospital staff directory...</span>
              </div>
            ) : isDirectoryError ? (
              <div className="p-6 space-y-3">
                <Alert type="error" title="Error" message="Failed to load employees directory." />
                <button type="button" onClick={() => refetch()} className="btn-secondary text-xs">
                  Retry
                </button>
              </div>
            ) : employees.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No employees found"
                message={
                  debouncedSearch || selectedDept !== 'all' || selectedHrmsStatus !== 'all' || selectedStatus !== 'all'
                    ? 'No staff matching your search criteria. Try adjusting your filters.'
                    : 'No HRMS employees synced yet. Ask System Admin to run OfficePortal Full Bootstrap Sync.'
                }
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
                          {sortBy === 'name' && <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('employee_id')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          Employee ID
                          {sortBy === 'employee_id' && <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('department')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          Department &amp; Location
                          {sortBy === 'department' && <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Designation, Type &amp; Manager
                      </th>
                      <th
                        onClick={() => handleSort('status')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          HRMS Status
                          {sortBy === 'status' && <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('is_registered')}
                        className="py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          IMS Account
                          {sortBy === 'is_registered' && <span className="text-indigo-600 text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((row) => (
                      <tr
                        key={row.master_id || row.employee_id}
                        title={row.is_registered ? 'View employee profile and incident history' : 'No IMS account created yet'}
                        onClick={() => {
                          if (!row.is_registered) {
                            toast('This user has not created their IMS account yet.');
                          } else {
                            setSelectedEmpId(row.employee_id);
                          }
                        }}
                        className={`transition-colors ${
                          row.is_registered ? 'hover:bg-slate-50/80 cursor-pointer group' : 'cursor-default opacity-85'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-sm uppercase">
                              {row.full_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                {row.full_name}
                              </div>
                              <div className="text-xs text-slate-400">{row.email || 'No email provided'}</div>
                              {row.phone && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                                  <Phone size={10} /> {row.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-1 rounded">
                            {row.employee_id}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-sm text-slate-700">
                            <Building size={14} className="text-slate-400 flex-shrink-0" />
                            <span className="font-medium">{row.department || '—'}</span>
                          </div>
                          {row.office_location && (
                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                              <MapPin size={11} /> {row.office_location}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-slate-700">{row.designation || '—'}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {row.employment_type_name && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {row.employment_type_name}
                              </span>
                            )}
                            {row.manager_name && (
                              <span className="text-[11px] text-slate-400">Mgr: {row.manager_name}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            {renderHrmsStatusBadge(row)}
                            {row.portal_access_disable_date && (
                              <span className="text-[10px] text-rose-600 font-medium">
                                Portal off: {formatDate(row.portal_access_disable_date)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {row.is_registered ? (
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

            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/70">
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
