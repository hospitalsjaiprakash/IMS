import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { employeeApi } from '../../api';
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
  const [selectedEmpId, setSelectedEmpId] = useState('');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({ employeeId: '', name: '', department: '', designation: '', phone: '', email: '' });

  // Update URL so it can be refreshed/bookmarked
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        setSearchParams({ q: searchTerm }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, setSearchParams]);

  // Query for master employees (The Directory List)
  const { data: employees = [], isLoading: isDirectoryLoading, isError: isDirectoryError } = useQuery({
    queryKey: ['master-employees'],
    queryFn: () => api.get('/api/master-employees').then(res => res.data.data),
    enabled: !selectedEmpId,
  });

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
    mutationFn: (data) => api.post('/api/master-employees', data),
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
    mutationFn: (employees) => api.post('/api/master-employees/bulk', { employees }),
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

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.department && emp.department.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const emp = detailData?.selectedEmployee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header flex justify-between items-end">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="text-indigo-600" /> 
            {selectedEmpId ? 'Employee Profile' : 'Staff Directory'}
          </h1>
          <p className="page-subtitle">
            {selectedEmpId ? 'View detailed profile and reported incidents' : 'Search and browse all hospital staff members'}
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
          <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by ID, Name or Department..."
                  className="input pl-10 bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="text-sm text-slate-500">
                Total Employees: <span className="font-bold text-slate-700">{employees.length}</span>
              </div>
            </div>

            {isDirectoryLoading && !employees.length ? (
              <div className="flex justify-center items-center h-64">
                <Spinner size={32} />
              </div>
            ) : isDirectoryError ? (
              <div className="p-8 text-center text-red-500">Failed to load employees. Please try again.</div>
            ) : filteredEmployees.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No employees found"
                message={searchTerm ? `No staff matching "${searchTerm}"` : "The directory is empty."}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">IMS Account Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.map((emp) => (
                      <tr 
                        key={emp.id} 
                        onClick={() => {
                          if (!emp.is_registered) {
                            toast.error('This user has not created their IMS account yet. No profile to view.');
                          } else {
                            setSelectedEmpId(emp.employee_id);
                          }
                        }}
                        className="hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-sm uppercase">
                              {emp.name?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                {emp.name}
                              </div>
                              <div className="text-xs text-slate-500">{emp.designation || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {emp.employee_id}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-sm text-slate-700">
                            <Building size={14} className="text-slate-400" />
                            {emp.department || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {emp.is_registered ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              <CheckCircle size={14} /> Registered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <XCircle size={14} /> Not Registered
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
