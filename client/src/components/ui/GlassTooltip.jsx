import React from 'react';

export const GlassTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/80 backdrop-blur-md border border-white/40 p-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <p className="text-xs font-bold text-slate-800 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-xs font-medium" style={{ color: entry.color || entry.fill }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};
