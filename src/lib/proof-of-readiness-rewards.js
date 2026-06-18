/**
 * Proof-of-Readiness Rewards — static action registry and eligibility helper.
 *
 * Defines WalletWall's security-native incentive model: rewards for verified
 * wallet readiness actions, not for deposits, staking, or asset custody.
 *
 * Hard guardrails (enforced by tests):
 *   - Every action has custodyRequired === false.
 *   - No copy includes: interest, guaranteed yield, deposit to earn,
 *     WalletWall pays APY, passive income, risk-free, insured, bank-like.
 *   - Protocol Reward Routing is future optional scope only; no staking,
 *     APY, validator routing, or transaction flows are implemented here.
 *
 * @see docs/features/proof-of-readiness-rewards.mdx
 */

/**
 * @typedef {'exposure_reduction'|'vault_readiness'|'recovery_setup'|'monitoring'|'governance_participation'|'readiness_attestation'} RewardCategory
 *
 * @typedef {Object} RewardAction
 * @property {string}   id
 * @property {string}   title
 * @property {RewardCategory} category
 * @property {string}   description
 * @property {string}   rewardReason
 * @property {string}   verificationSource
 * @property {string[]} earlyRewardTypes
 * @property {false}    custodyRequired
 * @property {boolean}  onChainWriteRequired
 * @property {string}   riskNotes
 * @property {string}   abuseNotes
 */

/**
 * Enforces custodyRequired: false on every registry entry and defaults
 * onChainWriteRequired to false, removing the repeated field pair from
 * each action definition and making the invariant structural.
 *
 * @param {Omit<RewardAction, 'custodyRequired'> & { onChainWriteRequired?: boolean }} def
 * @returns {RewardAction}
 */
function readinessAction(def) {
  return { ...def, onChainWriteRequired: def.onChainWriteRequired ?? false, custodyRequired: false };
}

/** @type {Readonly<RewardAction[]>} */
export const REWARD_ACTION_REGISTRY = Object.freeze([
  readinessAction({
    id: 'exposure_reduction',
    title: 'Reduce Signature Exposure',
    category: 'exposure_reduction',
    description:
      'Move value away from a wallet whose public key has been exposed through on-chain activity.',
    rewardReason:
      'Completing a verified migration reduces concentration of value behind an exposed signature key — a direct, measurable security improvement.',
    verificationSource: 'on-chain migration transaction observed by Dune Analytics',
    earlyRewardTypes: ['readiness_attestation', 'governance_weight'],
    riskNotes:
      'Reward eligibility is determined from Dune-derived on-chain facts. WalletWall does not verify migration correctness or guarantee safety of the destination wallet.',
    abuseNotes:
      'Sybil risk: self-transfers do not qualify. Eligibility checks for meaningful value movement to a previously-inactive address.',
  }),
  readinessAction({
    id: 'vault_readiness',
    title: 'Establish Vault Readiness',
    category: 'vault_readiness',
    description:
      'Demonstrate readiness for a post-quantum vault migration: programmable wallet structure, guardian configuration, or recovery policy simulation.',
    rewardReason:
      'Vault-ready wallets serve as reference implementations for the governance coordination of quantum migration. Readiness is verifiable without any deposit.',
    verificationSource: 'WalletWall Vault prototype (testnet) and Dune wallet classification',
    earlyRewardTypes: ['readiness_attestation', 'governance_weight'],
    riskNotes:
      'Vault prototype is testnet-only. No mainnet funds move through this flow. Vault readiness is informational; WalletWall does not custody or recover assets.',
    abuseNotes:
      'Readiness attestations are scoped to wallets that meet the vault-candidate classification threshold (programmable wallet with meaningful value).',
  }),
  readinessAction({
    id: 'recovery_setup',
    title: 'Configure Recovery Readiness',
    category: 'recovery_setup',
    description:
      'Simulate or configure a recovery path for a wallet that lacks one: multisig threshold review, guardian designation, or emergency withdrawal policy.',
    rewardReason:
      'Recovery-configured wallets reduce systemic risk across the ecosystem. Wallets with no recovery plan represent the highest concentration risk for unrecoverable value loss.',
    verificationSource: 'WalletWall recovery readiness classifier (on-chain facts and simulation)',
    earlyRewardTypes: ['readiness_attestation'],
    riskNotes:
      'Recovery simulation is read-only. WalletWall never stores private keys or handles seed phrases. Actual recovery implementation requires user action outside WalletWall.',
    abuseNotes:
      'Only wallets classified as recovery-needed or should-configure-recovery are eligible.',
  }),
  readinessAction({
    id: 'monitoring',
    title: 'Enable Wallet Monitoring',
    category: 'monitoring',
    description:
      'Add a wallet to the WalletWall watchlist and configure alerting thresholds for exposure changes or dormancy events.',
    rewardReason:
      'Monitored wallets generate richer signal data that benefits the whole ecosystem. Active monitoring is a low-effort, high-impact readiness action.',
    verificationSource: 'WalletWall watchlist configuration',
    earlyRewardTypes: ['readiness_attestation'],
    riskNotes:
      'Monitoring does not prevent exposure or guarantee alerts are actionable. Watchlist data is sourced from Dune and may lag real-time chain state.',
    abuseNotes:
      'Watchlist entries must correspond to real wallets with observable on-chain activity. Dummy addresses do not qualify.',
  }),
  readinessAction({
    id: 'governance_participation',
    title: 'Participate in Migration Governance',
    category: 'governance_participation',
    description:
      'Vote on quantum migration readiness standards, flag exposure patterns for community review, or contribute to governance proposals affecting migration paths.',
    rewardReason:
      'Quantum migration is a governance coordination problem, not a solo action. Participation in governance decisions creates shared standards that make migration safer for all wallets.',
    verificationSource: 'Governance participation records (on-chain or off-chain snapshot)',
    earlyRewardTypes: ['governance_weight', 'readiness_attestation'],
    riskNotes:
      'Governance participation does not grant financial rights or on-chain authority over other wallets. Votes are advisory unless a specific governance contract implements binding logic.',
    abuseNotes:
      'Vote farming or low-signal participation (empty proposals, self-votes) does not qualify. Quality signals are weighted over volume.',
  }),
  readinessAction({
    id: 'readiness_attestation',
    title: 'Publish a Readiness Attestation',
    category: 'readiness_attestation',
    description:
      'Sign and publish a non-custodial attestation confirming the wallet has completed a readiness review, accepted a migration path, or configured recovery.',
    rewardReason:
      'Attestations create verifiable, portable proof of readiness actions without moving funds or revealing keys. They serve as the coordination layer for future protocol reward routing.',
    verificationSource: 'EIP-712 typed signature or off-chain attestation (non-custodial)',
    earlyRewardTypes: ['readiness_attestation', 'governance_weight'],
    riskNotes:
      'Attestations do not transfer control of assets. The signing wallet must be the same address under review. WalletWall does not interpret attestations as financial authorization.',
    abuseNotes:
      'Attestations are scoped to the signing address. Cross-wallet attestations or unsigned claims do not qualify.',
  }),
]);

/**
 * Return the subset of reward actions that are relevant for the given wallet
 * signals based on simple deterministic eligibility rules.
 *
 * Rules are conservative: they do not reward users for merely being risky.
 * Each recommendation is framed as an action that reduces risk.
 *
 * @param {Object}  [walletSignals]
 * @param {number}  [walletSignals.quantumExposureScore]
 * @param {string}  [walletSignals.migrationReadinessTier]
 * @param {boolean} [walletSignals.hasSignatureExposure]
 * @param {number}  [walletSignals.dormantDays]
 * @param {number}  [walletSignals.estimatedValueUsd]
 * @param {boolean} [walletSignals.vaultEligible]
 * @param {boolean} [walletSignals.watchlistEnabled]
 * @param {boolean} [walletSignals.recoveryConfigured]
 * @param {Object}  [walletSignals.governanceContext]
 * @returns {RewardAction[]}
 */
export function getProofOfReadinessRewardActions(walletSignals = {}) {
  const signals = walletSignals ?? {};
  const {
    hasSignatureExposure,
    estimatedValueUsd,
    vaultEligible,
    watchlistEnabled,
    recoveryConfigured,
    governanceContext,
  } = signals;

  const byId = Object.fromEntries(REWARD_ACTION_REGISTRY.map((a) => [a.id, a]));
  const recommended = [];

  // Exposure reduction: signature-exposed AND high-value wallet
  if (
    hasSignatureExposure === true &&
    typeof estimatedValueUsd === 'number' &&
    estimatedValueUsd >= 100_000
  ) {
    recommended.push(byId.exposure_reduction);
  }

  // Vault readiness: wallet meets vault-candidate criteria
  if (vaultEligible === true) {
    recommended.push(byId.vault_readiness);
  }

  // Monitoring: watchlist not yet enabled
  if (watchlistEnabled === false) {
    recommended.push(byId.monitoring);
  }

  // Recovery setup: no recovery path configured
  if (recoveryConfigured === false) {
    recommended.push(byId.recovery_setup);
  }

  // Governance: active governance context available
  if (governanceContext != null && typeof governanceContext === 'object') {
    recommended.push(byId.governance_participation);
  }

  return recommended;
}
