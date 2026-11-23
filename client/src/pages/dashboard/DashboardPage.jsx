import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentsApi, teamsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Modal, SkeletonCard, StatusBadge, SLABadge, Alert } from '../../components/ui';
import { IncidentOverviewCards } from '../../components/dashboard/IncidentOverviewCards';
import { MonthlySeverityCharts } from '../../components/dashboard/MonthlySeverityCharts';
import {
  FileText, CheckCircle, FilePlus, BarChart3, Eye, UserCheck,
  Paperclip, Flame, Layers, RefreshCw
} from 'lucide-react';
import { formatDate } from '../../utils/helpers';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isReviewer = user?.role === 'hod' || Boolean(user?.isFeedbackReviewer);

  const [selectedInc, setSelectedInc] = useState(null);
  const [activeView, setActiveView] = useState(isReviewer ? 'reviewer' : 'personal');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState('all');

  const { data: assignedScope = { departments: [], categories: [] } } = useQuery({
    queryKey: ['my-assigned-departments'],
    queryFn: () => teamsApi.getAssignedDepartments().then(r => ({
      departments: r.data?.departments || [],
      categories: r.data?.categories || [],
    })),
    enabled: isReviewer,
  });

  const assignedCategories = assignedScope.categories;
  const assignedDepartments = assignedScope.departments;

  const filterParams = {
    viewMode: activeView === 'reviewer' ? 'dept_reviews' : 'my_incidents',
    ...(activeView === 'reviewer' && selectedCategoryFilter !== 'all' ? { category: selectedCategoryFilter } : {}),
    ...(activeView === 'reviewer' && selectedCategoryFilter === 'all' && selectedDepartmentFilter !== 'all'
      ? { departmentId: selectedDepartmentFilter }
      : {}),
  };

  const {
    data: stats,
    isLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats', filterParams],
    queryFn: () => incidentsApi.getStats(filterParams).then(r => r.data),
  });

  const { data: recentData = [] } = useQuery({
    queryKey: ['incidents', { page: 1, limit: 5, ...filterParams }],
    queryFn: () => incidentsApi.list({
      page: 1,
      limit: 5,
      viewMode: activeView === 'reviewer' ? 'department' : 'my_incidents',
      ...(activeView === 'reviewer' && selectedCategoryFilter !== 'all' ? { incidentCategory: selectedCategoryFilter } : {}),
      ...(activeView === 'reviewer' && selectedCategoryFilter === 'all' && selectedDepartmentFilter !== 'all'
        ? { departmentId: selectedDepartmentFilter }
        : {}),
    }).then(r => r.data.incidents || []),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (isStatsError) {
    return (
      <div className="space-y-4">
        <Alert
          type="error"
          title="Unable to load dashboard analytics"
          message="We hit a problem fetching your incident statistics."
        />
        <button onClick={() => refetchStats()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const totals = stats?.totals || {};
  const personalTotals = isReviewer ? (stats?.hodReport?.myIncidents || totals) : totals;
  const monthly = stats?.monthly || [];
  const bySeverity = stats?.bySeverity || [];
  const byType = stats?.byType || [];
  const showReviewerView = isReviewer && activeView === 'reviewer';

  const formatIncidentCategories = (inc) => {
    if (Array.isArray(inc.incident_categories) && inc.incident_categories.length > 0) {
      return inc.incident_categories.join(', ');
    }
    return inc.incident_category || (inc.departments || []).join(', ') || 'N/A';
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header flex-col items-start sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, {user?.fullName} · {user?.department || 'Quality Management'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {showReviewerView && assignedCategories.length > 1 && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
                <Layers size={14} className="text-teal-600" />
                <span>Category:</span>
              </span>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent border-none focus:ring-0 cursor-pointer pr-4 py-0.5"
              >
                <option value="all">All Assigned Categories ({assignedCategories.length})</option>
                {assignedCategories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {showReviewerView && assignedCategories.length === 0 && assignedDepartments.length > 1 && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
                <Layers size={14} className="text-teal-600" />
                <span>Review Dept:</span>
              </span>
              <select
                value={selectedDepartmentFilter}
                onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent border-none focus:ring-0 cursor-pointer pr-4 py-0.5"
              >
                <option value="all">All Departments ({assignedDepartments.length})</option>
                {assignedDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {isReviewer && (
            <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto shadow-inner border border-slate-200">
              <button
                onClick={() => setActiveView('reviewer')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeView === 'reviewer' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Reviewer View
              </button>
              <button
                onClick={() => setActiveView('personal')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeView === 'personal' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Personal View
              </button>
            </div>
          )}

          {(!isReviewer || activeView === 'personal') && (
            <button onClick={() => navigate('/incidents/new')} className="btn-primary flex-shrink-0 justify-center">
              <FilePlus size={16} />
              <span>Report Incident</span>
            </button>
          )}
        </div>
      </div>

      {/* Assigned Categories Authorization Banner */}
      {showReviewerView && assignedCategories.length > 0 && (
        <div className="bg-gradient-to-r from-teal-50/90 to-cyan-50/90 border border-teal-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-teal-950 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
              <Layers size={18} />
            </div>
            <div>
              <div className="font-black text-sm text-teal-900">Assigned Incident Category Scope</div>
              <div className="text-teal-700 mt-0.5">
                You are authorized to review and submit department feedback for <strong>{assignedCategories.length} incident {assignedCategories.length === 1 ? 'category' : 'categories'}</strong>.
              </div>
            </div>
          </div>
          {assignedCategories.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-teal-800 mr-1">Filter:</span>
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                    : 'bg-white/80 text-teal-800 border-teal-200/80 hover:bg-white'
                }`}
              >
                All ({assignedCategories.length})
              </button>
              {assignedCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryFilter(cat.name)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                    selectedCategoryFilter === cat.name
                      ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                      : 'bg-white/80 text-teal-800 border-teal-200/80 hover:bg-white'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OVERVIEW SECTION */}
      <div className="space-y-6">
        {!showReviewerView ? (
          <IncidentOverviewCards
            totals={personalTotals}
            mode="personal"
            viewModeFilter="my_incidents"
            title="My Incidents Overview"
            showSecondaryPills={false}
          />
        ) : (
          <div className="space-y-6">
            <IncidentOverviewCards
              totals={
                selectedCategoryFilter !== 'all' || selectedDepartmentFilter !== 'all'
                  ? totals
                  : {
                      total: stats?.hodReport?.received ?? totals.total,
                      active: stats?.hodReport?.active ?? totals.active,
                      resolved: stats?.hodReport?.resolved ?? totals.resolved,
                      withdrawn: stats?.hodReport?.withdrawn ?? totals.withdrawn,
                    }
              }
              mode="reviewer"
              viewModeFilter="department"
              title="Assigned Review Overview"
              showSecondaryPills={true}
            />

            {/* Department Feedback Tracker */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <UserCheck size={16} className="text-amber-600" />
                Department Feedback Tracker
              </h3>

              <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm">
                <div className="flex items-center">
                  <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-bold text-sm text-slate-700">Action Required</span>
                      <CheckCircle size={16} className={(stats?.hodReport?.feedbackPending || 0) === 0 ? 'text-green-500' : 'text-slate-300'} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'hodPending', viewMode: 'department' } })}
                        className="flex-1 bg-white hover:bg-amber-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-amber-300 shadow-sm"
                      >
                        <span className="block text-2xl font-extrabold text-amber-600 leading-none">{stats?.hodReport?.feedbackPending || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending Feedback</span>
                      </div>
                      <div
                        onClick={() => navigate('/incidents', { state: { reviewStage: 'hodGiven', viewMode: 'department' } })}
                        className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
                      >
                        <span className="block text-xl font-bold text-slate-700 leading-none">{stats?.hodReport?.feedbackGiven || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Feedback Given</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Charts row for reviewers */}
        {showReviewerView && (
          <MonthlySeverityCharts
            monthly={monthly}
            bySeverity={bySeverity}
            byType={byType}
            barColor="#10b981"
            monthlyTitle="Monthly Trend"
            showTypeChart={true}
          />
        )}
      </div>

      {/* Recent incidents */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Recent Incidents</h3>
          <button onClick={() => navigate('/incidents')} className="text-xs text-blue-600 hover:underline">
            View all →
          </button>
        </div>
        <div className="table-wrapper rounded-none border-0">
          <table className="table">
            <thead>
              {showReviewerView ? (
                <tr>
                  <th>Reference ID</th>
                  <th>Reporter</th>
                  <th>Reporter Dept</th>
                  <th>Emp ID</th>
                  <th>Apply Date</th>
                  <th>Incident Date</th>
                  <th>Location</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              ) : (
                <tr>
                  <th>Reference ID</th>
                  <th>Category</th>
                  <th>Apply Date</th>
                  <th>Incident Date & Time</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              )}
            </thead>
            <tbody>
              {!recentData?.length ? (
                <tr>
                  <td colSpan={showReviewerView ? 10 : 7} className="text-center py-8 text-slate-400">
                    No incidents yet
                  </td>
                </tr>
              ) : recentData.slice(0, 5).map((inc) => {
                const attCount = Number(inc.attachment_count ?? inc.attachments?.length ?? 0);
                return (
                  <tr key={inc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium text-green-700">{inc.reference_id}</span>
                        {attCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5" title={`${attCount} attachment(s)`}>
                            <Paperclip size={10} />
                            <span>{attCount}</span>
                          </span>
                        )}
                        {inc.priority_escalated_by && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 rounded px-1 py-0.5" title={`Escalated by ${inc.priority_escalated_by}`}>
                            <Flame size={10} />
                            <span>ESCALATED</span>
                          </span>
                        )}
                        <SLABadge createdAt={inc.created_at} status={inc.status} />
                      </div>
                    </td>
                    {showReviewerView ? (
                      <>
                        <td className="text-slate-700 text-xs font-medium">{inc.reporter_name || 'N/A'}</td>
                        <td className="text-slate-600 text-xs">{inc.reporter_department || 'N/A'}</td>
                        <td className="text-slate-600 text-xs font-mono">{inc.reporter_employee_id || 'N/A'}</td>
                        <td className="text-slate-500 text-xs">{formatDate(inc.created_at)}</td>
                        <td className="text-slate-500 text-xs">{formatDate(inc.incident_date)} {inc.incident_time?.slice(0, 5)}</td>
                        <td className="text-slate-600 text-xs font-mono truncate max-w-[120px]">
                          {inc.main_location_name || 'N/A'}
                          {inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''}
                        </td>
                        <td className="text-slate-600 text-xs font-medium">{formatIncidentCategories(inc)}</td>
                        <td><StatusBadge status={inc.status} /></td>
                      </>
                    ) : (
                      <>
                        <td className="text-slate-600 text-xs">{formatIncidentCategories(inc)}</td>
                        <td className="text-slate-500 text-xs">{formatDate(inc.created_at)}</td>
                        <td className="text-slate-500 text-xs">{formatDate(inc.incident_date)} {inc.incident_time?.slice(0, 5)}</td>
                        <td className="text-slate-600 text-xs">
                          {inc.main_location_name || 'N/A'}
                          {inc.sub_location_name ? ` - ${inc.sub_location_name}` : ''}
                        </td>
                        <td><StatusBadge status={inc.status} /></td>
                      </>
                    )}
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedInc(inc); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/incidents')}
          className="card p-4 text-left hover:shadow-md transition-shadow group"
        >
          <FileText size={20} className="text-blue-600 mb-2" />
          <p className="text-sm font-semibold text-slate-800">All Incidents</p>
          <p className="text-xs text-slate-500 mt-0.5">Browse and filter all reported incidents</p>
        </button>

        {(user?.role === 'system_admin' || user?.role === 'head_management') && (
          <button
            onClick={() => navigate('/admin/analytics')}
            className="card p-4 text-left hover:shadow-md transition-shadow"
          >
            <BarChart3 size={20} className="text-green-700 mb-2" />
            <p className="text-sm font-semibold text-slate-800">Analytics</p>
            <p className="text-xs text-slate-500 mt-0.5">System-wide reports and SLA tracking</p>
          </button>
        )}
      </div>

      <Modal
        open={!!selectedInc}
        onClose={() => setSelectedInc(null)}
        title={`Incident Details - ${selectedInc?.reference_id}`}
        size="lg"
        footer={
          <>
            <button onClick={() => setSelectedInc(null)} className="btn-secondary">Close</button>
            <button onClick={() => navigate(`/incidents/${encodeURIComponent(selectedInc?.id)}`)} className="btn-primary">
              View or Feedback
            </button>
          </>
        }
      >
        {selectedInc && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div><span className="text-slate-500 block text-xs">Reference ID</span><span className="font-medium text-green-700">{selectedInc.reference_id}</span></div>
              <div><span className="text-slate-500 block text-xs">Incident Category</span><span className="font-medium">{formatIncidentCategories(selectedInc)}</span></div>
              <div><span className="text-slate-500 block text-xs">Apply Date</span><span className="font-medium">{formatDate(selectedInc.created_at)}</span></div>
              <div><span className="text-slate-500 block text-xs">Incident Date & Time</span><span className="font-medium">{formatDate(selectedInc.incident_date)} {selectedInc.incident_time?.slice(0, 5)}</span></div>
              <div className="col-span-2"><span className="text-slate-500 block text-xs">Location</span><span className="font-medium">{selectedInc.main_location_name || 'N/A'}{selectedInc.sub_location_name ? ` - ${selectedInc.sub_location_name}` : ''}</span></div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                <span className="text-slate-600 font-medium">Status</span>
                <StatusBadge status={selectedInc.status} />
              </div>
              {selectedInc.priority_escalated_by && (
                <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-red-700 font-bold flex items-center gap-1.5"><Flame size={16} /> PRIORITY ESCALATION</span>
                  <span className="text-red-700 text-xs font-bold bg-red-100 px-2 py-1 rounded border border-red-200">BY {selectedInc.priority_escalated_by.toUpperCase()}</span>
                </div>
              )}
              {selectedInc.status !== 'withdrawn' && (
                <>
                  <div>
                    <span className="text-slate-500 block text-xs font-semibold uppercase tracking-wider mb-1.5 px-1">
                      Department Feedback
                    </span>
                    {selectedInc.hod_feedbacks && selectedInc.hod_feedbacks.length > 0 ? (
                      <div className="space-y-2">
                        {selectedInc.hod_feedbacks.map((fb, idx) => (
                          <div key={fb.id || idx} className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-sm">
                            <div className="flex items-center justify-between text-xs font-semibold text-amber-900 mb-1">
                              <span>{fb.author_name} {fb.category_name || fb.department_name ? `(${fb.category_name || fb.department_name})` : ''}</span>
                              {fb.created_at && (
                                <span className="font-normal text-amber-700/80 text-[11px]">{formatDate(fb.created_at)}</span>
                              )}
                            </div>
                            <p className="text-slate-700 leading-relaxed">{fb.feedback_text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-700 bg-amber-50 p-3 rounded-xl border border-amber-100 text-sm">
                        {selectedInc.hod_feedback || 'No feedback yet'}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs font-semibold uppercase tracking-wider mb-1.5 px-1">
                      Feedback by IMC
                    </span>
                    {selectedInc.imc_feedbacks && selectedInc.imc_feedbacks.length > 0 ? (
                      <div className="space-y-2">
                        {selectedInc.imc_feedbacks.map((fb, idx) => (
                          <div key={fb.id || idx} className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-sm">
                            <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 mb-1">
                              <span>{fb.author_name} {fb.designation ? `(${fb.designation})` : ''}</span>
                              {fb.created_at && (
                                <span className="font-normal text-indigo-700/80 text-[11px]">{formatDate(fb.created_at)}</span>
                              )}
                            </div>
                            <p className="text-slate-700 leading-relaxed">{fb.feedback_text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-700 bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-sm">
                        {selectedInc.imc_feedback || 'No feedback yet'}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs font-semibold uppercase tracking-wider mb-1.5 px-1">
                      Feedback by Management
                    </span>
                    {selectedInc.management_feedbacks && selectedInc.management_feedbacks.length > 0 ? (
                      <div className="space-y-2">
                        {selectedInc.management_feedbacks.map((fb, idx) => (
                          <div key={fb.id || idx} className="bg-purple-50 p-3 rounded-xl border border-purple-100 text-sm">
                            <div className="flex items-center justify-between text-xs font-semibold text-purple-900 mb-1">
                              <span>{fb.author_name} {fb.designation ? `(${fb.designation})` : ''}</span>
                              {fb.created_at && (
                                <span className="font-normal text-purple-700/80 text-[11px]">{formatDate(fb.created_at)}</span>
                              )}
                            </div>
                            <p className="text-slate-700 leading-relaxed">{fb.feedback_text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-700 bg-purple-50 p-3 rounded-xl border border-purple-100 text-sm">
                        {selectedInc.management_feedback || 'No feedback yet'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
