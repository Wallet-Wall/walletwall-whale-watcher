/**
 * Quantum Intelligence — pure exposure classification and heuristic scoring helpers.
 *
 * deriveWalletSignatureExposure
 *   Classifies a wallet's signature exposure status from source-backed on-chain
 *   facts and a chain signature profile.
 *
 * deriveQuantumExposureScore
 *   Computes a heuristic quantum-signature exposure score (0–100, or null) from
 *   the output of deriveWalletSignatureExposure.
 *
 * Language guardrails (enforced by tests):
 *   Preferred: future quantum-signature exposure, signature exposure observed,
 *              migration-readiness signals, heuristic score, source-backed facts.
 *   Prohibited: quantum vulnerable, will be hacked, unsafe wallet, compromised,
 *               guaranteed safe.
 */

/** @typedef {'signature_exposure_observed'|'no_outgoing_signature_observed'|'contract_wallet'|'unknown'} ExposureStatus */
/** @typedef {'active_0_30d'|'warm_dormant_30_180d'|'cold_dormant_180_730d'|'ancient_dormant_730d_plus'|'unknown'} DormancyBucket */
/** @typedef {'high'|'medium'|'low'} ConfidenceLevel */

const EXPOSURE_CAVEAT =
  'This is a heuristic estimate of future quantum-signature exposure based on ' +
  'source-backed on-chain facts. It does not imply current exploitability or ' +
  'constitute investment advice. Confidence reflects data completeness only.';

const SCORE_CAVEAT =
  'This heuristic score estimates future quantum-signature exposure priority ' +
  'based on observed signature activity, dormancy, and reported value. ' +
  'It does not constitute a security assessment, financial advice, or a claim ' +
  'about the current security status of this wallet.';

const LARGE_VALUE_USD_THRESHOLD = 100_000;
const HIGH_VALUE_USD_THRESHOLD = 1_000_000;

const SCORE_LABELS = {
  unknown:            'Unknown / insufficient data',
  low:                'Low exposure',
  moderate:           'Moderate exposure',
  elevated:           'Elevated exposure',
  migration_priority: 'Migration priority',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Compute days elapsed since an ISO 8601 timestamp.
 * Returns null for invalid, missing, or future timestamps.
 *
 * @param {string | null | undefined} isoDate
 * @param {number} nowMs
 * @returns {number | null}
 */
function daysSince(isoDate, nowMs) {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = nowMs - ms;
  return diff >= 0 ? Math.floor(diff / 86_400_000) : null;
}

/**
 * Classify days dormant into a named bucket.
 *
 * @param {number | null | undefined} daysDormant
 * @returns {DormancyBucket}
 */
function classifyDormancy(daysDormant) {
  if (daysDormant == null || !Number.isFinite(daysDormant)) return 'unknown';
  if (daysDormant <= 30)  return 'active_0_30d';
  if (daysDormant <= 180) return 'warm_dormant_30_180d';
  if (daysDormant <= 730) return 'cold_dormant_180_730d';
  return 'ancient_dormant_730d_plus';
}

// ── deriveWalletSignatureExposure ────────────────────────────────────────────

/**
 * @typedef {Object} WalletFacts
 * @property {string}          [chain]
 * @property {string}          [address]
 * @property {boolean}         [isContract]
 * @property {string|null}     [firstSeenAt]          - ISO 8601
 * @property {string|null}     [firstOutgoingTxAt]    - ISO 8601
 * @property {string|null}     [lastOutgoingTxAt]     - ISO 8601
 * @property {number|null}     [signedTxCount]
 * @property {number|null}     [txCountLifetime]
 * @property {number|null}     [daysDormant]
 * @property {number|null}     [totalBalanceUsd]
 * @property {boolean}         [isSafeWallet]
 * @property {boolean}         [isMultisig]
 * @property {boolean}         [isAccountAbstractionWallet]
 */

/**
 * @typedef {Object} WalletSignatureExposure
 * @property {ExposureStatus}  exposureStatus
 * @property {string|null}     signatureScheme
 * @property {number|null}     keyAgeDays
 * @property {number|null}     signatureAgeDays
 * @property {DormancyBucket}  dormancyBucket
 * @property {string[]}        migrationReadinessHints
 * @property {string[]}        reasonCodes
 * @property {ConfidenceLevel} confidence
 * @property {string}          caveat
 */

/**
 * Derive wallet signature exposure classification from source-backed on-chain facts.
 *
 * @param {WalletFacts | null | undefined} walletFacts
 * @param {import('../data/quantum/chain-signature-profiles.js').ChainSignatureProfile | null} chainProfile
 * @param {number} [_nowMs] - Override current time (for deterministic tests)
 * @returns {WalletSignatureExposure}
 */
function classifyContractWallet(facts, signatureScheme, keyAgeDays, signatureAgeDays, dormancyBucket) {
  const reasonCodes            = ['contract_wallet_detected'];
  const migrationReadinessHints = [];

  if (facts.isSafeWallet) {
    reasonCodes.push('safe_wallet_detected');
    migrationReadinessHints.push(
      'Safe multisig wallets may support signature scheme upgrades through module or threshold changes.',
    );
  }
  if (facts.isMultisig && !facts.isSafeWallet) {
    reasonCodes.push('multisig_detected');
    migrationReadinessHints.push(
      'Multisig wallets distribute signing responsibility; upgrade paths depend on the contract implementation.',
    );
  }
  if (facts.isAccountAbstractionWallet) {
    reasonCodes.push('account_abstraction_detected');
    migrationReadinessHints.push(
      'Account abstraction wallets may support validator key rotation as post-quantum standards become available.',
    );
  }
  if (dormancyBucket !== 'unknown') reasonCodes.push(dormancyBucket);
  if (typeof facts.totalBalanceUsd === 'number' && facts.totalBalanceUsd >= LARGE_VALUE_USD_THRESHOLD) {
    reasonCodes.push('large_value_at_risk');
  }

  return {
    exposureStatus: 'contract_wallet',
    signatureScheme, keyAgeDays, signatureAgeDays, dormancyBucket,
    migrationReadinessHints, reasonCodes,
    confidence: 'medium',
    caveat:     EXPOSURE_CAVEAT,
  };
}

export function deriveWalletSignatureExposure(walletFacts, chainProfile, _nowMs) {
  const nowMs  = typeof _nowMs === 'number' ? _nowMs : Date.now();
  const facts  = walletFacts ?? {};

  // No chain identity at all → cannot classify
  if (!facts.chain && !chainProfile) {
    return {
      exposureStatus:         'unknown',
      signatureScheme:        null,
      keyAgeDays:             null,
      signatureAgeDays:       null,
      dormancyBucket:         'unknown',
      migrationReadinessHints: [],
      reasonCodes:            ['insufficient_data'],
      confidence:             'low',
      caveat:                 EXPOSURE_CAVEAT,
    };
  }

  const signatureScheme  = chainProfile?.defaultSignatureScheme ?? null;
  const keyAgeDays       = daysSince(facts.firstSeenAt,       nowMs);
  const signatureAgeDays = daysSince(facts.firstOutgoingTxAt, nowMs);
  const dormancyBucket   = classifyDormancy(facts.daysDormant);

  const reasonCodes            = [];
  const migrationReadinessHints = [];

  // ── Contract / smart-wallet path ────────────────────────────────────────────
  const isContractWallet =
    facts.isContract === true         ||
    facts.isSafeWallet === true        ||
    facts.isMultisig === true          ||
    facts.isAccountAbstractionWallet === true;

  if (isContractWallet) {
    return classifyContractWallet(facts, signatureScheme, keyAgeDays, signatureAgeDays, dormancyBucket);
  }

  // ── EOA path ─────────────────────────────────────────────────────────────────
  const hasOutgoingActivity =
    Boolean(facts.firstOutgoingTxAt) ||
    (typeof facts.signedTxCount === 'number' && facts.signedTxCount > 0);

  if (hasOutgoingActivity) {
    reasonCodes.push('signature_exposure_observed');
  }

  if (dormancyBucket !== 'unknown') {
    reasonCodes.push(dormancyBucket);
  }

  if (typeof facts.totalBalanceUsd === 'number' && facts.totalBalanceUsd >= LARGE_VALUE_USD_THRESHOLD) {
    reasonCodes.push('large_value_at_risk');
  }

  // Confidence: high when we have timestamps + dormancy + profile; low when data is thin
  const hasKeyTimestamps = Boolean(facts.firstSeenAt);
  const hasDormancy      = facts.daysDormant != null;

  let confidence;
  if (hasKeyTimestamps && hasDormancy && chainProfile) {
    confidence = 'high';
  } else if (hasKeyTimestamps || hasDormancy || hasOutgoingActivity) {
    confidence = 'medium';
  } else {
    confidence = 'low';
    reasonCodes.push('source_coverage_partial');
  }

  return {
    exposureStatus:          hasOutgoingActivity
      ? 'signature_exposure_observed'
      : 'no_outgoing_signature_observed',
    signatureScheme,
    keyAgeDays,
    signatureAgeDays,
    dormancyBucket,
    migrationReadinessHints,
    reasonCodes,
    confidence,
    caveat:                  EXPOSURE_CAVEAT,
  };
}

// ── deriveQuantumExposureScore ────────────────────────────────────────────────

/**
 * @typedef {Object} QuantumExposureScoreResult
 * @property {number|null}     score
 * @property {string}          label
 * @property {ConfidenceLevel} confidence
 * @property {string[]}        reasonCodes
 * @property {string}          caveat    - Base static caveat (kept for backward compatibility)
 * @property {string[]}        caveats   - Full source-backed caveat list (superset of caveat)
 */

function _resolveAgeDays(facts) {
  if (typeof facts.keyAgeDays === 'number') return facts.keyAgeDays;
  if (typeof facts.signatureAgeDays === 'number') return facts.signatureAgeDays;
  return null;
}

/**
 * Compute a heuristic quantum-signature exposure score (0–100, or null).
 *
 * Input is the output of deriveWalletSignatureExposure, optionally augmented
 * with totalBalanceUsd when that field was not part of the exposure facts.
 *
 * Score components (max values):
 *   Signature exposure      — 0–35
 *   Dormancy                — 0–20
 *   Value at risk           — 0–25
 *   Key / signature age     — 0–15
 *   Migration-readiness     — reduces by up to 10
 *
 * @param {Partial<WalletSignatureExposure> & { totalBalanceUsd?: number | null }} exposureFacts
 * @returns {QuantumExposureScoreResult}
 */
function computeExposurePoints(facts) {
  let points = 0;

  if (facts.exposureStatus === 'signature_exposure_observed') points += 35;
  else if (facts.exposureStatus === 'no_outgoing_signature_observed') points += 5;

  const DORMANCY_POINTS = {
    ancient_dormant_730d_plus: 20,
    cold_dormant_180_730d:     12,
    warm_dormant_30_180d:       5,
    active_0_30d:               0,
    unknown:                    8,
  };
  points += DORMANCY_POINTS[facts.dormancyBucket] ?? 0;

  const totalUsd =
    typeof facts.totalBalanceUsd === 'number' && facts.totalBalanceUsd >= 0
      ? facts.totalBalanceUsd : null;
  if (totalUsd != null) {
    if      (totalUsd >= HIGH_VALUE_USD_THRESHOLD)  points += 25;
    else if (totalUsd >= LARGE_VALUE_USD_THRESHOLD) points += 18;
    else if (totalUsd >= 10_000)                    points += 10;
    else if (totalUsd > 0)                          points +=  5;
  }

  const ageDays = _resolveAgeDays(facts);
  if (ageDays != null) {
    if      (ageDays >= 1825) points += 15;
    else if (ageDays >= 1095) points += 10;
    else if (ageDays >= 365)  points +=  5;
  }

  return points;
}

export function deriveQuantumExposureScore(exposureFacts) {
  const facts      = exposureFacts ?? {};
  const reasonCodes = Array.isArray(facts.reasonCodes) ? [...facts.reasonCodes] : [];

  if (!facts.exposureStatus || facts.exposureStatus === 'unknown') {
    return {
      score:       null,
      label:       SCORE_LABELS.unknown,
      confidence:  'low',
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['insufficient_data'],
      caveat:      SCORE_CAVEAT,
      caveats: [
        SCORE_CAVEAT,
        'Insufficient on-chain data to compute a reliable score. ' +
        'Provide transaction history and chain context for a more accurate estimate.',
      ],
    };
  }

  let points = computeExposurePoints(facts);

  const hasMigrationPath =
    Array.isArray(facts.migrationReadinessHints) && facts.migrationReadinessHints.length > 0;
  if (hasMigrationPath) {
    points = Math.max(0, points - 10);
    if (!reasonCodes.includes('migration_readiness_signals_present')) {
      reasonCodes.push('migration_readiness_signals_present');
    }
  }

  const score = Math.min(100, Math.max(0, points));

  let labelKey;
  if      (score >= 75) labelKey = 'migration_priority';
  else if (score >= 50) labelKey = 'elevated';
  else if (score >= 25) labelKey = 'moderate';
  else                  labelKey = 'low';

  const caveats = [SCORE_CAVEAT];

  if (reasonCodes.includes('source_coverage_partial')) {
    caveats.push(
      'Limited source coverage — key facts (chain profile, transaction history, or dormancy) are ' +
      'not available. The estimate above may not reflect the actual exposure of this wallet.',
    );
  }

  return {
    score,
    label:      SCORE_LABELS[labelKey],
    confidence: facts.confidence ?? 'medium',
    reasonCodes,
    caveat:     SCORE_CAVEAT,
    caveats,
  };
}

export { EXPOSURE_CAVEAT, SCORE_CAVEAT, SCORE_LABELS };
