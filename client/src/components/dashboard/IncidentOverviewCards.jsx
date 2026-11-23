import { useNavigate } from 'react-router-dom';
import {
  FileText, Activity, CheckCircle, Clock, XOctagon,
  LayoutDashboard, AlertTriangle, Users, Mail, Inbox
} from 'lucide-react';

export function IncidentOverviewCards({
  totals = {},
  mode = 'all', // 'all' | 'reviewer' | 'personal'
  viewModeFilter,
  title = 'Incident Overview',
  showSecondaryPills = true,
}) {
  const navigate = useNavigate();

  const navState = (extra = {}) => {
    const base = viewModeFilter ? { viewMode: viewModeFilter } : {};
    return { state: { ...base, ...extra } };
  };

  if (mode === 'personal') {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <LayoutDashboard size={16} className="text-indigo-600" />
          {title}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div
            onClick={() => navigate('/incidents', navState())}
            className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">Total Incidents</p>
                <p className="text-3xl font-extrabold text-blue-900 mt-1">{totals.total || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText size={24} className="text-blue-600" />
              </div>
            </div>
          </div>

          <div
            onClick={() => navigate('/incidents', navState({ status: 'active' }))}
            className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-amber-800/70 uppercase tracking-wide">Active</p>
                <p className="text-3xl font-extrabold text-amber-900 mt-1">{totals.active || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock size={24} className="text-amber-600" />
              </div>
            </div>
          </div>

          <div
            onClick={() => navigate('/incidents', navState({ status: 'resolved' }))}
            className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-green-800/70 uppercase tracking-wide">Resolved</p>
                <p className="text-3xl font-extrabold text-green-900 mt-1">{totals.resolved || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle size={24} className="text-green-600" />
              </div>
            </div>
          </div>

          <div
            onClick={() => navigate('/incidents', navState({ status: 'withdrawn' }))}
            className="card p-5 bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-600/70 uppercase tracking-wide">Withdrawn</p>
                <p className="text-3xl font-extrabold text-slate-700 mt-1">{totals.withdrawn || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                <XOctagon size={24} className="text-slate-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalLabel = mode === 'reviewer' ? 'Received Incidents' : 'Total Incidents';
  const TotalIcon = mode === 'reviewer' ? Inbox : FileText;

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <LayoutDashboard size={16} className="text-indigo-600" />
        {title}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => navigate('/incidents', navState())}
          className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">{totalLabel}</p>
              <p className="text-3xl font-extrabold text-blue-900 mt-1">{totals.total || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TotalIcon size={24} className="text-blue-600" />
            </div>
          </div>
        </div>

        <div
          onClick={() => navigate('/incidents', navState({ status: 'active' }))}
          className="card p-5 bg-gradient-to-br from-red-50 to-orange-50 border-red-100 hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-red-800/70 uppercase tracking-wide">Active Incidents</p>
              <p className="text-3xl font-extrabold text-red-900 mt-1">{totals.active || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Activity size={24} className="text-red-600" />
            </div>
          </div>
        </div>

        <div
          onClick={() => navigate('/incidents', navState({ status: 'resolved' }))}
          className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-green-800/70 uppercase tracking-wide">Resolved</p>
              <p className="text-3xl font-extrabold text-green-900 mt-1">{totals.resolved || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle size={24} className="text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {showSecondaryPills && (
        <div className="flex flex-wrap gap-2.5 mt-3">
          {(totals.pendingLettersApproval || 0) > 0 && (
            <button
              onClick={() => navigate('/incidents', navState({ status: 'pending_management_letter_approval' }))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 border border-purple-300 rounded-lg text-xs font-bold text-purple-800 hover:bg-purple-200 transition-colors shadow-sm"
            >
              <Mail size={14} className="text-purple-600" /> Letters Awaiting Approval: {totals.pendingLettersApproval}
            </button>
          )}
          {(totals.pendingMgmtDecisions || 0) > 0 && (
            <button
              onClick={() => navigate('/incidents', navState({ status: 'with_head_management' }))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-200 transition-colors shadow-sm"
            >
              <Clock size={14} className="text-amber-600" /> Decisions Pending: {totals.pendingMgmtDecisions}
            </button>
          )}
          {mode !== 'reviewer' && (
            <>
              <button
                onClick={() => navigate('/incidents', navState({ severity: 'Grave' }))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <AlertTriangle size={14} className="text-purple-600" /> Grave: {totals.graveCount || 0}
              </button>
              <button
                onClick={() => navigate('/incidents', navState({ status: 'redirect_requested' }))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Clock size={14} className="text-orange-600" /> Redirects: {totals.redirectCount || 0}
              </button>
            </>
          )}
          <button
            onClick={() => navigate('/incidents', navState({ status: 'withdrawn' }))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <XOctagon size={14} className="text-slate-500" /> Withdrawn: {totals.withdrawn || 0}
          </button>
          {mode !== 'reviewer' && (
            <button
              onClick={() => navigate('/incidents', navState({ reviewStage: 'trainingPending' }))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Users size={14} className="text-rose-600" /> Training Pending: {totals.trainingPending || 0}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
