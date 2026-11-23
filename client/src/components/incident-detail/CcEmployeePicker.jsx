import { useState, useEffect, useRef } from 'react';
import { Search, X, Mail, UserCheck } from 'lucide-react';
import { Spinner } from '../ui';
import { employeeApi } from '../../api';

/**
 * Shared display formatter for CC entries across picker chips, letterhead preview,
 * and trainer appointment modal.
 * New directory-backed entries render strictly as: "Full Name — Complete Designation".
 * Preserves safe display for legacy historical { label, role } entries.
 */
export function formatCcDisplay(cc) {
  if (!cc) return '';
  if (typeof cc === 'string') return cc.trim();
  const name = String(cc.name || cc.full_name || '').trim();
  const designation = String(cc.designation || '').trim();
  if (name) {
    return designation ? `${name} — ${designation}` : name;
  }
  const label = String(cc.label || '').trim();
  if (!label) return '';
  if (designation) return `${label} — ${designation}`;
  const role = String(cc.role || '').trim();
  return role ? `${label} (${role})` : label;
}

function getCcIdentityKey(cc) {
  if (!cc) return '';
  if (typeof cc === 'string') return cc.trim().toLowerCase();
  const key = cc.employee_id || cc.emp_id || cc.employee_code || cc.user_id || cc.id || cc.label || cc.name || '';
  return String(key).trim().toLowerCase();
}

/**
 * Reusable active-employee search picker for formal letter & trainer appointment CC recipients.
 * Strictly selects real active employees (no predefined lists, no free-text entries).
 */
export default function CcEmployeePicker({
  selected = [],
  onChange,
  label = 'Copy Forwarded To (CC Recipients — Optional)',
  placeholder = 'Search active employee by name, ID, designation, or department…',
  excludeIds = [],
  disabled = false,
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef(null);

  const selectedKeys = new Set(
    (selected || []).flatMap((item) => {
      if (!item || typeof item !== 'object') return [getCcIdentityKey(item)];
      return [item.employee_id, item.emp_id, item.user_id, item.id]
        .filter(Boolean)
        .map((v) => String(v).trim().toLowerCase());
    }).filter(Boolean)
  );

  const excludedSet = new Set(
    (excludeIds || []).filter(Boolean).map((v) => String(v).trim().toLowerCase())
  );

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 260 && rect.top > 240);
    }
  }, [open, term]);

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
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      employeeApi
        .search(q)
        .then((res) => {
          if (!active) return;
          const data = res.data;
          const list = (Array.isArray(data) ? data : data?.employees || []).filter(
            (emp) => !['terminated', 'inactive', 'deleted'].includes(emp?.status)
          );
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
    const fullName = String(emp.full_name || emp.name || '').trim();
    const designation = String(emp.designation || '').trim();
    const empCode = String(emp.employee_id || emp.emp_id || '').trim();
    const userId = emp.is_registered ? emp.id : null;

    const ccEntry = {
      user_id: userId,
      id: emp.id || empCode,
      employee_id: empCode,
      name: fullName,
      full_name: fullName,
      designation,
      email: emp.email || null,
      label: designation ? `${fullName} — ${designation}` : fullName,
    };

    const nextKey = getCcIdentityKey(ccEntry);
    if (nextKey && selectedKeys.has(nextKey)) {
      setTerm('');
      setResults([]);
      setOpen(false);
      return;
    }

    onChange([...(selected || []), ccEntry]);
    setTerm('');
    setResults([]);
    setOpen(false);
  };

  const handleRemove = (indexToRemove) => {
    onChange((selected || []).filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5" ref={containerRef}>
      <div className="flex items-center justify-between gap-2">
        <label className="field-label text-xs mb-0 font-semibold text-slate-700 flex items-center gap-1.5">
          <UserCheck size={13} className="text-indigo-600" />
          <span>{label}</span>
        </label>
        <span className="text-[11px] text-slate-500">
          {selected.length} {selected.length === 1 ? 'staff' : 'staff'} selected
        </span>
      </div>

      {/* Selected CC Staff Chips */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((cc, idx) => {
            const display = formatCcDisplay(cc);
            const ccEmail = typeof cc === 'object' ? cc?.email : null;
            return (
              <span
                key={`${getCcIdentityKey(cc)}-${idx}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-[11px] text-slate-800 shadow-2xs"
              >
                <span className="font-semibold text-slate-800">{display}</span>
                {ccEmail ? (
                  <span
                    className="inline-flex items-center text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded"
                    title={`Will receive [CC] email at ${ccEmail}`}
                  >
                    <Mail size={10} className="mr-0.5" /> Email
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded"
                    title="No email on file — will still be printed on letterhead CC list"
                  >
                    No email
                  </span>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="text-slate-400 hover:text-rose-600 transition-colors ml-0.5"
                    title="Remove CC recipient"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 italic">
          No CC recipients selected. Search hospital employees below to add staff (displayed on letter with complete designation).
        </p>
      )}

      {/* Search Input & Results Dropdown */}
      {!disabled && (
        <div className="relative">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={term}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                const val = e.target.value;
                setTerm(val);
                setOpen(true);
                if (val.trim().length < 2) {
                  setResults([]);
                  setLoading(false);
                }
              }}
              placeholder={placeholder}
              className="input text-xs pl-9 pr-8 bg-white"
            />
            {loading ? (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <Spinner size={14} className="text-indigo-600" />
              </div>
            ) : term ? (
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  setResults([]);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          {open && term.trim().length >= 2 && (
            <div
              className={`absolute z-40 left-0 right-0 ${
                dropUp ? 'bottom-full mb-1.5 shadow-2xl' : 'top-full mt-1.5 shadow-xl'
              } max-h-60 overflow-y-auto bg-white rounded-xl border border-slate-200 divide-y divide-slate-100`}
            >
              {loading ? (
                <div className="p-3 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Spinner size={14} className="text-indigo-600" /> Searching staff directory…
                </div>
              ) : results.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  No active hospital employees found matching &ldquo;{term}&rdquo;.
                </div>
              ) : (
                results.map((emp) => {
                  const empIdLower = String(emp.employee_id || '').trim().toLowerCase();
                  const idLower = String(emp.id || '').trim().toLowerCase();
                  const isAlreadySelected =
                    (empIdLower && selectedKeys.has(empIdLower)) ||
                    (idLower && selectedKeys.has(idLower));
                  const isPrimaryRecipient =
                    (empIdLower && excludedSet.has(empIdLower)) ||
                    (idLower && excludedSet.has(idLower));
                  const isDisabled = isAlreadySelected || isPrimaryRecipient;

                  return (
                    <button
                      key={emp.employee_id || emp.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSelect(emp)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                        isDisabled
                          ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                          : 'hover:bg-indigo-50/70 cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{emp.full_name || emp.name}</span>
                          {emp.employee_id && (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal">
                              {emp.employee_id}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                          {emp.designation || 'Designation not specified'}
                          {emp.department ? (
                            <span className="text-slate-400"> · {emp.department}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isPrimaryRecipient ? (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            Recipient
                          </span>
                        ) : isAlreadySelected ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            Added
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-indigo-600">+ Add CC</span>
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
