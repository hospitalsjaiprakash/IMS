import React, { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, X, User, Building2, Briefcase, GraduationCap, DollarSign, Copy, CheckCircle } from 'lucide-react';
import { Spinner } from '../ui';
import { employeeApi } from '../../api';
import ProposedOutcomeMultiSelect from './ProposedOutcomeMultiSelect';
import { convertNumberToWords } from '../../utils/helpers';
import toast from 'react-hot-toast';

/**
 * Reusable typeahead picker for selecting employees involved in an incident.
 * Supports per-employee multiple proposed outcomes when allowPerEmployeeOutcomes is true.
 */
export default function ResponsibleEmployeePicker({
  selected = [],
  onChange,
  label = 'Select Responsible / Involved Employee(s)',
  required = false,
  placeholder = 'Type employee name or ID (e.g. JPHRC-1024 or Rahul)...',
  disabled = false,
  allowPerEmployeeOutcomes = false,
  defaultOutcomes = []
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
    const initialOutcomes = emp.outcomes && emp.outcomes.length > 0
      ? emp.outcomes
      : (defaultOutcomes.length > 0 ? [...defaultOutcomes] : []);

    const newEmp = {
      ...emp,
      outcomes: initialOutcomes,
      needs_training: emp.needs_training || initialOutcomes.some(o => o.toLowerCase().includes('training') || o.toLowerCase().includes('counselling')),
      penalty_amount: emp.penalty_amount || null
    };

    const newSelected = [...selected, newEmp];
    onChange(newSelected);
    setTerm('');
    setResults([]);
    setOpen(false);
  };

  const handleRemove = (empId) => {
    const newSelected = selected.filter(s => (s.id || s.employee_id) !== empId);
    onChange(newSelected);
  };

  const handleUpdateEmployee = (empId, updates) => {
    const newSelected = selected.map(s => {
      if ((s.id || s.employee_id) === empId) {
        return { ...s, ...updates };
      }
      return s;
    });
    onChange(newSelected);
  };

  const handleApplyToAll = (sourceOutcomes, sourcePenalty) => {
    const newSelected = selected.map(s => ({
      ...s,
      outcomes: [...sourceOutcomes],
      needs_training: sourceOutcomes.some(o => o.toLowerCase().includes('training') || o.toLowerCase().includes('counselling')),
      penalty_amount: sourcePenalty || null
    }));
    onChange(newSelected);
    toast.success('Applied outcomes to all selected employees.');
  };

  return (
    <div className="space-y-3" ref={containerRef}>
      {label && (
        <label className="field-label flex items-center justify-between">
          <span className="font-semibold text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
          </span>
          <span className="text-xs text-slate-500 font-normal">
            {selected.length} employee{selected.length === 1 ? '' : 's'} selected
          </span>
        </label>
      )}

      {/* Selected cards view */}
      {selected.length > 0 && (
        <div className="space-y-3 mb-2">
          {allowPerEmployeeOutcomes ? (
            /* Rich per-employee outcome cards */
            selected.map((emp, index) => {
              const key = emp.id || emp.employee_id;
              const empOutcomes = Array.isArray(emp.outcomes) ? emp.outcomes : [];
              const hasPenalty = empOutcomes.some(o => o.toLowerCase().includes('penalty'));
              const hasTraining = empOutcomes.some(o => o.toLowerCase().includes('training') || o.toLowerCase().includes('counselling'));
              const penaltyWords = emp.penalty_amount ? convertNumberToWords(emp.penalty_amount) : '';

              return (
                <div
                  key={key}
                  className="p-3.5 rounded-xl bg-white border border-indigo-200 shadow-xs space-y-3 animate-fade-in"
                >
                  {/* Employee identity row */}
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(emp.full_name || emp.name || 'E').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 flex-wrap">
                          <span>{emp.full_name || emp.name}</span>
                          {(emp.employee_id || emp.emp_id) && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-semibold rounded border border-indigo-100">
                              {emp.employee_id || emp.emp_id}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {[emp.designation, emp.department || emp.department_name].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {selected.length > 1 && !disabled && (
                        <button
                          type="button"
                          onClick={() => handleApplyToAll(empOutcomes, emp.penalty_amount)}
                          className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                          title="Apply this employee's outcomes to all other selected employees"
                        >
                          <Copy size={11} /> Apply to All
                        </button>
                      )}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => handleRemove(key)}
                          className="p-1 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                          title="Remove employee"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Outcome selection for this employee */}
                  <div>
                    <ProposedOutcomeMultiSelect
                      selected={empOutcomes}
                      onChange={(newOutcomes) => {
                        handleUpdateEmployee(key, {
                          outcomes: newOutcomes,
                          needs_training: newOutcomes.some(o => o.toLowerCase().includes('training') || o.toLowerCase().includes('counselling'))
                        });
                      }}
                      label={`Proposed Outcome(s) for ${emp.full_name || emp.name}`}
                      placeholder="Select one or more outcomes for this employee..."
                      disabled={disabled}
                      required={required}
                    />
                  </div>

                  {/* Optional penalty amount for this employee */}
                  {hasPenalty && (
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-rose-900 flex items-center gap-1 mb-0">
                          <DollarSign size={13} className="text-rose-600" />
                          Individual Penalty Deduction Amount (₹)
                        </label>
                        <span className="text-[10px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-medium">
                          Specific to {emp.full_name || emp.name}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={emp.penalty_amount || ''}
                        disabled={disabled}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          handleUpdateEmployee(key, { penalty_amount: val });
                        }}
                        placeholder="Enter penalty amount in INR (e.g. 1000)..."
                        className="w-full text-xs bg-white border border-rose-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-400 font-semibold"
                      />
                      {penaltyWords && (
                        <p className="text-[11px] text-rose-800 italic font-medium">
                          Amount in words: {penaltyWords}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Training mandate confirmation badge */}
                  {hasTraining && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 font-medium">
                      <GraduationCap size={14} className="text-blue-600 shrink-0" />
                      <span>
                        <strong>Mandatory Training Mandate:</strong> This staff member will be enrolled as a trainee for IMC trainer assignment.
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Compact tag view when allowPerEmployeeOutcomes is false */
            <div className="flex flex-wrap gap-2">
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
                      <div className="shrink-0 ml-2">
                        {isSelected ? (
                          <span className="text-[11px] text-slate-400 font-medium">Selected</span>
                        ) : (
                          <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                            <UserPlus size={13} /> Add
                          </span>
                        )}
                      </div>
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
