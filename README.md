# 🏷️ TechDebtTag

**Surface, prioritize, and track technical debt comments across your codebase.**

Scan local folders or GitHub repositories for TODO, FIXME, HACK, NOTE, OBS, and DEBT comments. Group by tag, filter by priority, see code excerpts inline — no ticket creation required. The comment in the code *is* the record.

## Features

- **📁 Local Folder Scanning** — Point at any directory and scan all source files
- **🌐 GitHub Repo Scanning** — Public repos via URL (no auth needed) or private repos via Personal Access Token
- **🏷️ 6 Default Tags** — TODO, FIXME, HACK, NOTE, OBS, DEBT (case-insensitive matching)
- **➕ Custom Tags** — Add your own markers like `@BUG`, `@REVIEW`, or `@PERF`
- **🔴 Priority Levels** — Critical, High, Medium, Low, Info — assign per-tag defaults or per-item overrides
- **📝 Code Excerpts** — See 5 lines of context before and after each match, expandable inline
- **🔍 Filtering** — Filter by tag, priority, or search file paths/code text
- **✅ Resolve Items** — Mark debt items as resolved when you fix them
- **🔄 Commit Detection** — For GitHub repos, detect new commits and re-scan on demand
- **📊 Stats Dashboard** — Open/resolved counts, breakdown by tag and priority

## Quick Start

```bash
git clone <this-repo>
cd TechDebtTag
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

### Scan a Local Folder

1. Select **📁 Local** tab
2. Enter the absolute path to your project folder
3. Click **🚀 Scan Now**

### Scan a Public GitHub Repo

1. Select **🌐 Public Repo** tab
2. Enter `owner/repo` or full GitHub URL
3. Click **🚀 Scan Now**

### Scan a Private GitHub Repo

1. Select **🔒 Private Repo** tab
2. Enter the repo URL
3. Create a GitHub Personal Access Token:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Or visit: https://github.com/settings/tokens?type=beta
   - Click "Generate new token"
   - Select your repository under "Repository access" → "Only select repositories"
   - Under Permissions → Repository permissions:
     - Set **Contents** to "Read-only"
     - Set **Metadata** to "Read-only" (auto-selected)
   - Click "Generate token" and paste it into the token field
4. Click **🚀 Scan Now**

### Managing Tags & Priorities

Click **🏷️ Manage Tags** to:
- Enable/disable which tags to scan for
- Change the default priority for each tag
- Add custom tags (e.g., `REVIEW`, `PERF`, `BUG`)
- Delete tags you don't need

### Filtering Results

Use the tag pills and dropdowns above the results to filter by:
- **Tag** — Click a tag to show only that type of debt
- **Priority** — Filter by critical/high/medium/low/info
- **Search** — Search across file paths and code excerpts

### Re-scanning

- Click **🔄 Re-scan** to scan the selected repo again
- For GitHub repos, click **🔍 Check for New Commits** to detect changes and auto-trigger a re-scan

## Architecture

- **Frontend**: Next.js App Router + React (client components)
- **Backend**: Next.js API Routes
- **Database**: SQLite (via better-sqlite3) — zero config, file-based
- **GitHub**: Octokit REST API
- **Styling**: Tailwind CSS (dark theme)
- **File scanning**: Node.js `fs` + `glob` for local; GitHub Trees API for repos

### Database Schema

```
repos         — Tracked repositories (local folders / GitHub URLs)
scans         — Scan runs with timestamps and commit SHAs
findings      — Individual tech debt items with code excerpts
tag_configs   — Enabled tags and their default priorities
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/repos` | List all tracked repos |
| POST | `/api/repos` | Add a new repo |
| DELETE | `/api/repos/:id` | Remove a repo and its data |
| POST | `/api/scan` | Trigger a scan on a repo |
| GET | `/api/findings` | Get findings with filters |
| PATCH | `/api/findings` | Resolve/reopen or change priority |
| GET | `/api/tags` | List tag configurations |
| POST | `/api/tags` | Add a custom tag |
| PATCH | `/api/tags/:id` | Update tag priority or enabled state |
| DELETE | `/api/tags/:id` | Delete a tag config |
| GET | `/api/stats` | Get stats for a repo |
| POST | `/api/check-commits` | Check GitHub for new commits |

## File Types Scanned

Source files: `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.java`, `.kt`, `.rb`, `.go`, `.rs`, `.c`, `.cpp`, `.swift`, `.php`, `.vue`, `.svelte`, `.html`, `.css`, `.yaml`, `.toml`, `.json`, `.md`, `.dart`, `.r`, `.lua`, `.sol`, `.tf`, `Dockerfile`, and more.

Directories ignored: `node_modules`, `.git`, `.next`, `dist`, `build`, `vendor`, `__pycache__`, `.venv`, `target`, `.gradle`, etc.

## Design

Built with a dark theme. Tags are color-coded. Code excerpts use monospace font with syntax-highlighted line numbers. The matching line is highlighted in blue with a left border for instant visual scanning.
