import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown, ChevronRight, XCircle } from 'lucide-react';
import { formatDuration } from '../../utils/helpers';

export function CategoryAnalyticsTable({
  categories = [],
  title = 'Category-wise Incident Feedback Tracking',
  detailBasePath = '/management/dashboard/category',
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'received', direction: 'desc' });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const processed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = categories.filter(item =>
      (item.category || '').toLowerCase().includes(q)
    );

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];

        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'string') {
          return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      });
    }
    return filtered;
  }, [categories, searchQuery, sortConfig]);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <h2 className="text-base font-bold text-slate-800">{title}</h2>

        <div className="relative w-full sm:w-64 flex-shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search categories…"
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-slate-400"
          />
        </div>
      </div>

      <div className="table-wrapper border border-slate-200 rounded-xl overflow-x-auto bg-white">
        <table className="table min-w-full divide-y divide-slate-200">
          <thead>
            <tr className="bg-slate-50">
              <th onClick={() => handleSort('category')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-left">
                <div className="flex items-center gap-1.5">
                  <span>Incident Category</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('received')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-28">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Received</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('feedbackGiven')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-44">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Dept Feedback Given</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('missingFeedback')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Pending Feedback</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('solved')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-28">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Resolved</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('avgReviewerHours')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Avg Dept Resp</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('avgImcHours')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Avg IMC Resp</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('avgResolutionHours')} className="cursor-pointer select-none hover:bg-slate-100 transition-colors text-[11px] font-bold text-slate-500 uppercase tracking-wider py-3.5 px-4 text-center w-36">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Avg Resolution</span>
                  <ArrowUpDown size={11} className="text-slate-400" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {processed.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400 text-sm">
                  {searchQuery ? `No matches found for "${searchQuery}"` : 'No category data available'}
                </td>
              </tr>
            ) : (
              processed.map(row => {
                const pct = row.pctFeedback ?? (row.received > 0 ? Math.round((row.feedbackGiven / row.received) * 100) : 0);
                const categoryUrl = `${detailBasePath}/${encodeURIComponent(row.category)}`;

                return (
                  <tr key={row.category} className="hover:bg-slate-50/50 transition-colors">
                    <td
                      onClick={() => navigate(categoryUrl)}
                      className="py-3.5 px-4 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>{row.category}</span>
                        <ChevronRight size={13} className="text-slate-400 opacity-60" />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-sm font-bold text-slate-700 text-center">
                      {row.received}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {row.received > 0 ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center justify-between w-full max-w-[120px] text-xs font-semibold text-slate-600">
                            <span>{pct}%</span>
                            <span>({row.feedbackGiven}/{row.received})</span>
                          </div>
                          <div className="w-full max-w-[120px] h-1.5 bg-slate-100 border border-slate-200/50 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {(row.missingFeedback || 0) > 0 ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                            <XCircle size={13} /> {row.missingFeedback}
                          </span>
                          <button
                            onClick={() => navigate(categoryUrl)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                          >
                            View
                          </button>
                        </div>
                      ) : (
                        <span className="text-green-600 text-xs font-semibold">All done ✓</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {row.received > 0 ? (
                        <span
                          className={`inline-flex items-center gap-1 font-bold text-sm ${
                            row.solved === row.received
                              ? 'text-green-700'
                              : row.solved > 0
                                ? 'text-indigo-600'
                                : 'text-slate-500'
                          }`}
                        >
                          {row.solved}
                          {row.solved === row.received && (
                            <span className="text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 rounded px-1 py-0.5">
                              All
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-sm text-center font-medium text-slate-700">
                      {row.avgReviewerHours != null ? formatDuration(row.avgReviewerHours) : <span className="text-slate-400 italic text-xs">N/A</span>}
                    </td>
                    <td className="py-3.5 px-4 text-sm text-center font-medium text-slate-700">
                      {row.avgImcHours != null ? formatDuration(row.avgImcHours) : <span className="text-slate-400 italic text-xs">N/A</span>}
                    </td>
                    <td className="py-3.5 px-4 text-sm text-center font-medium text-slate-700">
                      {row.avgResolutionHours != null ? formatDuration(row.avgResolutionHours) : <span className="text-slate-400 italic text-xs">N/A</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
