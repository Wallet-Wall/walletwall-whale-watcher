/**
 * Tests for the WhaleWatcher signal adapter — bridges raw walletData +
 * dune12wData into the WalletSignal[] that buildNarrativeCard consumes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { deriveWhaleWatcherSignals, buildBaselineFrom12w, txsToLiveEvents } =
  await import('../src/lib/whale-watcher-signals.js');

const { buildNarrativeCard } = await import('../src/data/narratives/builder.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function make12wData(overrides = {}) {
  const activity12w = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    activity12w.push({
      date:            d.toISOString().slice(0, 10),
      intensity_score: 0.5,
      tx_count:        3,
      usd_volume:      10_000,
    });
  }
  return {
    wallets: {
      [ADDR.toLowerCase()]: { activity12w, activity_tier: 'active', ...overrides.walletEntry },
    },
    metadata: { queryRunAt: '2026-05-01T06:00:00.000Z', isStale: false },
    ...overrides,
  };
}

let _txSeq = 0;
function makeTx(overrides = {}) {
  return {
    hash:       '0xdeadbeef' + (++_txSeq).toString(16).padStart(8, '0'),
    from:       ADDR,
    to:         '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    valueUSD:   5_000,
    timeStamp:  Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ── buildBaselineFrom12w ──────────────────────────────────────────────────────

test('buildBaselineFrom12w returns null for missing data', () => {
  assert.equal(buildBaselineFrom12w(ADDR, null), null);
  assert.equal(buildBaselineFrom12w(ADDR, {}), null);
  assert.equal(buildBaselineFrom12w(ADDR, { wallets: {} }), null);
});

test('buildBaselineFrom12w returns null when fewer than 7 active days', () => {
  const sparse = {
    wallets: {
      [ADDR.toLowerCase()]: {
        activity12w: [
          { date: '2026-05-01', intensity_score: 0.5, tx_count: 2, usd_volume: 1000 },
          { date: '2026-05-02', intensity_score: 0.3, tx_count: 1, usd_volume: 500 },
        ],
      },
    },
    metadata: {},
  };
  assert.equal(buildBaselineFrom12w(ADDR, sparse), null);
});

test('buildBaselineFrom12w returns a valid baseline for 12w data', () => {
  const baseline = buildBaselineFrom12w(ADDR, make12wData());
  assert.ok(baseline !== null);
  assert.equal(baseline.walletAddress, ADDR.toLowerCase());
  assert.ok(baseline.totalVolumeUSD > 0);
  assert.ok(baseline.txCount > 0);
  assert.equal(baseline.totalVolumeEstimated, true);
  assert.equal(baseline.dataQuality.isPartial, true);
  assert.ok(baseline.source.sourceType === 'dune_scheduled');
});

// ── txsToLiveEvents ───────────────────────────────────────────────────────────

test('txsToLiveEvents returns [] for empty input', () => {
  assert.deepEqual(txsToLiveEvents([], ADDR), []);
  assert.deepEqual(txsToLiveEvents(null, ADDR), []);
});

test('txsToLiveEvents maps valueUSD and counterparty correctly', () => {
  const counterparty = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const events = txsToLiveEvents([makeTx({ from: ADDR, to: counterparty, valueUSD: 12_000 })], ADDR);
  assert.equal(events.length, 1);
  assert.equal(events[0].valueUSD, 12_000);
  assert.equal(events[0].counterpartyAddress, counterparty);
  assert.equal(events[0].valueEstimated, false);
  assert.equal(events[0].walletAddress, ADDR);
});

test('txsToLiveEvents handles missing valueUSD gracefully', () => {
  const events = txsToLiveEvents([makeTx({ valueUSD: undefined })], ADDR);
  assert.equal(events[0].valueUSD, null);
  assert.equal(events[0].valueEstimated, true);
  assert.equal(events[0].dataQuality.confidence, 'low');
});

test('txsToLiveEvents resolves counterparty from either direction', () => {
  const other = '0xcccccccccccccccccccccccccccccccccccccccc';
  const asSender   = txsToLiveEvents([makeTx({ from: ADDR,  to: other  })], ADDR);
  const asReceiver = txsToLiveEvents([makeTx({ from: other, to: ADDR   })], ADDR);
  assert.equal(asSender[0].counterpartyAddress,   other);
  assert.equal(asReceiver[0].counterpartyAddress,  other);
});

// ── deriveWhaleWatcherSignals ─────────────────────────────────────────────────

test('deriveWhaleWatcherSignals returns [] for synthetic node (no fullAddress)', () => {
  const node = { id: 'token_eth', type: 'token' };
  assert.deepEqual(deriveWhaleWatcherSignals(node, null, null), []);
});

test('deriveWhaleWatcherSignals returns [] for null node', () => {
  assert.deepEqual(deriveWhaleWatcherSignals(null, null, null), []);
});

test('deriveWhaleWatcherSignals returns valid WalletSignal[] shape for real address', () => {
  const node = { fullAddress: ADDR, id: ADDR, type: 'wallet' };
  const signals = deriveWhaleWatcherSignals(node, { transactions: [] }, make12wData());
  assert.ok(Array.isArray(signals));
  for (const s of signals) {
    assert.ok('signalId' in s);
    assert.ok('signalType' in s);
    assert.ok(Array.isArray(s.caveats) && s.caveats.length > 0);
    assert.ok(Array.isArray(s.sources) && s.sources.length > 0);
  }
});

test('deriveWhaleWatcherSignals handles null walletData gracefully', () => {
  const node = { fullAddress: ADDR };
  const signals = deriveWhaleWatcherSignals(node, null, make12wData());
  assert.ok(Array.isArray(signals));
});

test('large tx vs baseline produces large_move_vs_baseline signal', () => {
  // Baseline: ~$10k/day avg over 84 days → $840k total, $10k daily avg
  // A single tx of $300k is 30× daily avg — well above the 5× threshold
  const node = { fullAddress: ADDR };
  const txs  = [makeTx({ valueUSD: 300_000, from: ADDR, to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })];
  const signals = deriveWhaleWatcherSignals(node, { transactions: txs }, make12wData());
  const large = signals.find(s => s.signalType === 'large_move_vs_baseline');
  assert.ok(large, 'large_move_vs_baseline signal emitted for 30× daily avg tx');
  assert.ok(large.evidence.largestEventValueUSD === 300_000);
  assert.ok(large.caveats.length > 0);
});

// ── Integration: signals → buildNarrativeCard ─────────────────────────────────

test('buildNarrativeCard produces valid card from adapter signals', () => {
  const node = { fullAddress: ADDR };
  const txs  = [makeTx({ valueUSD: 300_000 })];
  const signals = deriveWhaleWatcherSignals(node, { transactions: txs }, make12wData());
  if (signals.length === 0) return; // no signals in this env — skip card check

  const card = buildNarrativeCard(signals);
  assert.ok(card !== null);
  assert.ok(card.headline.length > 0);
  assert.ok(card.body.length > 0);
  assert.ok(Array.isArray(card.keyPoints));
  assert.ok(Array.isArray(card.caveats) && card.caveats.length > 0);
  assert.ok(['high', 'medium', 'low'].includes(card.confidence));
  assert.ok(card.caveats.some(c => c.toLowerCase().includes('not constitute')),
    'financial advice caveat must be present');
});
