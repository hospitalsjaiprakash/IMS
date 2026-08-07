import { useState, useRef, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle, Loader2, Search, ChevronDown, Check } from 'lucide-react';

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
//        placeholder, label, error
export function SearchableMultiSelect({ options = [], value = [], onChange, placeholder = 'Select…', error }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const ref                   = useRef(null);
  const triggerRef            = useRef(null);

  // close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // recompute position on scroll / resize
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  const handleOpen = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
    setQuery('');
  };

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else                     onChange([...value, opt]);
  };

  const remove = (opt, e) => { e.stopPropagation(); onChange(value.filter(v => v !== opt)); };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2 text-sm text-left flex flex-wrap items-center gap-1.5 focus:outline-none focus:ring-2 transition-colors duration-150 ${
          error ? 'border-red-500 focus:ring-red-500' : open ? 'border-green-500 ring-2 ring-green-500' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        {value.length === 0 ? (
          <span className="text-slate-400 flex-1">{placeholder}</span>
        ) : (
          value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
              {v}
              <button type="button" onClick={(e) => remove(v, e)} className="hover:text-red-500 ml-0.5"><X size={10} /></button>
            </span>
          ))
        )}
        <ChevronDown size={14} className={`ml-auto flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div 
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search categories…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder-slate-400"
            />
            {query && <button type="button" onClick={() => setQuery('')}><X size={13} className="text-slate-400 hover:text-slate-600" /></button>}
          </div>
          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400 text-center">No matches found</p>
            ) : filtered.map(opt => {
              const selected = value.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${
                    selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                  }`}>
                    {selected && <Check size={10} className="text-white" />}
                  </div>
                  {opt}
                </button>
              );
            })}
          </div>
          {/* Footer */}
          {value.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-500">{value.length} selected</span>
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Searchable Single-Select ──────────────────────
// Props: options: string[], value: string, onChange: (string) => void
//        placeholder, error
export function SearchableSelect({ options = [], value = '', onChange, placeholder = 'Select…', error }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const ref                   = useRef(null);
  const triggerRef            = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  const handleOpen = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
    setQuery('');
  };

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));
  const select = (opt) => { onChange(opt); setOpen(false); setQuery(''); };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-left flex items-center focus:outline-none focus:ring-2 transition-colors duration-150 ${
          error ? 'border-red-500 focus:ring-red-500' : open ? 'border-green-500 ring-2 ring-green-500' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <span className={`flex-1 truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        {value && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="mr-2 text-slate-400 hover:text-red-500">
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown — fixed to viewport to escape overflow:hidden parents */}
      {open && (
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder-slate-400"
            />
            {query && <button type="button" onClick={() => setQuery('')}><X size={13} className="text-slate-400 hover:text-slate-600" /></button>}
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400 text-center">No matches found</p>
            ) : filtered.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => select(opt)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  value === opt ? 'bg-green-50 text-green-700 font-medium' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border ${
                  value === opt ? 'bg-green-600 border-green-600' : 'border-slate-300'
                }`}>
                  {value === opt && <Check size={9} className="text-white" />}
                </div>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-box ${sizes[size]}`}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

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
    info:    { bg: 'bg-blue-50 border-blue-200', icon: Info, iconCls: 'text-blue-600' },
    success: { bg: 'bg-green-50 border-green-200', icon: CheckCircle, iconCls: 'text-green-700' },
    warning: { bg: 'bg-amber-50 border-yellow-200', icon: AlertTriangle, iconCls: 'text-amber-700' },
    error:   { bg: 'bg-red-50 border-red-200', icon: AlertCircle, iconCls: 'text-red-700' },
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

// ── Confirm Dialog ────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box max-w-sm">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-slate-600">{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>{confirmLabel}</button>
        </div>
      </div>
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
export function StatCard({ icon: Icon, label, value, sub, color = 'bg-blue-50', iconColor = 'text-blue-600', trend, onClick, className = '' }) {
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
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
            active === tab.id
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.icon && <tab.icon size={15} />}
          {tab.label}
          {tab.count !== undefined && (
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
              active === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
            }`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export * from './KanbanBoard';
export * from './InsightSummary';
