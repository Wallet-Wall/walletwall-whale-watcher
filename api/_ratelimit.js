const WINDOW_MS = 3_600_000;

// Allowed characters in an IP address: IPv4 dotted-decimal, IPv6 colon-hex,
// IPv4-mapped IPv6 (::ffff:a.b.c.d), bracketed IPv6, and zone identifiers (%eth0).
// Anything containing other characters (semicolons, angle brackets, spaces …) is
// rejected before it can be used as a rate-limit key.
const IP_RE = /^[0-9a-fA-F:.[\]%]+$/;
const MAX_IP_LEN = 50;

function sanitizeIp(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > MAX_IP_LEN || !IP_RE.test(s)) return null;
  return s;
}

export function getRedisConfig() {
  const supportedPairs = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['STORAGE_KV_REST_API_URL', 'STORAGE_KV_REST_API_TOKEN'],
  ];
  for (const [urlName, tokenName] of supportedPairs) {
    const url = process.env[urlName]?.replace(/\/$/, '');
    const token = process.env[tokenName];
    if (url && token) return { url, token, enabled: true };
  }
  return { url: undefined, token: undefined, enabled: false };
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function durableRateLimitFailure(message = 'Production durable rate limiting is not available') {
  const production = isProductionRuntime();
  return {
    allowed: false,
    configError: true,
    status: 503,
    error: production ? 'Service temporarily unavailable.' : 'Production rate limiting is not configured.',
    detail: production
      ? undefined
      : `${message}. Set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN, KV_REST_API_URL/KV_REST_API_TOKEN, or STORAGE_KV_REST_API_URL/STORAGE_KV_REST_API_TOKEN for sensitive routes.`,
    retryAfterSeconds: 60,
  };
}

function shouldRequireDurableRateLimit(durableRequired) {
  // If explicitly requested or running in production, durable storage (Redis) is mandatory.
  return isProductionRuntime() || Boolean(durableRequired);
}

function warnRedisOnce(message) {
  if (globalThis._redisWarningShown) return;
  globalThis._redisWarningShown = true;
  console.warn(`[ratelimit] ${message}. Falling back to in-memory counters.`);
}

async function redisCommand(parts) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) throw new Error('Upstash not configured');

  const path = parts.map(v => encodeURIComponent(String(v))).join('/');
  const res = await fetch(`${url}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Redis HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data?.error) {
    throw new Error(String(data.error));
  }
  return data?.result;
}

function getMemoryStore() {
  if (!globalThis._rateLimitMemory) {
    globalThis._rateLimitMemory = {
      tokenWindow: {},
      windows: {},
      credits: {},
    };
  }
  return globalThis._rateLimitMemory;
}

function memWindowIncr(bucket, key, windowMs) {
  const store = getMemoryStore();
  if (!store.windows) store.windows = {};
  if (!store.windows[bucket]) store.windows[bucket] = {};
  const bucketStore = bucket === 'tokenWindow' ? store.tokenWindow : store.windows[bucket];
  const now = Date.now();
  const curr = bucketStore[key] || { count: 0, resetAt: now + windowMs };
  if (now > curr.resetAt) {
    curr.count = 0;
    curr.resetAt = now + windowMs;
  }
  curr.count += 1;
  bucketStore[key] = curr;
  return {
    count: curr.count,
    resetInSeconds: Math.max(1, Math.ceil((curr.resetAt - now) / 1000)),
  };
}

function memCreditsGet(key) {
  const store = getMemoryStore();
  const now = Date.now();
  const curr = store.credits[key];
  if (!curr) return 0;
  if (now > curr.resetAt) {
    delete store.credits[key];
    return 0;
  }
  return curr.count;
}

function memCreditsIncr(key, ttlSeconds) {
  const store = getMemoryStore();
  const now = Date.now();
  const ttlMs = Math.max(1, ttlSeconds) * 1000;
  const curr = store.credits[key] || { count: 0, resetAt: now + ttlMs };
  if (now > curr.resetAt) {
    curr.count = 0;
    curr.resetAt = now + ttlMs;
  }
  curr.count += 1;
  store.credits[key] = curr;
  return curr.count;
}

export function getClientIp(req) {
  const h = req.headers || {};

  // 1. Cloudflare: Trust cf-connecting-ip ONLY when explicitly enabled.
  // This must only be enabled when Cloudflare is the exclusive entry point.
  if (process.env.TRUST_CLOUDFLARE_HEADERS === 'true') {
    const cfIp = sanitizeIp(h['cf-connecting-ip']);
    if (cfIp) return cfIp;
  }

  // 2. Vercel: Trust x-real-ip ONLY when running on Vercel's runtime.
  // VERCEL=1 is injected by the Vercel platform and is the reliable runtime
  // signal. VERCEL_ENV alone is not sufficient — it can be set locally via
  // .env files without requests actually flowing through Vercel's edge.
  if (process.env.VERCEL === '1') {
    const realIp = sanitizeIp(h['x-real-ip']);
    if (realIp) return realIp;
  }

  // 3. x-forwarded-for is NOT trusted. It can be easily spoofed by clients
  // unless a specific verified proxy chain is configured. To prevent IP-rotation
  // attacks, we ignore it entirely.

  // 4. Fallback: Use the direct socket address. This is the only reliable
  // source in local development and non-proxied environments.
  return sanitizeIp(req.socket?.remoteAddress) || 'unknown';
}

export function sendRateLimitResponse(res, allowance) {
  if (allowance.configError) {
    return res.status(allowance.status || 503).json({
      error: allowance.error,
      detail: allowance.detail,
      retryAfterSeconds: allowance.retryAfterSeconds,
    });
  }
  if (!allowance.allowed) {
    res.setHeader('Retry-After', String(allowance.resetInSeconds));
    return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: allowance.resetInSeconds });
  }
  return null;
}

export function sendMethodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  return res.status(405).json({ error: 'Method Not Allowed' });
}

export async function takeRequestAllowance(bucket, ip, { limit, windowSeconds = 3600, durableRequired = false } = {}) {
  const safeBucket = String(bucket || 'api').replace(/[^a-z0-9-]/gi, '_').slice(0, 80);
  const safeLimit = Math.max(1, Number(limit) || 1);
  const windowMs = Math.max(1, windowSeconds) * 1000;
  const key = `rl:${safeBucket}:${ip}`;
  const durableRequiredNow = shouldRequireDurableRateLimit(durableRequired);
  const redisConfig = getRedisConfig();
  if (durableRequiredNow && !redisConfig.enabled) {
    return durableRateLimitFailure('Upstash Redis is missing');
  }
  try {
    const count = Number(await redisCommand(['incr', key]));
    if (count === 1) await redisCommand(['expire', key, windowSeconds]);
    return {
      allowed: count <= safeLimit,
      remaining: Math.max(0, safeLimit - count),
      resetInSeconds: windowSeconds,
    };
  } catch (err) {
    if (durableRequiredNow) {
      return durableRateLimitFailure(err.message || 'Upstash Redis request failed');
    }
    warnRedisOnce(err.message || 'Redis unavailable');
    const local = memWindowIncr(safeBucket, ip, windowMs || WINDOW_MS);
    return {
      allowed: local.count <= safeLimit,
      remaining: Math.max(0, safeLimit - local.count),
      resetInSeconds: local.resetInSeconds,
    };
  }
}

export async function takeTokenIssueAllowance(ip, { limit = 3, windowSeconds = 3600, durableRequired = false } = {}) {
  return takeRequestAllowance('token', ip, { limit, windowSeconds, durableRequired });
}

export async function getUsedCredits(creditId) {
  const key = `credits:${creditId}`;
  try {
    const result = await redisCommand(['get', key]);
    return Number(result || 0);
  } catch (err) {
    warnRedisOnce(err.message || 'Redis unavailable');
    return memCreditsGet(creditId);
  }
}

export async function reserveCredit(creditId, { limit = 10, ttlSeconds = 3600, durableRequired = false } = {}) {
  const key = `credits:${creditId}`;
  const durableRequiredNow = shouldRequireDurableRateLimit(durableRequired);
  const redisConfig = getRedisConfig();
  if (durableRequiredNow && !redisConfig.enabled) {
    return durableRateLimitFailure('Upstash Redis is missing');
  }
  try {
    const count = Number(await redisCommand(['incr', key]));
    if (count === 1) await redisCommand(['expire', key, ttlSeconds]);
    return {
      allowed: count <= limit,
      used: count,
      remaining: Math.max(0, limit - count),
    };
  } catch (err) {
    if (durableRequiredNow) {
      return durableRateLimitFailure(err.message || 'Upstash Redis request failed');
    }
    warnRedisOnce(err.message || 'Redis unavailable');
    const count = memCreditsIncr(creditId, ttlSeconds);
    return {
      allowed: count <= limit,
      used: count,
      remaining: Math.max(0, limit - count),
    };
  }
}

export async function incrementUsedCredits(creditId, { ttlSeconds = 3600 } = {}) {
  const key = `credits:${creditId}`;
  try {
    const count = Number(await redisCommand(['incr', key]));
    if (count === 1) await redisCommand(['expire', key, ttlSeconds]);
    return count;
  } catch (err) {
    warnRedisOnce(err.message || 'Redis unavailable');
    return memCreditsIncr(creditId, ttlSeconds);
  }
}
