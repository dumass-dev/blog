import React, { useState } from 'react';
import { Cloud, Database, HardDrive, RotateCw, ChevronDown, ChevronUp } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i >= 3 ? 2 : 1)) + ' ' + sizes[i];
}

export default function StorageUsageCard({ storageData, refreshing, onRefresh }) {
  const [isOpen, setIsOpen] = useState(false);

  // Defaults if data still loading or offline
  const b2 = storageData?.b2 || {
    totalAllocatedBytes: 30 * 1024 * 1024 * 1024,
    usedBytes: 0,
    percentUsed: 0,
    fileCount: 0
  };

  const supa = storageData?.supabase || {
    totalAllocatedBytes: 500 * 1024 * 1024,
    usedBytes: 0,
    percentUsed: 0,
    breakdown: {
      entriesCount: 0
    }
  };

  const b2Allocated = b2.totalAllocatedBytes || 30 * 1024 * 1024 * 1024;
  const supaAllocated = supa.totalAllocatedBytes || 500 * 1024 * 1024;
  const totalAllocated = b2Allocated + supaAllocated;

  const b2Used = b2.usedBytes || 0;
  const supaUsed = supa.usedBytes || 0;
  const totalUsed = b2Used + supaUsed;
  const totalFree = Math.max(0, totalAllocated - totalUsed);

  const b2Percent = (b2Used / b2Allocated) * 100;
  const supaPercent = (supaUsed / supaAllocated) * 100;
  const totalPercent = (totalUsed / totalAllocated) * 100;

  // Visual bar widths with slight minimum so tiny usage is visible on graph
  const b2BarWidth = b2Used > 0 ? Math.max(1, Math.min(100, b2Percent)) : 0;
  const supaBarWidth = supaUsed > 0 ? Math.max(1, Math.min(100, supaPercent)) : 0;

  // Graph proportions across total capacity
  const b2GraphWidth = totalAllocated > 0 ? (b2Used / totalAllocated) * 100 : 0;
  const supaGraphWidth = totalAllocated > 0 ? (supaUsed / totalAllocated) * 100 : 0;

  return (
    <div className="mb-6 border border-[var(--border-subtle)] rounded-lg bg-[var(--card-bg)] overflow-hidden transition-all duration-200">
      {/* Dropdown Toggle Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(prev => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(prev => !prev);
          }
        }}
        className="w-full p-3 sm:px-4 sm:py-3 flex items-center justify-between text-left hover:bg-[var(--code-bg)]/40 transition-colors cursor-pointer select-none"
      >
        {/* Left: Icon + Title + Real Summary */}
        <div className="flex items-center gap-2.5 min-w-0">
          <HardDrive className="w-4 h-4 text-[var(--accent-warm)] shrink-0" />
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-medium text-[var(--text-primary)]">
              Storage & Cloud
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              ({formatBytes(totalUsed)} of {formatBytes(totalAllocated)} used)
            </span>
          </div>
        </div>

        {/* Right: Refresh button + Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh?.();
            }}
            disabled={refreshing}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-bg)] cursor-pointer transition-colors"
            title="Refresh storage stats"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <span className="text-[var(--text-muted)]">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </div>

      {/* Expanded Content: Visual Graphs & Clean Breakdown */}
      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-[var(--border-subtle)] bg-[var(--code-bg)]/20 animate-fadeIn">
          {/* Main Visual Storage Distribution Graph */}
          <div className="mb-5 pb-5 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-xs mb-2 font-sans">
              <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                <span>Total Usage:</span>
                <span className="font-mono text-[var(--accent-warm)]">{formatBytes(totalUsed)}</span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  ({totalPercent < 0.01 && totalUsed > 0 ? '< 0.01%' : `${totalPercent.toFixed(2)}%`})
                </span>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {formatBytes(totalFree)} free
              </span>
            </div>

            {/* Segmented Horizontal Graph Bar */}
            <div className="w-full h-3 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] overflow-hidden flex items-center p-0.5">
              {b2Used > 0 && (
                <div
                  className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
                  style={{ width: `${Math.max(1.5, b2GraphWidth)}%` }}
                  title={`Media (B2): ${formatBytes(b2Used)}`}
                />
              )}
              {supaUsed > 0 && (
                <div
                  className="h-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.max(1, supaGraphWidth)}%` }}
                  title={`Database: ${formatBytes(supaUsed)}`}
                />
              )}
            </div>

            {/* Clean Legend */}
            <div className="flex items-center gap-4 mt-2.5 text-[11px] font-sans text-[var(--text-secondary)] flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>Media ({formatBytes(b2Used)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <span>Database ({formatBytes(supaUsed)})</span>
              </div>
              <div className="flex items-center gap-1.5 sm:ml-auto text-[var(--text-muted)]">
                <span className="w-2 h-2 rounded-full bg-[var(--border-subtle)] shrink-0" />
                <span>Free ({formatBytes(totalFree)})</span>
              </div>
            </div>
          </div>

          {/* Clean 2-Card Visual Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Media Storage */}
            <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-[var(--text-primary)]">Media Storage</span>
                </div>
                <div className="text-right font-mono text-xs">
                  <span className="font-medium text-[var(--text-primary)]">{formatBytes(b2Used)}</span>
                  <span className="text-[var(--text-muted)]"> / 30 GB</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] overflow-hidden my-2">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${b2BarWidth}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                <span>{b2.fileCount || 0} media files</span>
                <span>{formatBytes(Math.max(0, b2Allocated - b2Used))} free</span>
              </div>
            </div>

            {/* Card 2: Database Storage */}
            <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-500" />
                  <span className="text-xs font-medium text-[var(--text-primary)]">Database</span>
                </div>
                <div className="text-right font-mono text-xs">
                  <span className="font-medium text-[var(--text-primary)]">{formatBytes(supaUsed)}</span>
                  <span className="text-[var(--text-muted)]"> / 500 MB</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] overflow-hidden my-2">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${supaBarWidth}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                <span>{supa.breakdown?.entriesCount || 0} written entries</span>
                <span>{formatBytes(Math.max(0, supaAllocated - supaUsed))} free</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
