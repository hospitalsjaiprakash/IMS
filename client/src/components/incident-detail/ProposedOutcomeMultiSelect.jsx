import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X, AlertCircle } from 'lucide-react';
import { PROPOSED_OUTCOME_OPTIONS } from '../../utils/helpers';

const getOutcomeBadgeStyle = (outcome) => {
  const o = (outcome || '').toLowerCase();
  if (o.includes('penalty')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (o.includes('warning') || o.includes('advisory')) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (o.includes('training') || o.includes('education') || o.includes('counselling')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (o.includes('suspension') || o.includes('termination') || o.includes('demotion') || o.includes('legal')) return 'bg-red-50 text-red-700 border-red-200';
  if (o.includes('protocol')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (o.includes('no action')) return 'bg-slate-100 text-slate-700 border-slate-300';
  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
};

/**
 * Modern multiselect component for Proposed Outcomes.
 * Supports selecting multiple outcomes (e.g. Warning Letter + Financial Penalty + Training).
 */
export default function ProposedOutcomeMultiSelect({
  selected = [],
  onChange,
  label = 'Proposed Outcome(s)',
  required = false,
  disabled = false,
  placeholder = 'Select one or more proposed outcomes...'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const dropdownRef = useRef(null);

  // Normalize selected to an array
  const currentSelected = Array.isArray(selected)
    ? selected.filter(Boolean)
    : (typeof selected === 'string' && selected.trim() ? selected.split(',').map(s => s.trim()).filter(Boolean) : []);

  // Determine open direction (up vs down) based on viewport clearance
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 280 && rect.top > 240) {
        setDropUp(true);
      } else {
        setDropUp(false);
      }
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleOutcome = (outcome) => {
    if (disabled) return;
    let next;
    if (outcome === 'No Action') {
      // If choosing 'No Action', clear all others
      next = currentSelected.includes('No Action') ? [] : ['No Action'];
    } else {
      // If choosing an active outcome, remove 'No Action' if present
      const withoutNoAction = currentSelected.filter(o => o !== 'No Action');
      if (withoutNoAction.includes(outcome)) {
        next = withoutNoAction.filter(o => o !== outcome);
      } else {
        next = [...withoutNoAction, outcome];
      }
    }
    onChange(next);
  };

  const removeOutcome = (outcome, e) => {
    e.stopPropagation();
    if (disabled) return;
    const next = currentSelected.filter(o => o !== outcome);
    onChange(next);
  };

  const clearAll = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange([]);
  };

  const filteredOptions = PROPOSED_OUTCOME_OPTIONS.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="field-label text-xs font-semibold text-slate-700 mb-0">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          {currentSelected.length > 0 && !disabled && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Main trigger button */}
      <div
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`w-full min-h-[42px] px-3 py-1.5 rounded-lg border text-xs cursor-pointer flex flex-wrap items-center justify-between gap-1.5 transition-all ${
          disabled
            ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-75'
            : isOpen
              ? 'bg-white border-indigo-500 ring-2 ring-indigo-100 shadow-sm'
              : 'bg-white border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {currentSelected.length === 0 ? (
            <span className="text-slate-400 italic py-1">{placeholder}</span>
          ) : (
            currentSelected.map((outcome) => (
              <span
                key={outcome}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${getOutcomeBadgeStyle(outcome)} animate-in fade-in zoom-in duration-100`}
              >
                <span>{outcome}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeOutcome(outcome, e)}
                    className="hover:opacity-75 focus:outline-none ml-0.5"
                    title={`Remove ${outcome}`}
                  >
                    <X size={12} className="stroke-[2.5]" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 text-slate-400 pl-1">
          {currentSelected.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600">
              {currentSelected.length}
            </span>
          )}
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div className={`absolute z-[100] left-0 right-0 ${dropUp ? 'bottom-full mb-1.5 shadow-2xl animate-in fade-in slide-in-from-bottom-1' : 'top-full mt-1.5 shadow-xl animate-in fade-in slide-in-from-top-1'} bg-white border border-slate-200 rounded-xl overflow-hidden duration-150`}>
          {/* Quick Search */}
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter outcomes..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                No matching outcomes found.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = currentSelected.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOutcome(opt)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/80 font-semibold text-indigo-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check size={11} className="stroke-[3]" />}
                      </div>
                      <span>{opt}</span>
                    </div>

                    {opt === 'No Action' && (
                      <span className="text-[10px] text-slate-400 font-normal">Mutually Exclusive</span>
                    )}
                    {opt === 'Financial Penalty' && (
                      <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                        Requires Amount
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>You can select multiple actions</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
