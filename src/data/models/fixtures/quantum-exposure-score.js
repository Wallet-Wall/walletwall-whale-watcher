/**
 * Fixture: Quantum Exposure Score result.
 *
 * A medium-exposure wallet with high DeFi engagement but moderate token
 * concentration.  Includes all required caveats and the full disclaimer.
 */

import { makeSourceMetadata, makeDataQuality } from '../source-metadata.js';
import { makeQuantumExposureScore, scoreToRiskBand, REQUIRED_CAVEATS, STANDARD_DISCLAIMER } from '../quantum-exposure.js';

const WALLET = '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97';

const duneSource = makeSourceMetadata({
  sourceId:        'dune-qes-inputs',
  sourceType:      'dune_cached',
  queryId:         'q_wallet_activity_30d',
  fetchedAt:       '2026-05-01T06:00:00.000Z',
  isCached:        true,
  cacheAgeSeconds: 3600,
});

const computedSource = makeSourceMetadata({
  sourceId:   'qes-compute-v1',
  sourceType: 'computed',
  fetchedAt:  '2026-05-01T08:10:00.000Z',
  isCached:   false,
});

const SCORE = 61;

export const walletExposureScore = makeQuantumExposureScore({
  walletAddress: WALLET,
  chain:         'ethereum',
  scoredAt:      '2026-05-01T08:10:00.000Z',
  score:         SCORE,
  riskBand:      scoreToRiskBand(SCORE),
  confidence:    'medium',
  breakdown: {
    defiExposure:       82,
    concentrationRisk:  58,
    counterpartyRisk:   44,
    volatilityExposure: 71,
  },
  caveats: [
    ...REQUIRED_CAVEATS,
    'DeFi exposure score is elevated due to consistent Uniswap V3 routing; this reflects protocol depth, not leverage.',
    'Counterparty risk is moderate: 12 unique counterparties recorded in the 30-day window.',
  ],
  disclaimer:  STANDARD_DISCLAIMER,
  dataQuality: makeDataQuality({
    isEstimated: false,
    isPartial:   false,
    isFallback:  false,
    confidence:  'medium',
    warnings:    ['Volatility exposure component uses 7-day rolling volatility which may lag sudden price moves.'],
    sources:     [duneSource, computedSource],
  }),
  sources: [duneSource, computedSource],
});
