# ─── TechDebtTag Docker Image ────────────────────────────────
# Multi-stage build: deps → builder → minimal runner
# Requires: Docker 20.10+

# Stage 1: Build dependencies (needs g++/make for better-sqlite3)
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

# Stage 2: Build Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Production runner (only needs Node + git)
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output (Next.js standalone bundles the compiled app + deps)
COPY --from=builder /app/.next/standalone ./

# Copy static assets (separate from standalone in Next.js 14)
COPY --from=builder /app/.next/static ./.next/static

# Remove dev data directory (will use volume mount in production)
RUN rm -rf /app/data

# Create persistent data directory
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
