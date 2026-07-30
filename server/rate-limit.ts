// ─── In-Memory Rate Limiter ────────────────────────────────

const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyFn?: (req: Request) => string;
}

export function createRateLimiter(opts: RateLimitOptions) {
  return function check(): { allowed: boolean; retryAfter?: number } {
    const key = opts.keyFn ? 'default' : 'global';
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
export const scanLimiter = createRateLimiter({
  windowMs: 60_000,    // 1 minute
  maxRequests: 5,       // 5 scans per minute
});

export const commitCheckLimiter = createRateLimiter({
  windowMs: 60_000,    // 1 minute
  maxRequests: 10,      // 10 commit checks per minute
});

export const apiLimiter = createRateLimiter({
  windowMs: 60_000,    // 1 minute
  maxRequests: 60,      // 60 general API calls per minute
});
