/**
 * Lightweight, per-instance provider usage telemetry.
 *
 * Tracks, per upstream provider (dune, etherscan, alchemy, coingecko, dexscreener,
 * thegraph, defillama, wallet-live, …), the signals we need to spot accidental
 * over-calling before it shows up on a provider invoice:
 *
 *   calls         — outbound provider requests actually made (cache misses)
 *   rateLimited   — provider responded 429 (or we detected upstream throttling)
 *   errors        — provider request failed (non-2xx or threw)
 *   cacheHits     — request served from a fresh cache entry (no provider call)
 *   cacheMisses   — cache absent/expired, so a provider call was attempted
 *   staleServed   — provider failed and we served a stale cache entry instead
 *   latencyMsTotal/latencyCount — for an average provider latency
 *
 * Counters live on globalThis so they survive module re-imports within a single
 * serverless instance. They are intentionally in-memory and best-effort: this is
 * observability, not billing. Read them via getProviderTelemetry() (see the
 * dev-only /api/provider-usage route).
 */

const VALID_EVENTS = new Set([
  'call', 'rateLimited', 'error', 'cacheHit', 'cacheMiss', 'staleServed',
]);

function emptyProviderStats() {
  return {
    calls: 0,
    rateLimited: 0,
    errors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    staleServed: 0,
    latencyMsTotal: 0,
    latencyCount: 0,
    lastUpdated: null,
  };
}

function getStore() {
  if (!globalThis._providerTelemetry) globalThis._providerTelemetry = {};
  return globalThis._providerTelemetry;
}

function normalizeProvider(provider) {
  return String(provider || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '_').slice(0, 40);
}

function statsFor(provider) {
  const store = getStore();
  const key = normalizeProvider(provider);
  if (!store[key]) store[key] = emptyProviderStats();
  return store[key];
}

/**
 * Record a single telemetry event for a provider.
 * @param {string} provider
 * @param {'call'|'rateLimited'|'error'|'cacheHit'|'cacheMiss'|'staleServed'} event
 * @param {{ ms?: number }} [opts]  latency in ms (only meaningful for 'call')
 */
export function recordProviderEvent(provider, event, { ms } = {}) {
  if (!VALID_EVENTS.has(event)) return;
  const stats = statsFor(provider);
  if (event === 'call') {
    stats.calls += 1;
    if (Number.isFinite(ms) && ms >= 0) {
      stats.latencyMsTotal += ms;
      stats.latencyCount += 1;
    }
  } else if (event === 'rateLimited') {
    stats.rateLimited += 1;
  } else if (event === 'error') {
    stats.errors += 1;
  } else if (event === 'cacheHit') {
    stats.cacheHits += 1;
  } else if (event === 'cacheMiss') {
    stats.cacheMisses += 1;
  } else if (event === 'staleServed') {
    stats.staleServed += 1;
  }
  stats.lastUpdated = new Date().toISOString();
}

/**
 * Convenience: record one outbound provider call plus its outcome.
 * @param {string} provider
 * @param {{ ms?: number, ok?: boolean, status?: number }} outcome
 */
export function recordProviderCall(provider, { ms, ok = true, status } = {}) {
  recordProviderEvent(provider, 'call', { ms });
  if (status === 429) recordProviderEvent(provider, 'rateLimited');
  if (ok === false || (Number.isFinite(status) && status >= 400)) {
    recordProviderEvent(provider, 'error');
  }
}

/** Snapshot of all provider counters with derived averages. Safe to serialize. */
export function getProviderTelemetry() {
  const store = getStore();
  const providers = {};
  for (const [provider, stats] of Object.entries(store)) {
    providers[provider] = {
      calls: stats.calls,
      rateLimited: stats.rateLimited,
      errors: stats.errors,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      staleServed: stats.staleServed,
      avgLatencyMs: stats.latencyCount > 0
        ? Math.round(stats.latencyMsTotal / stats.latencyCount)
        : null,
      cacheHitRate: (stats.cacheHits + stats.cacheMisses) > 0
        ? Math.round((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100) / 100
        : null,
      lastUpdated: stats.lastUpdated,
    };
  }
  return { providers, snapshotAt: new Date().toISOString() };
}

/** Clear all counters. Used by tests and admin tooling. */
export function resetProviderTelemetry() {
  globalThis._providerTelemetry = {};
}
