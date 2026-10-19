import React, { useState, useMemo } from 'react';
import EventCard from './EventCard';
import {
  ListFilter,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  Bell,
  Sparkles,
  ShieldAlert
} from 'lucide-react';

export default function CaseStoryFeed({
  events = [],
  incident,
  onViewAttachment
}) {
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'decisions' | 'investigation' | 'corrective'
  const [showSystemActivity, setShowSystemActivity] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedMap, setExpandedMap] = useState({});

  // Filter events based on active tab, system toggle, and search query
  const filteredEvents = useMemo(() => {
    let list = Array.isArray(events) ? [...events] : [];

    // Filter by System Activity toggle
    if (!showSystemActivity) {
      list = list.filter(e => !e.is_system_event);
    }

    // Filter by workflow tab
    if (filterMode === 'decisions') {
      list = list.filter(e => [
        'IMC_ASSESSMENT_SUBMITTED',
        'MGMT_DECISION_AGREED',
        'MGMT_DECISION_MODIFIED',
        'MGMT_RETURNED_FOR_REINVESTIGATION',
        'LETTERS_APPROVED_DISPATCHED',
        'INCIDENT_CLOSED',
        'MGMT_TRAINING_CLOSED',
        'REDIRECT_APPROVED',
        'REDIRECT_REJECTED'
      ].includes(e.event_type));
    } else if (filterMode === 'investigation') {
      list = list.filter(e => [
        'INVESTIGATION_PANEL_ASSIGNED',
        'INVESTIGATION_REPORT_SUBMITTED',
        'INVESTIGATION_RETURNED',
        'HOD_FEEDBACK_SUBMITTED',
        'DEPARTMENTS_INVOLVED'
      ].includes(e.event_type));
    } else if (filterMode === 'corrective') {
      list = list.filter(e => [
        'TRAINER_ASSIGNED',
        'TRAINING_REPORT_SUBMITTED',
        'TRAINING_REWORK_REQUESTED',
        'TRAINING_VERIFIED_BY_IMC',
        'EMPLOYEE_TRAINING_VERIFIED',
        'LETTER_DRAFTED',
        'LETTER_REVISED',
        'LETTERS_SUBMITTED_TO_MGMT',
        'LETTERS_RETURNED_FOR_REVISION',
        'LETTERS_APPROVED_DISPATCHED'
      ].includes(e.event_type));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => {
        const titleMatch = (e.title || '').toLowerCase().includes(q);
        const actorMatch = (e.actor_name || '').toLowerCase().includes(q);
        const summaryMatch = (e.summary || '').toLowerCase().includes(q);
        const payloadStr = JSON.stringify(e.payload || {}).toLowerCase();
        return titleMatch || actorMatch || summaryMatch || payloadStr.includes(q);
      });
    }

    return list;
  }, [events, filterMode, showSystemActivity, searchQuery]);

  const toggleExpand = (eventId) => {
    setExpandedMap(prev => {
      const current = prev[eventId] !== undefined ? prev[eventId] : allExpanded;
      return { ...prev, [eventId]: !current };
    });
  };

  const handleToggleAll = () => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    const reset = {};
    events.forEach(e => {
      reset[e.id] = nextState;
    });
    setExpandedMap(reset);
  };

  const systemEventsCount = useMemo(() => {
    return (events || []).filter(e => e.is_system_event).length;
  }, [events]);

  return (
    <div className="space-y-2.5">
      {/* CASE STORY HEADER CARD */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 sm:p-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
                <History size={14} />
              </div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Case Chronological Story
              </h2>
              <span className="px-2 py-0.2 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {events.length} {events.length === 1 ? 'Event' : 'Events'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 pl-8">
              Chronological ledger of every submission, investigation, and management action.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            {/* System activity toggle */}
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={showSystemActivity}
                onChange={e => setShowSystemActivity(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3"
              />
              <Bell size={12} className={showSystemActivity ? 'text-indigo-600' : 'text-slate-400'} />
              <span>System Activity</span>
              {systemEventsCount > 0 && (
                <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1 py-0.2 rounded-full">
                  {systemEventsCount}
                </span>
              )}
            </label>

            {/* Expand / Collapse all */}
            <button
              type="button"
              onClick={handleToggleAll}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-1 shadow-2xs transition-colors"
            >
              {allExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
            </button>
          </div>
        </div>

        {/* CONTROLS: FILTER TABS & SEARCH */}
        <div className="pt-2.5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-0.5 sm:pb-0">
            {[
              { key: 'all', label: 'All Story' },
              { key: 'decisions', label: 'Decisions' },
              { key: 'investigation', label: 'Investigation & Dept' },
              { key: 'corrective', label: 'Letters & Training' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterMode(tab.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all ${
                  filterMode === tab.key
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-56 shrink-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search story & findings..."
              className="w-full text-[11px] pl-7 pr-3 py-1 rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CHRONOLOGICAL EVENTS FEED */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-1.5">
          <History size={26} className="text-slate-300 mx-auto" />
          <h3 className="text-xs font-bold text-slate-800">No events matched the selected filter</h3>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Try switching to "All Story" tab or toggling "System Activity".
          </p>
          <button
            type="button"
            onClick={() => {
              setFilterMode('all');
              setSearchQuery('');
              setShowSystemActivity(true);
            }}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors mt-1"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.map((evt, idx) => {
            const isItemExpanded = expandedMap[evt.id] !== undefined ? expandedMap[evt.id] : allExpanded;
            const prevEvt = idx > 0 ? filteredEvents[idx - 1] : null;

            return (
              <EventCard
                key={evt.id || idx}
                event={evt}
                incident={incident}
                index={idx}
                totalEvents={filteredEvents.length}
                prevEvent={prevEvt}
                isExpanded={isItemExpanded}
                onToggleExpand={() => toggleExpand(evt.id)}
                onViewAttachment={onViewAttachment}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
