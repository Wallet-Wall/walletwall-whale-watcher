/**
 * Proof-of-Readiness attestation schema.
 *
 * Off-chain attestation records for verified wallet readiness actions.
 * No on-chain writes, no wallet connection, no cryptographic signing in
 * Phase 2 (no pre-existing signing utility to build on).
 *
 * Hard guardrails (enforced by tests):
 *   - Every attestation has custody === 'none'.
 *   - type, version, and custody are always enforced on create and validate.
 *   - No payout, token, APY, staking, deposit, or amount fields.
 *
 * @see docs/features/proof-of-readiness-rewards.mdx
 */

/** @type {'walletwall.proofOfReadiness'} */
export const PROOF_OF_READINESS_ATTESTATION_TYPE = 'walletwall.proofOfReadiness';

/** @type {'0.1'} */
export const PROOF_OF_READINESS_ATTESTATION_VERSION = '0.1';

const ATTESTOR = 'walletwall';

const DISCLAIMER =
  'This attestation confirms a readiness action only. It is not a financial instrument, ' +
  'not a payout, and does not represent a claim on any asset. ' +
  'WalletWall does not custody assets and this attestation is not a guarantee of any reward.';

/**
 * @typedef {Object} ProofOfReadinessAttestation
 * @property {'walletwall.proofOfReadiness'} type
 * @property {'0.1'}           version
 * @property {string|number}   chainId
 * @property {string}          walletAddress
 * @property {string}          actionType
 * @property {string}          actionId
 * @property {string}          evidenceHash
 * @property {string}          issuedAt
 * @property {string}          expiresAt
 * @property {string}          nonce
 * @property {'walletwall'}    attestor
 * @property {'none'}          custody
 * @property {string}          disclaimer
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isIsoLike(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

/**
 * Create a Proof-of-Readiness attestation.
 *
 * @param {Object}       input
 * @param {string|number} input.chainId       - required
 * @param {string}       input.walletAddress  - required
 * @param {string}       input.actionType     - required
 * @param {string}       input.actionId       - required
 * @param {string}       [input.evidenceHash] - direct hash string; takes precedence over evidence
 * @param {Object}       [input.evidence]     - ReadinessEvidence from proof-of-readiness-evidence.js;
 *                                             its .hash is used when evidenceHash is not provided
 * @param {string}       input.nonce          - required; prevents attestation replay
 * @param {string}       [input.issuedAt]     - ISO string; defaults to now
 * @param {string}       [input.expiresAt]    - ISO string; defaults to 90 days after issuedAt
 * @returns {ProofOfReadinessAttestation}
 */
export function createProofOfReadinessAttestation(input) {
  const inp = input ?? {};

  const { chainId, walletAddress, actionType, actionId, nonce } = inp;

  // evidenceHash may come directly or be derived from an evidence object
  const evidenceHash =
    inp.evidenceHash ??
    (inp.evidence != null && typeof inp.evidence === 'object' ? inp.evidence.hash : undefined);

  if (chainId == null) {
    throw new Error('createProofOfReadinessAttestation: chainId is required');
  }
  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
    throw new Error('createProofOfReadinessAttestation: walletAddress is required');
  }
  if (!actionType || typeof actionType !== 'string' || actionType.trim() === '') {
    throw new Error('createProofOfReadinessAttestation: actionType is required');
  }
  if (!actionId || typeof actionId !== 'string' || actionId.trim() === '') {
    throw new Error('createProofOfReadinessAttestation: actionId is required');
  }
  if (!evidenceHash || typeof evidenceHash !== 'string' || evidenceHash.trim() === '') {
    throw new Error('createProofOfReadinessAttestation: evidenceHash is required');
  }
  if (!nonce || typeof nonce !== 'string' || nonce.trim() === '') {
    throw new Error('createProofOfReadinessAttestation: nonce is required');
  }

  const issuedAt = inp.issuedAt ?? new Date().toISOString();

  let expiresAt = inp.expiresAt;
  if (!expiresAt) {
    const expiry = new Date(issuedAt);
    expiry.setDate(expiry.getDate() + 90);
    expiresAt = expiry.toISOString();
  }

  return {
    type: PROOF_OF_READINESS_ATTESTATION_TYPE,
    version: PROOF_OF_READINESS_ATTESTATION_VERSION,
    chainId,
    walletAddress,
    actionType,
    actionId,
    evidenceHash,
    issuedAt,
    expiresAt,
    nonce,
    attestor: ATTESTOR,
    custody: 'none',
    disclaimer: DISCLAIMER,
  };
}

/**
 * Validate a Proof-of-Readiness attestation object.
 *
 * @param {unknown} attestation
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export function validateProofOfReadinessAttestation(attestation) {
  const a = attestation ?? {};

  if (typeof a !== 'object' || Array.isArray(a)) {
    return { valid: false, errors: ['attestation must be a plain object'] };
  }

  const errors = [];

  if (a.type !== PROOF_OF_READINESS_ATTESTATION_TYPE) {
    errors.push(`type must be "${PROOF_OF_READINESS_ATTESTATION_TYPE}"`);
  }
  if (a.version !== PROOF_OF_READINESS_ATTESTATION_VERSION) {
    errors.push(`version must be "${PROOF_OF_READINESS_ATTESTATION_VERSION}"`);
  }
  if (a.custody !== 'none') {
    errors.push('custody must be "none"');
  }
  if (a.attestor !== ATTESTOR) {
    errors.push(`attestor must be "${ATTESTOR}"`);
  }

  if (a.chainId == null) {
    errors.push('chainId is required');
  }

  for (const field of ['walletAddress', 'actionType', 'actionId', 'evidenceHash', 'nonce']) {
    if (!a[field] || typeof a[field] !== 'string' || a[field].trim() === '') {
      errors.push(`${field} is required`);
    }
  }

  if (!isIsoLike(a.issuedAt)) {
    errors.push('issuedAt must be an ISO-like string');
  }
  if (!isIsoLike(a.expiresAt)) {
    errors.push('expiresAt must be an ISO-like string');
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
