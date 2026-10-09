import React from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { Spinner } from '../ui';
import { employeeApi } from '../../api';

/** True if a user record represents an IMC committee member. */
export const isImcUser = (u) => Boolean(u && (u.role === 'imc' || u.is_imc_member || u.is_imc_lead));

/**
 * Typeahead multi-select for picking investigators.
 *
 * mode = 'imc'     -> suggestions come from the provided `imcMembers` list (filtered client-side)
 * mode = 'non_imc' -> suggestions come from the employee search API, excluding IMC members
 *
 * The suggestion list only appears once the user starts typing a name or employee ID.
 */
export default function InvestigatorPicker({
  id,
  label,
  icon: Icon,
  required = false,
  mode,
  imcMembers = [],
  selected = [],
  onChange,
  excludeIds = [],
  placeholder,
  accent = 'indigo',
}) {
  const [term, setTerm] = React.useState('');
  const [remoteResults, setRemoteResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);

  const imcIdSet = React.useMemo(() => new Set(imcMembers.map(m => m.id)), [imcMembers]);
  const imcEmpIdSet = React.useMemo(
    () => new Set(imcMembers.map(m => (m.employee_id || '').toLowerCase()).filter(Boolean)),
    [imcMembers]
  );
  const takenIds = React.useMemo(
    () => new Set([...selected.map(s => s.id), ...excludeIds]),
    [selected, excludeIds]
  );

  // Close suggestions on outside click
  React.useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Remote search for non-IMC employees (debounced)
  React.useEffect(() => {
    if (mode !== 'non_imc') return;
    const q = term.trim();
    if (!q) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      employeeApi.search(q)
        .then(res => {
          if (cancelled) return;
          const data = res.data;
          setRemoteResults(Array.isArray(data) ? data : (data?.employees || []));
        })
        .catch(() => { if (!cancelled) setRemoteResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [term, mode]);

  const suggestions = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    if (mode === 'imc') {
      return imcMembers.filter(m =>
        !takenIds.has(m.id) &&
        ((m.full_name || '').toLowerCase().includes(q) || (m.employee_id || '').toLowerCase().includes(q))
      ).slice(0, 20);
    }
    return remoteResults.filter(emp =>
      !takenIds.has(emp.id) &&
      !isImcUser(emp) &&
      !imcIdSet.has(emp.id) &&
      !imcEmpIdSet.has((emp.employee_id || '').toLowerCase())
    );
  }, [term, mode, imcMembers, remoteResults, takenIds, imcIdSet, imcEmpIdSet]);

  const add = (emp) => {
    if (mode === 'non_imc' && emp.is_registered === false) return;
    if (!selected.some(s => s.id === emp.id)) onChange([...selected, emp]);
    setTerm('');
    setOpen(false);
  };

  const remove = (empId) => onChange(selected.filter(s => s.id !== empId));

  const chipClass = accent === 'blue'
    ? 'bg-blue-50 border-blue-200 text-blue-800'
    : 'bg-indigo-50 border-indigo-200 text-indigo-800';
  const iconClass = accent === 'blue' ? 'text-blue-600' : 'text-indigo-600';

  const showDropdown = open && term.trim().length > 0;

  return (
    <div ref={wrapperRef}>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="field-label mb-0 flex items-center gap-1.5">
          {Icon && <Icon size={14} className={iconClass} />}
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {selected.length > 0 && (
          <span className={`text-xs font-semibold ${iconClass}`}>{selected.length} selected</span>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          id={id}
          type="text"
          value={term}
          onChange={e => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Start typing a name or employee ID…'}
          className="input pl-9"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size={14} /></span>
        )}

        {showDropdown && (
          <div className="absolute z-30 left-0 right-0 mt-1 border border-slate-200 rounded-xl bg-white shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
            {suggestions.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">
                {searching ? 'Searching…' : (mode === 'imc' ? 'No matching IMC member found.' : 'No matching non-IMC employee found.')}
              </div>
            ) : suggestions.map(emp => {
              const disabled = mode === 'non_imc' && emp.is_registered === false;
              return (
                <button
                  type="button"
                  key={emp.id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => add(emp)}
                  disabled={disabled}
                  title={disabled ? 'This employee has not registered on IMS yet and cannot be assigned.' : ''}
                  className={`w-full text-left p-2.5 flex items-center justify-between gap-2 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {emp.full_name || emp.name}{emp.employee_id ? ` (${emp.employee_id})` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {[emp.designation, emp.department].filter(Boolean).join(' • ') || '—'}
                      {disabled && ' • Not registered'}
                    </p>
                  </div>
                  {!disabled && <UserPlus size={14} className={iconClass} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map(emp => (
            <span
              key={emp.id}
              className={`inline-flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-medium ${chipClass}`}
            >
              <span>{emp.full_name || emp.name}{emp.employee_id ? ` (${emp.employee_id})` : ''}</span>
              <button type="button" onClick={() => remove(emp.id)} className="hover:text-red-600" aria-label="Remove">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
