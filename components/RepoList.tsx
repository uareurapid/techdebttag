'use client';

// ─── Repo List: Shows all tracked repos ────────────────────

import { useState, useEffect } from 'react';
import type { Repo } from '@/server/types';

interface RepoListProps {
  repos: Repo[];
  selectedRepoId: number | null;
  onSelectRepo: (id: number) => void;
  onReposChanged: () => void;
}

export default function RepoList({ repos, selectedRepoId, onSelectRepo, onReposChanged }: RepoListProps) {
  const [deleting, setDeleting] = useState<number | null>(null);
  const safeRepos = Array.isArray(repos) ? repos : [];

  async function handleDelete(id: number) {
    if (!confirm('Delete this repo and all its scan data? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await fetch(`/api/repos/${id}`, { method: 'DELETE' });
      onReposChanged();
    } finally {
      setDeleting(null);
    }
  }

  async function handleRescan(id: number) {
    await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: id }),
    });
    onReposChanged();
  }

  if (safeRepos.length === 0) return null;

  const typeIcons: Record<string, string> = {
    local: '📁',
    'github-public': '🌐',
    'github-private': '🔒',
  };

  return (
    <div className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4 mb-6">
      <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Tracked Repositories</h2>
      <div className="flex flex-wrap gap-2">
        {safeRepos.map((repo) => (
          <div
            key={repo.id}
            onClick={() => onSelectRepo(repo.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all group"
            style={{
              background: selectedRepoId === repo.id ? '#1e3a8a33' : '#1a1a1e',
              border: `1px solid ${selectedRepoId === repo.id ? '#3b82f666' : '#333'}`,
            }}
          >
            <span>{typeIcons[repo.type] || '📦'}</span>
            <span className="font-medium truncate max-w-[200px]">{repo.name}</span>
            <span className="text-[10px] text-[var(--text-muted)] bg-[#0a0a0b] px-1.5 py-0.5 rounded">
              {repo.type.replace('github-', '')}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
              <button
                onClick={(e) => { e.stopPropagation(); handleRescan(repo.id); }}
                className="text-xs text-[#3b82f6] hover:text-[#60a5fa] px-1"
                title="Re-scan"
              >
                🔄
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(repo.id); }}
                className="text-xs text-[var(--text-muted)] hover:text-red-400 px-1"
                title="Remove"
              >
                {deleting === repo.id ? '⏳' : '✕'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
