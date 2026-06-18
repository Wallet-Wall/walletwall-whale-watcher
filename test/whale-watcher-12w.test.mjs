/**
 * Tests for Whale Watcher 12-week Dune scheduled query integration.
 *
 * Covers:
 *  - normalizeRows groups rows by address correctly
 *  - normalizeRows handles multiple distinct addresses
 *  - normalizeRows clamps intensity_score to 0..1 (below 0, above 1, NaN)
 *  - normalizeRows handles null/missing fields safely
 *  - normalizeRows skips rows without activity_day (48h-summary-only rows)
 *  - normalizeRows sorts activity12w chronologically
 *  - handler: does not call POST /execute — reads latest results only
 *  - handler: DUNE_QUERY_12WK_ACTIVE_WALLETS not configured → 200 with empty wallets + warning
 *  - handler: DUNE_API_KEY not set → 503
 *  - handler: empty Dune rows → graceful 200 with empty wallets
 *  - handler: metadata.dataNote never contains "live"
 *  - handler: isStale true when queryRunAt is older than stale window
 *  - handler: isStale false when queryRunAt is recent
 *  - source compliance: whale-watcher.js does not import executeAndPoll
 *  - source compliance: DATA_NOTE constant is "Dune Analytics · scheduled wallet data"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── Pure function tests (normalizeRows) ───────────────────────────────────────

const { normalizeRows } = await import('../api/whale-watcher.js');

test('normalizeRows: groups rows by address', () => {
  const rows = [
    { address: '0xAAAA', label: 'Wallet A', activity_day: '2026-05-01', intensity_score: 0.5, tx_count_day: 10 },
    { address: '0xAAAA', label: 'Wallet A', activity_day: '2026-05-02', intensity_score: 0.7, tx_count_day: 15 },
  ];
  const result = normalizeRows(rows);
  const addresses = Object.keys(result);
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0], '0xaaaa');
  assert.equal(result['0xaaaa'].activity12w.length, 2);
});

test('normalizeRows: multiple addresses produce separate wallet entries', () => {
  const rows = [
    { address: '0xAAAA', label: 'Whale A', activity_day: '2026-05-10', intensity_score: 0.3, tx_count_48h: 100 },
    { address: '0xBBBB', label: 'Whale B', activity_day: '2026-05-10', intensity_score: 0.8, tx_count_48h: 200 },
  ];
  const result = normalizeRows(rows);
  assert.equal(Object.keys(result).length, 2);
  assert.ok(result['0xaaaa']);
  assert.ok(result['0xbbbb']);
  assert.equal(result['0xaaaa'].label, 'Whale A');
  assert.equal(result['0xbbbb'].label, 'Whale B');
});

test('normalizeRows: intensity_score clamped — below 0 becomes 0', () => {
  const rows = [{ address: '0xCCCC', activity_day: '2026-05-01', intensity_score: -0.5 }];
  const result = normalizeRows(rows);
  assert.equal(result['0xcccc'].activity12w[0].intensity_score, 0);
});

test('normalizeRows: intensity_score clamped — above 1 becomes 1', () => {
  const rows = [{ address: '0xCCCC', activity_day: '2026-05-01', intensity_score: 1.5 }];
  const result = normalizeRows(rows);
  assert.equal(result['0xcccc'].activity12w[0].intensity_score, 1);
});

test('normalizeRows: intensity_score 0.5 passes through unchanged', () => {
  const rows = [{ address: '0xCCCC', activity_day: '2026-05-01', intensity_score: 0.5 }];
  const result = normalizeRows(rows);
  assert.equal(result['0xcccc'].activity12w[0].intensity_score, 0.5);
});

test('normalizeRows: null intensity_score treated as 0', () => {
  const rows = [{ address: '0xCCCC', activity_day: '2026-05-01', intensity_score: null }];
  const result = normalizeRows(rows);
  assert.equal(result['0xcccc'].activity12w[0].intensity_score, 0);
});

test('normalizeRows: NaN intensity_score treated as 0', () => {
  const rows = [{ address: '0xCCCC', activity_day: '2026-05-01', intensity_score: 'not-a-number' }];
  const result = normalizeRows(rows);
  assert.equal(result['0xcccc'].activity12w[0].intensity_score, 0);
});

test('normalizeRows: rows without activity_day produce no activity12w entries', () => {
  const rows = [
    { address: '0xDDDD', label: 'Summary Row', tx_count_48h: 50, usd_volume_48h: 1000 },
  ];
  const result = normalizeRows(rows);
  assert.equal(result['0xdddd'].activity12w.length, 0, 'no day row should produce empty activity12w');
  assert.equal(result['0xdddd'].tx_count_48h, 50, '48h summary fields should still be captured');
  assert.equal(result['0xdddd'].usd_volume_48h, 1000);
});

test('normalizeRows: mixed rows — summary row preserved, day rows added', () => {
  const rows = [
    { address: '0xEEEE', tx_count_48h: 77, usd_volume_48h: 5000 },
    { address: '0xEEEE', activity_day: '2026-05-20', intensity_score: 0.6, tx_count_day: 8 },
  ];
  const result = normalizeRows(rows);
  assert.equal(result['0xeeee'].tx_count_48h, 77);
  assert.equal(result['0xeeee'].activity12w.length, 1);
  assert.equal(result['0xeeee'].activity12w[0].tx_count, 8);
});

test('normalizeRows: activity12w sorted chronologically', () => {
  const rows = [
    { address: '0xFFFF', activity_day: '2026-05-03', intensity_score: 0.2 },
    { address: '0xFFFF', activity_day: '2026-05-01', intensity_score: 0.1 },
    { address: '0xFFFF', activity_day: '2026-05-02', intensity_score: 0.3 },
  ];
  const result = normalizeRows(rows);
  const dates = result['0xffff'].activity12w.map(d => d.date);
  assert.deepEqual(dates, ['2026-05-01', '2026-05-02', '2026-05-03']);
});

test('normalizeRows: null/missing label and category are null in output', () => {
  const rows = [{ address: '0x1234', activity_day: '2026-05-01', intensity_score: 0 }];
  const result = normalizeRows(rows);
  assert.equal(result['0x1234'].label, null);
  assert.equal(result['0x1234'].category, null);
});

test('normalizeRows: address is normalised to lowercase', () => {
  const rows = [{ address: '0xABCDEF', activity_day: '2026-05-01', intensity_score: 0 }];
  const result = normalizeRows(rows);
  assert.ok(result['0xabcdef'], 'address key must be lowercase');
  assert.equal(result['0xabcdef'].address, '0xabcdef');
});

test('normalizeRows: rows with no address are skipped', () => {
  const rows = [
    { address: null, activity_day: '2026-05-01', intensity_score: 0.5 },
    { activity_day: '2026-05-01', intensity_score: 0.5 },
    { address: '  ', activity_day: '2026-05-01', intensity_score: 0.5 },
  ];
  const result = normalizeRows(rows);
  assert.equal(Object.keys(result).length, 0);
});

// ── Source compliance ─────────────────────────────────────────────────────────

const whaleSrc = readFileSync('api/whale-watcher.js', 'utf8');

test('whale-watcher source: does not import executeAndPoll', () => {
  assert.doesNotMatch(whaleSrc, /executeAndPoll/, 'whale-watcher must never trigger Dune query execution');
  assert.match(whaleSrc, /readOrCache/, 'whale-watcher must use readOrCache for scheduled results');
});

test('whale-watcher source: DATA_NOTE is "Dune Analytics · scheduled wallet data"', () => {
  assert.match(whaleSrc, /Dune Analytics · scheduled wallet data/);
});

test('whale-watcher source: does not import from executeAndPoll-containing path', () => {
  // The only Dune import should be readOrCache (not executeAndPoll)
  const duneImports = whaleSrc.match(/import\s*\{([^}]+)\}\s*from\s*['"].*_dune/g) || [];
  for (const imp of duneImports) {
    assert.doesNotMatch(imp, /executeAndPoll/, `Dune import must not include executeAndPoll: ${imp}`);
  }
});

// ── Handler tests ─────────────────────────────────────────────────────────────

function makeReq(queryParams = {}) {
  return { method: 'GET', query: queryParams, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
}

function makeRes() {
  const resp = { statusCode: 200, body: null, headers: {} };
  resp.status    = (code) => { resp.statusCode = code; return resp; };
  resp.json      = (data) => { resp.body = data; return resp; };
  resp.setHeader = (k, v) => { resp.headers[k] = v; return resp; };
  resp.end       = () => resp;
  return resp;
}

function makeDuneFetch(overrides = {}) {
  return async (url, opts = {}) => {
    const method = opts.method?.toUpperCase() || 'GET';
    if (method === 'GET' && String(url).includes('/results')) {
      return {
        ok: true,
        json: async () => ({
          execution_ended_at: overrides.queryRunAt ?? '2026-05-26T10:00:00.000Z',
          result: { rows: overrides.rows ?? [] },
        }),
      };
    }
    // Redis not configured in tests — fail silently
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

/**
 * Saves DUNE_API_KEY, DUNE_QUERY_12WK_ACTIVE_WALLETS, and globalThis.fetch, sets them
 * to the supplied values for the duration of fn(), then restores them.
 * Pass undefined for apiKey or queryId to delete the env var.
 */
async function withHandlerEnv({ apiKey, queryId, fetch: fetchMock } = {}, fn) {
  const savedKey   = process.env.DUNE_API_KEY;
  const savedQuery = process.env.DUNE_QUERY_12WK_ACTIVE_WALLETS;
  const savedFetch = globalThis.fetch;

  if (apiKey === undefined) delete process.env.DUNE_API_KEY;
  else process.env.DUNE_API_KEY = apiKey;

  if (queryId === undefined) delete process.env.DUNE_QUERY_12WK_ACTIVE_WALLETS;
  else process.env.DUNE_QUERY_12WK_ACTIVE_WALLETS = queryId;

  if (fetchMock) globalThis.fetch = fetchMock;

  try {
    await fn();
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.DUNE_API_KEY;
    else process.env.DUNE_API_KEY = savedKey;
    if (savedQuery === undefined) delete process.env.DUNE_QUERY_12WK_ACTIVE_WALLETS;
    else process.env.DUNE_QUERY_12WK_ACTIVE_WALLETS = savedQuery;
  }
}

const { default: handler } = await import('../api/whale-watcher.js');

test('whale-watcher handler: DUNE_API_KEY not set → 503', async () => {
  await withHandlerEnv({ apiKey: undefined }, async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.statusCode, 503);
    assert.ok(res.body?.error);
  });
});

test('whale-watcher handler: DUNE_QUERY_12WK_ACTIVE_WALLETS not configured → 200 empty wallets with warning', async () => {
  await withHandlerEnv({ apiKey: 'test-key-cfg', queryId: undefined }, async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body?.wallets, {});
    assert.equal(res.body?.metadata?.walletCount, 0);
    assert.ok(
      res.body?.metadata?.warnings?.some(w => /DUNE_QUERY_12WK_ACTIVE_WALLETS/.test(w)),
      'missing query warning must be present'
    );
  });
});

test('whale-watcher handler: does not call POST /execute — reads latest results only', async () => {
  const fetchCalls = [];
  const trackingFetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), method: opts.method?.toUpperCase() || 'GET' });
    return makeDuneFetch()(url, opts);
  };
  await withHandlerEnv({ apiKey: 'test-key-noexec', queryId: '99001', fetch: trackingFetch }, async () => {
    await handler(makeReq(), makeRes());
    const executeCalls = fetchCalls.filter(c => c.method === 'POST' && c.url.includes('/execute'));
    assert.equal(executeCalls.length, 0, 'whale-watcher must not POST to Dune /execute');
    const resultCalls = fetchCalls.filter(c => c.method === 'GET' && c.url.includes('/results'));
    assert.ok(resultCalls.length > 0, 'whale-watcher must read Dune latest results');
  });
});

test('whale-watcher handler: empty Dune rows → 200 with empty wallets', async () => {
  await withHandlerEnv({ apiKey: 'test-key-empty', queryId: '99002', fetch: makeDuneFetch({ rows: [] }) }, async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body?.wallets, {});
  });
});

test('whale-watcher handler: metadata.dataNote never contains "live"', async () => {
  await withHandlerEnv({ apiKey: 'test-key-note', queryId: '99003', fetch: makeDuneFetch({ rows: [] }) }, async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const note = res.body?.metadata?.dataNote ?? '';
    assert.doesNotMatch(note, /live/i, 'dataNote must never contain "live"');
    assert.match(note, /Dune Analytics/i);
    assert.match(note, /scheduled/i);
  });
});

test('whale-watcher handler: isStale false when queryRunAt is recent', async () => {
  const recentTs = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
  await withHandlerEnv({ apiKey: 'test-key-fresh', queryId: '99004', fetch: makeDuneFetch({ rows: [], queryRunAt: recentTs }) }, async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.body?.metadata?.isStale, false, 'recent data must not be stale');
  });
});

test('whale-watcher handler: isStale true when queryRunAt is older than stale window', async () => {
  const staleTs = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(); // 10 hours ago
  await withHandlerEnv({ apiKey: 'test-key-stale', queryId: '99005', fetch: makeDuneFetch({ rows: [], queryRunAt: staleTs }) }, async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.body?.metadata?.isStale, true, 'old data must be marked stale');
    assert.ok(
      res.body?.metadata?.warnings?.some(w => /stale|delayed/i.test(w)),
      'stale warning must be in warnings array'
    );
  });
});

test('whale-watcher handler: address filter returns only matching wallet', async () => {
  await withHandlerEnv({
    apiKey: 'test-key-filter',
    queryId: '99006',
    fetch: makeDuneFetch({
      rows: [
        { address: '0xAAAA', activity_day: '2026-05-01', intensity_score: 0.4, tx_count_day: 5 },
        { address: '0xBBBB', activity_day: '2026-05-01', intensity_score: 0.6, tx_count_day: 8 },
      ],
    }),
  }, async () => {
    const res = makeRes();
    await handler(makeReq({ address: '0xaaaa' }), res);
    assert.equal(res.statusCode, 200);
    const keys = Object.keys(res.body?.wallets ?? {});
    assert.equal(keys.length, 1);
    assert.equal(keys[0], '0xaaaa');
    assert.equal(res.body?.metadata?.totalWallets, 2, 'totalWallets reflects full dataset');
    assert.equal(res.body?.metadata?.walletCount, 1, 'walletCount reflects filtered result');
  });
});

test('whale-watcher handler: POST method → 405', async () => {
  const res = makeRes();
  await handler({ method: 'POST', query: {}, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
  assert.equal(res.statusCode, 405);
});
