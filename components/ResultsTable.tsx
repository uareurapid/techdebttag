'use client';

// ─── Results Table: Grouped findings with code excerpts ─────

import { useState, useEffect, useMemo } from 'react';
import TagPill from './TagPill';
import PriorityBadge from './PriorityBadge';

interface Finding {
  id: number;
  tag: string;
  file_path: string;
  line_number: number;
  excerpt_before: string;
  excerpt_line: string;
  excerpt_after: string;
  priority: string;
  resolved: number;
  repo_name: string;
  repo_type: string;
  repo_url: string;
  created_at: string;
}

interface ResultsTableProps {
  repoId: number | null;
  onFindingsCount?: (count: number) => void;
}

export default function ResultsTable({ repoId, onFindingsCount }: ResultsTableProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!repoId) return;
    loadFindings();
  }, [repoId]);

  async function loadFindings() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (repoId) params.set('repo_id', String(repoId));
      if (filterTag) params.set('tag', filterTag);
      if (filterPriority) params.set('priority', filterPriority);
      if (search) params.set('search', search);
      params.set('resolved', 'false');
      params.set('limit', '500');

      const res = await fetch(`/api/findings?${params}`);
      const data = await res.json();
      setFindings(data.findings || []);
      onFindingsCount?.(data.total || 0);
    } finally {
      setLoading(false);
    }
  }

  // Debounce search
  useEffect(() => {
    if (!repoId) return;
    const t = setTimeout(loadFindings, 300);
    return () => clearTimeout(t);
  }, [filterTag, filterPriority, search]);

  async function handleResolve(id: number) {
    await fetch('/api/findings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', id }),
    });
    setFindings((prev) => prev.filter((f) => f.id !== id));
  }

  async function handlePriorityChange(id: number, priority: string) {
    await fetch('/api/findings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'priority', id, priority }),
    });
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, priority } : f)));
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group by tag
  const grouped = useMemo(() => {
    const groups: Record<string, Finding[]> = {};
    for (const f of findings) {
      if (!groups[f.tag]) groups[f.tag] = [];
      groups[f.tag].push(f);
    }
    // Sort groups by count descending
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [findings]);

  // Get unique tags and priorities for filters
  const tags = useMemo(() => [...new Set(findings.map((f) => f.tag))].sort(), [findings]);
  const priorities = useMemo(() => [...new Set(findings.map((f) => f.priority))].sort(), [findings]);

  if (!repoId) return null;

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 flex-wrap">
          <TagPill
            tag="ALL"
            count={findings.length}
            active={!filterTag}
            onClick={() => setFilterTag(null)}
          />
          {tags.map((tag) => (
            <TagPill
              key={tag}
              tag={tag}
              count={findings.filter((f) => f.tag === tag).length}
              active={filterTag === tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            />
          ))}
        </div>

        <div className="border-l border-[#2a2a30] h-6 hidden sm:block" />

        <select
          value={filterPriority || ''}
          onChange={(e) => setFilterPriority(e.target.value || null)}
          className="bg-[#1a1a1e] border border-[#333] rounded-lg px-3 py-1.5 text-xs focus:outline-none text-[var(--text-secondary)]"
        >
          <option value="">All Priorities</option>
          {(['critical', 'high', 'medium', 'low', 'info'] as const).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search files or code..."
          className="flex-1 min-w-[200px] bg-[#1a1a1e] border border-[#333] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3b82f6]"
        />

        <a
          href={`/api/findings?repo_id=${repoId}&format=csv&limit=10000`}
          download="techdebt-export.csv"
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a1e] border border-[#333] text-[var(--text-secondary)] hover:border-[#3b82f666] transition-colors whitespace-nowrap"
        >
          📥 Export CSV
        </a>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-[var(--text-muted)] animate-pulse-dot">
          Scanning...
        </div>
      )}

      {/* Empty state */}
      {!loading && findings.length === 0 && (
        <div className="text-center py-16 bg-[#141416] border border-[#2a2a30] rounded-xl">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-lg font-medium mb-1">No tech debt found!</div>
          <div className="text-sm text-[var(--text-muted)]">This codebase is clean — or maybe you need to enable more tags.</div>
        </div>
      )}

      {/* Grouped results */}
      {!loading &&
        grouped.map(([tag, items]) => (
          <div key={tag} className="mb-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-base font-semibold">
                <TagPill tag={tag} />
              </h3>
              <span className="text-xs text-[var(--text-muted)]">{items.length} item{items.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-2">
              {items.map((finding) => {
                const isExpanded = expanded.has(finding.id);
                const linesBefore = finding.excerpt_before ? finding.excerpt_before.split('\n') : [];
                const linesAfter = finding.excerpt_after ? finding.excerpt_after.split('\n') : [];
                const startLine = finding.line_number - linesBefore.length;

                return (
                  <div
                    key={finding.id}
                    className="bg-[#141416] border border-[#2a2a30] rounded-lg overflow-hidden hover:border-[#3b82f633] transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a1e]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-mono text-[#60a5fa] truncate max-w-[400px]" title={finding.file_path}>
                          {finding.file_path}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">:{finding.line_number}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={finding.priority}
                          onChange={(e) => handlePriorityChange(finding.id, e.target.value)}
                          className="bg-[#0a0a0b] border border-[#333] rounded-md px-2 py-0.5 text-[10px] focus:outline-none cursor-pointer"
                        >
                          {(['critical', 'high', 'medium', 'low', 'info'] as const).map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <PriorityBadge priority={finding.priority as any} />
                        <button
                          onClick={() => handleResolve(finding.id)}
                          className="text-xs px-2 py-1 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                          title="Mark as resolved"
                        >
                          ✓ Resolve
                        </button>
                      </div>
                    </div>

                    {/* Code excerpt (collapsed preview) */}
                    <div
                      className="code-block cursor-pointer"
                      onClick={() => toggleExpand(finding.id)}
                    >
                      {!isExpanded ? (
                        <div className="p-3">
                          <div className="line highlight">
                            <span className="line-number">{finding.line_number}</span>
                            <span className="line-content text-[#e4e4e7]">{finding.excerpt_line}</span>
                          </div>
                          <div className="text-xs text-[var(--text-muted)] mt-1 ml-12">
                            Click to expand context ({linesBefore.length} lines before, {linesAfter.length} after)
                          </div>
                        </div>
                      ) : (
                        <div className="p-3">
                          {linesBefore.map((line, i) => (
                            <div key={i} className="line">
                              <span className="line-number">{startLine + i}</span>
                              <span className="line-content text-[#71717a]">{line}</span>
                            </div>
                          ))}
                          <div className="line highlight">
                            <span className="line-number">{finding.line_number}</span>
                            <span className="line-content text-[#e4e4e7]">{finding.excerpt_line}</span>
                          </div>
                          {linesAfter.map((line, i) => (
                            <div key={i} className="line">
                              <span className="line-number">{finding.line_number + i + 1}</span>
                              <span className="line-content text-[#71717a]">{line}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
