import test from 'node:test';
import assert from 'node:assert/strict';

import { withProviderCache, ProviderRateLimitError, durableCacheEnabled } from '../api/_provider-cache.js';
import { getProviderTelemetry, resetProviderTelemetry } from '../api/_provider-telemetry.js';

function resetAll() {
  delete globalThis._providerCacheMem;
  delete globalThis._providerCacheInflight;
  delete globalThis._redisWarningShown;
  // Ensure no durable backend is configured for these in-memory tests.
  for (const k of [
    'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL', 'KV_REST_API_TOKEN',
    'STORAGE_KV_REST_API_URL', 'STORAGE_KV_REST_API_TOKEN',
    'PROVIDER_CACHE_ENABLED', 'NODE_ENV', 'VERCEL_ENV',
  ]) delete process.env[k];
  resetProviderTelemetry();
}

test.beforeEach(resetAll);
test.afterEach(resetAll);

// ── Cache hit: loader runs once across repeated calls ────────────────────────
test('cache hit: loader is called once for repeated calls within TTL', async () => {
  let calls = 0;
  const load = async () => { calls++; return { v: 1 }; };

  const a = await withProviderCache({ provider: 'test', key: 'k', ttlSeconds: 1000, load });
  const b = await withProviderCache({ provider: 'test', key: 'k', ttlSeconds: 1000, load });

  assert.equal(calls, 1, 'second call should be served from cache');
  assert.equal(a.fromCache, false);
  assert.equal(b.fromCache, true);
  assert.deepEqual(b.value, { v: 1 });

  const { providers } = getProviderTelemetry();
  assert.equal(providers.test.cacheHits, 1);
  assert.equal(providers.test.cacheMisses, 1);
  assert.equal(providers.test.calls, 1);
});

// ── Coalescing: concurrent misses share a single loader call ─────────────────
test('coalescing: concurrent calls trigger only one loader invocation', async () => {
  let calls = 0;
  const load = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { v: 2 }; };

  const [a, b, c] = await Promise.all([
    withProviderCache({ provider: 'test', key: 'same', ttlSeconds: 1000, load }),
    withProviderCache({ provider: 'test', key: 'same', ttlSeconds: 1000, load }),
    withProviderCache({ provider: 'test', key: 'same', ttlSeconds: 1000, load }),
  ]);

  assert.equal(calls, 1, 'no retry storm — one upstream call for concurrent requests');
  assert.deepEqual([a.value, b.value, c.value], [{ v: 2 }, { v: 2 }, { v: 2 }]);
});

// ── isCacheable gating: uncacheable results are not stored ───────────────────
test('isCacheable=false means the result is never cached', async () => {
  let calls = 0;
  const load = async () => { calls++; return { rows: [] }; };
  const isCacheable = (val) => Array.isArray(val.rows) && val.rows.length > 0;

  await withProviderCache({ provider: 'test', key: 'empty', ttlSeconds: 1000, load, isCacheable });
  await withProviderCache({ provider: 'test', key: 'empty', ttlSeconds: 1000, load, isCacheable });

  assert.equal(calls, 2, 'empty result must not be cached — loader runs again');
});

// ── Stale-on-429: serve a prior cached value when the provider throttles ──────
test('provider 429: serves stale cache and records rateLimited', async () => {
  // Seed cache with a good value.
  await withProviderCache({ provider: 'test', key: 'stale', ttlSeconds: 1000, load: async () => ({ v: 'fresh' }) });

  // Force the entry to look stale (older than TTL).
  for (const entry of globalThis._providerCacheMem.values()) {
    entry.stored.cachedAt = Date.now() - 10_000_000;
  }
  resetProviderTelemetry();

  const result = await withProviderCache({
    provider: 'test',
    key: 'stale',
    ttlSeconds: 10,
    load: async () => { throw new ProviderRateLimitError('429 from upstream'); },
  });

  assert.equal(result.stale, true, 'should serve stale on upstream failure');
  assert.equal(result.fromCache, true);
  assert.deepEqual(result.value, { v: 'fresh' });

  const { providers } = getProviderTelemetry();
  assert.equal(providers.test.staleServed, 1);
  assert.equal(providers.test.rateLimited, 1);
  assert.equal(providers.test.errors, 1);
});

// ── No stale available: error propagates ─────────────────────────────────────
test('loader error with no cached value rethrows', async () => {
  await assert.rejects(
    () => withProviderCache({
      provider: 'test',
      key: 'cold',
      ttlSeconds: 10,
      load: async () => { throw new Error('upstream down'); },
    }),
    /upstream down/,
  );
});

// ── durableCacheEnabled gating ───────────────────────────────────────────────
test('durableCacheEnabled: off by default, on in production or via flag', () => {
  resetAll();
  assert.equal(durableCacheEnabled(), false, 'off in local/test with no Redis');

  process.env.NODE_ENV = 'production';
  assert.equal(durableCacheEnabled(), true, 'on in production');
  delete process.env.NODE_ENV;

  process.env.PROVIDER_CACHE_ENABLED = 'true';
  assert.equal(durableCacheEnabled(), true, 'on when explicitly enabled');
  process.env.PROVIDER_CACHE_ENABLED = 'false';
  assert.equal(durableCacheEnabled(), false, 'explicit false wins');
});
