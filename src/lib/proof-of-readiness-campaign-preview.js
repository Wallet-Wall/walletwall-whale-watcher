/**
 * Proof-of-Readiness Campaign Preview — shared utilities.
 *
 * Extracted so Node test runner can import without a JSX transform.
 * The component itself lives in src/components/ProofOfReadinessCampaignPreview.jsx.
 *
 * Hard boundaries: no payout, no staking, no on-chain actions, no custody language.
 */

import { createReadinessEvidence } from './proof-of-readiness-evidence.js';

export const SAFE_LANGUAGE_DISCLAIMER =
  'Readiness evidence may help wallets participate in future ecosystem campaigns, ' +
  'audits, or migration-support programs. WalletWall does not custody funds, execute ' +
  'migrations, issue rewards, or determine final eligibility.';

export const EVIDENCE_DOCS_PATH = '/features/proof-of-readiness-rewards';
export const ROADMAP_DOCS_PATH  = '/features/proof-of-readiness-campaign-roadmap';

export const ATTESTATION_STATUS_LABELS = Object.freeze({
  eligible:          'Eligible',
  suggested:         'Suggested',
  completed_local:   'Completed locally',
  attestation_ready: 'Attestation ready',
});

/**
 * Truncates an evidence hash for display: `0x1a2b3c4d...9e8f7a`.
 * Returns null for absent or empty input.
 *
 * @param {string|null|undefined} hash
 * @returns {string|null}
 */
export function truncateHash(hash) {
  if (hash == null || typeof hash !== 'string' || hash.trim() === '') return null;
  const h = hash.trim();
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

/**
 * Copies evidenceHash via the onCopyHash callback or navigator.clipboard.
 * No-ops on absent/empty hash.
 *
 * @param {string|null|undefined} evidenceHash
 * @param {((h: string) => void)|undefined} onCopyHash
 */
export function handleCopyHash(evidenceHash, onCopyHash) {
  if (!evidenceHash || typeof evidenceHash !== 'string' || evidenceHash.trim() === '') return;
  if (typeof onCopyHash === 'function') {
    onCopyHash(evidenceHash);
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(evidenceHash);
  }
}

/**
 * Extract raw readiness signals from a wallet security profile.
 *
 * Returns null when no profile is supplied (no scan data yet).
 * Shared between deriveReadinessEvidenceHash (hash creation) and
 * ProofOfReadinessCampaignPreview (evidence detail panel display) so both
 * always read the same fields from the same source.
 *
 * @param {Object|null|undefined} securityProfile - from buildWalletSecurityProfile
 * @returns {{ hasSignatureExposure: boolean, vaultEligible: boolean, recoveryConfigured: boolean|null }|null}
 */
export function deriveReadinessSignals(securityProfile) {
  if (!securityProfile) return null;

  const state = securityProfile?.state?.state;
  const vaultEligible = securityProfile?.vaultEligibility?.eligible === true;
  const hasSignatureExposure =
    state === 'signature-exposed' ||
    state === 'high-value-exposed' ||
    state === 'recovery-needed';

  const recoveryClassification = securityProfile?.recovery?.classification;
  let recoveryConfigured = null;
  if (
    recoveryClassification === 'should-configure-recovery' ||
    recoveryClassification === 'needs-urgent-migration'
  ) {
    recoveryConfigured = false;
  } else if (recoveryClassification != null && recoveryClassification !== 'not-applicable') {
    recoveryConfigured = true;
  }

  return { hasSignatureExposure, vaultEligible, recoveryConfigured };
}

/**
 * Derive a Proof-of-Readiness evidence hash from a wallet security profile.
 *
 * Reuses the Phase 3.5 createReadinessEvidence helper to produce a
 * deterministic 0x-prefixed SHA-256 hash from the wallet's current readiness
 * signals. Returns null when inputs are insufficient or derivation fails.
 *
 * Hard boundaries: reads only from securityProfile + address; no wallet
 * connection, signing, transaction, custody, or payout logic.
 *
 * @param {Object|null|undefined} securityProfile - from buildWalletSecurityProfile
 * @param {string|null|undefined} address         - wallet address (hex string)
 * @param {string}                [observedAt]    - ISO timestamp; defaults to now
 * @returns {string|null} 0x-prefixed hash, or null if evidence cannot be derived
 */
export function deriveReadinessEvidenceHash(securityProfile, address, observedAt) {
  if (!securityProfile || !address || typeof address !== 'string' || address.trim() === '') {
    return null;
  }
  try {
    const sigs = deriveReadinessSignals(securityProfile);
    const { hasSignatureExposure, vaultEligible, recoveryConfigured } = sigs;

    const signals = { hasSignatureExposure, vaultEligible };
    if (recoveryConfigured !== null) {
      signals.recoveryConfigured = recoveryConfigured;
    }

    const { hash } = createReadinessEvidence({
      chainId: 0,
      walletAddress: address.trim(),
      actionId: 'vault_readiness',
      evidenceType: 'vault_readiness',
      observedAt,
      signals,
    });
    return hash;
  } catch {
    return null;
  }
}
