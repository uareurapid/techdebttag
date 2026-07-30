// ─── SQLite Database ────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';
import { encrypt, decrypt } from './crypto';

const DB_PATH = path.join(process.cwd(), 'data', 'techdebttag.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('local','github-public','github-private')),
      path_or_url TEXT NOT NULL,
      github_token TEXT,
      last_commit_sha TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      commit_sha TEXT,
      total_files INTEGER NOT NULL DEFAULT 0,
      total_findings INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed'))
    );

    CREATE INDEX IF NOT EXISTS idx_scans_repo ON scans(repo_id);

    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      excerpt_before TEXT NOT NULL DEFAULT '',
      excerpt_line TEXT NOT NULL DEFAULT '',
      excerpt_after TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
    CREATE INDEX IF NOT EXISTS idx_findings_repo ON findings(repo_id);
    CREATE INDEX IF NOT EXISTS idx_findings_tag ON findings(tag);
    CREATE INDEX IF NOT EXISTS idx_findings_resolved ON findings(resolved);

    CREATE TABLE IF NOT EXISTS tag_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      priority TEXT NOT NULL DEFAULT 'medium',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Default tags seed (only if table is empty)
    INSERT OR IGNORE INTO tag_configs (tag, priority, enabled) VALUES
      ('TODO', 'medium', 1),
      ('FIXME', 'high', 1),
      ('HACK', 'critical', 1),
      ('NOTE', 'info', 1),
      ('OBS', 'low', 1),
      ('DEBT', 'high', 1);
  `);

  // Migrations: add columns that may not exist from older schemas
  try { db.exec("ALTER TABLE repos ADD COLUMN user_id INTEGER DEFAULT NULL"); } catch { /* exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_repos_user ON repos(user_id)`);
}

// ─── Repo queries ──────────────────────────────────────────

export function createRepo(repo: {
  name: string;
  type: 'local' | 'github-public' | 'github-private';
  path_or_url: string;
  github_token?: string;
  user_id?: number;
}) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO repos (name, type, path_or_url, github_token, user_id) VALUES (@name, @type, @path_or_url, @github_token, @user_id)'
  );
  return stmt.run({ ...repo, user_id: repo.user_id ?? null, github_token: repo.github_token ? encrypt(repo.github_token) : null });
}

export function getRepos(userId?: number) {
  const db = getDb();
  let rows: any[];
  if (userId !== undefined) {
    rows = db.prepare('SELECT * FROM repos WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  } else {
    rows = db.prepare('SELECT * FROM repos ORDER BY updated_at DESC').all();
  }
  return rows.map((r: any) => ({ ...r, github_token: r.github_token ? decrypt(r.github_token) : null }));
}

export function getRepo(id: number) {
  const db = getDb();
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(id) as any;
  if (repo && repo.github_token) {
    repo.github_token = decrypt(repo.github_token);
  }
  return repo;
}

export function updateRepoLastCommit(id: number, sha: string) {
  const db = getDb();
  db.prepare('UPDATE repos SET last_commit_sha = ?, updated_at = datetime(\'now\') WHERE id = ?').run(sha, id);
}

export function deleteRepo(id: number) {
  const db = getDb();
  db.prepare('DELETE FROM repos WHERE id = ?').run(id);
}

// ─── Scan queries ──────────────────────────────────────────

export function createScan(repoId: number, commitSha?: string) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO scans (repo_id, commit_sha) VALUES (?, ?)');
  return stmt.run(repoId, commitSha || null);
}

export function completeScan(scanId: number, totalFiles: number, totalFindings: number) {
  const db = getDb();
  db.prepare(
    'UPDATE scans SET total_files = ?, total_findings = ?, status = \'completed\', completed_at = datetime(\'now\') WHERE id = ?'
  ).run(totalFiles, totalFindings, scanId);
}

export function failScan(scanId: number, errorMessage?: string) {
  const db = getDb();
  // Add error_message column if missing
  try { db.exec("ALTER TABLE scans ADD COLUMN error_message TEXT DEFAULT ''"); } catch { /* exists */ }
  db.prepare("UPDATE scans SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?").run(errorMessage || '', scanId);
}

export function getLatestScan(repoId: number) {
  const db = getDb();
  return db.prepare('SELECT * FROM scans WHERE repo_id = ? ORDER BY id DESC LIMIT 1').get(repoId);
}

export function getScans(repoId: number) {
  const db = getDb();
  return db.prepare('SELECT * FROM scans WHERE repo_id = ? ORDER BY id DESC').all(repoId);
}

// ─── Finding queries ───────────────────────────────────────

export function insertFinding(finding: {
  scan_id: number;
  repo_id: number;
  tag: string;
  file_path: string;
  line_number: number;
  excerpt_before: string;
  excerpt_line: string;
  excerpt_after: string;
  priority: string;
}) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO findings (scan_id, repo_id, tag, file_path, line_number, excerpt_before, excerpt_line, excerpt_after, priority)
     VALUES (@scan_id, @repo_id, @tag, @file_path, @line_number, @excerpt_before, @excerpt_line, @excerpt_after, @priority)`
  );
  return stmt.run(finding);
}

export function getFindings(filters: {
  repo_id?: number;
  tag?: string;
  priority?: string;
  resolved?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.repo_id) {
    clauses.push('f.repo_id = @repo_id');
    params.repo_id = filters.repo_id;
  }
  if (filters.tag) {
    clauses.push('f.tag = @tag');
    params.tag = filters.tag;
  }
  if (filters.priority) {
    clauses.push('f.priority = @priority');
    params.priority = filters.priority;
  }
  if (filters.resolved !== undefined) {
    clauses.push('f.resolved = @resolved');
    params.resolved = filters.resolved ? 1 : 0;
  }
  if (filters.search) {
    clauses.push('(f.file_path LIKE @search OR f.excerpt_line LIKE @search)');
    params.search = `%${filters.search}%`;
  }

  const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
  const limit = filters.limit || 200;
  const offset = filters.offset || 0;

  const count = db.prepare(`SELECT COUNT(*) as c FROM findings f ${where}`).get(params) as { c: number };
  const rows = db
    .prepare(`SELECT f.*, r.name as repo_name, r.type as repo_type, r.path_or_url as repo_url
              FROM findings f JOIN repos r ON f.repo_id = r.id
              ${where} ORDER BY f.created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });

  return { findings: rows, total: count.c };
}

export function getFindingsByTag(repoId: number, scanId?: number) {
  const db = getDb();
  if (scanId) {
    return db
      .prepare(
        'SELECT tag, COUNT(*) as count FROM findings WHERE repo_id = ? AND scan_id = ? AND resolved = 0 GROUP BY tag ORDER BY count DESC'
      )
      .all(repoId, scanId);
  }
  return db
    .prepare(
      'SELECT tag, COUNT(*) as count FROM findings WHERE repo_id = ? AND resolved = 0 GROUP BY tag ORDER BY count DESC'
    )
    .all(repoId);
}

export function resolveFinding(id: number, resolved: boolean) {
  const db = getDb();
  db.prepare('UPDATE findings SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
}

export function updateFindingPriority(id: number, priority: string) {
  const db = getDb();
  db.prepare('UPDATE findings SET priority = ? WHERE id = ?').run(priority, id);
}

export function replaceScanFindings(scanId: number, repoId: number, findings: Omit<Parameters<typeof insertFinding>[0], 'scan_id' | 'repo_id'>[]) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO findings (scan_id, repo_id, tag, file_path, line_number, excerpt_before, excerpt_line, excerpt_after, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    // Mark old findings from this repo as resolved if not in new set
    // Actually for simplicity, we mark all previous findings from this repo as resolved
    // and only the new ones are active
    db.prepare('UPDATE findings SET resolved = 1 WHERE repo_id = ? AND resolved = 0').run(repoId);

    for (const f of findings) {
      insert.run(scanId, repoId, f.tag, f.file_path, f.line_number, f.excerpt_before, f.excerpt_line, f.excerpt_after, f.priority);
    }
  });

  tx();
}

// ─── Tag config queries ────────────────────────────────────

export function getTagConfigs() {
  const db = getDb();
  return db.prepare('SELECT * FROM tag_configs ORDER BY tag').all() as import('./types').TagConfig[];
}

export function addTagConfig(tag: string, priority: string) {
  const db = getDb();
  const upperTag = tag.toUpperCase();
  try {
    db.prepare('INSERT INTO tag_configs (tag, priority) VALUES (?, ?)').run(upperTag, priority);
    return { success: true, tag: upperTag };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE')) {
      return { success: false, error: `Tag "${upperTag}" already exists` };
    }
    throw e;
  }
}

export function updateTagConfig(id: number, updates: { priority?: string; enabled?: boolean }) {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.priority) {
    sets.push('priority = ?');
    params.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE tag_configs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function deleteTagConfig(id: number) {
  const db = getDb();
  db.prepare('DELETE FROM tag_configs WHERE id = ?').run(id);
}

// ─── Stats queries ─────────────────────────────────────────

export function getRepoStats(repoId: number) {
  const db = getDb();
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(repoId) as import('./types').Repo | undefined;
  if (!repo) return null;

  // Add error_message column if missing
  try { db.exec("ALTER TABLE scans ADD COLUMN error_message TEXT DEFAULT ''"); } catch { /* exists */ }

  const latestScan = db.prepare('SELECT * FROM scans WHERE repo_id = ? ORDER BY id DESC LIMIT 1').get(repoId) as import('./types').Scan | undefined;

  const findingsByTag = (db
    .prepare('SELECT tag, COUNT(*) as count FROM findings WHERE repo_id = ? AND resolved = 0 GROUP BY tag ORDER BY count DESC')
    .all(repoId) || []) as { tag: string; count: number }[];

  const findingsByPriority = (db
    .prepare('SELECT priority, COUNT(*) as count FROM findings WHERE repo_id = ? AND resolved = 0 GROUP BY priority')
    .all(repoId) || []) as { priority: string; count: number }[];

  const totalOpen = (db.prepare('SELECT COUNT(*) as c FROM findings WHERE repo_id = ? AND resolved = 0').get(repoId) as { c: number }).c;
  const totalResolved = (db.prepare('SELECT COUNT(*) as c FROM findings WHERE repo_id = ? AND resolved = 1').get(repoId) as { c: number }).c;

  const history = db
    .prepare(
      `SELECT date(completed_at) as date, total_findings as total
       FROM scans WHERE repo_id = ? AND status = 'completed'
       ORDER BY completed_at ASC`
    )
    .all(repoId) as { date: string; total: number }[];

  return {
    repo,
    latestScan,
    findingsByTag,
    findingsByPriority,
    totalOpen,
    totalResolved,
    history,
  };
}
