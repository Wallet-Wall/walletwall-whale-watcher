/**
 * Fixture: Low-confidence / partial-data scenario.
 *
 * A wallet where the Dune query returned incomplete results (the tx window
 * was truncated), price data is unavailable for most tokens, and no live
 * source was reachable.  This demonstrates how models degrade gracefully
 * and surface warnings instead of silent inaccuracies.
 */

import { makeSourceMetadata, makeDataQuality } from '../source-metadata.js';
import { makeHistoricalWalletBaseline } from '../historical-baseline.js';
import { makeWalletSignal, makeSignalId } from '../signals.js';

const WALLET = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const CHAIN  = 'ethereum';

const WINDOW_START = '2026-03-01T00:00:00.000Z';
const WINDOW_END   = '2026-05-01T00:00:00.000Z';

export const partialDuneSource = makeSourceMetadata({
  sourceId:        'dune-partial-q1-q2',
  sourceType:      'dune_cached',
  queryId:         'q_wallet_activity_90d',
  fetchedAt:       '2026-05-01T04:00:00.000Z',
  isCached:        true,
  cacheAgeSeconds: 86400,
});

export const partialDataQuality = makeDataQuality({
  isEstimated: true,
  isPartial:   true,
  isFallback:  false,
  confidence:  'low',
  warnings: [
    'Dune query result was truncated at 200 rows; transaction history may be incomplete.',
    'Price data unavailable for 6 of 9 tokens; USD values are rough estimates.',
    'No live data source available; delta values not populated.',
    'Cache is 24 h stale.',
  ],
  sources: [partialDuneSource],
});

export const partialBaseline = makeHistoricalWalletBaseline({
  walletAddress:        WALLET,
  chain:                CHAIN,
  baselineWindowStart:  WINDOW_START,
  baselineWindowEnd:    WINDOW_END,
  totalVolumeUSD:       310_000,
  totalVolumeEstimated: true,
  txCount:              200,
  uniqueCounterparties: null,
  topTokenFlows: [
    { tokenSymbol: 'UNI',    tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', volumeUSD: 140_000, volumeEstimated: true,  direction: 'in',  txCount: 80 },
    { tokenSymbol: 'ETH',    tokenAddress: null,                                           volumeUSD:  90_000, volumeEstimated: false, direction: 'net', txCount: 60 },
    { tokenSymbol: 'UNKNOWN',tokenAddress: null,                                           volumeUSD:  80_000, volumeEstimated: true,  direction: 'net', txCount: 60 },
  ],
  topCounterparties: [],
  protocolUsage: [
    { protocolName: 'Unknown', protocolAddress: null, protocolType: 'other', volumeUSD: 80_000, txCount: 60, attributionConfidence: 'low' },
  ],
  dataQuality: partialDataQuality,
  source: partialDuneSource,
});

export const lowConfidenceSignal = makeWalletSignal({
  signalId:      makeSignalId(WALLET, 'unusual_volume', WINDOW_START),
  walletAddress: WALLET,
  chain:         CHAIN,
  signalType:    'unusual_volume',
  strength:      'medium',
  confidence:    'low',
  windowStart:   WINDOW_START,
  windowEnd:     WINDOW_END,
  detectedAt:    '2026-05-01T04:30:00.000Z',
  evidence: {
    observedVolumeUSD: 310_000,
    expectedRangeUSD:  [50_000, 200_000],
    truncationWarning: true,
  },
  caveats: [
    'Signal derived from a truncated Dune dataset (200-row limit reached).',
    'USD volumes are estimates; exact values unknown for most tokens.',
    'Low confidence — treat as a flag for further manual review, not a confirmed signal.',
    'No live data available to validate against recent on-chain state.',
  ],
  dataQuality: partialDataQuality,
  sources: [partialDuneSource],
});
