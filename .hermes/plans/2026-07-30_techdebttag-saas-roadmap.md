# TechDebtTag — Production SaaS Roadmap

> **For Hermes:** Execute tasks sequentially. Each task is self-contained with exact file paths and verification steps. Commit after each task.

**Goal:** Transform TechDebtTag from a single-user local tool into a production-ready SaaS deployed on Hetzner via Docker + Coolify, with authentication, security hardening, and team-friendly features.

**Architecture:** Next.js 14 App Router + SQLite (better-sqlite3) + Tailwind CSS dark theme. APIs are RESTful. Scanner uses local `fs` + `git` for GitHub cloning. Deployed as a Docker container on Hetzner VPS managed by Coolify.

**Tech Stack:** Next.js 14, React 18, TypeScript, better-sqlite3, Tailwind CSS, NextAuth.js, Docker, Coolify, Caddy (reverse proxy via Coolify).

**Current State (baseline):**
- 7 API routes, 7 components, 3 server modules — ~1,750 lines
- No auth, no tests, tokens in plaintext, broken commit-check for private repos
- SQLite single-file DB in `data/techdebttag.db`

---

## 🗺️ Roadmap Overview

| Phase | What | Effort |
|-------|------|--------|
| **Phase 1 — Fix & Harden** | Fix critical bugs, add auth, encrypt tokens, rate limiting | 3-4 hours |
| **Phase 2 — Ship It** | Dockerfile, Coolify config, first deploy to Hetzner | 1-2 hours |
| **Phase 3 — User Value** | CSV export, scan diffs, polish | 2-3 hours |
| **Phase 4 — SaaS Features** | Stripe payments, teams, CI integration (future) | TBD |

---

## Phase 1: Fix & Harden

### Task 1: Fix `checkForNewCommits` auth for private repos

**Objective:** The `checkForNewCommits` function builds a URL with literal `***` instead of the actual token. Fix it so private repos can be checked for new commits.

**Files:**
- Modify: `server/scanner.ts:244`

**The Bug (scanner.ts line 244):**
```ts
const remoteUrl = token
  ? `https://***@github.com/${owner}/${repo}.git`  // BUG: *** is literal, not the token
  : `https://github.com/${owner}/${repo}.git`;
```

**Fix:**
Replace lines 244-246 with:
```ts
const remoteUrl = token
  ? `https://oauth2:${token}@github.com/${owner}/${repo}.git`
  : `https://github.com/${owner}/${repo}.git`;
```

Same fix applies to the clone URL at line 189-191:
```ts
const cloneUrl = token
  ? `https://oauth2:${token}@github.com/${owner}/${repo}.git`
  : `https://github.com/${owner}/${repo}.git`;
```

**Verification:** Scan a private repo with a PAT. After the scan completes, click "Check for New Commits". It should actually detect the HEAD SHA instead of failing with auth errors.

**Commit:**
```bash
git add server/scanner.ts
git commit -m "fix: use actual token in GitHub auth URLs instead of literal ***"
```

---

### Task 2: Add NextAuth.js with GitHub OAuth

**Objective:** Add authentication so each user has their own private dashboard. Use GitHub OAuth (dogfooding — the tool scans GitHub repos, so users already have GitHub accounts).

**Files:**
- Create: `server/auth.ts`
- Modify: `server/db.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/api/repos/route.ts`
- Modify: `app/api/scan/route.ts`
- Modify: `app/api/findings/route.ts`
- Modify: `app/api/stats/route.ts`
- Modify: `app/api/tags/route.ts`
- Modify: `app/api/tags/[id]/route.ts`
- Modify: `app/api/check-commits/route.ts`
- Modify: `app/api/repos/[id]/route.ts`
- Create: `.env.example` (update)
- Modify: `package.json` (add next-auth)

**Step 1: Install next-auth**

```bash
npm install next-auth@4
```

**Step 2: Create `server/auth.ts`**

```ts
import { getServerSession } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',  // Use homepage sign-in instead of separate page
  },
};

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session;
}
```

**Step 3: Create `app/api/auth/[...nextauth]/route.ts`**

```ts
import NextAuth from 'next-auth';
import { authOptions } from '@/server/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**Step 4: Add `user_id` column to repos table**

Modify `server/db.ts` — in the `initSchema` function, alter the repos table:

Add this right after the `CREATE TABLE IF NOT EXISTS repos` block:
```ts
// Migration: add user_id column if not exists
try {
  db.exec("ALTER TABLE repos ADD COLUMN user_id INTEGER DEFAULT NULL");
} catch { /* column exists */ }
```

Also add index:
```ts
db.exec(`CREATE INDEX IF NOT EXISTS idx_repos_user ON repos(user_id)`);
```

**Step 5: Update all DB queries to scope by user_id**

Update `createRepo` to accept and store `user_id`:
```ts
export function createRepo(repo: {
  name: string;
  type: 'local' | 'github-public' | 'github-private';
  path_or_url: string;
  github_token?: string;
  user_id: number;
}) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO repos (name, type, path_or_url, github_token, user_id) VALUES (@name, @type, @path_or_url, @github_token, @user_id)'
  );
  return stmt.run(repo);
}
```

Update `getRepos` to accept optional `user_id`:
```ts
export function getRepos(userId?: number) {
  const db = getDb();
  if (userId) {
    return db.prepare('SELECT * FROM repos WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  }
  return db.prepare('SELECT * FROM repos ORDER BY updated_at DESC').all();
}
```

**Step 6: Add auth middleware/wrapper to all API routes**

Each API route needs to extract the user session and enforce ownership. Pattern:

```ts
import { requireSession } from '@/server/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = parseInt((session.user as any).id);
    // ... scoped query using userId
  } catch (e: any) {
    if (e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ...
  }
}
```

All 7 API route files need this pattern. The `repos/route.ts` POST needs to pass user_id. The `repos/[id]/route.ts` DELETE needs to verify ownership. The `scan`, `findings`, `stats`, `tags`, and `check-commits` routes need to verify the repo belongs to the user.

**Step 7: Update frontend**

Add sign-in button to `app/layout.tsx` header:
```tsx
import { getServerSession } from 'next-auth';
// ... in the header div, after the right section:
<div className="flex items-center gap-3">
  {session ? (
    <>
      <img src={session.user?.image || ''} className="w-6 h-6 rounded-full" />
      <span className="text-xs text-[var(--text-secondary)]">{session.user?.name}</span>
    </>
  ) : (
    <a href="/api/auth/signin" className="text-xs px-3 py-1.5 rounded-lg bg-[#2563eb] text-white">
      Sign in with GitHub
    </a>
  )}
</div>
```

Actually, since layout is server component by default, we need a client component for the auth state. Create `components/AuthButton.tsx`:
```tsx
'use client';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function AuthButton() {
  const { data: session } = useSession();
  
  if (!session) {
    return (
      <button onClick={() => signIn('github')} className="text-xs px-3 py-1.5 rounded-lg bg-[#2563eb] text-white">
        Sign in with GitHub
      </button>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      {session.user?.image && <img src={session.user.image} className="w-6 h-6 rounded-full" />}
      <span className="text-xs text-[var(--text-secondary)]">{session.user?.name}</span>
      <button onClick={() => signOut()} className="text-xs text-[var(--text-muted)] hover:text-red-400">
        Sign out
      </button>
    </div>
  );
}
```

Wrap layout in SessionProvider. Modify `app/layout.tsx`:
```tsx
import { Providers } from './providers';
// ... in body, wrap main with <Providers>
```

Create `app/providers.tsx`:
```tsx
'use client';
import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Verification:**
1. Set up GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `NEXTAUTH_SECRET` to `.env.local`
3. `npm run dev` — should see Sign in button
4. Sign in → redirected back, see avatar and name
5. Add a repo → only visible to that user
6. Sign out → repos hidden
7. Direct API calls without session → 401

**Note:** The `getServerSession` approach works because the page is an RSC layout. But `app/page.tsx` is a `'use client'` component, so it can't call `requireSession()` directly. Instead, all API routes enforce auth, and the client-side code uses `useSession()` for UI state. The API routes are the security boundary.

**Commit:**
```bash
git add .
git commit -m "feat: add NextAuth.js GitHub OAuth with multi-user scoping"
```

---

### Task 3: Encrypt stored GitHub tokens

**Objective:** GitHub PATs stored in `repos.github_token` are currently plaintext in SQLite. Encrypt them at rest using AES-256-GCM with a server-side key.

**Files:**
- Create: `server/crypto.ts`
- Modify: `server/db.ts` (encrypt on write, decrypt on read)

**Step 1: Create `server/crypto.ts`**

```ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

if (!process.env.ENCRYPTION_KEY || KEY.length !== 32) {
  console.warn('⚠️ ENCRYPTION_KEY not set or invalid (must be 64 hex chars / 32 bytes). Tokens will not be encrypted.');
}

export function encrypt(plaintext: string): string {
  if (!KEY || KEY.length !== 32) return plaintext; // fallback: no encryption
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encrypted: string): string {
  if (!KEY || KEY.length !== 32) return encrypted;
  if (!encrypted.includes(':')) return encrypted; // Not encrypted
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) return encrypted;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    return encrypted; // Decryption failed, return as-is
  }
}
```

**Step 2: Update `server/db.ts`**

In `createRepo`, encrypt the token before storing:
```ts
import { encrypt, decrypt } from './crypto';

export function createRepo(repo: { ..., github_token?: string }) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO repos (...) VALUES (...)'
  );
  return stmt.run({
    ...repo,
    github_token: repo.github_token ? encrypt(repo.github_token) : null,
  });
}
```

In `getRepo` and `getRepos`, decrypt the token when reading:
```ts
export function getRepo(id: number) {
  const db = getDb();
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(id) as any;
  if (repo && repo.github_token) {
    repo.github_token = decrypt(repo.github_token);
  }
  return repo;
}
```

Same for `getRepos` return values.

**Step 3: Generate encryption key**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```
ENCRYPTION_KEY=<64-char-hex-output>
```

**Verification:**
1. Add a repo with a GitHub token
2. Check the SQLite DB directly: `sqlite3 data/techdebttag.db "SELECT github_token FROM repos"` — should show encrypted hex, not the token
3. The app should still work (scanning, commit checking) — tokens decrypted in memory
4. If ENCRYPTION_KEY is missing, app still works (unencrypted fallback)

**Commit:**
```bash
git add server/crypto.ts server/db.ts
git commit -m "feat: encrypt GitHub tokens at rest with AES-256-GCM"
```

---

### Task 4: Add rate limiting to API routes

**Objective:** Prevent abuse of scan endpoints (which trigger expensive `git clone` operations) and general API hammering.

**Files:**
- Create: `server/rate-limit.ts`
- Modify: `app/api/scan/route.ts`
- Modify: `app/api/check-commits/route.ts`

**Step 1: Create simple in-memory rate limiter `server/rate-limit.ts`**

```ts
const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

interface RateLimitOptions {
  windowMs: number;  // time window in ms
  maxRequests: number;  // max requests per window
  keyFn?: (req: Request) => string;  // custom key function
}

export function rateLimit(opts: RateLimitOptions) {
  return function check(request: Request): { allowed: boolean; retryAfter?: number } {
    const key = opts.keyFn ? opts.keyFn(request) : 'global';
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
      return { allowed: true };
    }

    entry.count++;
    if (entry.count > opts.maxRequests) {
      return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }

    return { allowed: true };
  };
}

// Pre-configured limiters
export const scanLimiter = rateLimit({
  windowMs: 60_000,    // 1 minute
  maxRequests: 5,       // 5 scans per minute
  keyFn: () => 'scan',
});

export const commitCheckLimiter = rateLimit({
  windowMs: 60_000,    // 1 minute
  maxRequests: 10,      // 10 checks per minute
  keyFn: () => 'commit-check',
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  maxRequests: 60,       // 60 general API calls per minute
  keyFn: () => 'api',
});
```

**Step 2: Apply to scan and check-commits routes**

In `app/api/scan/route.ts`, add at the top of the POST handler:
```ts
import { scanLimiter } from '@/server/rate-limit';

export async function POST(req: NextRequest) {
  const limit = scanLimiter(req);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }
  // ... rest of handler
}
```

Same pattern for `check-commits/route.ts`.

**Verification:**
1. Hit the scan endpoint 6 times within a minute — 6th request returns 429
2. Wait 60 seconds, request again — works
3. Different endpoints have independent limits

**Note:** This is in-memory only (resets on server restart). For production, swap to Redis-based rate limiting if you need persistence across restarts/deployments. For a single-instance Docker deployment, in-memory is fine.

**Commit:**
```bash
git add server/rate-limit.ts app/api/scan/route.ts app/api/check-commits/route.ts
git commit -m "feat: add in-memory rate limiting to scan and commit-check endpoints"
```

---

### Task 5: Create .env.example with all required variables

**Objective:** Document all environment variables needed for the app to run.

**Files:**
- Modify: `.env.example` (create if missing)

**Content for `.env.example`:**

```bash
# ─── NextAuth ───────────────────────────────────
# Generate: openssl rand -base64 32
NEXTAUTH_SECRET=change-me
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth App credentials
# Create at: https://github.com/settings/developers
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# ─── Encryption ─────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# ─── Optional ───────────────────────────────────
# Port for the Next.js server (default: 3000)
PORT=3000
```

**Commit:**
```bash
git add .env.example
git commit -m "docs: add .env.example with all required environment variables"
```

---

## Phase 2: Ship It

### Task 6: Create Dockerfile

**Objective:** Package the app in a Docker container that works on Coolify. Needs Node.js, git (for cloning), and the build toolchain for better-sqlite3.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Step 1: `.dockerignore`**

```
node_modules
.next
data
.git
.env
.env.local
README.md
```

**Step 2: `Dockerfile`**

```dockerfile
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create data directory with correct permissions
RUN mkdir -p data && chown -R nextjs:nodejs data

# Copy server files that aren't bundled by standalone
COPY --from=builder /app/server ./server

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

**Step 3: Update `next.config.js` for standalone output**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

module.exports = nextConfig;
```

**Verification:**
```bash
docker build -t techdebttag .
docker run -p 3000:3000 --env-file .env.local -v $(pwd)/data:/app/data techdebttag
```
Visit http://localhost:3000 — should work.

**Commit:**
```bash
git add Dockerfile .dockerignore next.config.js
git commit -m "feat: add Dockerfile with multi-stage build for production"
```

---

### Task 7: Coolify deployment configuration

**Objective:** Document how to deploy on Coolify. Coolify natively supports Dockerfile-based deployments from Git repos.

**Files:**
- Create: `DEPLOY.md`

**Step 1: Create `DEPLOY.md`**

Tool call will handle this. The doc should cover:
- Prerequisites (Coolify instance, GitHub OAuth app, domain)
- Creating the Coolify service
- Environment variables to set
- Volume mount for SQLite persistence
- Health check configuration
- Domain + SSL setup (automatic via Coolify)

**Verification:** Follow the DEPLOY.md steps on the actual Coolify instance. The app should be live at the configured domain.

**Commit:**
```bash
git add DEPLOY.md
git commit -m "docs: add Coolify deployment guide"
```

---

## Phase 3: User Value

### Task 8: Add CSV export for findings

**Objective:** Let users download their findings as a CSV file for use in other tools (Jira import, spreadsheet analysis, etc.).

**Files:**
- Modify: `app/api/findings/route.ts` (add ?format=csv support)
- Modify: `components/ResultsTable.tsx` (add export button)

**Step 1: Add CSV export to findings API**

In `app/api/findings/route.ts` GET handler, after the existing logic:

```ts
const format = searchParams.get('format');
if (format === 'csv') {
  const result = getFindings({ repo_id: repoId ? parseInt(repoId) : undefined, limit: 10000 });
  const headers = ['id', 'tag', 'file_path', 'line_number', 'excerpt_line', 'priority', 'resolved', 'repo_name', 'created_at'];
  const csvRows = [headers.join(',')];
  for (const f of result.findings as any[]) {
    csvRows.push([
      f.id,
      `"${f.tag}"`,
      `"${f.file_path}"`,
      f.line_number,
      `"${(f.excerpt_line || '').replace(/"/g, '""')}"`,
      f.priority,
      f.resolved ? 'yes' : 'no',
      `"${f.repo_name}"`,
      f.created_at,
    ].join(','));
  }
  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="techdebt-export.csv"`,
    },
  });
}
```

**Step 2: Add export button to ResultsTable**

In `components/ResultsTable.tsx`, add a button in the filter bar:

```tsx
<a
  href={`/api/findings?repo_id=${repoId}&resolved=false&format=csv&limit=10000`}
  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a1e] border border-[#333] text-[var(--text-secondary)] hover:border-[#3b82f666] transition-colors"
  download
>
  📥 Export CSV
</a>
```

**Verification:**
1. Scan a repo with findings
2. Click "Export CSV"
3. File downloads with correct headers, data, and escaped quotes

**Commit:**
```bash
git add app/api/findings/route.ts components/ResultsTable.tsx
git commit -m "feat: add CSV export for findings"
```

---

### Task 9: Add diff-between-scans view

**Objective:** After re-scanning a repo, show what's new (not in previous scan), what was removed (fixed), and what changed priority — instead of silently replacing all findings.

**Files:**
- Create: `app/api/diff/route.ts`
- Modify: `server/db.ts`
- Modify: `components/ResultsTable.tsx` (show diff state)
- Modify: `app/page.tsx` (show diff summary after re-scan)

**Approach:**
Instead of `replaceScanFindings` marking all old findings resolved, we do a smarter upsert: findings are matched by (repo_id, file_path, line_number, tag). If a finding from the new scan matches an existing unresolved finding by these keys, keep it (don't duplicate). If a previous finding is no longer present, mark it as resolved (it was fixed!). If a finding is new, insert it.

**Step 1: Add `scanFindingsDiff` to `server/db.ts`**

```ts
export function scanFindingsDiff(
  scanId: number,
  repoId: number,
  newFindings: Omit<Parameters<typeof insertFinding>[0], 'scan_id' | 'repo_id'>[]
): { new_count: number; removed_count: number; unchanged_count: number } {
  const db = getDb();

  const tx = db.transaction(() => {
    // Get existing unresolved findings for this repo
    const existing = db.prepare(
      'SELECT id, file_path, line_number, tag FROM findings WHERE repo_id = ? AND resolved = 0'
    ).all(repoId) as { id: number; file_path: string; line_number: number; tag: string }[];

    // Build lookup set of new findings
    const newSet = new Set(newFindings.map(f => `${f.file_path}:${f.line_number}:${f.tag}`));

    let new_count = 0;
    let removed_count = 0;
    let unchanged_count = 0;

    // Insert new findings
    const insert = db.prepare(
      `INSERT INTO findings (scan_id, repo_id, tag, file_path, line_number, excerpt_before, excerpt_line, excerpt_after, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const f of newFindings) {
      const key = `${f.file_path}:${f.line_number}:${f.tag}`;
      const exists = existing.find(e => `${e.file_path}:${e.line_number}:${e.tag}` === key);
      if (!exists) {
        insert.run(scanId, repoId, f.tag, f.file_path, f.line_number, f.excerpt_before, f.excerpt_line, f.excerpt_after, f.priority);
        new_count++;
      } else {
        unchanged_count++;
      }
    }

    // Mark removed findings as resolved
    for (const e of existing) {
      const key = `${e.file_path}:${e.line_number}:${e.tag}`;
      if (!newSet.has(key)) {
        db.prepare('UPDATE findings SET resolved = 1 WHERE id = ?').run(e.id);
        removed_count++;
      }
    }

    return { new_count, removed_count, unchanged_count };
  });

  return tx();
}
```

**Step 2: Update scan route to use diff**

In `app/api/scan/route.ts`, in `runScanAsync` and the GitHub sync path, replace `replaceScanFindings` with `scanFindingsDiff` and return the diff stats:

```ts
const diff = scanFindingsDiff(scanId, repo_id, dbFindings);
completeScan(scanId, 0, result.findings.length);
// ... include diff in response
```

**Step 3: Show diff summary in UI**

In `app/page.tsx`, after a scan completes, show the diff stats in the stats panel or as a temporary toast/banner.

**Verification:**
1. Scan a repo → N findings
2. Edit a file: remove one TODO, add a new FIXME
3. Re-scan
4. Stats show: "2 new, 1 removed, 45 unchanged"
5. The removed TODO is marked resolved, the new FIXME appears as unresolved

**Commit:**
```bash
git add server/db.ts app/api/scan/route.ts app/page.tsx
git commit -m "feat: add smart diff-between-scans instead of bulk-replace"
```

---

### Task 10: Custom tag colors

**Objective:** When users add custom tags, they all get the same gray color. Let them pick from a palette.

**Files:**
- Modify: `server/db.ts` (add color column to tag_configs)
- Modify: `app/api/tags/route.ts` (accept color in POST)
- Modify: `app/api/tags/[id]/route.ts` (accept color in PATCH)
- Modify: `components/TagManager.tsx` (add color picker)
- Modify: `components/TagPill.tsx` (use stored color)

**Step 1: DB migration**

In `server/db.ts` `initSchema`:
```ts
try {
  db.exec("ALTER TABLE tag_configs ADD COLUMN color TEXT DEFAULT ''");
} catch { /* exists */ }
```

**Step 2: Update TagPill to use stored color**

```tsx
const storedColor = tagColorMap[tag]; // from tag_configs
const color = storedColor || TAG_COLORS[tag] || '#6b7280';
```

**Step 3: Add color picker to TagManager**

A simple grid of 12 preset colors that the user can click. Store the hex in the tag_configs.color column.

**Verification:** Add a custom tag "REVIEW", pick purple. It shows purple in pills and results.

**Commit:**
```bash
git add .
git commit -m "feat: custom tag colors with color picker"
```

---

## Phase 4: SaaS Features (Future)

### Task 11: Stripe subscription integration

**Files:**
- Create: `app/api/stripe/webhook/route.ts`
- Create: `app/api/stripe/checkout/route.ts`
- Modify: `server/db.ts` (add subscriptions table)
- Create: `components/PricingPage.tsx`
- Create: `app/pricing/page.tsx`

**Architecture:**
- `subscriptions` table: user_id, stripe_customer_id, stripe_subscription_id, plan (free|pro|team), status, current_period_end
- Free tier: 3 repos, 1 scan/day
- Pro tier: $8/month, unlimited repos, unlimited scans, CSV export, diff view
- Team tier: $20/month, all pro features + team management, CI integration

**Stripe integration:** Use Stripe Checkout for self-serve. Webhook handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

**This is future work — not part of the current implementation phase.**

---

## ⚠️ Pitfalls & Notes

1. **better-sqlite3 is a native module.** The Docker build needs `python3`, `make`, `g++` in the build stage. The final runner stage only needs `git`. Multi-stage builds handle this cleanly.

2. **SQLite concurrency.** WAL mode handles concurrent reads well. But writes are serialized. For a single-instance deployment with <100 users, this is fine. If you outgrow it, migrate to Turso/LibSQL (drop-in SQLite compatible, but remote).

3. **Data directory.** The Docker container expects `/app/data` to be a volume mount or it creates an ephemeral DB. On Coolify, configure a persistent volume at `/app/data`.

4. **GitHub OAuth app callback URL.** Must match the deployed domain exactly. For local dev: `http://localhost:3000/api/auth/callback/github`. For production: `https://yourdomain.com/api/auth/callback/github`.

5. **NextAuth secret.** Generate with `openssl rand -base64 32`. Must be 32+ chars. Used to encrypt the session JWT.

6. **Encoding key.** 64 hex chars = 32 bytes. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

7. **Private repos with local scanning.** Local folder scanning only works on the server's filesystem. For a deployed app, this means scanning repos that are on the VPS. Most users will use GitHub scanning.

8. **Coolify health checks.** Point it at `/api/repos` (returns empty array if no repos — 200 = healthy).

---

## 📋 Execution Order

Tasks should be done in order — each builds on the previous:

```
Phase 1 (required before deploy):
  Task 1 → Task 2 → Task 3 → Task 4 → Task 5

Phase 2 (deploy):
  Task 6 → Task 7

Phase 3 (post-deploy polish):
  Task 8 → Task 9 → Task 10

Phase 4 (future):
  Task 11+
```

**Current status:** All tasks pending.
**Target:** Phase 1 + Phase 2 complete, deployed on Hetzner via Coolify, functional with auth.
