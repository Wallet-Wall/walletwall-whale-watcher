/**
 * Proof-of-Readiness Rewards — local/off-chain reward ledger model.
 *
 * Tracks readiness reward events in local state only. No on-chain writes,
 * no database persistence, no custody, no payouts.
 *
 * Hard guardrails (enforced by tests):
 *   - Every event has custody === 'none'.
 *   - No payout, token, APY, staking, deposit, or amount fields.
 *
 * @see docs/features/proof-of-readiness-rewards.mdx
 */

const DISCLAIMER =
  'This readiness event is a local record only. It is not a financial instrument, ' +
  'not a payout, and does not represent a claim on any asset. ' +
  'WalletWall does not custody assets.';

/**
 * Allowed statuses for a local readiness reward event.
 *
 * @type {readonly ['eligible','suggested','completed_local','attestation_ready']}
 */
export const READINESS_REWARD_STATUSES = Object.freeze([
  'eligible',
  'suggested',
  'completed_local',
  'attestation_ready',
]);

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isValidReadinessRewardStatus(status) {
  return READINESS_REWARD_STATUSES.includes(status);
}

/**
 * Builds a deterministic-style event id from the key input fields plus a
 * millisecond timestamp to avoid collisions on rapid successive calls.
 *
 * @param {string} walletAddress
 * @param {string|number} chainId
 * @param {string} actionId
 * @returns {string}
 */
function makeEventId(walletAddress, chainId, actionId) {
  const addrSlug = String(walletAddress).toLowerCase().replace(/^0x/, '').slice(0, 8);
  return `por_${addrSlug}_${chainId}_${actionId}_${Date.now()}`;
}

/**
 * @typedef {'eligible'|'suggested'|'completed_local'|'attestation_ready'} ReadinessRewardStatus
 *
 * @typedef {Object} ReadinessRewardEvent
 * @property {string}                id
 * @property {string}                walletAddress
 * @property {string|number}         chainId
 * @property {string}                actionId
 * @property {ReadinessRewardStatus} status
 * @property {string|null}           evidenceHash
 * @property {number}                rewardUnits  - non-monetary; may inform governance weight
 * @property {string}                createdAt
 * @property {string}                updatedAt
 * @property {'none'}                custody
 * @property {string}                disclaimer
 */

/**
 * Create a new local readiness reward event.
 *
 * @param {Object}               input
 * @param {string}               input.walletAddress  - required
 * @param {string|number}        input.chainId        - required
 * @param {string}               input.actionId       - required
 * @param {ReadinessRewardStatus}[input.status]       - defaults to 'eligible'
 * @param {string}               [input.evidenceHash]
 * @param {number}               [input.rewardUnits]
 * @returns {ReadinessRewardEvent}
 */
export function createReadinessRewardEvent(input) {
  const inp = input ?? {};

  const { walletAddress, chainId, actionId } = inp;

  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
    throw new Error('createReadinessRewardEvent: walletAddress is required');
  }
  if (chainId == null) {
    throw new Error('createReadinessRewardEvent: chainId is required');
  }
  if (!actionId || typeof actionId !== 'string' || actionId.trim() === '') {
    throw new Error('createReadinessRewardEvent: actionId is required');
  }

  const status = inp.status ?? 'eligible';
  if (!isValidReadinessRewardStatus(status)) {
    throw new Error(`createReadinessRewardEvent: invalid status "${status}"`);
  }

  const now = new Date().toISOString();

  return {
    id: makeEventId(walletAddress, chainId, actionId),
    walletAddress,
    chainId,
    actionId,
    status,
    evidenceHash: inp.evidenceHash ?? null,
    rewardUnits: typeof inp.rewardUnits === 'number' ? inp.rewardUnits : 0,
    createdAt: now,
    updatedAt: now,
    custody: 'none',
    disclaimer: DISCLAIMER,
  };
}

/**
 * Return a new event with an updated status and a refreshed `updatedAt`.
 * The original event object is not mutated.
 *
 * @param {ReadinessRewardEvent} event
 * @param {ReadinessRewardStatus} nextStatus
 * @returns {ReadinessRewardEvent}
 */
export function updateReadinessRewardEventStatus(event, nextStatus) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('updateReadinessRewardEventStatus: event must be a plain object');
  }
  if (!isValidReadinessRewardStatus(nextStatus)) {
    throw new Error(`updateReadinessRewardEventStatus: invalid status "${nextStatus}"`);
  }
  return {
    ...event,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    custody: 'none',
  };
}
