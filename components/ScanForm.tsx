'use client';

// ─── Scan Form: Add repos & trigger scans ──────────────────

import { useState, useRef } from 'react';

interface ScanFormProps {
  onRepoAdded: () => void;
}

export default function ScanForm({ onRepoAdded }: ScanFormProps) {
  const [mode, setMode] = useState<'local' | 'github-public' | 'github-private'>('local');
  const [name, setName] = useState('');
  const [pathOrUrl, setPathOrUrl] = useState('');
  const [token, setToken] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);

  function handleBrowseFolder() {
    folderInputRef.current?.click();
  }

  function handleFolderSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Extract folder path from the first file's webkitRelativePath
    // e.g. "my-project/src/app.ts" -> folder name is "my-project"
    const firstPath = files[0].webkitRelativePath || files[0].name;
    const folderName = firstPath.split('/')[0] || '';

    // Try to reconstruct the path - webkitRelativePath gives us the folder name
    // but not the absolute path. Populate what we can, user can edit.
    if (folderName && folderName !== files[0].name) {
      // We got a meaningful folder name - populate a best-guess path
      setPathOrUrl(`~/projects/${folderName}`);
    } else if (folderName) {
      setPathOrUrl(`~/projects/${folderName}`);
    }

    // Reset the input so the same folder can be re-selected
    e.target.value = '';
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || pathOrUrl.split('/').pop()?.replace('.git', '') || 'Untitled',
          type: mode,
          path_or_url: mode === 'local' ? pathOrUrl : (pathOrUrl.startsWith('http') ? pathOrUrl : `https://github.com/${pathOrUrl}`),
          github_token: mode === 'github-private' ? token : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add repo');
      }

      const { id } = await res.json();

      // Auto-trigger scan
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: id }),
      });

      const scanData = await scanRes.json();

      if (!scanRes.ok || scanData.status === 'failed') {
        throw new Error(scanData.error || scanData.message || 'Failed to scan');
      }

      setName('');
      setPathOrUrl('');
      setToken('');
      onRepoAdded();

      // For GitHub repos, scan completes synchronously — show result
      if (scanData.status === 'completed') {
        // Success! The page will auto-update via polling
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#141416] border border-[#2a2a30] rounded-xl p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">Scan a Codebase</h2>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 bg-[#1a1a1e] rounded-lg p-1 inline-flex">
        {(['local', 'github-public', 'github-private'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              background: mode === m ? '#2a2a30' : 'transparent',
              color: mode === m ? '#e4e4e7' : '#71717a',
            }}
          >
            {m === 'local' && '📁 Local'}
            {m === 'github-public' && '🌐 Public Repo'}
            {m === 'github-private' && '🔒 Private Repo'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'local' ? (
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Folder Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pathOrUrl}
                onChange={(e) => setPathOrUrl(e.target.value)}
                placeholder="/Users/you/projects/my-app"
                className="flex-1 bg-[#1a1a1e] border border-[#333] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
                required
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="px-4 py-2.5 rounded-lg text-sm font-medium bg-[#1a1a1e] border border-[#333] text-[var(--text-secondary)] hover:border-[#3b82f666] hover:text-[var(--text)] transition-colors whitespace-nowrap"
              >
                📂 Browse
              </button>
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is well-supported in Chromium/Safari
                webkitdirectory=""
                directory=""
                onChange={handleFolderSelected}
                className="hidden"
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Paste the absolute path or click Browse to pick a folder. Then edit the path to be the full absolute path.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Repository URL</label>
              <input
                type="text"
                value={pathOrUrl}
                onChange={(e) => setPathOrUrl(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
                className="w-full bg-[#1a1a1e] border border-[#333] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
                required
              />
            </div>

            {mode === 'github-private' && (
              <>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">GitHub Personal Access Token</label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full bg-[#1a1a1e] border border-[#333] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
                    required
                  />
                </div>

                <div className="bg-[#1a1a1e] border border-[#2a2a30] rounded-lg p-4 text-xs space-y-2">
                  <p className="font-medium text-[var(--text-secondary)]">🔒 How to create a GitHub Personal Access Token:</p>
                  <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)]">
                    <li>Go to <strong>GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong></li>
                    <li>Or visit: <span className="text-[#3b82f6]">https://github.com/settings/tokens?type=beta</span></li>
                    <li>Click <strong>"Generate new token"</strong></li>
                    <li>Select your repository under <strong>"Repository access"</strong> → <strong>"Only select repositories"</strong></li>
                    <li>Under <strong>Permissions</strong> → <strong>Repository permissions</strong>:</li>
                    <li>Set <strong>Contents</strong> to <strong>"Read-only"</strong></li>
                    <li>Set <strong>Metadata</strong> to <strong>"Read-only"</strong> (auto-selected)</li>
                    <li>Click <strong>"Generate token"</strong> and copy it here</li>
                  </ol>
                  <p className="text-[var(--text-muted)] mt-2 border-t border-[#2a2a30] pt-2">
                    ℹ️ TechDebtTag only needs <strong>read-only</strong> access to your code. It never writes or modifies anything.
                  </p>
                </div>
              </>
            )}

            {mode === 'github-public' && (
              <p className="text-xs text-[var(--text-muted)]">
                No authentication needed for public repositories. Rate limit: 60 requests/hour.
              </p>
            )}
          </div>
        )}

        {mode !== 'local' && (
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Display Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full bg-[#1a1a1e] border border-[#333] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: loading ? '#1e3a8a' : '#2563eb',
            color: '#fff',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '⏳ Scanning...' : '🚀 Scan Now'}
        </button>
      </form>
    </div>
  );
}
