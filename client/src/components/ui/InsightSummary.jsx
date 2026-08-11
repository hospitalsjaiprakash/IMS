import React from 'react';
import logoImg from '../../assets/logo.webp';

export function InsightSummary({ incidents = [], role }) {
  if (!incidents.length) return null;

  // Calculate insights
  const activeCount = incidents.filter(i => i.status !== 'resolved' && i.status !== 'withdrawn').length;
  const escalatedCount = incidents.filter(i => i.priority_escalated_by).length;
  
  // Find most targeted department
  const deptCounts = {};
  incidents.forEach(inc => {
    (inc.departments || []).forEach(d => {
      deptCounts[d] = (deptCounts[d] || 0) + 1;
    });
  });
  const topDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0];

  // Find most common category
  const catCounts = {};
  incidents.forEach(inc => {
    if (inc.incident_category) {
      catCounts[inc.incident_category] = (catCounts[inc.incident_category] || 0) + 1;
    }
  });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-200 to-green-200 rounded-full blur-3xl opacity-30 -mr-10 -mt-10 pointer-events-none" />
      
      <div className="flex items-start gap-3 relative z-10">
        <div className="mt-0.5 p-1.5 bg-white/60 backdrop-blur rounded-lg border border-white flex-shrink-0 shadow-sm">
          <img src={logoImg} alt="Logo" className="w-6 h-6 object-contain" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-emerald-900/60 uppercase tracking-wider mb-1.5 flex items-center gap-2">
            Incident Summary
          </h4>
          <p className="text-sm text-slate-700 leading-relaxed font-medium">
            Currently tracking <strong className="text-emerald-700 font-bold">{activeCount}</strong> active incidents.
            {escalatedCount > 0 ? (
              <span>
                {' '}There are <strong className="text-rose-600 font-bold">{escalatedCount} escalated</strong> issues requiring immediate attention.
              </span>
            ) : (
              <span> All critical priorities are currently stable.</span>
            )}
            {topDept && (
              <span>
                {' '}The <strong className="text-slate-900 font-bold">{topDept[0]}</strong> department is currently receiving the highest volume of reports.
              </span>
            )}
            {topCat && (
              <span>
                {' '}The most common issue category is <strong className="text-slate-900 font-bold">{topCat[0]}</strong>.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
