/**
 * Fixture: Whale Accumulation scenario.
 *
 * A large wallet that has systematically bought ETH and WBTC over 30 days,
 * primarily via Uniswap V3.  Signal strength is HIGH with high confidence
 * because the Dune historical baseline is complete.
 *
 * This fixture is designed to power a future WhaleWatcher NarrativeCard.
 */

import { makeSourceMetadata, makeDataQuality } from '../source-metadata.js';
import { makeHistoricalWalletBaseline } from '../historical-baseline.js';
import { makeLiveWalletEvent } from '../live-events.js';
import { makeWalletSignal, makeSignalId } from '../signals.js';
import { makeNarrativeInput, makeNarrativeCard } from '../narrative.js';

const WALLET = '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97';
const CHAIN  = 'ethereum';

const WINDOW_START = '2026-04-01T00:00:00.000Z';
const WINDOW_END   = '2026-05-01T00:00:00.000Z';

// ── Source metadata ──────────────────────────────────────────────────────────

export const duneCachedSource = makeSourceMetadata({
  sourceId:        'dune-whale-activity-q1',
  sourceType:      'dune_cached',
  queryId:         'q_whale_activity_30d',
  fetchedAt:       '2026-05-01T06:00:00.000Z',
  isCached:        true,
  cacheAgeSeconds: 3600,
});

export const alchemyLiveSource = makeSourceMetadata({
  sourceId:   'alchemy-live-tx',
  sourceType: 'alchemy',
  fetchedAt:  '2026-05-01T07:45:00.000Z',
  isCached:   false,
});

// ── Historical baseline ───────────────────────────────────────────────────────

export const whaleBaseline = makeHistoricalWalletBaseline({
  walletAddress:        WALLET,
  chain:                CHAIN,
  baselineWindowStart:  WINDOW_START,
  baselineWindowEnd:    WINDOW_END,
  totalVolumeUSD:       42_800_000,
  totalVolumeEstimated: false,
  txCount:              187,
  uniqueCounterparties: 12,
  topTokenFlows: [
    { tokenSymbol: 'ETH',  tokenAddress: null,                                           volumeUSD: 31_000_000, volumeEstimated: false, direction: 'in', txCount: 94 },
    { tokenSymbol: 'WBTC', tokenAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', volumeUSD:  9_200_000, volumeEstimated: false, direction: 'in', txCount: 41 },
    { tokenSymbol: 'USDC', tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', volumeUSD:  2_600_000, volumeEstimated: false, direction: 'out', txCount: 52 },
  ],
  topCounterparties: [
    { address: '0xe592427a0aece92de3edee1f18e0157c05861564', label: 'Uniswap V3',   volumeUSD: 38_000_000, txCount: 120, counterpartyType: 'dex' },
    { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', label: 'WBTC contract', volumeUSD:  4_800_000, txCount:  67, counterpartyType: 'protocol' },
  ],
  protocolUsage: [
    { protocolName: 'Uniswap V3', protocolAddress: '0xe592427a0aece92de3edee1f18e0157c05861564', protocolType: 'defi', volumeUSD: 38_000_000, txCount: 120, attributionConfidence: 'high' },
  ],
  dataQuality: makeDataQuality({ isEstimated: false, isPartial: false, isFallback: false, confidence: 'high', sources: [duneCachedSource] }),
  source: duneCachedSource,
});

// ── Live event (most recent accumulation tx) ─────────────────────────────────

export const latestAccumulationEvent = makeLiveWalletEvent({
  txHash:              '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  walletAddress:       WALLET,
  chain:               CHAIN,
  timestamp:           '2026-05-01T07:30:12.000Z',
  eventType:           'swap',
  valueUSD:            2_100_000,
  valueEstimated:      false,
  tokenSymbol:         'ETH',
  counterpartyAddress: '0xe592427a0aece92de3edee1f18e0157c05861564',
  counterpartyLabel:   'Uniswap V3',
  dataQuality:         makeDataQuality({ confidence: 'high', sources: [alchemyLiveSource] }),
  source:              alchemyLiveSource,
});

// ── WalletSignal — powers WhaleWatcher narrative ──────────────────────────────

export const whaleAccumulationSignal = makeWalletSignal({
  signalId:      makeSignalId(WALLET, 'accumulation', WINDOW_START),
  walletAddress: WALLET,
  chain:         CHAIN,
  signalType:    'accumulation',
  strength:      'high',
  confidence:    'high',
  windowStart:   WINDOW_START,
  windowEnd:     WINDOW_END,
  detectedAt:    '2026-05-01T08:00:00.000Z',
  evidence: {
    netInflowUSD:       40_200_000,
    primaryToken:       'ETH',
    primaryProtocol:    'Uniswap V3',
    consistencyScore:   0.87,
    weeklyTxCounts:     [41, 38, 55, 53],
  },
  caveats: [
    'Signal derived from Dune historical data (30-day window, cached).',
    'On-chain accumulation does not imply future price impact.',
    'Counterparty labels are inferred from protocol address matching and may be incomplete.',
  ],
  dataQuality: makeDataQuality({
    isEstimated: false, isPartial: false, isFallback: false,
    confidence: 'high',
    sources: [duneCachedSource, alchemyLiveSource],
  }),
  sources: [duneCachedSource, alchemyLiveSource],
});

// ── NarrativeInput — ready to pass to api/analyze.js ────────────────────────

export const whaleNarrativeInput = makeNarrativeInput({
  walletAddress: WALLET,
  chain:         CHAIN,
  signals:       [whaleAccumulationSignal],
  baseline:      whaleBaseline,
  recentEvents:  [latestAccumulationEvent],
  focusTopics:   ['accumulation', 'defi', 'whale'],
  requestedTone: 'analytical',
});

// ── NarrativeCard — example output from AI layer ─────────────────────────────

export const whaleNarrativeCard = makeNarrativeCard({
  cardId:        'card-whale-acc-2026-05-01',
  walletAddress: WALLET,
  headline:      'Large wallet accumulated $40M+ in ETH and WBTC via Uniswap V3 over 30 days',
  body:          'This wallet moved $42.8M on-chain between April 1 and May 1, with net inflows ' +
                 'of $40.2M concentrated in ETH (72%) and WBTC (21%). Activity was consistent ' +
                 'across all four weeks with 94 ETH-acquisition transactions routed through Uniswap V3. ' +
                 'USDC outflows of $2.6M suggest liquidity sourcing rather than exits.',
  keyPoints: [
    'Net inflow: $40.2M over 30 days (ETH + WBTC)',
    'Primary route: Uniswap V3 (89% of volume)',
    'Consistent weekly cadence — not a single large event',
    'USDC outflow likely funds swap activity, not distribution',
    'Data source: Dune Analytics (cached), Alchemy (live delta)',
  ],
  cardType:    'whale_watcher',
  confidence:  'high',
  caveats: [
    'This narrative is based on publicly available on-chain data only.',
    'On-chain accumulation does not constitute investment advice.',
    'Off-chain context (OTC trades, custodial holdings) is not reflected.',
  ],
  generatedAt: '2026-05-01T08:05:00.000Z',
  sources:     [duneCachedSource, alchemyLiveSource],
  signals:     [whaleAccumulationSignal],
});
