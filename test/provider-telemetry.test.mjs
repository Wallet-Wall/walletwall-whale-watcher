import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordProviderEvent,
  recordProviderCall,
  getProviderTelemetry,
  resetProviderTelemetry,
} from '../api/_provider-telemetry.js';

test.beforeEach(() => resetProviderTelemetry());
test.afterEach(() => resetProviderTelemetry());

test('telemetry: records calls, latency average, and cache hit/miss', () => {
  recordProviderCall('etherscan', { ms: 100, ok: true });
  recordProviderCall('etherscan', { ms: 300, ok: true });
  recordProviderEvent('etherscan', 'cacheHit');
  recordProviderEvent('etherscan', 'cacheHit');
  recordProviderEvent('etherscan', 'cacheMiss');

  const { providers } = getProviderTelemetry();
  const es = providers.etherscan;
  assert.equal(es.calls, 2);
  assert.equal(es.avgLatencyMs, 200, 'average of 100 and 300');
  assert.equal(es.cacheHits, 2);
  assert.equal(es.cacheMisses, 1);
  assert.equal(es.cacheHitRate, 0.67, '2 hits of 3 cache lookups, rounded');
});

test('telemetry: 429 status increments both rateLimited and errors', () => {
  recordProviderCall('dune', { ms: 50, ok: false, status: 429 });
  const { providers } = getProviderTelemetry();
  assert.equal(providers.dune.rateLimited, 1);
  assert.equal(providers.dune.errors, 1);
  assert.equal(providers.dune.calls, 1);
});

test('telemetry: non-2xx status counts as an error but not rate-limited', () => {
  recordProviderCall('alchemy', { ms: 10, ok: false, status: 500 });
  const { providers } = getProviderTelemetry();
  assert.equal(providers.alchemy.errors, 1);
  assert.equal(providers.alchemy.rateLimited, 0);
});

test('telemetry: avgLatencyMs and cacheHitRate are null with no data', () => {
  recordProviderEvent('coingecko', 'error');
  const { providers } = getProviderTelemetry();
  assert.equal(providers.coingecko.avgLatencyMs, null);
  assert.equal(providers.coingecko.cacheHitRate, null);
  assert.equal(providers.coingecko.errors, 1);
});

test('telemetry: provider names are normalized and reset clears all', () => {
  recordProviderEvent('DEX Screener', 'call', { ms: 5 });
  const snap = getProviderTelemetry();
  assert.ok(snap.providers.dex_screener, 'name normalized to lowercase + underscores');

  resetProviderTelemetry();
  assert.deepEqual(getProviderTelemetry().providers, {});
});

test('telemetry: unknown event types are ignored', () => {
  recordProviderEvent('etherscan', 'not-a-real-event');
  assert.deepEqual(getProviderTelemetry().providers, {});
});
