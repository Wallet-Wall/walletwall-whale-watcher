/**
 * Generic provider cache-aside wrapper.
 *
 * Protects any upstream provider (Etherscan, Alchemy, CoinGecko, …) from being
 * re-called on repeated page loads, navigation, polling, retries, or repeated
 * clicks. Built on the same Redis + in-memory-fallback pattern as _dune.js, plus:
 *
 *   - in-flight coalescing      one provider call per key, no retry storms
 *   - stale-on-failure fallback if the loader throws (incl. tagged 429s), a
 *                               previously cached value is served instead of
 *                               breaking the page
 *   - telemetry                 cache hit/miss, stale-served, recorded per provider
 *
 * Cache entries are stored with a long physical TTL (staleTtlSeconds) but carry a
 * `cachedAt` timestamp. An entry younger than ttlSeconds is a fresh hit (no
 * provider call); an older entry is only used as a stale fallback when a refresh
 * fails.
 */

import { getRedisConfig } from './_ratelimit.js';
import { recordProviderEvent } from './_provider-telemetry.js';

const KEY_PREFIX = 'pc:v1';

/** Error that signals an upstream provider throttle so callers can serve stale. */
export class ProviderRateLimitError extends Error {
  constructor(message, status = 429) {
    super(message);
    this.name = 'ProviderRateLimitError';
    this.status = status;
    this.isRateLimit = true;
  }
}

/**
 * Whether server-side provider caching should be active.
 *
 * Enabled where it protects real provider spend — production runtimes and any
 * deployment with durable (Redis) cache configured — and forceable via
 * PROVIDER_CACHE_ENABLED. Left off in local/test runs without Redis so each
 * request exercises the live provider path directly.
 */
export function durableCacheEnabled() {
  if (process.env.PROVIDER_CACHE_ENABLED === 'false') return false;
  if (process.env.PROVIDER_CACHE_ENABLED === 'true') return true;
  if (getRedisConfig().enabled) return true;
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function getMemCache() {
  if (!globalThis._providerCacheMem) globalThis._providerCacheMem = new Map();
  return globalThis._providerCacheMem;
}

function getInflight() {
  if (!globalThis._providerCacheInflight) globalThis._providerCacheInflight = new Map();
  return globalThis._providerCacheInflight;
}

function buildKey(provider, key) {
  const safeProvider = String(provider || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '_').slice(0, 40);
  const safeKey = String(key || 'default').toLowerCase().replace(/[^a-z0-9:._-]/g, '_').slice(0, 200);
  return `${KEY_PREFIX}:${safeProvider}:${safeKey}`;
}

async function cacheGet(fullKey) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) {
    const entry = getMemCache().get(fullKey);
    if (!entry) return null;
    if (Date.now() > entry.physicalExpiresAt) { getMemCache().delete(fullKey); return null; }
    return entry.stored;
  }
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(fullKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.result == null) return null;
    return JSON.parse(d.result);
  } catch { return null; }
}

async function cacheSet(fullKey, stored, staleTtlSeconds) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) {
    getMemCache().set(fullKey, { stored, physicalExpiresAt: Date.now() + staleTtlSeconds * 1000 });
    return;
  }
  try {
    await fetch(
      `${url}/setex/${encodeURIComponent(fullKey)}/${staleTtlSeconds}/${encodeURIComponent(JSON.stringify(stored))}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }
    );
  } catch { /* non-critical — a write failure just means the next request re-reads upstream */ }
}

/**
 * Cache-aside with coalescing and stale-on-failure fallback.
 *
 * @template T
 * @param {object} args
 * @param {string} args.provider        telemetry/cache namespace, e.g. 'etherscan'
 * @param {string} args.key             cache key within the provider namespace
 * @param {number} args.ttlSeconds       freshness window — entries younger than this are served without a provider call
 * @param {number} [args.staleTtlSeconds] physical retention used for stale fallback (defaults to 24h)
 * @param {() => Promise<T>} args.load   loads a fresh value from the provider
 * @param {(value: T) => boolean} [args.isCacheable] only store when this returns true (default: store everything)
 * @returns {Promise<{ value: T, fromCache: boolean, stale: boolean, ageSeconds: number|null }>}
 */
export async function withProviderCache({
  provider,
  key,
  ttlSeconds,
  staleTtlSeconds = 86_400,
  load,
  isCacheable = () => true,
}) {
  const fullKey = buildKey(provider, key);
  const effectiveStaleTtl = Math.max(staleTtlSeconds, ttlSeconds);

  const existing = await cacheGet(fullKey);
  if (existing && typeof existing.cachedAt === 'number') {
    const ageSeconds = Math.round((Date.now() - existing.cachedAt) / 1000);
    if (ageSeconds <= ttlSeconds) {
      recordProviderEvent(provider, 'cacheHit');
      return { value: existing.value, fromCache: true, stale: false, ageSeconds };
    }
  }

  recordProviderEvent(provider, 'cacheMiss');

  const inflight = getInflight();
  if (inflight.has(fullKey)) return inflight.get(fullKey);

  const pending = (async () => {
    const startedAt = Date.now();
    try {
      const value = await load();
      recordProviderEvent(provider, 'call', { ms: Date.now() - startedAt });
      if (isCacheable(value)) {
        await cacheSet(fullKey, { value, cachedAt: Date.now() }, effectiveStaleTtl);
      }
      return { value, fromCache: false, stale: false, ageSeconds: null };
    } catch (err) {
      recordProviderEvent(provider, 'call', { ms: Date.now() - startedAt });
      recordProviderEvent(provider, 'error');
      if (err?.isRateLimit || err?.status === 429) recordProviderEvent(provider, 'rateLimited');
      // Serve stale cache on failure if we have any — avoids breaking the page.
      if (existing && 'value' in existing) {
        recordProviderEvent(provider, 'staleServed');
        const ageSeconds = typeof existing.cachedAt === 'number'
          ? Math.round((Date.now() - existing.cachedAt) / 1000)
          : null;
        return { value: existing.value, fromCache: true, stale: true, ageSeconds };
      }
      throw err;
    } finally {
      if (inflight.get(fullKey) === pending) inflight.delete(fullKey);
    }
  })();

  inflight.set(fullKey, pending);
  return pending;
}
