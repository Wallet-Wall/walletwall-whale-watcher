import { ethers } from 'ethers';
import { buildDataQuality } from './wallet-contract.js';
import { buildTransactionSample, computeDelta7d, computeFingerprintScore } from './_wallet-helpers.js';

// ── Provider result envelope ──────────────────────────────────────────────────
// Standardizes what provider adapters return before the route normalizes and
// serializes the response. The route passes result.payload to
// normalizeWalletGraphResponse — all other fields are for the route's own use.
export function makeProviderResult({
  ok = true,
  provider = 'unknown',
  source = 'live',
  payload = {},
  warnings = [],
  errors = [],
  partial = false,
  freshness = null,
  timing = null,
} = {}) {
  return { ok, provider, source, payload, warnings, errors, partial, freshness, timing };
}

// ── Mock provider (no API keys configured) ───────────────────────────────────

function deterministicUnit(seed) {
  const hex = ethers.id(String(seed)).slice(2, 15);
  return Number.parseInt(hex, 16) / 0x10000000000000;
}

function generateTimeline(days = 90, baseVolume = 5000, seed = 'demo') {
  const timeline = [];
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const active = deterministicUnit(`${seed}:active:${i}`) > 0.65;
    timeline.push({
      date,
      volumeUSD: active ? Math.round(baseVolume * (0.5 + deterministicUnit(`${seed}:volume:${i}`) * 2)) : 0,
      txCount: active ? Math.floor(deterministicUnit(`${seed}:tx:${i}`) * 5) + 1 : 0,
      estimated: true,
    });
  }
  return timeline;
}

function buildMockPayload(address) {
  const seed = String(address || 'demo').toLowerCase();
  const ethTimeline = generateTimeline(90, 8000, `${seed}:eth`);
  const uniTimeline = generateTimeline(90, 12000, `${seed}:uni`);
  const aaveTimeline = generateTimeline(90, 4000, `${seed}:aave`);
  const usdcTimeline = generateTimeline(90, 3000, `${seed}:usdc`);
  const wbtcTimeline = generateTimeline(90, 6000, `${seed}:wbtc`);
  const lidoTimeline = generateTimeline(90, 2500, `${seed}:lido`);
  const inchTimeline = generateTimeline(90, 1800, `${seed}:inch`);

  const nodes = [
    {
      id: 'eth', label: 'ETH', type: 'token', color: '#627EEA',
      volumeUSD: 187400, volumeEstimated: true, interactions: 218,
      riskScore: 1.2, balanceUSD: 43800, priceUSD: 3640,
      firstSeen: '2021-03-12', lastActive: '2026-05-14',
      protocolAttributionConfidence: 'high', timeline: ethTimeline,
      delta7d: computeDelta7d(ethTimeline),
      topCounterparties: [
        { address: '0xe592427a0aece92de3edee1f18e0157c05861564', label: 'Uniswap V3', volumeUSD: 98000 },
        { address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', label: 'Aave V3', volumeUSD: 42000 },
        { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', label: 'Lido', volumeUSD: 28000 },
      ],
      anomalies: [
        { type: 'large_tx', description: 'Single tx of $92,000 on Jan 18 — 14x the median', severity: 'medium' },
      ],
      opportunities: [],
    },
    {
      id: 'uniswap_v3', label: 'Uniswap V3', type: 'defi', color: '#FF007A',
      volumeUSD: 134200, volumeEstimated: true, interactions: 156,
      riskScore: 1.8, balanceUSD: null, priceUSD: null,
      firstSeen: '2021-05-08', lastActive: '2026-05-12',
      protocolAttributionConfidence: 'high', timeline: uniTimeline,
      delta7d: computeDelta7d(uniTimeline),
      topCounterparties: [
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USDC', volumeUSD: 62000 },
        { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', label: 'WBTC', volumeUSD: 48000 },
      ],
      anomalies: [],
      opportunities: [],
    },
    {
      id: 'aave_v3', label: 'Aave V3', type: 'defi', color: '#B6509E',
      volumeUSD: 58700, volumeEstimated: true, interactions: 43,
      riskScore: 1.5, balanceUSD: null, priceUSD: null,
      firstSeen: '2022-04-01', lastActive: '2026-04-29',
      protocolAttributionConfidence: 'high', timeline: aaveTimeline,
      delta7d: computeDelta7d(aaveTimeline),
      topCounterparties: [
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USDC', volumeUSD: 34000 },
      ],
      anomalies: [],
      opportunities: [],
    },
    {
      id: 'usdc', label: 'USDC', type: 'token', color: '#2775CA',
      volumeUSD: 92400, volumeEstimated: true, interactions: 87,
      riskScore: 0.6, balanceUSD: 8400, priceUSD: 1,
      firstSeen: '2021-04-20', lastActive: '2026-05-10',
      protocolAttributionConfidence: 'high', timeline: usdcTimeline,
      delta7d: computeDelta7d(usdcTimeline),
      topCounterparties: [
        { address: '0xe592427a0aece92de3edee1f18e0157c05861564', label: 'Uniswap V3', volumeUSD: 52000 },
        { address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', label: 'Aave V3', volumeUSD: 34000 },
      ],
      anomalies: [],
      opportunities: [
        { type: 'yield', description: '$8,400 in idle USDC could earn roughly 4.2% APY on Morpho Blue', impactUSD: 353, estimated: true },
      ],
    },
    {
      id: 'wbtc', label: 'WBTC', type: 'token', color: '#F7931A',
      volumeUSD: 74300, volumeEstimated: true, interactions: 32,
      riskScore: 1.4, balanceUSD: 29200, priceUSD: 97400,
      firstSeen: '2021-08-14', lastActive: '2025-12-03',
      protocolAttributionConfidence: 'high', timeline: wbtcTimeline,
      delta7d: computeDelta7d(wbtcTimeline),
      topCounterparties: [
        { address: '0xe592427a0aece92de3edee1f18e0157c05861564', label: 'Uniswap V3', volumeUSD: 48000 },
      ],
      anomalies: [
        { type: 'dormancy_break', description: '163-day dormancy followed by $28,500 move', severity: 'low' },
      ],
      opportunities: [],
    },
    {
      id: 'lido', label: 'Lido stETH', type: 'defi', color: '#00A3FF',
      volumeUSD: 32100, volumeEstimated: true, interactions: 18,
      riskScore: 1.1, balanceUSD: null, priceUSD: null,
      firstSeen: '2022-09-15', lastActive: '2026-03-22',
      protocolAttributionConfidence: 'high', timeline: lidoTimeline,
      delta7d: computeDelta7d(lidoTimeline),
      topCounterparties: [],
      anomalies: [],
      opportunities: [],
    },
    {
      id: '1inch_v5', label: '1inch V5', type: 'defi', color: '#1B314F',
      volumeUSD: 21800, volumeEstimated: true, interactions: 24,
      riskScore: 1.3, balanceUSD: null, priceUSD: null,
      firstSeen: '2022-01-08', lastActive: '2025-11-14',
      protocolAttributionConfidence: 'high', timeline: inchTimeline,
      delta7d: computeDelta7d(inchTimeline),
      topCounterparties: [],
      anomalies: [],
      opportunities: [
        { type: 'gas', description: 'Estimated $420 overpaid in gas on 1inch calls vs direct Uniswap routes', impactUSD: 420, estimated: true },
      ],
    },
  ];

  const edges = [
    { source: 'eth', target: 'uniswap_v3', weightUSD: 98000, txCount: 88 },
    { source: 'eth', target: 'aave_v3', weightUSD: 42000, txCount: 31 },
    { source: 'eth', target: 'lido', weightUSD: 28000, txCount: 12 },
    { source: 'usdc', target: 'uniswap_v3', weightUSD: 52000, txCount: 56 },
    { source: 'usdc', target: 'aave_v3', weightUSD: 34000, txCount: 28 },
    { source: 'wbtc', target: 'uniswap_v3', weightUSD: 48000, txCount: 22 },
    { source: 'eth', target: '1inch_v5', weightUSD: 18000, txCount: 14 },
  ];

  const mockTxs = Array.from({ length: 120 }, (_, i) => ({
    hash: `0xmock${i}`,
    from: address,
    to: ['0xe592427a0aece92de3edee1f18e0157c05861564', '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', '0xae7ab96520de3a18e5e111b5eaab095312d7fe84'][i % 3],
    valueETH: deterministicUnit(`${seed}:value-eth:${i}`) * 2,
    valueUSD: Math.round(deterministicUnit(`${seed}:value-usd:${i}`) * 12000 + 200),
    estimated: true,
    gasPrice: Math.round((10 + deterministicUnit(`${seed}:gas-price:${i}`) * 30) * 1e9),
    gasUsed: 21000 + Math.round(deterministicUnit(`${seed}:gas-used:${i}`) * 80000),
    timeStamp: Math.floor((Date.now() - (365 * 86400000) + i * (365 * 86400000 / 120)) / 1000),
  }));

  const overallRiskScore = 1.4;
  const fp = computeFingerprintScore(nodes, mockTxs, overallRiskScore);

  const MOCK_0X = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const isEns = address.toLowerCase().endsWith('.eth');
  const displayAddress = isEns ? MOCK_0X : address;
  let displayEns = null;
  if (isEns) {
    displayEns = address;
  } else if (address.toLowerCase() === MOCK_0X.toLowerCase()) {
    displayEns = 'vitalik.eth';
  }

  return {
    address: displayAddress,
    ens: displayEns,
    chain: 'ethereum',
    sources: {
      walletActivity: 'demo',
      prices: 'estimated',
    },
    dataQuality: buildDataQuality({
      isDemo: true,
      isFallback: true,
      warnings: ['No API keys configured — showing demo data.'],
    }),
    transactionSample: {
      ...buildTransactionSample(mockTxs, null),
      totalKnown: null,
    },
    valueMetadata: {
      isEstimated: true,
      priceSource: 'estimated',
      valueScope: 'demo',
    },
    totalValueUSD: 81400,
    totalValueEstimated: true,
    valueScope: 'demo',
    ethBalance: 12.03,
    firstSeen: '2021-03-12',
    lastActive: '2026-05-14',
    txCount: 420,
    overallRiskScore,
    dataConfidence: 'HIGH',
    apiErrors: [{ source: 'mock', message: 'No API keys configured — showing demo data', severity: 'info' }],
    transactions: mockTxs,
    fingerprintScore: fp,
    nodes,
    edges,
  };
}

export function mockWalletProvider(address) {
  const payload = buildMockPayload(address);
  return makeProviderResult({
    ok: true,
    provider: 'mock',
    source: 'mock',
    payload,
    warnings: ['No API keys configured — showing demo data.'],
    errors: [{ source: 'mock', message: 'No API keys configured — showing demo data', severity: 'info' }],
    partial: false,
    freshness: null,
  });
}
