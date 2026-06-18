/**
 * quantum-exposure-formatting.js
 *
 * Human-readable labels and tone helpers for Quantum Intelligence UI surfaces.
 *
 * Language guardrails (mirrors quantum-exposure.js):
 *   Preferred: future quantum-signature exposure, signature exposure observed,
 *              migration-readiness signals, heuristic score, source-backed facts.
 *   Prohibited: quantum vulnerable, will be hacked, unsafe wallet, compromised,
 *               guaranteed safe.
 */

/** @type {Record<string, string>} */
const REASON_CODE_LABELS = {
  insufficient_data:
    'Insufficient on-chain data available',
  signature_exposure_observed:
    'Signature activity observed on this address',
  no_outgoing_signature_observed:
    'No outgoing signature activity observed in available data',
  contract_wallet_detected:
    'Contract wallet — signature exposure model differs from EOA',
  safe_wallet_detected:
    'Safe multisig wallet detected',
  multisig_detected:
    'Multisig wallet detected',
  account_abstraction_detected:
    'Account abstraction wallet detected',
  source_coverage_partial:
    'Limited source coverage — additional on-chain data may refine this estimate',
  large_value_at_risk:
    'Large-value holdings observed on-chain',
  active_0_30d:
    'Active within the last 30 days',
  warm_dormant_30_180d:
    'Dormant for 30–180 days',
  cold_dormant_180_730d:
    'Dormant for 180–730 days',
  ancient_dormant_730d_plus:
    'Dormant for over 2 years',
  migration_readiness_signals_present:
    'Migration-readiness signals observed',
};

/**
 * Return a human-readable label for a reason code.
 * Falls back to the raw code string for unknown codes.
 *
 * @param {string} code
 * @returns {string}
 */
export function formatReasonCode(code) {
  return REASON_CODE_LABELS[code] ?? code;
}

/**
 * Return a human-readable confidence label.
 *
 * @param {'high'|'medium'|'low'|string|null|undefined} level
 * @returns {string}
 */
export function formatConfidence(level) {
  if (level === 'high')   return 'High confidence';
  if (level === 'medium') return 'Medium confidence';
  if (level === 'low')    return 'Low confidence';
  return level ?? 'Unknown confidence';
}

/**
 * Map a score result label to a Badge tone.
 *
 * @param {string|null|undefined} label
 * @returns {'safe'|'warn'|'risk'|'muted'}
 */
export function labelTone(label) {
  if (!label || label === 'Unknown / insufficient data') return 'muted';
  if (label === 'Low exposure')      return 'safe';
  if (label === 'Moderate exposure') return 'warn';
  return 'risk'; // Elevated exposure, Migration priority
}

/** Minimum signal score to surface a behavioral exposure line in the UI. */
export const SIGNAL_DISPLAY_THRESHOLD = 0.3;

/**
 * Return only adversarial signals that cross the display threshold, sorted
 * by score descending.  Returns [] for null/absent input.
 *
 * @param {Object|null|undefined} adversarialSignals
 * @returns {Array<{key: string, signal: Object}>}
 */
export function visibleSignals(adversarialSignals) {
  if (!adversarialSignals || typeof adversarialSignals !== 'object') return [];
  return Object.entries(adversarialSignals)
    .filter(([, s]) => typeof s?.score === 'number' && s.score >= SIGNAL_DISPLAY_THRESHOLD)
    .sort(([, a], [, b]) => b.score - a.score)
    .map(([key, signal]) => ({ key, signal }));
}
