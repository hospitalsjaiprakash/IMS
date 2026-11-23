import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle, Loader2, Search, ChevronDown, Check, ChevronRight, Home, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getSLABadgeInfo, getSeverityClass, getStatusClass, getStatusLabel } from '../../utils/helpers';

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
      <div className="h-8 bg-slate-200 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-slate-100 rounded w-1/4"></div>
    </div>
  );
}

// ── Searchable Multi-Select ───────────────────────
// Props: options: string[], value: string[], onChange: (string[]) => void
//        placeholder, searchPlaceholder, error
export function SearchableMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  error,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropPos, setDropPos] = useState({
    top: 'auto',
    bottom: 'auto',
    left: 0,
    width: 0,
    maxHeight: 340,
    placement: 'bottom',
  });
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionRefs = useRef([]);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const VIEWPORT_PADDING = 12;
    const DROPDOWN_GAP = 6;
    const MAX_DROPDOWN_HEIGHT = 340;
    const MIN_PREFERRED_BELOW = 240;

    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (r.bottom <= 0 || r.top >= vh) {
      return { hidden: true };
    }

    const spaceBelow = Math.max(0, vh - r.bottom - DROPDOWN_GAP - VIEWPORT_PADDING);
    const spaceAbove = Math.max(0, r.top - DROPDOWN_GAP - VIEWPORT_PADDING);
    const openUpward = spaceBelow < MIN_PREFERRED_BELOW && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(MAX_DROPDOWN_HEIGHT, availableHeight);
    const width = Math.min(r.width, Math.max(200, vw - VIEWPORT_PADDING * 2));
    const left = Math.max(VIEWPORT_PADDING, Math.min(r.left, vw - width - VIEWPORT_PADDING));

    return {
      hidden: false,
      placement: openUpward ? 'top' : 'bottom',
      top: openUpward ? 'auto' : r.bottom + DROPDOWN_GAP,
      bottom: openUpward ? vh - r.top + DROPDOWN_GAP : 'auto',
      left,
      width,
      maxHeight,
    };
  }, []);

  // close on outside click (accounting for portaled dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inTrigger && !inDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // focus search input without triggering browser scroll jumps
  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // recompute position on external scroll, viewport resize, or trigger resize (e.g. wrapping chips)
  useEffect(() => {
    if (!open) return;

    const update = () => {
      const pos = computePosition();
      if (!pos) return;
      if (pos.hidden) {
        setOpen(false);
        return;
      }
      setDropPos(pos);
    };

    const handleScroll = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      update();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', update);

    let observer;
    if (typeof ResizeObserver !== 'undefined' && triggerRef.current) {
      observer = new ResizeObserver(update);
      observer.observe(triggerRef.current);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [open, computePosition]);

  const closeDropdown = (returnFocus = false) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  const handleOpen = () => {
    if (open) {
      closeDropdown(false);
      return;
    }
    const pos = computePosition();
    if (pos && !pos.hidden) {
      setDropPos(pos);
    }
    setOpen(true);
    setQuery('');
    setActiveIndex(-1);
  };

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };

  const remove = (opt, e) => { e.stopPropagation(); onChange(value.filter(v => v !== opt)); };

  const handleDropdownKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      const next = activeIndex < filtered.length - 1 ? activeIndex + 1 : 0;
      setActiveIndex(next);
      optionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      const prev = activeIndex > 0 ? activeIndex - 1 : filtered.length - 1;
      setActiveIndex(prev);
      optionRefs.current[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < filtered.length) {
      e.preventDefault();
      toggle(filtered[activeIndex]);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
          } else if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            handleOpen();
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            closeDropdown(false);
          }
        }}
        className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2 text-sm text-left flex flex-wrap items-center gap-1.5 focus:outline-none focus:ring-2 transition-colors duration-150 cursor-pointer ${error ? 'border-red-500 focus:ring-red-500' : open ? 'border-green-500 ring-2 ring-green-500' : 'border-slate-300 hover:border-slate-400'
          }`}
      >
        {value.length === 0 ? (
          <span className="text-slate-400 flex-1">{placeholder}</span>
        ) : (
          value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={(e) => remove(v, e)} className="hover:text-red-500 ml-0.5"><X size={10} /></button>
            </span>
          ))
        )}
        <ChevronDown size={14} className={`ml-auto flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown — portaled to body with viewport-aware collision flipping & constrained height */}
      {open && createPortal(
        <div
          ref={dropdownRef}
          onKeyDown={handleDropdownKeyDown}
          style={{
            position: 'fixed',
            top: dropPos.top,
            bottom: dropPos.bottom,
            left: dropPos.left,
            width: dropPos.width,
            maxHeight: dropPos.maxHeight,
            zIndex: 9999,
          }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 flex-shrink-0 bg-white">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
              placeholder={searchPlaceholder}
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder-slate-400"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setQuery(''); setActiveIndex(-1); searchInputRef.current?.focus({ preventScroll: true }); }}
              >
                <X size={13} className="text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          {/* Options */}
          <div
            role="listbox"
            aria-multiselectable="true"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1"
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400 text-center">No matches found</p>
            ) : filtered.map((opt, idx) => {
              const selected = value.includes(opt);
              const isActive = idx === activeIndex;
              return (
                <button
                  key={opt}
                  ref={el => { optionRefs.current[idx] = el; }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => toggle(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${selected
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : isActive
                      ? 'bg-slate-100 text-slate-800'
                      : 'hover:bg-slate-50 text-slate-700'
                    }`}
                >
                  <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                    }`}>
                    {selected && <Check size={10} className="text-white" />}
                  </div>
                  <span className="break-words">{opt}</span>
                </button>
              );
            })}
          </div>
          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between bg-slate-50 flex-shrink-0">
            <span className="text-xs text-slate-500">
              {value.length > 0 ? `${value.length} selected` : `${filtered.length} available`}
            </span>
            <div className="flex items-center gap-3">
              {value.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-700 font-medium">
                  Clear all
                </button>
              )}
              <button type="button" onClick={() => closeDropdown(true)} className="text-xs text-green-700 hover:text-green-800 font-semibold">
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Searchable Single-Select ──────────────────────
// Props: options: string[], value: string, onChange: (string) => void
//        placeholder, error
export function SearchableSelect({ options = [], value = '', onChange, placeholder = 'Select…', error }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inTrigger && !inDropdown) setOpen(false);
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const handleOpen = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen((o) => !o);
    setQuery('');
  };

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const select = (opt) => {
    onChange(opt);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
          } else if (e.key === 'Escape' && open) {
            setOpen(false);
          }
        }}
        className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-left flex items-center cursor-pointer focus:outline-none focus:ring-2 transition-colors duration-150 ${
          error ? 'border-red-500 focus:ring-red-500' : open ? 'border-green-500 ring-2 ring-green-500' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <span className={`flex-1 truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        {value && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="mr-2 text-slate-400 hover:text-red-500"
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear filter">
                <X size={13} className="text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400 text-center">No matches found</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => select(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    value === opt ? 'bg-green-50 text-green-700 font-medium' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border ${
                      value === opt ? 'bg-green-600 border-green-600' : 'border-slate-300'
                    }`}
                  >
                    {value === opt && <Check size={9} className="text-white" />}
                  </div>
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export { Modal, ConfirmDialog } from './Modal';

// ── Spinner ───────────────────────────────────────
export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-blue-600 ${className}`} />;
}

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
          <span className="text-white font-bold text-xl font-display">IMS</span>
        </div>
        <Spinner size={24} />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    </div>
  );
}

// ── Alert ─────────────────────────────────────────
export function Alert({ type = 'info', title, message, className = '' }) {
  const cfg = {
    info: { bg: 'bg-blue-50 border-blue-200', icon: Info, iconCls: 'text-blue-600' },
    success: { bg: 'bg-green-50 border-green-200', icon: CheckCircle, iconCls: 'text-green-700' },
    warning: { bg: 'bg-amber-50 border-yellow-200', icon: AlertTriangle, iconCls: 'text-amber-700' },
    error: { bg: 'bg-red-50 border-red-200', icon: AlertCircle, iconCls: 'text-red-700' },
  };
  const { bg, icon: Icon, iconCls } = cfg[type] || cfg.info;
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${bg} ${className}`}>
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${iconCls}`} />
      <div>
        {title && <p className="text-sm font-semibold text-slate-800">{title}</p>}
        {message && <p className="text-sm text-slate-600 mt-0.5">{message}</p>}
      </div>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────
export function Badge({ children, variant = 'gray' }) {
  const map = {
    gray: 'badge-gray', blue: 'badge-blue', green: 'badge-green',
    yellow: 'badge-yellow', red: 'badge-red', purple: 'badge-purple',
  };
  return <span className={`badge ${map[variant] || map.gray}`}>{children}</span>;
}

// ── Empty State ───────────────────────────────────
export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 w-full h-full min-h-[160px] bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
      <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 border border-slate-100">
        {Icon ? <Icon size={24} className="text-indigo-400" /> : <div className="text-slate-300">∅</div>}
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      {message && <p className="text-xs text-slate-500 max-w-xs text-center mb-4 leading-relaxed">{message}</p>}
      {action}
    </div>
  );
}

// ── Pagination ────────────────────────────────────
export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="btn-secondary btn-sm"
      >Previous</button>
      <span className="px-4 py-1.5 text-sm text-slate-600 font-medium">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="btn-secondary btn-sm"
      >Next</button>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────
export function StatCard({ icon: Icon, label, value, sub, color = 'bg-blue-50', iconColor = 'text-blue-600', onClick, className = '' }) {
  return (
    <div className={`stat-card ${onClick ? 'cursor-pointer hover:shadow-card-hover transition-all' : ''} ${className}`} onClick={onClick}>
      <div className={`stat-icon ${color}`}>
        <Icon className={`${iconColor} w-5 h-5 sm:w-5 sm:h-5 flex-shrink-0`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="stat-value truncate">{value}</div>
        <div className="stat-label uppercase tracking-wide break-words line-clamp-2">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${active === tab.id
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
          {tab.icon && <tab.icon size={15} />}
          {tab.label}
          {tab.count !== undefined && (
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${active === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Status & Severity Badges ──────────────────────
export function StatusBadge({ status, className = '' }) {
  return (
    <span className={`${getStatusClass(status)} ${className}`}>
      {getStatusLabel(status)}
    </span>
  );
}

export function SeverityBadge({ severity, className = '' }) {
  return (
    <span className={`badge ${getSeverityClass(severity)} ${className}`}>
      {severity}
    </span>
  );
}

// ── SLA Badge ─────────────────────────────────────
export function SLABadge({ createdAt, status, className = '' }) {
  const info = getSLABadgeInfo(createdAt, status);
  if (!info) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${info.isOverdue
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
      } ${className}`}>
      <Clock size={10} />
      {info.text}
    </span>
  );
}

// ── Breadcrumbs ───────────────────────────────────
export function Breadcrumbs({ items, className = '' }) {
  return (
    <nav className={`flex items-center text-sm font-medium text-slate-500 mb-4 ${className}`} aria-label="Breadcrumb">
      <Link to="/dashboard" className="hover:text-slate-800 flex items-center transition-colors">
        <Home size={14} />
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center">
          <ChevronRight size={14} className="mx-2 text-slate-400" />
          {item.to ? (
            <Link to={item.to} className="hover:text-slate-800 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-800">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

// ── Complex Skeletons ─────────────────────────────
export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="card w-full">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="h-4 bg-slate-200 rounded w-1/4 animate-pulse"></div>
      </div>
      <div className="p-0">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/6"></div>
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/6"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/4"></div>
      <div className="card p-6">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="h-3 bg-slate-200 rounded w-1/4 mb-2"></div>
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
          </div>
          <div>
            <div className="h-3 bg-slate-200 rounded w-1/4 mb-2"></div>
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
          </div>
        </div>
        <div className="mt-6">
          <div className="h-3 bg-slate-200 rounded w-1/4 mb-2"></div>
          <div className="h-20 bg-slate-200 rounded w-full"></div>
        </div>
      </div>
    </div>
  );
}

export { KanbanBoard } from './KanbanBoard';
export { AttachmentViewerModal } from './AttachmentViewerModal';
