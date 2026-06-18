/**
 * Wallet Security Orchestration Layer — public entry point.
 *
 * One import that unifies the three previously-separate wallet-risk surfaces
 * (Quantum Intelligence, Migration Readiness, Quantum Vault Readiness) into a
 * single security profile:
 *
 *   buildWalletSecurityProfile({ exposure, scoreResult, migration, facts, context })
 *     → { state, vaultEligibility, recovery, context, disclosures }
 *
 * It is a *projection* layer: it reuses existing utilities and never re-scores,
 * never stores keys, never asks for seed phrases, and never moves funds. It is
 * the foundation the next phase (private-key management & recovery UX) builds on.
 *
 * Typical wiring sits right after computeQuantumBaseResult():
 *
 *   const { exposure, scoreResult, readiness, migration, facts } =
 *     computeQuantumBaseResult(address, duneQuantumResponse, quantumReadinessResponse);
 *   const profile = buildWalletSecurityProfile({
 *     exposure, scoreResult, migration, facts,
 *     context: { connected, vaultExists, chainSupported },
 *   });
 */

import {
  classifyWalletSecurityState,
  normalizeSecurityContext,
} from './states.js';
import { evaluateVaultEligibility } from './vault-eligibility.js';
import { classifyRecoveryReadiness } from './recovery-readiness.js';

export {
  classifyWalletSecurityState,
  normalizeSecurityContext,
  WALLET_SECURITY_STATES,
  WALLET_SECURITY_STATE_META,
} from './states.js';
export {
  evaluateVaultEligibility,
  VAULT_ELIGIBILITY_DISCLOSURE,
} from './vault-eligibility.js';
export {
  classifyRecoveryReadiness,
  RECOVERY_READINESS_CLASSES,
  RECOVERY_READINESS_META,
} from './recovery-readiness.js';

/**
 * Optional, non-risk UX context. Risk classification never depends on these —
 * they only steer which Vault route view to show.
 *
 * @typedef {Object} WalletSecurityUxContext
 * @property {boolean} [connected]      - A wallet is connected in the Vault dashboard.
 * @property {boolean} [vaultExists]    - The connected address already owns a vault.
 * @property {boolean} [chainSupported] - The connected chain is a supported testnet.
 */

/**
 * Derive the recommended Vault-route view from the security profile + UX context.
 * Mirrors the five states in docs/security and VaultPage.
 *
 * @returns {(
 *   'scanner' | 'create-or-recovery-preview' | 'vault-candidate-dashboard' |
 *   'monitor-or-rotate' | 'recovery-planning'
 * )}
 */
export function recommendVaultRouteView(profile, context = {}) {
  if (!context.connected) return 'scanner';

  const recoveryClass = profile?.recovery?.classification;
  const state = profile?.state?.state;

  if (state === 'recovery-needed' || recoveryClass === 'needs-urgent-migration') {
    return 'recovery-planning';
  }
  if (context.vaultExists) return 'vault-candidate-dashboard';
  if (profile?.vaultEligibility?.eligible) return 'create-or-recovery-preview';
  return 'monitor-or-rotate';
}

/**
 * @typedef {Object} WalletSecurityProfile
 * @property {import('./states.js').WalletSecurityStateResult}            state
 * @property {import('./vault-eligibility.js').VaultEligibilityResult}    vaultEligibility
 * @property {import('./recovery-readiness.js').RecoveryReadinessResult}  recovery
 * @property {WalletSecurityUxContext} context
 * @property {string}   recommendedView
 * @property {Object}   disclosures
 */

/**
 * Build the unified wallet security profile.
 *
 * Accepts precomputed objects (exposure / scoreResult / migration / facts from
 * quantum-page-helpers) and/or raw primitives — all optional. Missing data
 * degrades gracefully to 'unknown' / 'not-applicable' rather than guessing.
 *
 * @param {Parameters<typeof normalizeSecurityContext>[0] & { context?: WalletSecurityUxContext }} [input]
 * @returns {WalletSecurityProfile}
 */
export function buildWalletSecurityProfile(input = {}) {
  const { context = {}, ...signals } = input;

  // Normalize once so every sub-model reads the same derived context; pass the
  // resulting migration result through so they agree on the recommended path.
  const ctx = normalizeSecurityContext(signals);
  const shared = { ...signals, migration: ctx.migration };

  const state = classifyWalletSecurityState(shared);
  const vaultEligibility = evaluateVaultEligibility(shared);
  const recovery = classifyRecoveryReadiness(shared);

  const profile = {
    state,
    vaultEligibility,
    recovery,
    context,
    recommendedView: 'scanner',
    disclosures: {
      vault: vaultEligibility.disclosure,
      recovery: recovery.disclosure,
    },
  };
  profile.recommendedView = recommendVaultRouteView(profile, context);
  return profile;
}
