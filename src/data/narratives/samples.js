/**
 * Sample NarrativeCards for testing, documentation, and UI development.
 *
 * Three scenarios:
 *   1. whaleAccumulationCard  — high-confidence ETH/WBTC accumulation
 *   2. largeMoveCard          — medium-confidence large transfer + new counterparty
 *   3. lowConfidenceCard      — low-confidence unusual volume (truncated data)
 *
 * Each card is built deterministically from WalletSignal fixtures using
 * buildNarrativeCard(), so they always reflect the current builder logic.
 */

import { buildNarrativeCard } from './builder.js';
import { makeWalletSignal, makeSignalId } from '../models/signals.js';
import { makeSourceMetadata, makeDataQuality } from '../models/source-metadata.js';
import { whaleAccumulationSignal } from '../models/fixtures/whale-accumulation.js';
import { lowConfidenceSignal } from '../models/fixtures/low-confidence.js';

// ── Sample 1: Whale Accumulation ──────────────────────────────────────────────

export const whaleAccumulationCard = buildNarrativeCard(
  [whaleAccumulationSignal],
  { cardId: 'card-sample-whale-acc', generatedAt: '2026-05-01T08:05:00.000Z' },
);

// ── Sample 2: Large Move + New Counterparty ───────────────────────────────────

const WALLET_2     = '0x28c6c06298d514db089934071355e5743bf21d60';
const WIN_START_2  = '2026-04-25T00:00:00.000Z';
const WIN_END_2    = '2026-05-02T00:00:00.000Z';
const DETECTED_2   = '2026-05-02T10:05:00.000Z';

const duneSource2 = makeSourceMetadata({
  sourceId:        'dune-7d-2',
  sourceType:      'dune_cached',
  queryId:         'q_wallet_7d',
  fetchedAt:       '2026-05-02T09:00:00.000Z',
  isCached:        true,
  cacheAgeSeconds: 3600,
});

const alchemySource2 = makeSourceMetadata({
  sourceId:  'alchemy-txs-2',
  sourceType: 'alchemy',
  fetchedAt:  '2026-05-02T10:00:00.000Z',
  isCached:   false,
});

const largeMoveSignal = makeWalletSignal({
  signalId:      makeSignalId(WALLET_2, 'large_move_vs_baseline', WIN_START_2),
  walletAddress: WALLET_2,
  chain:         'ethereum',
  signalType:    'large_move_vs_baseline',
  strength:      'high',
  confidence:    'medium',
  windowStart:   WIN_START_2,
  windowEnd:     WIN_END_2,
  detectedAt:    DETECTED_2,
  evidence: {
    largestEventValueUSD: 8_500_000,
    largestEventTxHash:   '0xdef789abc012def789abc012def789abc012def789abc012def789abc012def7',
    largestEventType:     'transfer',
    deviationVsDailyAvg:  12.2,
    thresholdMultiplier:  5,
    usualDailyVolumeUSD:  696_000,
    thresholdUSD:         3_480_000,
    totalLargeEventCount: 1,
    totalLargeVolumeUSD:  8_500_000,
  },
  caveats: [
    'Large move threshold is a multiple of the baseline daily average; a higher baseline means a higher threshold.',
    'Confidence is medium because the Dune baseline uses estimated USD prices for some tokens.',
  ],
  dataQuality: makeDataQuality({ isEstimated: true, confidence: 'medium', sources: [duneSource2, alchemySource2] }),
  sources: [duneSource2, alchemySource2],
});

const newCounterpartySignal = makeWalletSignal({
  signalId:      makeSignalId(WALLET_2, 'new_counterparty', WIN_START_2),
  walletAddress: WALLET_2,
  chain:         'ethereum',
  signalType:    'new_counterparty',
  strength:      'high',
  confidence:    'medium',
  windowStart:   WIN_START_2,
  windowEnd:     WIN_END_2,
  detectedAt:    DETECTED_2,
  evidence: {
    newCounterpartyCount:  1,
    totalNewVolumeUSD:     8_500_000,
    topNewCounterparties: [
      { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', label: 'Uniswap V3 Router 2', valueUSD: 8_500_000 },
    ],
    knownCounterpartyCount: 5,
    minValueThresholdUSD:   50_000,
  },
  caveats: [
    'Counterparty is "new" only relative to the Dune baseline top-counterparty list; it may appear in full transaction history.',
    'Counterparty addresses are publicly observable on-chain data; no identity inference is made.',
  ],
  dataQuality: makeDataQuality({ confidence: 'medium', sources: [duneSource2, alchemySource2] }),
  sources: [duneSource2, alchemySource2],
});

export const largeMoveCard = buildNarrativeCard(
  [largeMoveSignal, newCounterpartySignal],
  { cardId: 'card-sample-large-move', generatedAt: '2026-05-02T10:10:00.000Z' },
);

// ── Sample 3: Low-Confidence Unusual Volume ───────────────────────────────────

export const lowConfidenceCard = buildNarrativeCard(
  [lowConfidenceSignal],
  { cardId: 'card-sample-low-conf', generatedAt: '2026-05-01T05:00:00.000Z' },
);
