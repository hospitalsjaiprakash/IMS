import { useState, useMemo } from 'react';
import { Search, Edit3 } from 'lucide-react';
import { ROLE_CONFIG } from '../../utils/helpers';

const LOCKED_HRMS_STATUSES = new Set(['terminated', 'inactive', 'deleted']);

export default function EmployeeAutocomplete({
  employees = [],
  isLoading = false,
  value = '',
  onChange,
  label = 'Search Employee',
  selectedLabel = 'Selected Employee',
  required = true,
  placeholder = 'Search by name, Employee ID, or department...',
  helperText = '',
  showCurrentRole = false,
  accentColor = 'blue',
  excludeRootAdmin = true,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const selectedEmp = useMemo(
    () => (employees || []).find((e) => String(e.employee_id) === String(value)),
    [employees, value]
  );

  const matches = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return [];
    return (employees || [])
      .filter((e) => {
        if (LOCKED_HRMS_STATUSES.has(e.status)) return false;
        if (excludeRootAdmin && String(e.employee_id || '').trim() === '00000') return false;
        const fullName = String(e.full_name || e.name || '').toLowerCase();
        const empId = String(e.employee_id || '').toLowerCase();
        const dept = String(e.department || '').toLowerCase();
        const desig = String(e.designation || '').toLowerCase();
        return fullName.includes(term) || empId.includes(term) || dept.includes(term) || desig.includes(term);
      })
      .slice(0, 50);
  }, [employees, searchTerm, excludeRootAdmin]);

  const avatarClasses =
    accentColor === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : accentColor === 'indigo'
      ? 'bg-indigo-100 text-indigo-700'
      : 'bg-blue-100 text-blue-700';

  const hoverClasses =
    accentColor === 'amber' ? 'hover:bg-amber-50/70' : 'hover:bg-blue-50/70';

  if (value) {
    if (selectedEmp) {
      const roleMeta = ROLE_CONFIG[selectedEmp.role] || { label: selectedEmp.role?.replace(/_/g, ' ') || 'Employee' };
      return (
        <div>
          <label className={`field-label font-bold ${required ? 'field-required' : ''}`}>{selectedLabel}</label>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl ${avatarClasses} flex items-center justify-center font-black text-lg flex-shrink-0`}>
                  {(selectedEmp.full_name || selectedEmp.name)?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-slate-900 leading-tight truncate">
                      {selectedEmp.full_name || selectedEmp.name}
                    </p>
                    {selectedEmp.status === 'noticePeriod' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Notice Period
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono font-bold text-slate-600 mt-0.5">
                    ID: {selectedEmp.employee_id}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">
                    {selectedEmp.designation || 'Staff'} • {selectedEmp.department || 'No Dept'}
                  </p>
                  {showCurrentRole && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Role:</span>
                      <span className="font-bold text-blue-700 uppercase px-2 py-0.5 bg-blue-100 border border-blue-200 rounded-md text-[10px]">
                        {roleMeta.label}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setSearchTerm('');
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-bold px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Edit3 size={13} /> Change
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div>
        <label className={`field-label font-bold ${required ? 'field-required' : ''}`}>{selectedLabel}</label>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-1 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-900">Selected Employee</p>
            <p className="text-xs text-amber-700 font-mono mt-0.5">ID: {value}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSearchTerm('');
            }}
            className="text-xs text-amber-700 hover:text-amber-900 font-bold px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Edit3 size={13} /> Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className={`field-label font-bold ${required ? 'field-required' : ''}`}>{label}</label>
      <div className="relative mt-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={isLoading ? 'Loading hospital directory...' : placeholder}
          className="input pl-9 font-semibold text-sm w-full"
          disabled={isLoading}
          autoFocus
        />

        {searchTerm.trim() && (
          <div className="mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
            {matches.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 text-center font-medium">
                No active employees found matching &ldquo;{searchTerm}&rdquo;
              </div>
            ) : (
              matches.map((emp) => (
                <button
                  type="button"
                  key={emp.employee_id || emp.master_id || emp.id}
                  onClick={() => {
                    onChange(String(emp.employee_id));
                    setSearchTerm('');
                  }}
                  className={`w-full text-left p-3 ${hoverClasses} transition-colors block`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800">{emp.full_name || emp.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold whitespace-nowrap">
                      ID: {emp.employee_id}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{emp.designation || 'Staff'}</span>
                    <span>•</span>
                    <span className="text-slate-700 font-medium">{emp.department || 'No Dept'}</span>
                    {emp.status === 'noticePeriod' && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Notice Period
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {helperText && <p className="text-[11px] text-slate-500 mt-1">{helperText}</p>}
    </div>
  );
}
