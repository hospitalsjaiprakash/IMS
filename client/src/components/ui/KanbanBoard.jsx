import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Paperclip, Flame } from 'lucide-react';
import { getStatusClass, getStatusLabel, timeAgo } from '../../utils/helpers';

function SortableItem({ id, incident, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(incident)}
      className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow-md transition-shadow relative"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-mono text-xs font-bold text-slate-700">{incident.reference_id}</span>
        <span className={getStatusClass(incident.status)}>{getStatusLabel(incident.status)}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-2 leading-snug">
        {incident.departments?.[0] || 'Unknown Dept'}
      </p>

      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span className="truncate max-w-[120px]">{timeAgo(incident.created_at)}</span>
        <div className="flex gap-1.5">
          {incident.attachments && incident.attachments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] bg-slate-100 px-1 rounded">
              <Paperclip size={10} /> {incident.attachments.length}
            </span>
          )}
          {incident.priority_escalated_by && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 px-1 rounded">
              <Flame size={10} /> Esc
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({ id, title, incidents, onIncidentClick }) {
  return (
    <div className="flex flex-col bg-slate-50/80 rounded-2xl p-3 border border-slate-100 min-w-[280px] w-1/4 max-h-[70vh]">
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{title}</h3>
        <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{incidents.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-1 pb-4">
        <SortableContext items={incidents.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3 min-h-[150px]">
            {incidents.map((inc) => (
              <SortableItem key={inc.id} id={inc.id} incident={inc} onClick={onIncidentClick} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export function KanbanBoard({ columns, incidents, onDragEnd, onIncidentClick }) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // Allows clicking without triggering drag
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 -mx-2 items-start">
        {columns.map(col => {
          const colIncidents = incidents.filter(inc => col.statusIds.includes(inc.status));
          return (
            <Column
              key={col.id}
              id={col.id}
              title={col.title}
              incidents={colIncidents}
              onIncidentClick={onIncidentClick}
            />
          );
        })}
      </div>
    </DndContext>
  );
}
