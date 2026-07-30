// ─── Shared Types ────────────────────────────────────────────

export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Repo {
  id: number;
  name: string;
  type: 'local' | 'github-public' | 'github-private';
  path_or_url: string;
  github_token?: string;
  last_commit_sha?: string;
  created_at: string;
  updated_at: string;
}

export interface Scan {
  id: number;
  repo_id: number;
  commit_sha?: string;
  total_files: number;
  total_findings: number;
  started_at: string;
  completed_at: string;
  status: 'running' | 'completed' | 'failed';
  error_message?: string;
}

export interface Finding {
  id: number;
  scan_id: number;
  repo_id: number;
  tag: string;
  file_path: string;
  line_number: number;
  excerpt_before: string;
  excerpt_line: string;
  excerpt_after: string;
  priority: Priority;
  resolved: boolean;
  created_at: string;
}

export interface TagConfig {
  id: number;
  tag: string;
  priority: Priority;
  enabled: boolean;
  created_at: string;
}

export interface ScanResult {
  repo: Repo;
  scan: Scan;
  findings: Finding[];
  stats: {
    by_tag: Record<string, number>;
    by_priority: Record<Priority, number>;
    total: number;
  };
}

export interface RepoStats {
  repo: Repo;
  latestScan: Scan | null;
  findingsByTag: { tag: string; count: number }[];
  findingsByPriority: { priority: string; count: number }[];
  totalOpen: number;
  totalResolved: number;
  history: { date: string; total: number }[];
}

export const DEFAULT_TAGS: TagConfig[] = [
  { id: 0, tag: 'TODO', priority: 'medium', enabled: true, created_at: '' },
  { id: 0, tag: 'FIXME', priority: 'high', enabled: true, created_at: '' },
  { id: 0, tag: 'HACK', priority: 'critical', enabled: true, created_at: '' },
  { id: 0, tag: 'NOTE', priority: 'info', enabled: true, created_at: '' },
  { id: 0, tag: 'OBS', priority: 'low', enabled: true, created_at: '' },
  { id: 0, tag: 'DEBT', priority: 'high', enabled: true, created_at: '' },
];

export const TAG_COLORS: Record<string, string> = {
  TODO: '#3b82f6',
  FIXME: '#ef4444',
  HACK: '#f59e0b',
  NOTE: '#6b7280',
  OBS: '#8b5cf6',
  DEBT: '#dc2626',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
