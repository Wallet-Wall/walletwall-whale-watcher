/**
 * Proof-of-Readiness Campaigns — structured readiness campaign definitions
 * and wallet eligibility helper.
 *
 * A readiness campaign is a structured set of security-positive actions that
 * helps wallets, DAOs, and protocols reduce exposure and coordinate quantum
 * migration readiness. Campaigns are informational scaffolding only: no
 * custody, no payouts, no staking, no protocol reward routing.
 *
 * Hard guardrails (enforced by tests):
 *   - Every campaign has custodyRequired === false.
 *   - Every campaign has payoutImplemented === false.
 *   - Every campaign has protocolRoutingImplemented === false.
 *   - No forbidden financial copy.
 *
 * @see docs/features/proof-of-readiness-rewards.mdx
 * @see docs/features/proof-of-readiness-campaign-roadmap.mdx
 */

/**
 * Allowed campaign type values.
 *
 * @type {readonly string[]}
 */
export const READINESS_CAMPAIGN_TYPES = Object.freeze([
  'exposure_reduction',
  'dormant_whale_readiness',
  'vault_readiness',
  'watchlist_monitoring',
  'dao_treasury_migration',
  'proof_of_readiness_attestation',
]);

/**
 * Allowed audience values.
 * @type {readonly string[]}
 */
export const READINESS_CAMPAIGN_AUDIENCES = Object.freeze([
  'individual_wallet',
  'whale_wallet',
  'dao_treasury',
  'protocol_team',
  'ecosystem_partner',
]);

/**
 * Allowed sponsor model values.
 * @type {readonly string[]}
 */
export const READINESS_CAMPAIGN_SPONSOR_MODELS = Object.freeze([
  'walletwall_native_preview',
  'dao_sponsored_future',
  'protocol_sponsored_future',
  'ecosystem_sponsored_future',
]);

/**
 * Enforces structural invariants on every campaign definition.
 * custodyRequired, payoutImplemented, and protocolRoutingImplemented are
 * always false regardless of what the caller passes.
 */
function readinessCampaign(def) {
  return {
    ...def,
    custodyRequired: false,
    payoutImplemented: false,
    protocolRoutingImplemented: false,
  };
}

/**
 * @typedef {Object} ReadinessCampaign
 * @property {string}   id
 * @property {string}   title
 * @property {string}   type
 * @property {string}   description
 * @property {string}   audience
 * @property {string}   goal
 * @property {string[]} eligibleActionIds
 * @property {string}   readinessReason
 * @property {string[]} suggestedRewardTypes
 * @property {string}   sponsorModel
 * @property {false}    custodyRequired
 * @property {false}    payoutImplemented
 * @property {false}    protocolRoutingImplemented
 * @property {string}   riskNotes
 * @property {string}   abuseNotes
 * @property {string}   marketingAngle
 */

/** @type {Readonly<ReadinessCampaign[]>} */
export const READINESS_CAMPAIGN_REGISTRY = Object.freeze([
  readinessCampaign({
    id: 'quantum_exposure_reduction',
    title: 'Quantum Exposure Reduction',
    type: 'exposure_reduction',
    description:
      'Help signature-exposed, high-value wallets migrate to quantum-safer addresses before the post-quantum threat window closes.',
    audience: 'whale_wallet',
    goal:
      'Verify and attest a completed migration from a public-key-exposed wallet to a fresh, quantum-safer address.',
    eligibleActionIds: ['exposure_reduction', 'readiness_attestation'],
    readinessReason:
      'Wallets with exposed public keys represent the highest-risk value concentration in the Ethereum ecosystem. Completing a verified migration is the single most impactful readiness action available.',
    suggestedRewardTypes: ['readiness_attestation', 'governance_weight'],
    sponsorModel: 'walletwall_native_preview',
    riskNotes:
      'Eligibility is determined from on-chain facts observed by Dune Analytics. WalletWall does not verify migration correctness or guarantee the safety of the destination wallet.',
    abuseNotes:
      'Self-transfers do not qualify. Eligibility requires meaningful value movement to a previously-inactive address.',
    marketingAngle:
      'The post-quantum window is closing for high-value exposed wallets. Complete a verified migration and earn a non-custodial readiness attestation before the window narrows further.',
  }),

  readinessCampaign({
    id: 'dormant_whale_readiness',
    title: 'Dormant Whale Readiness',
    type: 'dormant_whale_readiness',
    description:
      'Surface and prepare high-value dormant wallets for quantum readiness before exposure risk becomes critical.',
    audience: 'whale_wallet',
    goal:
      'Enable monitoring, configure recovery, and publish a readiness attestation for a wallet that has been inactive for over one year.',
    eligibleActionIds: ['monitoring', 'recovery_setup', 'readiness_attestation'],
    readinessReason:
      'Dormant wallets with significant value represent systemic risk: they are typically exposed, have no active recovery path, and cannot respond to post-quantum threats in time without advance readiness.',
    suggestedRewardTypes: ['readiness_attestation'],
    sponsorModel: 'walletwall_native_preview',
    riskNotes:
      'Dormancy threshold is based on Dune-derived last activity. WalletWall does not contact wallet owners directly or move assets on their behalf.',
    abuseNotes:
      'Dormancy must be verifiable on-chain. Recently active wallets are not eligible for this campaign.',
    marketingAngle:
      'Dormant whale wallets are among the most exposed assets in a post-quantum world — unmonitored, unrecovered, and unaware. Dormant Whale Readiness brings these wallets into the migration path.',
  }),

  readinessCampaign({
    id: 'vault_readiness',
    title: 'Vault Readiness',
    type: 'vault_readiness',
    description:
      'Prepare programmable wallet candidates for the WalletWall Vault prototype and a post-quantum vault migration path.',
    audience: 'individual_wallet',
    goal:
      'Demonstrate vault-readiness through programmable wallet structure, guardian configuration, or recovery policy simulation on testnet.',
    eligibleActionIds: ['vault_readiness', 'recovery_setup', 'readiness_attestation'],
    readinessReason:
      'Vault-ready wallets serve as reference implementations for the governance coordination of quantum migration. Readiness is verifiable without any deposit or on-chain fund movement.',
    suggestedRewardTypes: ['readiness_attestation', 'governance_weight'],
    sponsorModel: 'walletwall_native_preview',
    riskNotes:
      'Vault prototype is testnet-only. No mainnet funds move through this campaign. Vault readiness is informational; WalletWall does not custody or recover assets.',
    abuseNotes:
      'Readiness attestations are scoped to wallets meeting the vault-candidate classification threshold (programmable wallet with meaningful on-chain value).',
    marketingAngle:
      'Be a reference implementation for quantum-safe vault migration. Vault Readiness Campaign wallets demonstrate the path forward for the whole ecosystem.',
  }),

  readinessCampaign({
    id: 'watchlist_monitoring',
    title: 'Watchlist Monitoring',
    type: 'watchlist_monitoring',
    description:
      'Activate monitoring on wallets that have not yet enabled watchlist coverage or exposure alerting.',
    audience: 'individual_wallet',
    goal:
      'Enable watchlist monitoring and configure alerting thresholds for a wallet that is currently unmonitored.',
    eligibleActionIds: ['monitoring'],
    readinessReason:
      'Monitored wallets generate richer signal data that benefits the whole ecosystem. Active monitoring is the lowest-effort, highest-coverage readiness action available.',
    suggestedRewardTypes: ['readiness_attestation'],
    sponsorModel: 'walletwall_native_preview',
    riskNotes:
      'Monitoring does not prevent exposure or guarantee that alerts are actionable in time. Watchlist data is sourced from Dune and may lag real-time chain state.',
    abuseNotes:
      'Watchlist entries must correspond to real wallets with observable on-chain activity. Dummy or empty addresses do not qualify.',
    marketingAngle:
      'Every unmonitored wallet is a blind spot. The Watchlist Monitoring Campaign helps wallets stay visible and responsive in a post-quantum migration world.',
  }),

  readinessCampaign({
    id: 'dao_treasury_migration',
    title: 'DAO Treasury Migration',
    type: 'dao_treasury_migration',
    description:
      'Help DAOs and protocol treasuries establish a governance-coordinated quantum readiness plan for their treasury wallets.',
    audience: 'dao_treasury',
    goal:
      'Participate in governance coordination for treasury migration: vote on migration standards, publish a treasury readiness attestation, or configure a migration path.',
    eligibleActionIds: ['governance_participation', 'vault_readiness', 'readiness_attestation'],
    readinessReason:
      'DAO treasuries represent some of the largest concentrated value at post-quantum risk. Governance-coordinated migration is the only viable path for multi-sig and programmatic treasury structures.',
    suggestedRewardTypes: ['governance_weight', 'readiness_attestation'],
    sponsorModel: 'dao_sponsored_future',
    riskNotes:
      'Governance participation does not grant financial authority over treasury assets. Campaign recommendations are advisory and do not execute treasury actions.',
    abuseNotes:
      'Only wallets with observable governance participation qualify. Empty proposal submissions or self-votes do not count toward eligibility.',
    marketingAngle:
      'DAO treasuries are the most exposed, least-protected assets in the post-quantum migration path. DAO Treasury Migration Campaign coordinates governance-native readiness across the ecosystem.',
  }),

  readinessCampaign({
    id: 'proof_of_readiness_attestation',
    title: 'Proof-of-Readiness Attestation',
    type: 'proof_of_readiness_attestation',
    description:
      'Complete a structured readiness review and publish a non-custodial off-chain attestation for any completed readiness action.',
    audience: 'individual_wallet',
    goal:
      'Issue a verified off-chain readiness attestation for at least one completed readiness action.',
    eligibleActionIds: [
      'readiness_attestation',
      'exposure_reduction',
      'vault_readiness',
      'recovery_setup',
      'monitoring',
    ],
    readinessReason:
      'Attestations create verifiable, portable proof of readiness actions without moving funds or revealing keys. They are the coordination layer for future non-custodial protocol reward routing.',
    suggestedRewardTypes: ['readiness_attestation', 'governance_weight'],
    sponsorModel: 'walletwall_native_preview',
    riskNotes:
      'Attestations do not transfer control of assets. The attesting wallet must be the same address under review. WalletWall does not interpret attestations as financial authorization.',
    abuseNotes:
      'Attestations are scoped to the attesting address. Cross-wallet attestations or unsigned claims do not qualify.',
    marketingAngle:
      'Your readiness work deserves a verifiable record. The Proof-of-Readiness Attestation Campaign creates portable, off-chain proof of security-positive actions.',
  }),
]);

/**
 * Return the subset of campaigns relevant for the given wallet signals.
 *
 * Rules are conservative: campaigns are only recommended when there is a
 * concrete, signal-backed reason. Do not recommend campaigns solely because
 * a wallet is at risk — recommend campaigns that reduce the risk.
 *
 * @param {Object}  [walletSignals]
 * @param {boolean} [walletSignals.hasSignatureExposure]
 * @param {number}  [walletSignals.estimatedValueUsd]
 * @param {number}  [walletSignals.dormantDays]
 * @param {boolean} [walletSignals.vaultEligible]
 * @param {boolean} [walletSignals.watchlistEnabled]
 * @param {Object}  [walletSignals.governanceContext]
 * @param {boolean} [walletSignals.attestationReady]
 * @returns {ReadinessCampaign[]}
 */
export function getReadinessCampaignsForWallet(walletSignals = {}) {
  const signals = walletSignals ?? {};
  const {
    hasSignatureExposure,
    estimatedValueUsd,
    dormantDays,
    vaultEligible,
    watchlistEnabled,
    governanceContext,
    attestationReady,
  } = signals;

  const byId = Object.fromEntries(READINESS_CAMPAIGN_REGISTRY.map((c) => [c.id, c]));
  const recommended = [];

  // Signature-exposed high-value wallet → quantum exposure reduction
  if (
    hasSignatureExposure === true &&
    typeof estimatedValueUsd === 'number' &&
    estimatedValueUsd >= 100_000
  ) {
    recommended.push(byId.quantum_exposure_reduction);
  }

  // Dormant high-value wallet → dormant whale readiness
  if (
    typeof dormantDays === 'number' &&
    dormantDays >= 365 &&
    typeof estimatedValueUsd === 'number' &&
    estimatedValueUsd >= 100_000
  ) {
    recommended.push(byId.dormant_whale_readiness);
  }

  // Vault eligible → vault readiness
  if (vaultEligible === true) {
    recommended.push(byId.vault_readiness);
  }

  // Watchlist not enabled → watchlist monitoring
  if (watchlistEnabled === false) {
    recommended.push(byId.watchlist_monitoring);
  }

  // Active governance context → DAO treasury migration
  if (governanceContext != null && typeof governanceContext === 'object') {
    recommended.push(byId.dao_treasury_migration);
  }

  // At least one action is attestation-ready → attestation campaign
  if (attestationReady === true) {
    recommended.push(byId.proof_of_readiness_attestation);
  }

  return recommended;
}

/**
 * Look up a campaign by id.
 *
 * @param {string} campaignId
 * @returns {ReadinessCampaign|null}
 */
export function getReadinessCampaignById(campaignId) {
  return READINESS_CAMPAIGN_REGISTRY.find((c) => c.id === campaignId) ?? null;
}
