'use client';

// ─── Main Dashboard Page ───────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import ScanForm from '@/components/ScanForm';
import RepoList from '@/components/RepoList';
import ResultsTable from '@/components/ResultsTable';
import TagManager from '@/components/TagManager';
import StatsCards from '@/components/StatsCards';
import type { Repo, RepoStats } from '@/server/types';

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [findingsCount, setFindingsCount] = useState(0);

  const loadRepos = useCallback(async () => {
    try {
      const res = await fetch('/api/repos');
      const data = await res.json();
      const repoList = Array.isArray(data) ? data : [];
      setRepos(repoList);

      // Auto-select first repo if none selected
      if (!selectedRepoId && repoList.length > 0) {
        setSelectedRepoId(repoList[0].id);
      }
    } catch {
      setRepos([]);
    }
  }, [selectedRepoId]);

  const loadStats = useCallback(async () => {
    if (!selectedRepoId) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/stats?repo_id=${selectedRepoId}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setStats(null);
      }
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [selectedRepoId]);

  useEffect(() => {
    loadRepos();
  }, []);

  useEffect(() => {
    loadStats();
    // Poll for updates when scan is running
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Poll repos list too (to pick up new repos after scan)
  useEffect(() => {
    const interval = setInterval(loadRepos, 5000);
    return () => clearInterval(interval);
  }, [loadRepos]);

  async function handleCheckCommits() {
    if (!selectedRepoId) return;
    const repo = Array.isArray(repos) ? repos.find((r) => r.id === selectedRepoId) : undefined;
    if (!repo || repo.type === 'local') return;

    try {
      const res = await fetch('/api/check-commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: selectedRepoId }),
      });
      const data = await res.json();

      if (data.hasNew) {
        // Trigger re-scan
        await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo_id: selectedRepoId }),
        });
        alert(`New commits detected on ${repo.name}. Re-scan started!`);
      } else {
        alert(`No new commits on ${repo.name}.`);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to check commits');
    }
  }

  return (
    <div>
      {/* Scan Form */}
      <ScanForm onRepoAdded={() => { loadRepos(); loadStats(); }} />

      {/* Repo List + Actions */}
      <RepoList
        repos={repos}
        selectedRepoId={selectedRepoId}
        onSelectRepo={(id) => setSelectedRepoId(id)}
        onReposChanged={loadRepos}
      />

      {/* Action bar */}
      {selectedRepoId && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_id: selectedRepoId }),
              }).then(() => {
                loadStats();
                setFindingsCount(0);
              });
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            🔄 Re-scan
          </button>

          {Array.isArray(repos) && repos.find((r) => r.id === selectedRepoId)?.type !== 'local' && (
            <button
              onClick={handleCheckCommits}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#141416] border border-[#2a2a30] text-[var(--text-secondary)] hover:border-[#3b82f666] transition-colors"
            >
              🔍 Check for New Commits
            </button>
          )}

          <button
            onClick={() => setTagManagerOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#141416] border border-[#2a2a30] text-[var(--text-secondary)] hover:border-[#3b82f666] transition-colors"
          >
            🏷️ Manage Tags
          </button>

          <div className="ml-auto text-xs text-[var(--text-muted)]">
            {findingsCount > 0 && `${findingsCount} open debt items`}
          </div>
        </div>
      )}

      {/* Stats */}
      <StatsCards stats={stats} loading={statsLoading} />

      {/* Results */}
      <ResultsTable
        repoId={selectedRepoId}
        onFindingsCount={setFindingsCount}
      />

      {/* Tag Manager Modal */}
      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        onTagsChanged={() => { loadStats(); }}
      />
    </div>
  );
}
