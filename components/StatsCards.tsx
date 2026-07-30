'use client';

// ─── Stats Cards ───────────────────────────────────────────

import type { RepoStats } from '@/server/types';

export default function StatsCards({ stats, loading }: { stats: RepoStats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-[#2a2a30] rounded w-16 mb-2" />
            <div className="h-8 bg-[#2a2a30] rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'Open Debt Items', value: stats.totalOpen, color: '#f59e0b' },
    { label: 'Resolved', value: stats.totalResolved, color: '#22c55e' },
    { label: 'Scan Status', value: stats.latestScan?.status || 'none', color: stats.latestScan?.status === 'failed' ? '#ef4444' : stats.latestScan?.status === 'running' ? '#f59e0b' : '#22c55e' },
    { label: 'Last Scan', value: stats.latestScan ? formatDate(stats.latestScan.completed_at || stats.latestScan.started_at) : 'Never', color: '#8b5cf6' },
  ];

  const scanError = stats.latestScan?.error_message;

  return (
    <>
      {scanError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 mt-0.5">⚠️</span>
            <div>
              <div className="text-sm font-medium text-red-400">Last scan failed</div>
              <div className="text-xs text-red-400/70 mt-1 font-mono">{scanError}</div>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4">
            <div className="text-xs text-[var(--text-muted)] mb-1">{card.label}</div>
            <div className="text-2xl font-bold" style={{ color: card.color }}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : String(card.value)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
