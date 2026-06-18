/**
 * Proof-of-Readiness evidence payload helpers.
 *
 * Deterministic, privacy-safe evidence payloads that attestations can
 * reference. Payloads redact raw wallet signals to an allowlisted set;
 * a stable SHA-256 hash ties an attestation to a specific evidence
 * snapshot without exposing the underlying data.
 *
 * Hard guardrails (enforced by tests):
 *   - Every payload has privacy === 'redacted'.
 *   - Every payload has custody === 'none'.
 *   - Signal normalization strips all non-allowlisted fields, including
 *     any sensitive, financial, or identity-revealing data.
 *   - No payout, token, APY, staking, deposit, or private-key fields.
 *
 * @see docs/features/proof-of-readiness-rewards.mdx
 */

import { createHash } from 'node:crypto';

/** @type {'0.1'} */
export const PROOF_OF_READINESS_EVIDENCE_VERSION = '0.1';

/**
 * Allowed evidence type values.
 *
 * @type {readonly string[]}
 */
export const READINESS_EVIDENCE_TYPES = Object.freeze([
  'exposure_reduction',
  'vault_readiness',
  'recovery_setup',
  'monitoring_enabled',
  'governance_participation',
  'readiness_attestation',
  'campaign_eligibility',
]);

/**
 * Allowlist of signal fields that may appear in a redacted evidence payload.
 * Any field not in this set is stripped during normalization.
 *
 * @type {Readonly<Set<string>>}
 */
const SIGNAL_ALLOWLIST = Object.freeze(
  new Set([
    'hasSignatureExposure',
    'dormantDays',
    'estimatedValueBand',
    'migrationReadinessTier',
    'vaultEligible',
    'watchlistEnabled',
    'recoveryConfigured',
    'governanceContextType',
    'attestationReady',
    'campaignEligible',
    'actionCompleted',
  ]),
);

/**
 * Produce a stable JSON string with keys sorted at every level so that the
 * same semantic object always produces the same byte sequence.
 *
 * @param {unknown} value
 * @returns {string}
 */
function sortedJson(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = v[k];
          return acc;
        }, {});
    }
    return v;
  });
}

/**
 * Return a normalized signals object containing only allowlisted fields from
 * `input.signals`. Fields not in the allowlist (including any sensitive,
 * financial, or identity-revealing data) are silently dropped.
 *
 * @param {Object} [input]
 * @param {Object} [input.signals]
 * @returns {Record<string, unknown>}
 */
export function normalizeReadinessEvidencePayload(input) {
  const raw =
    input != null && typeof input === 'object' && !Array.isArray(input)
      ? (input.signals ?? {})
      : {};

  const normalized = {};
  for (const key of SIGNAL_ALLOWLIST) {
    if (Object.hasOwn(raw, key)) {
      normalized[key] = raw[key];
    }
  }
  return normalized;
}

/**
 * @typedef {Object} ReadinessEvidencePayload
 * @property {'walletwall.readinessEvidence'} type
 * @property {'0.1'}             version
 * @property {string|number}     chainId
 * @property {string}            walletAddress
 * @property {string}            actionId
 * @property {string}            [campaignId]
 * @property {string}            evidenceType
 * @property {string}            observedAt
 * @property {Record<string,unknown>} signals
 * @property {'redacted'}        privacy
 * @property {'none'}            custody
 */

/**
 * Build a structured, privacy-safe evidence payload.
 *
 * @param {Object}       input
 * @param {string|number} input.chainId        - required
 * @param {string}       input.walletAddress   - required
 * @param {string}       input.actionId        - required
 * @param {string}       input.evidenceType    - required; must be in READINESS_EVIDENCE_TYPES
 * @param {string}       [input.campaignId]    - optional
 * @param {string}       [input.observedAt]    - ISO string; defaults to now
 * @param {Object}       [input.signals]       - raw signals; only allowlisted fields are kept
 * @returns {ReadinessEvidencePayload}
 */
export function createReadinessEvidencePayload(input) {
  const inp = input ?? {};

  const { chainId, walletAddress, actionId, evidenceType } = inp;

  if (chainId == null) {
    throw new Error('createReadinessEvidencePayload: chainId is required');
  }
  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
    throw new Error('createReadinessEvidencePayload: walletAddress is required');
  }
  if (!actionId || typeof actionId !== 'string' || actionId.trim() === '') {
    throw new Error('createReadinessEvidencePayload: actionId is required');
  }
  if (!evidenceType || !READINESS_EVIDENCE_TYPES.includes(evidenceType)) {
    throw new Error(
      `createReadinessEvidencePayload: evidenceType must be one of: ${READINESS_EVIDENCE_TYPES.join(', ')}`,
    );
  }

  const observedAt = inp.observedAt ?? new Date().toISOString();
  const signals = normalizeReadinessEvidencePayload(inp);

  /** @type {ReadinessEvidencePayload} */
  const payload = {
    type: 'walletwall.readinessEvidence',
    version: PROOF_OF_READINESS_EVIDENCE_VERSION,
    chainId,
    walletAddress,
    actionId,
    evidenceType,
    observedAt,
    signals,
    privacy: 'redacted',
    custody: 'none',
  };

  if (inp.campaignId != null) {
    payload.campaignId = inp.campaignId;
  }

  return payload;
}

/**
 * Produce a deterministic `0x`-prefixed SHA-256 hash of a redacted evidence
 * payload. Key ordering is normalised before hashing so that the same
 * semantic payload always produces the same hash.
 *
 * @param {ReadinessEvidencePayload} payload
 * @returns {string}  hex string prefixed with `0x`
 */
export function hashReadinessEvidencePayload(payload) {
  const canonical = sortedJson(payload);
  return '0x' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * @typedef {Object} ReadinessEvidence
 * @property {ReadinessEvidencePayload} payload
 * @property {string}                   hash
 */

/**
 * Convenience: build a payload and compute its hash in one call.
 *
 * @param {Object} input  - same shape as createReadinessEvidencePayload
 * @returns {ReadinessEvidence}
 */
export function createReadinessEvidence(input) {
  const payload = createReadinessEvidencePayload(input);
  const hash = hashReadinessEvidencePayload(payload);
  return { payload, hash };
}

/**
 * Validate a ReadinessEvidence object: checks structure, required fields,
 * guardrail invariants, and that the hash matches the payload.
 *
 * @param {unknown} evidence
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export function validateReadinessEvidence(evidence) {
  if (evidence == null || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { valid: false, errors: ['evidence must be a plain object'] };
  }

  const { payload, hash } = evidence;

  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['evidence.payload must be a plain object'] };
  }

  const errors = [];

  if (payload.type !== 'walletwall.readinessEvidence') {
    errors.push('payload.type must be "walletwall.readinessEvidence"');
  }
  if (payload.version !== PROOF_OF_READINESS_EVIDENCE_VERSION) {
    errors.push(`payload.version must be "${PROOF_OF_READINESS_EVIDENCE_VERSION}"`);
  }
  if (payload.privacy !== 'redacted') {
    errors.push('payload.privacy must be "redacted"');
  }
  if (payload.custody !== 'none') {
    errors.push('payload.custody must be "none"');
  }
  if (payload.chainId == null) {
    errors.push('payload.chainId is required');
  }
  if (
    !payload.walletAddress ||
    typeof payload.walletAddress !== 'string' ||
    payload.walletAddress.trim() === ''
  ) {
    errors.push('payload.walletAddress is required');
  }
  if (
    !payload.actionId ||
    typeof payload.actionId !== 'string' ||
    payload.actionId.trim() === ''
  ) {
    errors.push('payload.actionId is required');
  }
  if (!READINESS_EVIDENCE_TYPES.includes(payload.evidenceType)) {
    errors.push(
      `payload.evidenceType must be one of: ${READINESS_EVIDENCE_TYPES.join(', ')}`,
    );
  }
  if (!hash || typeof hash !== 'string' || hash.trim() === '') {
    errors.push('evidence.hash is required');
  }

  if (errors.length === 0) {
    const expected = hashReadinessEvidencePayload(payload);
    if (hash !== expected) {
      errors.push('evidence.hash does not match recomputed payload hash');
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
