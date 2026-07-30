'use client';

// ─── Tag Manager Modal ─────────────────────────────────────

import { useState, useEffect } from 'react';
import type { TagConfig } from '@/server/types';
import PriorityBadge from './PriorityBadge';

interface TagManagerProps {
  open: boolean;
  onClose: () => void;
  onTagsChanged: () => void;
}

export default function TagManager({ open, onClose, onTagsChanged }: TagManagerProps) {
  const [tags, setTags] = useState<TagConfig[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) loadTags();
  }, [open]);

  async function loadTags() {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setTags(data);
  }

  async function handleAdd() {
    if (!newTag.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: newTag.trim().toUpperCase(), priority: newPriority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewTag('');
      await loadTags();
      onTagsChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: number, enabled: boolean) {
    await fetch(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await loadTags();
    onTagsChanged();
  }

  async function handlePriority(id: number, priority: string) {
    await fetch(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    await loadTags();
    onTagsChanged();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/tags/${id}`, { method: 'DELETE' });
    await loadTags();
    onTagsChanged();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#141416] border border-[#2a2a30] rounded-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">🏷️ Manage Tags</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-xl leading-none">&times;</button>
        </div>

        {/* Existing tags */}
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">Active Tags</h3>
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center justify-between bg-[#1a1a1e] rounded-lg p-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(tag.id, !tag.enabled)}
                  className="w-9 h-5 rounded-full relative transition-colors"
                  style={{ background: tag.enabled ? '#22c55e' : '#3f3f46' }}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm"
                    style={{ left: tag.enabled ? '18px' : '3px' }}
                  />
                </button>
                <span className="font-mono text-sm font-medium">{tag.tag}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={tag.priority}
                  onChange={(e) => handlePriority(tag.id, e.target.value)}
                  className="bg-[#0a0a0b] border border-[#333] rounded-md px-2 py-1 text-xs focus:outline-none"
                >
                  {(['critical', 'high', 'medium', 'low', 'info'] as const).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleDelete(tag.id)}
                  className="text-[var(--text-muted)] hover:text-red-400 text-sm px-1"
                  title="Delete tag"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add new tag */}
        <div className="border-t border-[#2a2a30] pt-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Add Custom Tag</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. BUG, HACK, XXX"
              className="flex-1 bg-[#1a1a1e] border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6] uppercase"
            />
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="bg-[#1a1a1e] border border-[#333] rounded-lg px-2 py-2 text-xs focus:outline-none"
            >
              {(['critical', 'high', 'medium', 'low', 'info'] as const).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={loading || !newTag.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#2563eb] text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Custom tags let you track domain-specific markers like @BUG, @REVIEW, or @PERF.
            Tags are case-insensitive — &quot;bug&quot; and &quot;BUG&quot; match the same comments.
          </p>
        </div>
      </div>
    </div>
  );
}
