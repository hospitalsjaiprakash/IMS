import React, { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, X, User, Building2, Briefcase } from 'lucide-react';
import { Spinner } from '../ui';
import { employeeApi } from '../../api';

/**
 * Reusable typeahead picker for selecting employees involved in an incident.
 */
export default function ResponsibleEmployeePicker({
  selected = [],
  onChange,
  label = 'Select Responsible / Involved Employee(s)',
  required = false,
  placeholder = 'Type employee name or ID (e.g. JPHRC-1024 or Rahul)...',
  disabled = false
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedIds = new Set(selected.map(s => String(s.id || s.employee_id || '').toLowerCase()));

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    const q = term.trim();
    if (!q || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;
    const timer = setTimeout(() => {
      employeeApi.search(q)
        .then(res => {
          if (!active) return;
          const data = res.data;
          const list = Array.isArray(data) ? data : (data?.employees || []);
          setResults(list);
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  const handleSelect = (emp) => {
    const newSelected = [...selected, emp];
    onChange(newSelected);
    setTerm('');
    setResults([]);
    setOpen(false);
  };

  const handleRemove = (empId) => {
    const newSelected = selected.filter(s => (s.id || s.employee_id) !== empId);
    onChange(newSelected);
  };

  return (
    <div className="space-y-3" ref={containerRef}>
      {label && (
        <label className="field-label flex items-center justify-between">
          <span>
            {label} {required && <span className="text-red-500">*</span>}
          </span>
          <span className="text-xs text-slate-500 font-normal">
            {selected.length} employee{selected.length === 1 ? '' : 's'} selected
          </span>
        </label>
      )}

      {/* Selected tags / cards */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map(emp => {
            const key = emp.id || emp.employee_id;
            return (
              <div
                key={key}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 shadow-2xs animate-fade-in"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-xs font-bold">
                  {(emp.full_name || emp.name || 'E').charAt(0).toUpperCase()}
                </div>
                <div className="text-left text-xs">
                  <div className="font-semibold text-slate-800">
                    {emp.full_name || emp.name}
                    {(emp.employee_id || emp.emp_id) && (
                      <span className="text-slate-500 font-mono ml-1 text-[11px]">
                        ({emp.employee_id || emp.emp_id})
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {[emp.designation, emp.department || emp.department_name].filter(Boolean).join(' • ')}
                  </div>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(key)}
                    className="p-1 hover:bg-indigo-100 rounded text-slate-400 hover:text-red-600 transition-colors ml-1"
                    title="Remove employee"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Input box */}
      {!disabled && (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3 text-slate-400 pointer-events-none" size={16} />
            <input
              type="text"
              value={term}
              onChange={e => {
                setTerm(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              className="input pl-9 pr-8 w-full text-sm"
            />
            {loading && (
              <div className="absolute right-3">
                <Spinner size={14} className="text-indigo-600" />
              </div>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {open && (term.trim().length >= 2 || results.length > 0) && (
            <div className="absolute left-0 right-0 top-full mt-1.5 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 z-50 divide-y divide-slate-100">
              {results.length === 0 && !loading ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  No hospital employee found matching &quot;{term}&quot;
                </div>
              ) : (
                results.map(emp => {
                  const empId = emp.id || emp.employee_id;
                  const isSelected = selectedIds.has(String(empId).toLowerCase()) ||
                    (emp.employee_id && selectedIds.has(String(emp.employee_id).toLowerCase()));

                  return (
                    <button
                      type="button"
                      key={empId}
                      disabled={isSelected}
                      onClick={() => handleSelect(emp)}
                      className={`w-full px-3 py-2.5 text-left flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                          : 'hover:bg-indigo-50/70 text-slate-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0">
                          {(emp.full_name || emp.name || 'E').charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="truncate">{emp.full_name || emp.name}</span>
                            {emp.employee_id && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                {emp.employee_id}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                            <span>{emp.designation || 'Staff'}</span>
                            {emp.department && (
                              <>
                                <span>•</span>
                                <span>{emp.department}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected ? (
                        <span className="text-[10px] font-medium text-slate-400">Added</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 shrink-0">
                          <UserPlus size={13} /> Add
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
