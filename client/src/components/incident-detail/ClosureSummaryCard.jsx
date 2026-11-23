import { CheckCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';

export default function ClosureSummaryCard({
  incident,
  finalReport,
  isManagement,
  canImcAct,
  onOpenReopenModal,
}) {
  return (
    <>
      {finalReport && (
        <div className="card p-5 border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                <CheckCircle size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Hospital Case Resolution &amp; CAPA Report</h2>
                <p className="text-[11px] text-slate-500">Official incident closure summary and comprehensive CAPA implementation</p>
              </div>
            </div>
            <span className="badge badge-success text-xs font-semibold">
              Hospital Case Closed
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-emerald-200">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Assessed Fault Type</span>
                <span className="text-xs font-bold text-slate-800">{finalReport.fault_type || 'Hospital / Process'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Generated On</span>
                <span className="text-xs font-semibold text-slate-700">{formatDateTime(finalReport.generated_at)}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-100 space-y-1.5">
              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide block">
                Corrective &amp; Preventive Actions (CAPA) Implemented:
              </span>
              <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                {finalReport.corrective_actions}
              </p>
            </div>
          </div>
        </div>
      )}

      {['closed', 'resolved'].includes(incident?.status) && (
        <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-950">Hospital Incident Officially Concluded</h3>
                <p className="text-xs text-emerald-800">All required actions, investigations, and governance protocols are archived.</p>
              </div>
            </div>
            <span className="badge badge-success text-xs font-bold">Case Closed</span>
          </div>

          {(isManagement || canImcAct) && (
            <div className="pt-2 border-t border-emerald-200 flex justify-end">
              <button
                type="button"
                onClick={onOpenReopenModal}
                className="btn-secondary btn-sm text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200 flex items-center gap-1.5 font-semibold"
              >
                <RotateCcw size={13} />
                <span>Reopen Incident for Exceptional Review</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
