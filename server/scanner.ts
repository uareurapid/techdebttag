// ─── Core Scanner: filesystem + GitHub ─────────────────────

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import type { TagConfig } from './types';

const CONTEXT_LINES = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB skip threshold

// Extensions we care about (source code only)
const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.pyi', '.pyx',
  '.java', '.kt', '.kts',
  '.rb', '.erb',
  '.go',
  '.rs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hxx',
  '.cs',
  '.swift', '.m', '.mm',
  '.php', '.phtml',
  '.scala',
  '.clj', '.cljs', '.cljc', '.edn',
  '.ex', '.exs',
  '.hs', '.lhs',
  '.elm',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.vue', '.svelte',
  '.html', '.htm', '.css', '.scss', '.less',
  '.yaml', '.yml', '.toml',
  '.md', '.mdx',
  '.dart',
  '.r',
  '.lua',
  '.sol',
  '.tf', '.tfvars',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build',
  '.cache', '__pycache__', '.venv', 'venv', '.tox',
  'vendor', '.idea', '.vscode', 'coverage', '.nyc_output',
  'target', '.gradle', 'bin', 'obj',
  'tmp', 'temp', '.turbo', '.parcel-cache',
]);

const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', 'Cargo.lock', 'Gemfile.lock',
  'poetry.lock', 'composer.lock', 'mix.lock',
]);

export interface ScanFinding {
  tag: string;
  file_path: string;
  line_number: number;
  excerpt_before: string;
  excerpt_line: string;
  excerpt_after: string;
  priority: string;
}

export interface ScanResult {
  findings: ScanFinding[];
  commitSha?: string;
}

function buildRegex(tagNames: string[]): RegExp {
  const tagPattern = tagNames.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(?:^|\\s|[\\/\\*#;!<%-]+\\s*)(?:@)?(${tagPattern})\\b[\\s:]*`, 'gi');
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        const base = entry.name;
        if (CODE_EXTENSIONS.has(ext) || base.includes('Dockerfile') || base.includes('Makefile') || base === '.env.example') {
          results.push(fullPath);
        }
      }
    }
  }

  return results;
}

function scanFile(filePath: string, relPath: string, regex: RegExp, tagPriorityMap: Map<string, string>): ScanFinding[] {
  const findings: ScanFinding[] = [];

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) return findings;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      regex.lastIndex = 0;
      const match = regex.exec(line);
      if (match) {
        const matchedTag = match[1].toUpperCase();
        const tagConfig = tagPriorityMap.get(matchedTag);
        const start = Math.max(0, i - CONTEXT_LINES);
        const end = Math.min(lines.length, i + CONTEXT_LINES + 1);

        findings.push({
          tag: matchedTag,
          file_path: relPath,
          line_number: i + 1,
          excerpt_before: lines.slice(start, i).join('\n'),
          excerpt_line: line.trim(),
          excerpt_after: lines.slice(i + 1, end).join('\n'),
          priority: tagConfig || 'medium',
        });
      }
    }
  } catch {
    // Skip unreadable files
  }

  return findings;
}

export async function scanLocalFolder(folderPath: string, tags: TagConfig[]): Promise<ScanResult> {
  const tagNames = tags.filter(t => t.enabled).map(t => t.tag);
  const tagPriorityMap = new Map(tags.map(t => [t.tag, t.priority]));

  if (tagNames.length === 0) return { findings: [] };

  const regex = buildRegex(tagNames);
  const files = walkDir(folderPath);

  const allFindings: ScanFinding[] = [];
  for (const filePath of files) {
    const relPath = path.relative(folderPath, filePath);
    const fileFindings = scanFile(filePath, relPath, regex, tagPriorityMap);
    allFindings.push(...fileFindings);
  }

  return { findings: allFindings };
}

export async function scanGitHubRepo(
  repoUrl: string,
  token?: string,
  tags?: TagConfig[]
): Promise<ScanResult> {
  // Parse GitHub URL
  let owner: string, repo: string;
  const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (urlMatch) {
    owner = urlMatch[1];
    repo = urlMatch[2].replace(/\.git$/, '');
  } else {
    const parts = repoUrl.replace(/^https?:\/\/github\.com\//, '').split('/');
    owner = parts[0];
    repo = parts[1]?.replace(/\.git$/, '') || '';
  }

  if (!owner || !repo) {
    throw new Error(`Could not parse GitHub repo from: ${repoUrl}`);
  }

  // Clone repo to temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techdebttag-'));
  const cloneUrl = token
    ? `https://oauth2:${token}@github.com/${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;

  try {
    execSync(`git clone --depth 1 ${cloneUrl} .`, {
      cwd: tmpDir,
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    // Get the commit SHA
    let commitSha: string | undefined;
    try {
      commitSha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8', timeout: 5000 }).trim();
    } catch {
      // Non-critical
    }

    // Now scan it as a local folder
    const result = await scanLocalFolder(tmpDir, tags || []);
    return { findings: result.findings, commitSha };

  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

export function checkForNewCommits(
  repoUrl: string,
  lastKnownSha: string,
  token?: string
): { hasNew: boolean; commitSha: string } {
  // Parse URL
  let owner: string, repo: string;
  const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (urlMatch) {
    owner = urlMatch[1];
    repo = urlMatch[2].replace(/\.git$/, '');
  } else {
    const parts = repoUrl.replace(/^https?:\/\/github\.com\//, '').split('/');
    owner = parts[0];
    repo = parts[1]?.replace(/\.git$/, '') || '';
  }

  if (!owner || !repo) {
    throw new Error(`Could not parse GitHub repo from: ${repoUrl}`);
  }

  const remoteUrl = token
    ? `https://oauth2:${token}@github.com/${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;

  // Use git ls-remote to check latest commit without cloning
  const output = execSync(`git ls-remote ${remoteUrl} HEAD`, {
    encoding: 'utf-8',
    timeout: 15000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });

  const currentSha = output.split(/\s+/)[0];
  if (!currentSha) {
    throw new Error('Could not get HEAD SHA from remote');
  }

  return {
    hasNew: currentSha !== lastKnownSha,
    commitSha: currentSha,
  };
}
