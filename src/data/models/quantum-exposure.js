/**
 * QuantumExposureScore — composite risk-exposure metric for a wallet.
 *
 * The score (0–100) summarises how exposed a wallet is across four dimensions:
 * DeFi protocol depth, token concentration, counterparty diversity, and
 * volatility-weighted holdings.  Higher scores indicate higher measured exposure,
 * NOT higher risk in a financial-advice sense.
 *
 * REQUIRED caveats:
 *   1. This score is informational and does NOT constitute investment advice.
 *   2. On-chain data cannot capture off-chain hedges, custodial holdings, or
 *      intent behind transactions.
 *   3. Confidence is limited by the completeness of the underlying data sources.
 *   4. Past on-chain behaviour does not predict future outcomes.
 */

import { makeDataQuality, makeSourceMetadata } from './source-metadata.js';

/** @typedef {import('./source-metadata.js').ConfidenceLevel} ConfidenceLevel */

/**
 * @typedef {Object} ExposureBreakdown
 * @property {number} defiExposure        - DeFi protocol interaction depth (0–100)
 * @property {number} concentrationRisk   - Token concentration relative to portfolio size (0–100)
 * @property {number} counterpartyRisk    - Inverse of counterparty diversity (0–100)
 * @property {number} volatilityExposure  - Volatility-weighted asset exposure (0–100)
 */

/**
 * @typedef {'high'|'medium'|'low'} RiskBand
 */

/**
 * @typedef {Object} QuantumExposureScore
 * @property {string}            walletAddress - Wallet address this score describes
 * @property {string}            chain         - Chain identifier
 * @property {string}            scoredAt      - ISO 8601 scoring timestamp
 * @property {number}            score         - Composite score, 0–100 (higher = more exposed)
 * @property {RiskBand}          riskBand      - Categorical risk band derived from score
 * @property {ConfidenceLevel}   confidence    - Confidence in the score
 * @property {ExposureBreakdown} breakdown     - Per-dimension component scores
 * @property {string[]}          caveats       - Required caveats — must be non-empty
 * @property {string}            disclaimer    - Full disclaimer text — must be non-empty
 * @property {import('./source-metadata.js').DataQuality}      dataQuality - Aggregate quality metadata
 * @property {import('./source-metadata.js').SourceMetadata[]} sources     - All contributing sources
 */

const REQUIRED_CAVEATS = [
  'This score is informational and does not constitute investment advice.',
  'On-chain data cannot capture off-chain hedges, custodial holdings, or transaction intent.',
  'Confidence is bounded by completeness of the underlying data sources.',
  'Past on-chain behaviour does not predict future outcomes.',
];

const STANDARD_DISCLAIMER =
  'QuantumExposureScore is a derived, on-chain-only metric for informational purposes. ' +
  'It is not a credit score, risk rating, or financial recommendation. ' +
  'Do not make financial decisions based solely on this score.';

/**
 * Derive the risk band from a 0–100 score.
 *
 * @param {number} score
 * @returns {RiskBand}
 */
export function scoreToRiskBand(score) {
  if (score >= 67) return 'high';
  if (score >= 34) return 'medium';
  return 'low';
}

/**
 * Factory for QuantumExposureScore.
 *
 * @param {Partial<QuantumExposureScore>} partial
 * @returns {QuantumExposureScore}
 */
export function makeQuantumExposureScore(partial = {}) {
  const score = typeof partial.score === 'number'
    ? Math.max(0, Math.min(100, partial.score))
    : 0;

  const breakdown = {
    defiExposure:       partial.breakdown?.defiExposure       ?? 0,
    concentrationRisk:  partial.breakdown?.concentrationRisk  ?? 0,
    counterpartyRisk:   partial.breakdown?.counterpartyRisk   ?? 0,
    volatilityExposure: partial.breakdown?.volatilityExposure ?? 0,
  };

  const caveats = Array.isArray(partial.caveats) && partial.caveats.length > 0
    ? partial.caveats
    : REQUIRED_CAVEATS;

  return {
    walletAddress: partial.walletAddress ?? '0x0000000000000000000000000000000000000000',
    chain:         partial.chain         ?? 'ethereum',
    scoredAt:      partial.scoredAt      ?? new Date().toISOString(),
    score,
    riskBand:      partial.riskBand      ?? scoreToRiskBand(score),
    confidence:    partial.confidence    ?? 'medium',
    breakdown,
    caveats,
    disclaimer:    partial.disclaimer    ?? STANDARD_DISCLAIMER,
    dataQuality:   partial.dataQuality   ?? makeDataQuality({ confidence: 'medium' }),
    sources:       Array.isArray(partial.sources) ? partial.sources : [makeSourceMetadata({ sourceType: 'computed' })],
  };
}

export { REQUIRED_CAVEATS, STANDARD_DISCLAIMER };
