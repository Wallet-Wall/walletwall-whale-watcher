/**
 * Tests for adversarial behavior heuristics (Quantum Intelligence v1).
 *
 * Covers:
 *   1. Missing/null data returns safe low/default signals
 *   2. Large spike increases extraction-style activity signal
 *   3. Top-heavy counterparties increase concentration signal
 *   4. Routing-like graph shape increases relay/routing exposure
 *   5. Quiet baseline + sharp recent spike increases activity ramp signal
 *   6. Unknown/missing asset/value fields increase ambiguity signal
 *   7. Existing quantum exposure output is backward-compatible
 *   8. Copy safety — disallowed terminology must not appear in any output
 *
 * Uses Node.js built-in test runner.
 */

import test  from 'node:test';
import assert from 'node:assert/strict';

const { deriveAdversarialSignals } = await import('../src/lib/adversarial-heuristics.js');

// Re-import quantum exports to confirm backward compatibility
const {
  deriveWalletSignatureExposure,
  deriveQuantumExposureScore,
  EXPOSURE_CAVEAT,
  SCORE_CAVEAT,
} = await import('../src/lib/quantum-exposure.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_A = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_B = '0xcccccccccccccccccccccccccccccccccccccccc';
const OTHER_C = '0xdddddddddddddddddddddddddddddddddddddddd';

const node = { fullAddress: ADDR, id: 'wallet_test' };

/** Unix timestamp n seconds before now. */
function secsAgo(n) {
  return Math.floor((Date.now() - n * 1000) / 1000);
}

/** Unix timestamp n days before now. */
function daysAgo(n) {
  return secsAgo(n * 86_400);
}

/** Build a minimal transaction object. */
function tx(from, to, valueUSD, timeStamp) {
  return { from, to, valueUSD, timeStamp };
}

// ── 1. Missing / null data → safe defaults ────────────────────────────────────

test('missing data: null node returns safe low signals', () => {
  const signals = deriveAdversarialSignals(null, null, null);
  for (const key of Object.keys(signals)) {
    const s = signals[key];
    assert.ok(typeof s.score === 'number', `${key}: score must be a number`);
    assert.ok(s.score <= 0.15, `${key}: score should be low when data is missing, got ${s.score}`);
    assert.equal(s.confidence, 'low', `${key}: confidence should be 'low' for missing data`);
    assert.ok(typeof s.reason === 'string' && s.reason.length > 0, `${key}: reason must be a non-empty string`);
    assert.ok(typeof s.evidence === 'object', `${key}: evidence must be an object`);
  }
});

test('missing data: empty walletData returns safe low signals', () => {
  const signals = deriveAdversarialSignals(node, {}, null);
  for (const key of Object.keys(signals)) {
    assert.ok(signals[key].score <= 0.15, `${key}: expected low score for empty walletData`);
    assert.equal(signals[key].confidence, 'low');
  }
});

test('missing data: single transaction is insufficient for most signals', () => {
  const walletData = {
    transactions: [tx(ADDR, OTHER_A, 1000, daysAgo(1))],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  // Cannot reliably compute extraction or concentration from a single tx
  assert.ok(signals.extractionStyleActivityRisk.score <= 0.15);
  assert.ok(signals.counterpartyConcentrationRisk.score <= 0.15);
});

test('missing data: all five signal keys are always present', () => {
  const signals = deriveAdversarialSignals(null, null, null);
  const EXPECTED_KEYS = [
    'extractionStyleActivityRisk',
    'counterpartyConcentrationRisk',
    'relayRoutingExposure',
    'activityRampRisk',
    'assetValueAmbiguityRisk',
  ];
  for (const key of EXPECTED_KEYS) {
    assert.ok(key in signals, `Missing key: ${key}`);
  }
});

test('missing data: all scores are in 0.0–1.0 range', () => {
  const signals = deriveAdversarialSignals(null, null, null);
  for (const [key, s] of Object.entries(signals)) {
    assert.ok(s.score >= 0 && s.score <= 1, `${key}: score ${s.score} out of range`);
  }
});

// ── 2. Extraction-style activity risk ─────────────────────────────────────────

test('extraction: large dominant outgoing tx raises signal above 0.5', () => {
  const walletData = {
    transactions: [
      tx(ADDR, OTHER_A, 90_000, daysAgo(1)),  // dominant
      tx(ADDR, OTHER_B,  3_000, daysAgo(2)),
      tx(ADDR, OTHER_C,  2_000, daysAgo(3)),
      tx(ADDR, OTHER_A,  2_500, daysAgo(4)),
      tx(ADDR, OTHER_B,  2_500, daysAgo(5)),
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.extractionStyleActivityRisk.score > 0.5,
    `Expected score > 0.5, got ${signals.extractionStyleActivityRisk.score}`,
  );
});

test('extraction: balanced outgoing distribution gives low signal', () => {
  const walletData = {
    transactions: [
      tx(ADDR, OTHER_A, 10_000, daysAgo(1)),
      tx(ADDR, OTHER_B, 10_000, daysAgo(2)),
      tx(ADDR, OTHER_C,  9_000, daysAgo(3)),
      tx(ADDR, OTHER_A,  9_500, daysAgo(4)),
      tx(ADDR, OTHER_B, 11_000, daysAgo(5)),
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.extractionStyleActivityRisk.score < 0.4,
    `Expected score < 0.4 for balanced outflow, got ${signals.extractionStyleActivityRisk.score}`,
  );
});

test('extraction: evidence fields are numeric and present when data exists', () => {
  const walletData = {
    transactions: [
      tx(ADDR, OTHER_A, 80_000, daysAgo(1)),
      tx(ADDR, OTHER_B,  5_000, daysAgo(2)),
      tx(ADDR, OTHER_C,  5_000, daysAgo(3)),
      tx(ADDR, OTHER_A,  5_000, daysAgo(4)),
      tx(ADDR, OTHER_B,  5_000, daysAgo(5)),
    ],
  };
  const { extractionStyleActivityRisk } = deriveAdversarialSignals(node, walletData, null);
  assert.ok(typeof extractionStyleActivityRisk.evidence.largestOutgoingUsd === 'number');
  assert.ok(typeof extractionStyleActivityRisk.evidence.totalOutgoingUsd === 'number');
  assert.ok(typeof extractionStyleActivityRisk.evidence.concentrationRatio === 'number');
});

// ── 3. Counterparty concentration risk ────────────────────────────────────────

test('concentration: single dominant counterparty raises signal above 0.6', () => {
  // One counterparty receives >80% of total volume; only 2 unique CPs
  const walletData = {
    transactions: [
      tx(ADDR, OTHER_A, 85_000, daysAgo(1)),
      tx(ADDR, OTHER_A, 10_000, daysAgo(2)),
      tx(ADDR, OTHER_B,  2_000, daysAgo(3)),
      tx(OTHER_A, ADDR,  1_000, daysAgo(4)),
      tx(OTHER_B, ADDR,  2_000, daysAgo(5)),
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.counterpartyConcentrationRisk.score > 0.6,
    `Expected score > 0.6, got ${signals.counterpartyConcentrationRisk.score}`,
  );
});

test('concentration: many diverse counterparties gives low signal', () => {
  const cps = ['0xaa', '0xbb', '0xcc', '0xdd', '0xee', '0xff', '0x11', '0x22'];
  const walletData = {
    transactions: cps.map((cp, i) => tx(ADDR, cp, 10_000, daysAgo(i + 1))),
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.counterpartyConcentrationRisk.score < 0.4,
    `Expected score < 0.4 for diverse CPs, got ${signals.counterpartyConcentrationRisk.score}`,
  );
});

test('concentration: evidence includes unique counterparty count', () => {
  const walletData = {
    transactions: [
      tx(ADDR, OTHER_A, 90_000, daysAgo(1)),
      tx(ADDR, OTHER_B,  5_000, daysAgo(2)),
      tx(ADDR, OTHER_B,  5_000, daysAgo(3)),
    ],
  };
  const { counterpartyConcentrationRisk } = deriveAdversarialSignals(node, walletData, null);
  assert.ok(typeof counterpartyConcentrationRisk.evidence.uniqueCounterparties === 'number');
  assert.ok(counterpartyConcentrationRisk.evidence.uniqueCounterparties >= 1);
});

// ── 4. Relay / routing exposure ───────────────────────────────────────────────

test('routing: rapid in-then-out pattern raises relay signal above 0.4', () => {
  // Each incoming tx followed by an outgoing tx within 30 minutes
  const now = Date.now();
  const walletData = {
    transactions: [
      // pair 1
      { from: OTHER_A, to: ADDR,    valueUSD: 5_000, timeStamp: Math.floor((now - 3_600_000 * 10) / 1000) },
      { from: ADDR,    to: OTHER_B, valueUSD: 4_800, timeStamp: Math.floor((now - 3_600_000 * 10 + 1_000_000) / 1000) },
      // pair 2
      { from: OTHER_B, to: ADDR,    valueUSD: 6_000, timeStamp: Math.floor((now - 3_600_000 * 8) / 1000) },
      { from: ADDR,    to: OTHER_C, valueUSD: 5_900, timeStamp: Math.floor((now - 3_600_000 * 8 + 900_000) / 1000) },
      // pair 3
      { from: OTHER_C, to: ADDR,    valueUSD: 3_000, timeStamp: Math.floor((now - 3_600_000 * 6) / 1000) },
      { from: ADDR,    to: OTHER_A, valueUSD: 2_950, timeStamp: Math.floor((now - 3_600_000 * 6 + 500_000) / 1000) },
      // pair 4
      { from: OTHER_A, to: ADDR,    valueUSD: 4_000, timeStamp: Math.floor((now - 3_600_000 * 4) / 1000) },
      { from: ADDR,    to: OTHER_B, valueUSD: 3_900, timeStamp: Math.floor((now - 3_600_000 * 4 + 800_000) / 1000) },
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.relayRoutingExposure.score > 0.4,
    `Expected score > 0.4 for relay pattern, got ${signals.relayRoutingExposure.score}`,
  );
});

test('routing: no in-out pairing gives low relay signal', () => {
  const walletData = {
    transactions: [
      tx(OTHER_A, ADDR, 1_000, daysAgo(30)),
      tx(OTHER_B, ADDR, 2_000, daysAgo(60)),
      tx(OTHER_C, ADDR, 3_000, daysAgo(90)),
      // outgoing months later (not within relay window)
      tx(ADDR, OTHER_A, 500, daysAgo(1)),
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.relayRoutingExposure.score < 0.4,
    `Expected score < 0.4 for non-relay pattern, got ${signals.relayRoutingExposure.score}`,
  );
});

test('routing: evidence includes relay pair count', () => {
  const now = Date.now();
  const walletData = {
    transactions: [
      { from: OTHER_A, to: ADDR,    valueUSD: 1_000, timeStamp: Math.floor((now - 7_200_000) / 1000) },
      { from: ADDR,    to: OTHER_B, valueUSD: 900,   timeStamp: Math.floor((now - 7_200_000 + 300_000) / 1000) },
      { from: OTHER_B, to: ADDR,    valueUSD: 1_000, timeStamp: Math.floor((now - 3_600_000) / 1000) },
      { from: ADDR,    to: OTHER_C, valueUSD: 900,   timeStamp: Math.floor((now - 3_600_000 + 300_000) / 1000) },
    ],
  };
  const { relayRoutingExposure } = deriveAdversarialSignals(node, walletData, null);
  assert.ok(typeof relayRoutingExposure.evidence.relayPairCount === 'number');
  assert.ok(typeof relayRoutingExposure.evidence.incomingTxCount === 'number');
});

// ── 5. Activity ramp risk ─────────────────────────────────────────────────────

test('ramp: quiet 12w baseline + high recent intensity raises signal above 0.5', () => {
  const addrLc = ADDR.toLowerCase();
  const activity12w = [];
  // 70 days of baseline (low intensity)
  for (let i = 83; i >= 14; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    activity12w.push({ date: d, intensity_score: 0.02 });
  }
  // 14 days recent (high intensity)
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    activity12w.push({ date: d, intensity_score: 0.85 });
  }
  const dune12wData = { wallets: { [addrLc]: { activity12w } } };
  const signals = deriveAdversarialSignals(node, {}, dune12wData);
  assert.ok(
    signals.activityRampRisk.score > 0.5,
    `Expected score > 0.5 for ramp pattern, got ${signals.activityRampRisk.score}`,
  );
});

test('ramp: steady uniform activity gives low ramp signal', () => {
  const addrLc = ADDR.toLowerCase();
  const activity12w = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    activity12w.push({ date: d, intensity_score: 0.5 });
  }
  const dune12wData = { wallets: { [addrLc]: { activity12w } } };
  const signals = deriveAdversarialSignals(node, {}, dune12wData);
  assert.ok(
    signals.activityRampRisk.score < 0.4,
    `Expected score < 0.4 for uniform activity, got ${signals.activityRampRisk.score}`,
  );
});

test('ramp: tx-based fallback raises signal when recent spike with no prior activity', () => {
  const recent = Array.from({ length: 8 }, (_, i) =>
    tx(ADDR, OTHER_A, 1_000, secsAgo((i + 1) * 3_600)),
  );
  // No prior21d txs
  const walletData = { transactions: recent };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.activityRampRisk.score > 0.4,
    `Expected score > 0.4 for tx-based spike, got ${signals.activityRampRisk.score}`,
  );
});

// ── 6. Asset / value ambiguity risk ──────────────────────────────────────────

test('ambiguity: high fraction of missing valueUSD raises signal above 0.4', () => {
  const walletData = {
    transactions: [
      { from: ADDR, to: OTHER_A, valueUSD: null,    timeStamp: daysAgo(1) },
      { from: ADDR, to: OTHER_B, valueUSD: null,    timeStamp: daysAgo(2) },
      { from: ADDR, to: OTHER_C, valueUSD: null,    timeStamp: daysAgo(3) },
      { from: ADDR, to: OTHER_A, valueUSD: 0,       timeStamp: daysAgo(4) },
      { from: ADDR, to: OTHER_B, valueUSD: null,    timeStamp: daysAgo(5) },
      { from: ADDR, to: OTHER_C, valueUSD: 1_000,   timeStamp: daysAgo(6) },
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.assetValueAmbiguityRisk.score > 0.4,
    `Expected score > 0.4 for high missing values, got ${signals.assetValueAmbiguityRisk.score}`,
  );
});

test('ambiguity: unknown token names raise ambiguity signal', () => {
  const walletData = {
    transactions: [
      { from: ADDR, to: OTHER_A, valueUSD: null, value: '1000000000000000000', tokenName: 'Unknown', timeStamp: daysAgo(1) },
      { from: ADDR, to: OTHER_B, valueUSD: null, value: '500000000000000000',  tokenName: 'Unknown', timeStamp: daysAgo(2) },
      { from: ADDR, to: OTHER_C, valueUSD: null, value: '250000000000000000',  tokenSymbol: 'UNKNOWN', timeStamp: daysAgo(3) },
      { from: ADDR, to: OTHER_A, valueUSD: 100,  timeStamp: daysAgo(4) },
    ],
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.assetValueAmbiguityRisk.score > 0.2,
    `Expected score > 0.2 for unknown tokens, got ${signals.assetValueAmbiguityRisk.score}`,
  );
});

test('ambiguity: complete USD values give low ambiguity signal', () => {
  const walletData = {
    transactions: Array.from({ length: 10 }, (_, i) =>
      tx(ADDR, OTHER_A, 1_000 * (i + 1), daysAgo(i + 1)),
    ),
  };
  const signals = deriveAdversarialSignals(node, walletData, null);
  assert.ok(
    signals.assetValueAmbiguityRisk.score < 0.2,
    `Expected score < 0.2 for complete USD data, got ${signals.assetValueAmbiguityRisk.score}`,
  );
});

test('ambiguity: evidence includes totalTxCount and missingValueCount', () => {
  const walletData = {
    transactions: [
      { from: ADDR, to: OTHER_A, valueUSD: null, timeStamp: daysAgo(1) },
      { from: ADDR, to: OTHER_B, valueUSD: 500,  timeStamp: daysAgo(2) },
    ],
  };
  const { assetValueAmbiguityRisk } = deriveAdversarialSignals(node, walletData, null);
  assert.equal(assetValueAmbiguityRisk.evidence.totalTxCount, 2);
  assert.ok(assetValueAmbiguityRisk.evidence.missingValueCount >= 1);
});

// ── 7. Backward compatibility ─────────────────────────────────────────────────

test('compat: existing quantum-exposure exports are unaffected', () => {
  assert.equal(typeof deriveWalletSignatureExposure, 'function');
  assert.equal(typeof deriveQuantumExposureScore, 'function');
  assert.ok(typeof EXPOSURE_CAVEAT === 'string' && EXPOSURE_CAVEAT.length > 0);
  assert.ok(typeof SCORE_CAVEAT === 'string' && SCORE_CAVEAT.length > 0);
});

test('compat: deriveAdversarialSignals result does not affect scoreResult or exposure shape', () => {
  const facts        = { chain: 'ethereum', signedTxCount: 5 };
  const chainProfile = { defaultSignatureScheme: 'ecdsa_secp256k1' };
  const exposure     = deriveWalletSignatureExposure(facts, chainProfile);
  const scoreResult  = deriveQuantumExposureScore(exposure);

  // Adversarial call must not mutate existing objects
  deriveAdversarialSignals(node, null, null);

  assert.ok('exposureStatus' in exposure);
  assert.ok('score' in scoreResult || scoreResult.score === null);
  assert.ok(Array.isArray(scoreResult.reasonCodes));
});

test('compat: adversarialSignals namespace does not break consumers ignoring it', () => {
  // Consumer that only reads scoreResult — must not throw
  const signals = deriveAdversarialSignals(null, null, null);
  // signals is an additional namespace; ignoring it is safe
  assert.ok(typeof signals === 'object');
});

// ── 8. Copy safety ────────────────────────────────────────────────────────────

const DISALLOWED = [
  'scam',
  'fraud',
  'criminal',
  'malicious',
  'mule',
  'lure',
  'drop trading',
  'trust scam',
  'bait-and-switch',
  'runescape',
  'trade window',
];

/** Recursively collect all string values from an object. */
function gatherText(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(gatherText).join(' ');
  if (v && typeof v === 'object') return Object.values(v).map(gatherText).join(' ');
  return '';
}

// Generate signals from several scenarios to cover all reason strings
const SCENARIOS = [
  deriveAdversarialSignals(null, null, null),
  deriveAdversarialSignals(node, {}, null),
  deriveAdversarialSignals(node, {
    transactions: [
      tx(ADDR, OTHER_A, 90_000, daysAgo(1)),
      tx(ADDR, OTHER_B,  5_000, daysAgo(2)),
      tx(ADDR, OTHER_B,  5_000, daysAgo(3)),
    ],
  }, null),
];

const ALL_TEXT = SCENARIOS.map(gatherText).join('\n').toLowerCase();

for (const term of DISALLOWED) {
  test(`copy safety: output does not contain "${term}"`, () => {
    assert.ok(
      !ALL_TEXT.includes(term.toLowerCase()),
      `Disallowed term found in generated output: "${term}"`,
    );
  });
}
