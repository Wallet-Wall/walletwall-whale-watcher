/**
 * Shared Dune Analytics API client with Redis-backed caching.
 *
 * Read-only operation — WalletWall treats Dune as a read-only auto-run
 * snapshot source. Public runtime routes must never execute Dune queries.
 *
 * Allowed from public routes
 * ──────────────────────────
 *   readLatestResults(queryId, opts)
 *     Reads whatever Dune produced on the last auto-run / scheduled run.
 *     Free, instant, no credits consumed.
 *
 *   readOrCache(queryId, opts)
 *     Read-only cache-aside: reads latest Dune snapshot then caches it.
 *     Recommended TTLs: 21 600 (6h) for quantum facts, 43 200 (12h) for
 *     movement/breakdown, 86 400 (24h) for holder leaderboards.
 *
 *   getOrCache(queryId, params, opts)
 *     Same as readOrCache but namespaces the cache key by params so that
 *     concurrent requests for different wallets don't overwrite each other.
 *     On a cache miss it reads the latest Dune snapshot — it NEVER executes
 *     a query. The caller is responsible for filtering rows by wallet address.
 *
 * Admin / internal only — fail-closed multi-factor gate
 * ──────────────────────────────────────────────────────────
 *   executeAndPoll(queryId, params, opts)
 *     POSTs an execution request to Dune and polls until complete.
 *     Consumes execution credits. Must NOT be imported by public API routes.
 *     Blocked unless ALL of these hold (see _dune-execution-guard.js):
 *       ALLOW_DUNE_EXECUTION=true, DUNE_EXECUTION_ACK=<ack phrase>,
 *       DUNE_WRITE_API_KEY set, and NOT running in CI/tests.
 *     Only a deliberate, one-off human action can satisfy all four.
 *
 * Redis key schema
 * ────────────────
 *   dune:v1:<queryId>:<paramHash>   — per-wallet cache namespace
 *   dune:v1:<queryId>:default       — global / non-parameterized snapshot
 */

import { getRedisConfig } from './_ratelimit.js';
import { recordProviderCall } from './_provider-telemetry.js';
import { assertDuneExecutionAllowed } from './_dune-execution-guard.js';

const DUNE_BASE = 'https://api.dune.com/api/v1';

/**
 * Read-only key for cache/read paths. Prefers the explicitly read-scoped
 * DUNE_READONLY_API_KEY; falls back to the legacy DUNE_API_KEY. A write key
 * (DUNE_WRITE_API_KEY) is NEVER used for reads.
 */
function getReadKey() {
  return process.env.DUNE_READONLY_API_KEY || process.env.DUNE_API_KEY || '';
}

/** Stable, order-independent hash for a params object. */
function makeParamHash(params) {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join('&') : 'default';
}

// In-process fallback used when Redis is not configured (dev / quota-guard).
function getMemCache() {
  if (!globalThis._duneMemCache) globalThis._duneMemCache = new Map();
  return globalThis._duneMemCache;
}

function getInflightReads() {
  if (!globalThis._duneInflightReads) globalThis._duneInflightReads = new Map();
  return globalThis._duneInflightReads;
}

async function coalesceRead(cacheKey, load) {
  const inflight = getInflightReads();
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const pending = Promise.resolve()
    .then(load)
    .finally(() => {
      if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
    });
  inflight.set(cacheKey, pending);
  return pending;
}

async function cacheGet(key) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) {
    const entry = getMemCache().get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { getMemCache().delete(key); return null; }
    return entry.value;
  }
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.result ?? null;
  } catch { return null; }
}

async function cacheSetEx(key, ttlSeconds, value) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) {
    getMemCache().set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  try {
    // Upstash REST: POST /setex/<key>/<ttl>/<value>
    await fetch(
      `${url}/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodeURIComponent(value)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }
    );
  } catch { /* non-critical — a cache write failure just means the next request re-reads Dune */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the latest cached results from Dune for a given query.
 * No execution credit is consumed. Returns rows and the query execution timestamp.
 * @param {string|number} queryId
 * @param {{ limit?: number }} opts
 * @returns {Promise<{ rows: object[], queryRunAt: string|null }>}
 */
export async function readLatestResults(queryId, { limit = 200 } = {}) {
  const key = getReadKey();
  if (!key) throw new Error('Dune read key not configured (set DUNE_READONLY_API_KEY or DUNE_API_KEY)');

  const startedAt = Date.now();
  let r;
  try {
    r = await fetch(
      `${DUNE_BASE}/query/${queryId}/results?limit=${limit}`,
      { headers: { 'x-dune-api-key': key }, signal: AbortSignal.timeout(10000) }
    );
  } catch (e) {
    recordProviderCall('dune', { ms: Date.now() - startedAt, ok: false });
    throw e;
  }
  recordProviderCall('dune', { ms: Date.now() - startedAt, ok: r.ok, status: r.status });
  if (!r.ok) throw new Error(`Dune HTTP ${r.status} reading query ${queryId}`);
  const d = await r.json();
  const rows = d.result?.rows;
  if (!Array.isArray(rows)) throw new Error(`Dune query ${queryId}: unexpected response shape`);
  const queryRunAt = d.execution_ended_at ?? d.execution_started_at ?? null;
  return { rows, queryRunAt, limit };
}

/**
 * Execute a parameterized Dune query and poll until complete.
 * ADMIN / INTERNAL USE ONLY — fail-closed behind assertDuneExecutionAllowed
 * (ALLOW_DUNE_EXECUTION + DUNE_EXECUTION_ACK + DUNE_WRITE_API_KEY + not CI/test).
 * Must NOT be called from public API routes.
 * @param {string|number} queryId
 * @param {Record<string, string>} params   query_parameters passed to Dune
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<{ rows: object[], queryRunAt: string|null }>}
 */
export async function executeAndPoll(queryId, params = {}, { timeoutMs = 25000 } = {}) {
  // Fail-closed multi-factor gate (see api/_dune-execution-guard.js):
  // requires ALLOW_DUNE_EXECUTION=true + DUNE_EXECUTION_ACK ack phrase +
  // a dedicated DUNE_WRITE_API_KEY + not running in CI/tests. No agent, CI
  // job, script, or test can satisfy all four by accident.
  assertDuneExecutionAllowed(process.env);

  // Execution uses the dedicated WRITE key only — never the read key.
  const key = process.env.DUNE_WRITE_API_KEY;
  if (!key) throw new Error('DUNE_WRITE_API_KEY not configured');

  const headers = { 'x-dune-api-key': key, 'Content-Type': 'application/json' };

  const execRes = await fetch(`${DUNE_BASE}/query/${queryId}/execute`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ query_parameters: params }),
    signal:  AbortSignal.timeout(8000),
  });
  if (!execRes.ok) throw new Error(`Dune execute HTTP ${execRes.status} for query ${queryId}`);
  const { execution_id } = await execRes.json();
  if (!execution_id) throw new Error(`Dune query ${queryId}: no execution_id returned`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    const pollRes = await fetch(
      `${DUNE_BASE}/execution/${execution_id}/results`,
      { headers: { 'x-dune-api-key': key }, signal: AbortSignal.timeout(8000) }
    ).catch(() => null);
    if (!pollRes?.ok) break;
    const data = await pollRes.json();
    if (data.state === 'QUERY_STATE_COMPLETED') {
      const queryRunAt = data.execution_ended_at ?? data.execution_started_at ?? null;
      return { rows: data.result?.rows || [], queryRunAt };
    }
    if (data.state === 'QUERY_STATE_FAILED' || data.state === 'QUERY_STATE_CANCELLED') {
      throw new Error(`Dune query ${queryId} ended with state: ${data.state}`);
    }
  }
  throw new Error(`Dune query ${queryId} timed out after ${timeoutMs}ms`);
}

/**
 * Cache-aside wrapper for per-wallet callers.
 * Delegates to readOrCache so all wallets share a single cache entry per
 * queryId — no per-wallet snapshot copies in Redis, and only one Dune read
 * is needed regardless of how many concurrent wallet requests arrive.
 * The `params` argument is ignored (no query parameters are sent to Dune).
 * Callers must filter returned rows by wallet address downstream.
 *
 * @param {string|number} queryId
 * @param {Record<string, string>} _params  ignored — kept for call-site compat
 * @param {{ ttlSeconds?: number }} opts
 * @returns {Promise<{ rows: object[], fromCache: boolean, queryRunAt: string|null }>}
 */
export async function getOrCache(queryId, _params = {}, { ttlSeconds = 900 } = {}) {
  const cacheKey = `dune:v1:${queryId}:default`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Handle legacy cache entries (plain array) alongside current ({ rows, queryRunAt })
      if (Array.isArray(parsed)) return { rows: parsed, fromCache: true, queryRunAt: null, limit: null };
      return { rows: parsed.rows || [], fromCache: true, queryRunAt: parsed.queryRunAt ?? null, limit: null };
    }
    catch { /* corrupted entry — fall through to read latest */ }
  }

  // Read the latest Dune snapshot — never executes a query.
  return coalesceRead(cacheKey, async () => {
    const { rows, queryRunAt, limit } = await readLatestResults(queryId);
    if (rows.length > 0) await cacheSetEx(cacheKey, ttlSeconds, JSON.stringify({ rows, queryRunAt }));
    return { rows, fromCache: false, queryRunAt, limit };
  });
}

/**
 * Read-only cache-aside for global (non-parameterized) trend queries.
 * Reads Dune's latest results (free, no execution credit), caches in Redis.
 * On a cache hit the response is instant; on a miss it calls Dune once.
 *
 * @param {string|number} queryId
 * @param {{ ttlSeconds?: number, limit?: number }} opts
 * @returns {Promise<{ rows: object[], fromCache: boolean, queryRunAt: string|null, limit: number|null }>}
 */
export async function readOrCache(queryId, { ttlSeconds = 3600, limit = 200 } = {}) {
  const cacheKey = `dune:v1:${queryId}:default`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Handle legacy cache entries (plain array) alongside current ({ rows, queryRunAt })
      if (Array.isArray(parsed)) return { rows: parsed, fromCache: true, queryRunAt: null, limit: null };
      return { rows: parsed.rows || [], fromCache: true, queryRunAt: parsed.queryRunAt ?? null, limit: null };
    }
    catch { /* corrupted — fall through */ }
  }

  return coalesceRead(cacheKey, async () => {
    const { rows, queryRunAt } = await readLatestResults(queryId, { limit });
    if (rows.length > 0) await cacheSetEx(cacheKey, ttlSeconds, JSON.stringify({ rows, queryRunAt }));
    return { rows, fromCache: false, queryRunAt, limit };
  });
}
