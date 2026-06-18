/**
 * Migration Readiness — deterministic migration-path recommender.
 *
 * This module does NOT introduce a separate recovery readiness score. It reuses
 * existing wallet signals (quantum exposure, value at risk, dormancy, wallet
 * structure) to recommend ONE migration path among a fixed set. The WalletWall
 * vault candidate appears here as one experimental research path, never as
 * a custody claim.
 *
 * Concept distinction (kept consistent with user-facing copy):
 *   - Quantum Exposure   = how urgent the wallet-level risk is.
 *   - Migration Readiness = how feasible it is to move safely (this module).
 *   - WalletWall Vault    = one experimental migration path, monitor only.
 *
 * Language guardrails are enforced by tests: no absolute safety, recovery,
 * asset-control, key-storage, or deployment-action claims.
 */

/**
 * @typedef {'monitor'|'fresh-wallet'|'split-wallet'|'multisig'|'treasury-custody'|'vault-prototype'} MigrationPath
 */

/**
 * @typedef {Object} MigrationReadiness
 * @property {'low'|'medium'|'high'|'unknown'}       level          - How feasible a safe migration is.
 * @property {'monitor'|'plan'|'prioritize'}         urgency        - How soon to act.
 * @property {'low'|'medium'|'high'|'unknown'}       difficulty     - How hard the migration is.
 * @property {MigrationPath}                         recommendedPath
 * @property {string[]}                              blockers
 * @property {string}                                nextAction
 * @property {string}                                [disclosure]   - Present for 'vault-prototype'.
 */

export const WALLETWALL_VAULT_REPO_URL = 'https://github.com/Wallet-Wall/walletwall-vault';

/**
 * Required disclosure whenever the WalletWall Vault prototype is surfaced as a
 * recommended path. Wording is deliberately conservative.
 */
export const VAULT_PROTOTYPE_DISCLOSURE =
  'WalletWall Vault is a read-only research prototype in this app. WalletWall does not store keys, recover seed phrases, or enable live vault writes.';

/**
 * One-line explainer copy that distinguishes the three concepts for end users.
 */
export const MIGRATION_CONCEPT_COPY = {
  quantumExposure:   'Signature exposure shows whether outgoing activity has widened the wallet review surface.',
  migrationReadiness: 'Recovery readiness shows how prepared a wallet appears for a post-quantum migration path.',
  walletWallVault:   'WalletWall Vault is a monitor only research surface until the shared orchestration model lands.',
};

/**
 * NIST-aligned naming used in vault-prototype copy. Newer FIPS names are paired
 * with the legacy algorithm names rather than used in isolation.
 */
export const PQC_ALGORITHM_NOTE =
  'The WalletWall Vault prototype models a hybrid classical + post-quantum authorization flow ' +
  'using ML-DSA (FIPS 204, formerly CRYSTALS-Dilithium). Related signature research includes ' +
  'SLH-DSA (FIPS 205, formerly SPHINCS+). The on-chain verifier is an architectural placeholder, ' +
  'not production-grade cryptographic verification.';

export const MIGRATION_PATHS = Object.freeze([
  'monitor',
  'fresh-wallet',
  'split-wallet',
  'multisig',
  'treasury-custody',
  'vault-prototype',
]);

export const MIGRATION_PATH_LABELS = Object.freeze({
  'monitor':          'Monitor only',
  'fresh-wallet':     'Fresh wallet',
  'split-wallet':     'Split wallet',
  'multisig':         'Multisig',
  'treasury-custody': 'Treasury signer plan',
  'vault-prototype':  'Vault candidate',
});

export const MIGRATION_PATH_DESCRIPTIONS = Object.freeze({
  'monitor':          'Keep watching signature exposure; no migration action is needed yet.',
  'fresh-wallet':     'Move long-term holdings to a fresh wallet to reduce public-key exposure.',
  'split-wallet':     'Split holdings across wallets to reduce single-address concentration.',
  'multisig':         'Distribute signing across a multisig (e.g. Safe) with an upgrade path.',
  'treasury-custody': 'Coordinate a signer-led treasury migration path with the wallet signers.',
  'vault-prototype':  'Review this wallet as a vault candidate for post-quantum migration research.',
});

const MIGRATION_NEXT_ACTIONS = Object.freeze({
  'monitor':          'Keep monitoring signature exposure; no migration action is needed yet.',
  'fresh-wallet':     'Plan a move to a fresh wallet to reduce public-key exposure for long-term holdings.',
  'split-wallet':     'Consider splitting holdings across multiple wallets to reduce single-address concentration.',
  'multisig':         'Consider a multisig (e.g. Safe) so signing is distributed and upgradeable.',
  'treasury-custody': 'Coordinate a signer-led treasury migration path before migrating.',
  'vault-prototype':  'Review the WalletWall Vault research prototype as one experimental post-quantum migration path.',
});

// Thresholds mirror quantum-vault-readiness.js for consistency.
const MEANINGFUL_USD = 10_000;
const HIGH_USD = 100_000;
const VERY_HIGH_USD = 1_000_000;
const LONG_HORIZON_DAYS = 365;
const OLD_KEY_DAYS = 365;
const DORMANT_DAYS = 180;
const MANY_ASSETS = 10;
const SOME_ASSETS = 4;

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function unknownReadiness(blockers) {
  return {
    level:           'unknown',
    urgency:         'monitor',
    difficulty:      'unknown',
    recommendedPath: 'monitor',
    blockers,
    nextAction:      'Load wallet activity or Dune auto-run facts to recommend a migration path.',
  };
}

/**
 * Normalize raw input into typed primitives plus the derived booleans the
 * recommendation rules read. Keeping derivation here keeps each rule helper flat.
 */
function buildContext(input) {
  const value         = num(input.totalValueUsd);
  const daysDormant   = num(input.daysDormant);
  const keyAgeDays    = num(input.keyAgeDays);
  const assetCount    = num(input.assetCount);
  const exposureScore = num(input.exposureScore);
  const exposureStatus = typeof input.exposureStatus === 'string' ? input.exposureStatus : null;

  const isContract = bool(input.isContract);
  const isMultisig = bool(input.isMultisig);
  const isSafe     = bool(input.isSafeWallet);
  const isAa       = bool(input.isAccountAbstractionWallet);
  const isTreasury = bool(input.isTreasuryLike);

  const signatureExposed = typeof input.signatureExposed === 'boolean'
    ? input.signatureExposed
    : exposureStatus === 'signature_exposure_observed';

  const v = value ?? 0;

  return {
    value,
    exposureScore,
    exposureStatus,
    daysDormant,
    keyAgeDays,
    assetCount,
    isContract,
    signatureExposed,
    explicitExposed: typeof input.signatureExposed === 'boolean',
    hasStructureFlag: isContract != null || isMultisig != null || isSafe != null || isAa != null,
    hasTxCount: num(input.txCount) != null,
    provisional: value == null || exposureStatus == null || exposureStatus === 'unknown',
    isMeaningful: v >= MEANINGFUL_USD,
    isHigh:       v >= HIGH_USD,
    isVeryHigh:   v >= VERY_HIGH_USD,
    programmable: isContract === true || isMultisig === true || isSafe === true || isAa === true,
    treasuryLike: isTreasury === true || ((isSafe === true || isMultisig === true) && v >= HIGH_USD),
    longHorizon:
      (daysDormant != null && daysDormant >= LONG_HORIZON_DAYS) ||
      (keyAgeDays != null && keyAgeDays >= OLD_KEY_DAYS),
    oldWallet:
      (keyAgeDays != null && keyAgeDays >= OLD_KEY_DAYS) ||
      (daysDormant != null && daysDormant >= DORMANT_DAYS),
    highComplexity:
      v >= VERY_HIGH_USD ||
      (assetCount != null && assetCount >= MANY_ASSETS) ||
      input.chainComplexity === 'high',
  };
}

function hasAnySignal(ctx) {
  return ctx.value != null || ctx.daysDormant != null || ctx.keyAgeDays != null ||
    ctx.assetCount != null || ctx.exposureScore != null ||
    (ctx.exposureStatus != null && ctx.exposureStatus !== 'unknown') ||
    ctx.hasStructureFlag || ctx.hasTxCount || ctx.explicitExposed;
}

/** Recommended path — deterministic, first match wins. */
function recommendPath(ctx) {
  if (ctx.treasuryLike) return 'treasury-custody';
  if (ctx.signatureExposed && ctx.isHigh && ctx.longHorizon) return 'vault-prototype';
  if (ctx.isVeryHigh) return 'split-wallet';
  if (ctx.signatureExposed && ctx.isHigh) return 'multisig';
  if (ctx.signatureExposed && ctx.isMeaningful && ctx.oldWallet) return 'fresh-wallet';
  return 'monitor';
}

function assessUrgency(ctx) {
  const score = ctx.exposureScore ?? 0;
  if (score >= 75 || ctx.isVeryHigh || (ctx.signatureExposed && ctx.isHigh)) return 'prioritize';
  if (score >= 40 || ctx.isMeaningful || ctx.signatureExposed || ctx.longHorizon) return 'plan';
  return 'monitor';
}

/** Level — how ready/feasible a safe migration is. */
function assessLevel(ctx) {
  if (ctx.programmable) return 'high';
  if (ctx.highComplexity || (ctx.isContract === false && ctx.isHigh)) return 'low';
  return 'medium';
}

function assessDifficulty(ctx) {
  let rank = 0;
  if (ctx.isVeryHigh) rank = 2;
  else if (ctx.isHigh) rank = Math.max(rank, 1);
  if (ctx.assetCount != null && ctx.assetCount >= MANY_ASSETS) rank = 2;
  else if (ctx.assetCount != null && ctx.assetCount >= SOME_ASSETS) rank = Math.max(rank, 1);
  if (ctx.signatureExposed) rank = Math.max(rank, 1);
  if (ctx.treasuryLike) rank = 2;
  return ['low', 'medium', 'high'][rank];
}

function collectBlockers(ctx) {
  const blockers = [];
  if (ctx.signatureExposed) {
    blockers.push('Public key is already exposed by past outgoing transactions.');
  }
  if (ctx.isHigh) {
    blockers.push('High value is concentrated in a single address.');
  }
  if (ctx.daysDormant != null && ctx.daysDormant >= LONG_HORIZON_DAYS) {
    blockers.push('Wallet has been dormant long-term, so holder responsiveness is uncertain.');
  }
  if (ctx.isContract === false && !ctx.programmable) {
    blockers.push('Externally owned account has no programmable signature-upgrade path.');
  }
  if (ctx.assetCount != null && ctx.assetCount >= SOME_ASSETS) {
    blockers.push('Multiple assets increase migration coordination effort.');
  }
  if (ctx.treasuryLike) {
    blockers.push('Treasury-style wallet needs multi-party coordination to migrate.');
  }
  if (ctx.provisional) {
    blockers.push('Wallet data is incomplete, so this recommendation is provisional.');
  }
  return blockers;
}

/**
 * Recommend a single migration path from available wallet signals.
 *
 * All inputs are optional; missing data degrades gracefully to 'unknown' levels
 * and a provisional 'monitor' recommendation rather than inventing a path.
 *
 * @param {Object} [input]
 * @param {string}  [input.exposureStatus]   - From deriveWalletSignatureExposure.
 * @param {number}  [input.exposureScore]    - Heuristic quantum exposure score (0–100).
 * @param {boolean} [input.signatureExposed] - Overrides exposureStatus when provided.
 * @param {number}  [input.totalValueUsd]
 * @param {number}  [input.daysDormant]
 * @param {number}  [input.keyAgeDays]
 * @param {number}  [input.assetCount]
 * @param {number}  [input.txCount]
 * @param {boolean} [input.isContract]
 * @param {boolean} [input.isMultisig]
 * @param {boolean} [input.isSafeWallet]
 * @param {boolean} [input.isAccountAbstractionWallet]
 * @param {boolean} [input.isTreasuryLike]
 * @param {'low'|'medium'|'high'} [input.chainComplexity]
 * @returns {MigrationReadiness}
 */
export function deriveMigrationReadiness(input = {}) {
  const ctx = buildContext(input);

  if (!hasAnySignal(ctx)) {
    return unknownReadiness(['Insufficient wallet data to recommend a migration path.']);
  }

  const recommendedPath = recommendPath(ctx);

  const result = {
    level:           assessLevel(ctx),
    urgency:         assessUrgency(ctx),
    difficulty:      assessDifficulty(ctx),
    recommendedPath,
    blockers:        collectBlockers(ctx),
    nextAction:      MIGRATION_NEXT_ACTIONS[recommendedPath],
  };

  if (recommendedPath === 'vault-prototype') {
    result.disclosure = VAULT_PROTOTYPE_DISCLOSURE;
  }

  return result;
}

/**
 * Adapter that maps existing WalletWall shapes onto deriveMigrationReadiness.
 *
 * @param {Object|null} walletFacts  - Output of mergeDuneIntoWalletFacts / live facts.
 * @param {Object|null} exposure     - Output of deriveWalletSignatureExposure.
 * @param {Object|null} scoreResult  - Output of deriveQuantumExposureScore.
 * @param {Object}      [extra]
 * @returns {MigrationReadiness}
 */
export function buildMigrationReadiness(walletFacts, exposure, scoreResult, extra = {}) {
  const facts = walletFacts ?? {};
  const exp = exposure ?? {};

  return deriveMigrationReadiness({
    exposureStatus:  exp.exposureStatus,
    exposureScore:   typeof scoreResult?.score === 'number' ? scoreResult.score : null,
    totalValueUsd:   facts.totalBalanceUsd ?? extra.totalValueUsd ?? null,
    daysDormant:     facts.daysDormant ?? null,
    keyAgeDays:      exp.keyAgeDays ?? null,
    assetCount:      facts.assetCount ?? extra.assetCount ?? null,
    txCount:         facts.txCountLifetime ?? facts.signedTxCount ?? null,
    isContract:      facts.isContract ?? null,
    isMultisig:      facts.isMultisig ?? null,
    isSafeWallet:    facts.isSafeWallet ?? null,
    isAccountAbstractionWallet: facts.isAccountAbstractionWallet ?? null,
    isTreasuryLike:  extra.isTreasuryLike ?? null,
    chainComplexity: extra.chainComplexity ?? null,
  });
}
