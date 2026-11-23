import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi, metaApi } from '../../api';
import { getStatusLabel, formatDate, INCIDENT_CATEGORIES, SEVERITY_OPTIONS, getApiErrorMessage } from '../../utils/helpers';
import { EmptyState, Pagination, Spinner, Tabs, KanbanBoard, Breadcrumbs, StatusBadge, SeverityBadge, SLABadge, SkeletonTable, Alert } from '../../components/ui';
import { FileText, Search, Filter, X, FilePlus, ChevronRight, Layers, User, Download, Calendar, Check, Columns, List, LayoutGrid, Settings } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const ALL_COLUMNS = [
  { id: 'ref', label: 'Reference ID' },
  { id: 'reporter', label: 'Reporter (ID)' },
  { id: 'type', label: 'Type' },
  { id: 'category', label: 'Category' },
  { id: 'severity', label: 'Severity' },
  { id: 'status', label: 'Status' },
  { id: 'date', label: 'Date' },
];

export default function IncidentsListPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const location = useLocation();
  const colMenuRef = useRef(null);

  const isReviewer = user?.role === 'hod' || Boolean(user?.isFeedbackReviewer);
  const canViewAllOrDept = isReviewer || ['imc', 'head_management', 'system_admin'].includes(user?.role);
  const defaultViewMode = canViewAllOrDept ? 'department' : 'my_incidents';

  const [filters, setFilters] = useState({
    status: location.state?.status || '',
    severity: location.state?.severity || '',
    incidentCategory: location.state?.incidentCategory || '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    viewMode: location.state?.viewMode || defaultViewMode,
    reviewStage: location.state?.reviewStage || '',
  });

  useEffect(() => {
    if (location.state && Object.keys(location.state).length > 0) {
      setFilters(f => ({
        ...f,
        status: location.state.status || '',
        severity: location.state.severity || '',
        incidentCategory: location.state.incidentCategory || '',
        viewMode: location.state.viewMode || defaultViewMode,
        reviewStage: location.state.reviewStage || '',
        page: 1,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setFilters(f => (f.page === 1 ? f : { ...f, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const [viewStyle, setViewStyle] = useState('table');
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('visibleColumns') || 'null');
      if (Array.isArray(saved) && saved.length > 0) {
        return saved.map(id => (id === 'dept' ? 'category' : id));
      }
    } catch {
      // ignore invalid storage
    }
    return ALL_COLUMNS.map(c => c.id);
  });
  const [showColDropdown, setShowColDropdown] = useState(false);

  useEffect(() => {
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    if (!showColDropdown) return;
    const handleClickOutside = (e) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
        setShowColDropdown(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setShowColDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showColDropdown]);

  // Export states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportRange, setExportRange] = useState('last_30');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val, page: 1 }));
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFilters(f => ({
      status: '',
      severity: '',
      incidentCategory: '',
      dateFrom: '',
      dateTo: '',
      reviewStage: '',
      page: 1,
      viewMode: f.viewMode,
    }));
    if (location.state) navigate(location.pathname, { replace: true, state: {} });
  };
  const hasFilters = filters.status || filters.severity || filters.incidentCategory || filters.dateFrom || filters.dateTo || filters.reviewStage || debouncedSearch;

  const queryParams = useMemo(() => ({
    ...filters,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [filters, debouncedSearch]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['incidents', queryParams],
    queryFn: () => incidentsApi.list(queryParams).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => metaApi.categories().then(r => r.data || []),
  });

  const categoryOptions = useMemo(() => {
    if (Array.isArray(categoriesData) && categoriesData.length > 0) {
      return categoriesData.filter(c => c.is_active !== false).map(c => c.name);
    }
    return INCIDENT_CATEGORIES;
  }, [categoriesData]);

  const incidents = data?.incidents || [];

  const formatDurationBetween = (startStr, endStr) => {
    if (!startStr || !endStr) return 'Pending / No Feedback';
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start) || isNaN(end) || end < start) return 'N/A';

    const diffMs = end - start;
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins % (60 * 24)) / 60);
    const mins = totalMins % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

    return parts.join(' ');
  };

  const handleExportReport = async () => {
    if (exportRange === 'custom' && (!exportStartDate || !exportEndDate)) {
      toast.error('Please select both start and end dates for custom range.');
      return;
    }
    setExporting(true);
    try {
      const res = await incidentsApi.exportReport({
        dateFilter: exportRange,
        startDate: exportStartDate,
        endDate: exportEndDate,
        status: filters.status || 'all',
        severity: filters.severity || 'all',
        incidentCategory: filters.incidentCategory || 'all',
      });
      const incidentsData = res.data.incidents || [];
      if (incidentsData.length === 0) {
        toast.error('No incidents found for the selected time range.');
        setExporting(false);
        return;
      }

      const rows = incidentsData.map(inc => {
        const deptTaken = inc.hod_feedback_at ? formatDurationBetween(inc.created_at, inc.hod_feedback_at) : 'Pending / No Feedback';
        const imcStart = inc.hod_feedback_at || inc.created_at;
        const imcTaken = inc.imc_feedback_at ? formatDurationBetween(imcStart, inc.imc_feedback_at) : 'Pending / No Feedback';
        const mgmtStart = inc.imc_feedback_at || inc.hod_feedback_at || inc.created_at;
        const mgmtTaken = inc.mgmt_feedback_at ? formatDurationBetween(mgmtStart, inc.mgmt_feedback_at) : 'Pending / No Feedback';
        const totalTaken = inc.resolved_at
          ? formatDurationBetween(inc.created_at, inc.resolved_at)
          : `Active (${formatDurationBetween(inc.created_at, new Date())} elapsed)`;

        return {
          'Reference ID': inc.reference_id || 'N/A',
          'Reporter Name (Emp ID)': inc.reporter_name && inc.reporter_employee_id ? `${inc.reporter_name} (${inc.reporter_employee_id})` : (inc.reporter_name || 'N/A'),
          'Reporter Department': inc.reporter_department || 'N/A',
          'Incident Category': Array.isArray(inc.incident_categories) && inc.incident_categories.length ? inc.incident_categories.join(', ') : (inc.incident_category || 'N/A'),
          'Incident Type': inc.incident_type || 'N/A',
          'Occurred To': inc.occurred_to || 'N/A',
          'Severity': inc.severity || 'Pending',
          'Location': `${inc.main_location_name || 'N/A'}${inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''}`,
          'Current Status': getStatusLabel(inc.status) || inc.status,
          'Incident Date': formatDate(inc.incident_date || inc.created_at),
          'Reported Timestamp': inc.created_at ? new Date(inc.created_at).toLocaleString('en-GB') : 'N/A',
          'Department Feedback': inc.hod_feedback || 'No feedback given',
          'Department Feedback Time Taken': deptTaken,
          'IMC Feedback': inc.imc_feedback || 'No feedback given',
          'IMC Feedback Time Taken': imcTaken,
          'Management Feedback': inc.mgmt_feedback || 'No feedback given',
          'Management Feedback Time Taken': mgmtTaken,
          'Total Time Taken (Incident Duration)': totalTaken,
          'Resolved Timestamp': inc.resolved_at ? new Date(inc.resolved_at).toLocaleString('en-GB') : 'N/A',
          'Description': inc.description || '',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 16 }, { wch: 26 }, { wch: 22 }, { wch: 28 },
        { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 26 }, { wch: 24 },
        { wch: 15 }, { wch: 22 }, { wch: 42 }, { wch: 24 }, { wch: 42 },
        { wch: 22 }, { wch: 42 }, { wch: 24 }, { wch: 32 }, { wch: 22 },
        { wch: 50 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Incidents Report');

      const fileName = `JPHRC_Incidents_Report_${exportRange === 'custom' ? `${exportStartDate}_to_${exportEndDate}` : exportRange}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success(`Successfully exported ${incidentsData.length} incidents to Excel!`);
      setShowExportModal(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to generate report.'));
    } finally {
      setExporting(false);
    }
  };

  const STATUS_OPTIONS = [
    { value: 'active', label: 'Active (Unresolved)' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'with_hod', label: 'Awaiting Department Feedback' },
    { value: 'with_hod_and_imc', label: 'Awaiting Department & IMC Feedback' },
    { value: 'redirect_requested', label: 'Redirect Requested' },
    { value: 'with_imc', label: 'Department Reviewed - Awaiting IMC' },
    { value: 'with_head_management', label: 'IMC Reviewed - Awaiting Mgmt' },
    { value: 'pending_letter_generation', label: 'Drafting Letter(s)' },
    { value: 'pending_management_letter_approval', label: 'Awaiting Letter Approval' },
    { value: 'pending_trainer_assignment', label: 'Awaiting Trainer Assignment' },
    { value: 'training_in_progress', label: 'Training in Progress' },
    { value: 'pending_imc_training_review', label: 'Awaiting Training Verification' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ];

  const getCategoryDisplay = (inc) => {
    if (Array.isArray(inc.incident_categories) && inc.incident_categories.length > 0) {
      return inc.incident_categories.join(', ');
    }
    return inc.incident_category || (inc.departments || []).join(', ') || 'N/A';
  };

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: 'Incidents' }]} />

      <div className="page-header pb-2">
        <div>
          <h1 className="page-title">Incidents</h1>
          <p className="page-subtitle">
            {data?.total !== undefined ? `${data.total} total incident${data.total !== 1 ? 's' : ''}` : 'All reported incidents'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {canViewAllOrDept && (
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button onClick={() => setViewStyle('table')} className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewStyle === 'table' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`} title="Table View"><List size={16} /></button>
              <button onClick={() => setViewStyle('cards')} className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewStyle === 'cards' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`} title="Card View"><LayoutGrid size={16} /></button>
              <button onClick={() => setViewStyle('kanban')} className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewStyle === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`} title="Kanban Board"><Columns size={16} /></button>
            </div>
          )}
          {(user?.role !== 'employee' || isReviewer) && (
            <button onClick={() => setShowExportModal(true)} className="btn-secondary">
              <Download size={16} />
              <span>Export Report</span>
            </button>
          )}
          {(user?.role === 'employee' || user?.role === 'hod') && (
            <button onClick={() => navigate('/incidents/new')} className="btn-primary">
              <FilePlus size={16} />
              <span>Report Incident</span>
            </button>
          )}
        </div>
      </div>

      {isReviewer && (
        <Tabs
          tabs={[
            { id: 'department', label: 'Assigned Reviews', icon: Layers },
            { id: 'my_incidents', label: 'My Incidents', icon: User },
          ]}
          active={filters.viewMode}
          onChange={(id) => setFilter('viewMode', id)}
        />
      )}

      {/* Filters Area */}
      <div className="card p-3 overflow-visible">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by reference ID, category, type, or reporter…"
              className="input pl-9 w-full"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary flex-shrink-0 ${hasFilters ? 'border-blue-500 text-blue-600 bg-blue-50' : ''}`}>
            <Filter size={15} /> Filters {hasFilters && <span className="w-2 h-2 rounded-full bg-blue-600 ml-1" />}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-icon flex-shrink-0" title="Clear filters">
              <X size={16} />
            </button>
          )}

          {viewStyle === 'table' && (
            <div ref={colMenuRef} className="relative">
              <button onClick={() => setShowColDropdown(v => !v)} className="btn-secondary flex-shrink-0">
                <Settings size={15} /> Columns
              </button>
              {showColDropdown && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 shadow-lg rounded-xl p-2 z-50">
                  <h4 className="text-xs font-bold text-slate-500 mb-2 px-2">Visible Columns</h4>
                  {ALL_COLUMNS.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) setVisibleColumns([...visibleColumns, c.id]);
                          else setVisibleColumns(visibleColumns.filter(id => id !== c.id));
                        }}
                        className="rounded border-slate-300"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="field-label text-xs">Status</label>
              <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className="select text-xs py-2">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label text-xs">Severity</label>
              <select value={filters.severity} onChange={e => setFilter('severity', e.target.value)} className="select text-xs py-2">
                <option value="">All Severities</option>
                {SEVERITY_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label text-xs">Category</label>
              <select value={filters.incidentCategory} onChange={e => setFilter('incidentCategory', e.target.value)} className="select text-xs py-2">
                <option value="">All Categories</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label text-xs">From</label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} className="input text-xs py-2" />
            </div>
            <div>
              <label className="field-label text-xs">To</label>
              <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} className="input text-xs py-2" />
            </div>
          </div>
        )}
      </div>

      {/* View Content */}
      {isError && (
        <Alert type="error" title="Unable to load incidents" message={getApiErrorMessage(error, 'Failed to fetch incidents list.')} />
      )}

      <div className={viewStyle === 'table' ? 'card overflow-hidden' : ''}>
        {isLoading ? (
          viewStyle === 'table' ? <SkeletonTable /> : <div className="flex justify-center py-16"><Spinner size={28} /></div>
        ) : incidents.length === 0 ? (
          <EmptyState icon={FileText} title="No incidents found" message={hasFilters ? 'Try adjusting your filters.' : 'No incidents reported.'} />
        ) : viewStyle === 'kanban' ? (
          <KanbanBoard
            columns={[
              { id: 'submitted', title: 'Submitted', statusIds: ['submitted', 'active'] },
              {
                id: 'reviewing',
                title: 'Under Review',
                statusIds: [
                  'with_hod', 'with_hod_and_imc', 'redirect_requested',
                  'with_investigator', 'with_imc_review', 'with_imc', 'with_head_management',
                ],
              },
              {
                id: 'action',
                title: 'Action / Letters / Training',
                statusIds: [
                  'pending_letter_generation', 'pending_management_letter_approval',
                  'pending_trainer_assignment', 'training_in_progress',
                  'pending_imc_training_review', 'pending_training',
                ],
              },
              { id: 'resolved', title: 'Resolved & Closed', statusIds: ['resolved', 'closed', 'locked'] },
              { id: 'withdrawn', title: 'Withdrawn', statusIds: ['withdrawn'] },
            ]}
            incidents={incidents}
            onIncidentClick={(inc) => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}
          />
        ) : viewStyle === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incidents.map(inc => (
              <div key={inc.id} onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)} className="card p-4 hover:shadow-md cursor-pointer transition-shadow relative">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono text-sm font-bold text-slate-800">{inc.reference_id}</span>
                  <SLABadge createdAt={inc.created_at} status={inc.status} />
                </div>
                <div className="space-y-2 text-sm text-slate-600 mb-4">
                  <p><span className="font-medium text-slate-700">Type:</span> {inc.incident_type}</p>
                  <p className="truncate"><span className="font-medium text-slate-700">Category:</span> {getCategoryDisplay(inc)}</p>
                  <p><span className="font-medium text-slate-700">Date:</span> {formatDate(inc.incident_date)}</p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <SeverityBadge severity={inc.severity || 'Pending'} />
                  <StatusBadge status={inc.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  {visibleColumns.includes('ref') && <th>Reference ID</th>}
                  {visibleColumns.includes('reporter') && ['imc', 'head_management', 'system_admin'].includes(user?.role) && <th>Reporter (ID)</th>}
                  {visibleColumns.includes('type') && <th>Type</th>}
                  {visibleColumns.includes('category') && <th>Category</th>}
                  {visibleColumns.includes('severity') && <th>Severity</th>}
                  {visibleColumns.includes('status') && <th>Status</th>}
                  {visibleColumns.includes('date') && <th>Date</th>}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => navigate(`/incidents/${encodeURIComponent(inc.id)}`)}>
                    {visibleColumns.includes('ref') && (
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs font-bold text-slate-800">{inc.reference_id}</span>
                          <SLABadge createdAt={inc.created_at} status={inc.status} className="w-fit" />
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('reporter') && ['imc', 'head_management', 'system_admin'].includes(user?.role) && (
                      <td className="text-xs text-slate-700">
                        <div className="font-semibold text-slate-800">{inc.reporter_name || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {inc.reporter_employee_id || 'N/A'}</div>
                      </td>
                    )}
                    {visibleColumns.includes('type') && <td className="text-slate-600 text-xs truncate max-w-[180px]">{inc.incident_type}</td>}
                    {visibleColumns.includes('category') && (
                      <td className="text-xs text-slate-600 max-w-[180px] truncate" title={getCategoryDisplay(inc)}>
                        {getCategoryDisplay(inc)}
                      </td>
                    )}
                    {visibleColumns.includes('severity') && <td><SeverityBadge severity={inc.severity || 'Pending'} /></td>}
                    {visibleColumns.includes('status') && <td><StatusBadge status={inc.status} /></td>}
                    {visibleColumns.includes('date') && <td className="text-xs text-slate-500">{formatDate(inc.incident_date)}</td>}
                    <td><ChevronRight size={16} className="text-slate-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && incidents.length > 0 && (
          <div className="p-4 border-t border-slate-200 mt-2 bg-white rounded-b-xl">
            <Pagination page={filters.page} totalPages={data?.totalPages || 1} onPageChange={(p) => setFilters(f => ({ ...f, page: p }))} />
          </div>
        )}
      </div>

      {/* Export Report Modal */}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-box max-w-md">
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Download size={18} />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Export Incidents Report</h3>
              </div>
              <button onClick={() => setShowExportModal(false)} className="btn-icon">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Select Date Range</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {['last_30', 'last_60', 'last_90', 'all'].map(opt => (
                    <button key={opt} type="button" onClick={() => setExportRange(opt)} className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${exportRange === opt ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900 font-semibold shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                      <span className="text-xs">{opt.replace('_', ' ').toUpperCase()}</span>
                      {exportRange === opt && <Check size={14} className="text-emerald-600" />}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setExportRange('custom')} className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between mt-2 ${exportRange === 'custom' ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900 font-semibold shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar size={14} className={exportRange === 'custom' ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>Custom Date Range</span>
                  </div>
                  {exportRange === 'custom' && <Check size={14} className="text-emerald-600" />}
                </button>
              </div>

              {exportRange === 'custom' && (
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Date</label>
                    <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="input py-1.5 text-xs w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Date</label>
                    <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="input py-1.5 text-xs w-full" />
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowExportModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="button" onClick={handleExportReport} disabled={exporting} className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs px-4 flex items-center gap-1.5">
                  {exporting ? <><Spinner size={14} /><span>Generating…</span></> : <><Download size={14} /><span>Download Excel</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
