import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { employeeApi } from '../../api';
import { Spinner, EmptyState, Pagination } from '../../components/ui';
import { Search, Users, Phone, Building, Briefcase, FileText, ArrowLeft } from 'lucide-react';
import { formatDate, getStatusClass, getStatusLabel } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function EmployeeDirectory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');
  const [selectedEmpId, setSelectedEmpId] = useState('');

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
      
      // Update URL so it can be refreshed/bookmarked
      if (search) {
        setSearchParams({ q: search }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, setSearchParams]);

  // Query for directory list
  const { data: directoryData, isLoading: isDirectoryLoading, isError: isDirectoryError } = useQuery({
    queryKey: ['employeeDirectory', debouncedSearch, page],
    queryFn: () => employeeApi.getDirectory({ search: debouncedSearch, page, limit: 15 }).then(res => res.data),
    keepPreviousData: true,
    enabled: !selectedEmpId,
  });

  // Query for selected employee details
  const { data: detailData, isLoading: isDetailLoading, isError: isDetailError } = useQuery({
    queryKey: ['employeeDetails', selectedEmpId],
    queryFn: () => employeeApi.search(selectedEmpId).then(res => res.data),
    enabled: !!selectedEmpId,
    retry: false,
    onError: (err) => {
      if (err.response?.status === 404) {
        toast.error('No employee found matching your search.');
      } else {
        toast.error('Failed to load employee details.');
      }
      setSelectedEmpId('');
    }
  });

  const emp = detailData?.selectedEmployee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">{selectedEmpId ? 'Employee Profile' : 'Employee Directory'}</h1>
          <p className="page-subtitle">
            {selectedEmpId ? 'View detailed profile and reported incidents' : 'Search and browse all hospital staff members'}
          </p>
        </div>
        {selectedEmpId && (
          <button 
            onClick={() => setSelectedEmpId('')}
            className="btn btn-secondary bg-white flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Directory
          </button>
        )}
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
                        <span className="font-medium">{emp.phone || emp.whatsapp || 'N/A'}</span>
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
          {/* Search Bar */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="relative max-w-lg">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="input pl-10 w-full"
                placeholder="Search by name, employee ID, or department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {isDirectoryLoading && !directoryData ? (
              <div className="flex justify-center items-center h-64">
                <Spinner size={32} />
              </div>
            ) : isDirectoryError ? (
              <div className="p-8 text-center text-red-500">Failed to load employees. Please try again.</div>
            ) : directoryData?.users?.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No employees found"
                message={debouncedSearch ? `No staff matching "${debouncedSearch}"` : "The directory is empty."}
              />
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {directoryData?.users?.map((user) => (
                        <tr 
                          key={user.id} 
                          onClick={() => setSelectedEmpId(user.employee_id)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-sm uppercase">
                                {user.full_name?.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                  {user.full_name}
                                </div>
                                <div className="text-xs text-slate-500">{user.designation}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">
                              {user.employee_id}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-sm text-slate-700">
                              <Building size={14} className="text-slate-400" />
                              {user.department || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 text-xs">
                              {(user.phone || user.whatsapp) ? (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <Phone size={13} className="text-slate-400" />
                                  {user.phone || user.whatsapp}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No phone</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                {directoryData?.totalPages > 1 && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="text-sm text-slate-500">
                      Showing <span className="font-medium text-slate-700">{directoryData.users.length}</span> of <span className="font-medium text-slate-700">{directoryData.total}</span> employees
                    </div>
                    <Pagination page={page} totalPages={directoryData.totalPages} onPageChange={setPage} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
