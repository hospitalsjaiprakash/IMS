import { useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronRight, ShieldCheck } from 'lucide-react';

export function AccountabilityPipelineStepper({
  totals = {},
  title = 'Review & Accountability Pipeline',
  mgmtLabel = '3. Management Feedback',
}) {
  const navigate = useNavigate();

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-teal-600" />
        {title}
      </h3>

      <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm overflow-x-auto">
        <div className="flex items-center min-w-[700px]">
          {/* Step 1: Department / Category Reviewer Feedback */}
          <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-sm text-slate-700">1. Department Feedback</span>
              <CheckCircle size={16} className={(totals.hodPending || 0) === 0 ? 'text-green-500' : 'text-slate-300'} />
            </div>
            <div className="flex items-center gap-2">
              <div
                onClick={() => navigate('/incidents', { state: { reviewStage: 'hodPending' } })}
                className="flex-1 bg-white hover:bg-amber-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-amber-300 shadow-sm"
              >
                <span className="block text-2xl font-extrabold text-amber-600 leading-none">{totals.hodPending || 0}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending</span>
              </div>
              <div
                onClick={() => navigate('/incidents', { state: { reviewStage: 'hodGiven' } })}
                className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
              >
                <span className="block text-xl font-bold text-slate-700 leading-none">{totals.hodGiven || 0}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Completed</span>
              </div>
            </div>
          </div>

          <div className="px-2 text-slate-300"><ChevronRight size={20} /></div>

          {/* Step 2: IMC Feedback */}
          <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-sm text-slate-700">2. IMC Feedback</span>
              <CheckCircle size={16} className={(totals.imcPending || 0) === 0 ? 'text-green-500' : 'text-slate-300'} />
            </div>
            <div className="flex items-center gap-2">
              <div
                onClick={() => navigate('/incidents', { state: { reviewStage: 'imcPending' } })}
                className="flex-1 bg-white hover:bg-indigo-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-indigo-300 shadow-sm"
              >
                <span className="block text-2xl font-extrabold text-indigo-600 leading-none">{totals.imcPending || 0}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending</span>
              </div>
              <div
                onClick={() => navigate('/incidents', { state: { reviewStage: 'imcGiven' } })}
                className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
              >
                <span className="block text-xl font-bold text-slate-700 leading-none">{totals.imcGiven || 0}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Completed</span>
              </div>
            </div>
          </div>

          <div className="px-2 text-slate-300"><ChevronRight size={20} /></div>

          {/* Step 3: Management Feedback */}
          <div className="flex-1 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-sm text-slate-700">{mgmtLabel}</span>
              <CheckCircle size={16} className={(totals.mgmtPending || 0) === 0 ? 'text-green-500' : 'text-slate-300'} />
            </div>
            <div className="flex items-center gap-2">
              <div
                onClick={() => navigate('/incidents', { state: { reviewStage: 'mgmtPending' } })}
                className="flex-1 bg-white hover:bg-cyan-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-cyan-300 shadow-sm"
              >
                <span className="block text-2xl font-extrabold text-cyan-600 leading-none">{totals.mgmtPending || 0}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Pending</span>
              </div>
              <div
                onClick={() => navigate('/incidents', { state: { reviewStage: 'mgmtGiven' } })}
                className="flex-1 bg-white hover:bg-green-50 p-2.5 rounded-lg cursor-pointer transition-colors border border-slate-200 hover:border-green-300 shadow-sm"
              >
                <span className="block text-xl font-bold text-slate-700 leading-none">{totals.mgmtGiven || 0}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 block">Completed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
