import React, { useState } from 'react';
import { Cloud, Database, HardDrive, RotateCw, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i >= 3 ? 2 : 1)) + ' ' + sizes[i];
}

export default function StorageUsageCard({ storageData, refreshing, onRefresh }) {
  const [showDetails, setShowDetails] = useState(false);

  // Defaults if data still loading or offline
  const b2 = storageData?.b2 || {
    totalAllocatedBytes: 30 * 1024 * 1024 * 1024,
    usedBytes: 0,
    percentUsed: 0,
    fileCount: 0,
    vaults: [
      { id: 'media1', name: 'Pool 1 (q04ti-media-1)', bucket: 'q04ti-media-1', allocatedBytes: 10 * 1024 * 1024 * 1024, usedBytes: 0 },
      { id: 'media2', name: 'Pool 2 (q04ti-media-2)', bucket: 'q04ti-media-2', allocatedBytes: 10 * 1024 * 1024 * 1024, usedBytes: 0 },
      { id: 'journal', name: 'Vault 3 (q04ti-blog)', bucket: 'q04ti-blog', allocatedBytes: 10 * 1024 * 1024 * 1024, usedBytes: 0 }
    ]
  };

  const supa = storageData?.supabase || {
    totalAllocatedBytes: 500 * 1024 * 1024,
    usedBytes: 0,
    percentUsed: 0,
    breakdown: {
      entriesCount: 0,
      journalCount: 0,
      writingCount: 0,
      photoCount: 0,
      updateCount: 0,
      entriesBytes: 0,
      commentsCount: 0,
      commentsBytes: 0,
      mediaRowsCount: 0
    }
  };

  // Safe visual percentage widths (min 0.5% so tiny amounts are visible)
  const b2BarWidth = b2.usedBytes > 0 ? Math.max(0.6, Math.min(100, b2.percentUsed)) : 0;
  const supaBarWidth = supa.usedBytes > 0 ? Math.max(0.6, Math.min(100, supa.percentUsed)) : 0;

  return (
    <div className="mb-8 border border-[var(--border-subtle)] rounded-lg bg-[var(--card-bg)] overflow-hidden shadow-sm transition-all duration-200">
      {/* Top Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--code-bg)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[var(--accent-warm)]" />
          <h2 className="text-xs font-mono font-medium uppercase tracking-wider text-[var(--text-primary)]">
            Storage & Cloud Allocation
          </h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            30.5 GB Unified Total
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="text-[11px] font-sans text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[var(--card-bg)] cursor-pointer transition-colors"
            title="Update storage meters with latest cloud usage"
          >
            <RotateCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Updating...' : 'Sync'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDetails(prev => !prev)}
            className="text-[11px] font-sans text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--card-bg)] cursor-pointer transition-colors"
          >
            <span>{showDetails ? 'Hide Details' : 'Details'}</span>
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Main Grid: 2 Storage Meters */}
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-5 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
        {/* Meter 1: Backblaze B2 (30 GB) */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)]">
                  <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>Backblaze B2 Cloud</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                      30 GB Multi-Vault
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Photos, GIFs, Videos & Media Assets
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono font-medium text-[var(--text-primary)]">
                  {formatBytes(b2.usedBytes)}
                </span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]"> / 30 GB</span>
              </div>
            </div>

            {/* Progress Bar with 3-Vault Indicators */}
            <div className="relative my-3">
              <div className="w-full h-2.5 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${b2BarWidth}%` }}
                />
              </div>
              {/* Visual Vault Segment Markers at 33.3% and 66.6% */}
              <div className="absolute inset-y-0 left-1/3 w-[1px] bg-[var(--border-subtle)] pointer-events-none" />
              <div className="absolute inset-y-0 left-2/3 w-[1px] bg-[var(--border-subtle)] pointer-events-none" />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] mb-3">
              <span>{b2.fileCount} uploaded files</span>
              <span>{b2.percentUsed < 0.01 && b2.usedBytes > 0 ? '< 0.01%' : `${b2.percentUsed}%`} used</span>
              <span>{formatBytes(Math.max(0, b2.totalAllocatedBytes - b2.usedBytes))} free</span>
            </div>
          </div>

          {/* Quick Vault Status Badges */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2 flex-wrap text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Pool 1 (q04ti-media-1): Active</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Auto-Spillover: Ready</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>24h Keepalive (No Sleep)</span>
            </span>
          </div>
        </div>

        {/* Meter 2: Supabase Database (500 MB) */}
        <div className="flex flex-col justify-between pt-4 md:pt-0 md:pl-5">
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)]">
                  <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>Supabase Database</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium border border-sky-500/20">
                      500 MB Tier
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Journals, Essays, Notes & Comments Text
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono font-medium text-[var(--text-primary)]">
                  {formatBytes(supa.usedBytes)}
                </span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]"> / 500 MB</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative my-3">
              <div className="w-full h-2.5 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${supaBarWidth}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] mb-3">
              <span>{supa.breakdown?.entriesCount || 0} written entries</span>
              <span>{supa.percentUsed < 0.01 && supa.usedBytes > 0 ? '< 0.01%' : `${supa.percentUsed}%`} used</span>
              <span>{formatBytes(Math.max(0, supa.totalAllocatedBytes - supa.usedBytes))} free</span>
            </div>
          </div>

          {/* Quick Database Badges */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2 flex-wrap text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <CheckCircle2 className="w-3 h-3 text-sky-500" />
              <span>{supa.breakdown?.commentsCount || 0} Reader Comments</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <span>{supa.breakdown?.mediaRowsCount || 0} Media Index Rows</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
              Zero Media Bloat
            </span>
          </div>
        </div>
      </div>

      {/* Collapsible Details Drawer */}
      {showDetails && (
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--code-bg)]/50 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {b2.vaults?.map((vault, idx) => (
              <div key={vault.id} className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-[var(--text-primary)]">Account {idx + 1}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    idx === 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'bg-[var(--code-bg)] text-[var(--text-muted)]'
                  }`}>
                    {idx === 0 ? 'Primary Active' : 'Overflow Standby'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mb-1">
                  Bucket: {vault.bucket}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                  <span>Usage: {formatBytes(vault.usedBytes || 0)}</span>
                  <span>Cap: 10 GB</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
            <span>
              All written journals, essays, and comments remain in Supabase text tables. All binary media (photos, GIFs, videos) is offloaded to Backblaze.
            </span>
            <span className="font-mono whitespace-nowrap text-[var(--text-secondary)]">
              Threshold: 9.5 GB per vault
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
