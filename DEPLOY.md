# 🚀 Deploying TechDebtTag on Coolify

TechDebtTag is a Next.js app packaged as a Docker container. Coolify can build and deploy it directly from a Git repository.

## Prerequisites

1. **A Coolify instance** running on a server (Hetzner VPS, etc.)
2. **A domain name** pointed to your server (Coolify handles SSL automatically)
3. **GitHub OAuth App** created at [GitHub Developer Settings](https://github.com/settings/developers)
4. **Encryption key** generated: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. **NextAuth secret** generated: `openssl rand -base64 32`

## Step 1: Push to Git

Push the TechDebtTag repository to GitHub/GitLab:

```bash
git remote add origin git@github.com:your-org/techdebttag.git
git push -u origin main
```

## Step 2: Create GitHub OAuth App

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name**: `TechDebtTag`
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/api/auth/callback/github`
3. Click **Register application**
4. Generate a **Client Secret**
5. Save both **Client ID** and **Client Secret**

## Step 3: Add Service in Coolify

1. In your Coolify dashboard, click **+ New** → **Application**
2. Select **Dockerfile** as the build method
3. Connect your Git repository
4. Configure:

### Build Settings
- **Build Pack**: Dockerfile
- **Dockerfile Path**: `Dockerfile` (default)
- **Ports Exposes**: `3000`

### Environment Variables

Add all of the following as **Build Variables** (or Runtime Variables — both work for Next.js):

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXTAUTH_SECRET` | `<32+ char random string>` | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://your-domain.com` | Must match your Coolify domain |
| `GITHUB_CLIENT_ID` | `<from GitHub OAuth App>` | |
| `GITHUB_CLIENT_SECRET` | `<from GitHub OAuth App>` | |
| `ENCRYPTION_KEY` | `<64 hex chars>` | Generate with script above |
| `PORT` | `3000` | |

### Persistent Storage

TechDebtTag stores data in SQLite (`/app/data/techdebttag.db`). To persist this across deployments:

1. In the service settings, go to **Storages**
2. Add a **Persistent Volume**:
   - **Source Path**: `/data/techdebttag`
   - **Destination Path**: `/app/data`

This ensures the database survives container restarts and redeploys.

## Step 4: Domain & SSL

1. In the service, go to **Domains**
2. Add your domain: `your-domain.com`
3. Set the port to `3000`
4. Coolify automatically provisions a Let's Encrypt SSL certificate via Caddy/Traefik

## Step 5: Deploy

Click **Deploy**. Coolify will:
1. Clone the repository
2. Build the Docker image (multi-stage build)
3. Start the container
4. Make it available at your domain with HTTPS

## Health Check

Once deployed, visit `https://your-domain.com`. You should see the TechDebtTag dashboard with a "Sign in with GitHub" button.

To verify the API is healthy:
```bash
curl -I https://your-domain.com/api/repos
# Should return 200 (empty repos list) or 401 (if auth is required)
```

## Updating

Push new commits to the Git branch that Coolify is watching. Coolify automatically rebuilds and redeploys when it detects changes (if you've enabled auto-deploy in the service settings).

## Troubleshooting

### "better-sqlite3" errors during build
The Dockerfile's `base` stage includes `python3`, `make`, and `g++` — required to compile the native SQLite module. If the build fails, ensure the build stage has these packages.

### Database resets after deploy
Make sure the persistent volume is configured correctly. Without it, each deploy creates a fresh database.

### GitHub auth redirects to wrong URL
Check `NEXTAUTH_URL` matches your Coolify-assigned domain exactly (including `https://`).

### Scan fails on very large repos
The `git clone --depth 1` may timeout for very large repositories. Adjust the timeout in `server/scanner.ts` (currently 120 seconds) if needed.
