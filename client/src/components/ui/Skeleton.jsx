import React from 'react';

export function Skeleton({ className = '', style = {} }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 rounded-md ${className}`}
      style={style}
    ></div>
  );
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
