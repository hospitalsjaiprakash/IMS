import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText, Users, LayoutDashboard, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function CommandPalette({ open, setOpen, role }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Handle keyboard shortcut (Ctrl+K or Cmd+K)
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [setOpen]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [open]);

  const handleSelect = (path) => {
    setOpen(false);
    navigate(path);
  };

  const getCommands = () => {
    const base = [
      { id: 'incidents', name: 'Search Incidents', icon: FileText, path: '/incidents' },
      { id: 'new-incident', name: 'Report New Incident', icon: FileText, path: '/incidents/new' },
    ];
    
    if (role === 'imc' || role === 'head_management' || role === 'system_admin') {
      base.push({ id: 'employees', name: 'Search Employee Directory', icon: Users, path: '/employees' });
    }
    if (role === 'system_admin') {
      base.push({ id: 'settings', name: 'System Settings', icon: Settings, path: '/admin/settings' });
    }
    
    return base;
  };

  const commands = getCommands().filter(c => 
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[101] flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="w-full max-w-2xl bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden pointer-events-auto flex flex-col"
            >
              <div className="flex items-center px-4 py-4 border-b border-slate-100">
                <Search className="w-5 h-5 text-slate-400 mr-3" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search incidents, employees, or actions... (Try 'new')"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-slate-800 text-lg placeholder:text-slate-400"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded">ESC</span>
                  <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {commands.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No matching commands found. Press Enter to search globally for "{query}".
                  </div>
                ) : (
                  commands.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelect(cmd.path)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 transition-colors text-left group"
                    >
                      <cmd.icon className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      <span className="font-medium">{cmd.name}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="bg-slate-50/50 px-4 py-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                <span>Tip: Use <kbd className="font-sans font-semibold border border-slate-200 bg-white px-1.5 py-0.5 rounded shadow-sm">↑</kbd> <kbd className="font-sans font-semibold border border-slate-200 bg-white px-1.5 py-0.5 rounded shadow-sm">↓</kbd> to navigate</span>
                <span>JPHRC Command Palette</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
