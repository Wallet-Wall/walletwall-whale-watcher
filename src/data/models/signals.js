/**
 * WalletSignal — a deterministic, sourced fact about wallet behavior.
 *
 * Signals are derived from historical baselines and live events.  They are
 * the atomic unit that powers Whale Watcher cards, Intel Mode, and the
 * Quantum Exposure Score.  Every signal MUST carry:
 *   - explicit confidence (not implied)
 *   - a non-empty caveats array
 *   - at least one SourceMetadata entry
 *
 * Signals do NOT contain investment advice and do NOT deanonymize wallets
 * beyond publicly available on-chain data.
 */

import { makeDataQuality, makeSourceMetadata } from './source-metadata.js';

/**
 * @typedef {'accumulation'|'distribution'|'protocol_entry'|'protocol_exit'|'dormancy_break'|'unusual_volume'|'counterparty_cluster'|'staking_entry'|'staking_exit'|'bridge'|'cex_deposit'|'cex_withdrawal'|'unusual_activity'|'new_counterparty'|'protocol_rotation'|'large_move_vs_baseline'} SignalType
 */

/**
 * @typedef {Object} WalletSignal
 * @property {string}      signalId      - Deterministic ID; use makeSignalId() or supply your own
 * @property {string}      walletAddress - Wallet address this signal is about
 * @property {string}      chain         - Chain identifier
 * @property {SignalType}  signalType    - Signal classification
 * @property {import('./source-metadata.js').ConfidenceLevel} strength   - Observed signal strength
 * @property {import('./source-metadata.js').ConfidenceLevel} confidence - Confidence in the signal derivation
 * @property {string}      windowStart   - ISO 8601 observation window start
 * @property {string}      windowEnd     - ISO 8601 observation window end
 * @property {string}      detectedAt    - ISO 8601 when this signal was computed
 * @property {Object}      evidence      - Signal-type-specific supporting data (free-form object)
 * @property {string[]}    caveats       - Required caveats — must be non-empty
 * @property {import('./source-metadata.js').DataQuality}      dataQuality - Aggregate data quality
 * @property {import('./source-metadata.js').SourceMetadata[]} sources     - All contributing sources
 */

/**
 * Deterministic signal ID derived from wallet address, type, and window start.
 * Browser-safe djb2 variant — no crypto dependency.
 *
 * @param {string} walletAddress
 * @param {SignalType} signalType
 * @param {string} windowStart
 * @returns {string}
 */
export function makeSignalId(walletAddress, signalType, windowStart) {
  const input = `${walletAddress.toLowerCase()}:${signalType}:${windowStart}`;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) ^ input.codePointAt(i)) >>> 0;
  }
  return `sig-${h.toString(16).padStart(8, '0')}`;
}

/**
 * Factory for WalletSignal.
 *
 * @param {Partial<WalletSignal>} partial
 * @returns {WalletSignal}
 */
export function makeWalletSignal(partial = {}) {
  const walletAddress = partial.walletAddress ?? '0x0000000000000000000000000000000000000000';
  const signalType    = partial.signalType    ?? 'unusual_volume';
  const windowStart   = partial.windowStart   ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    signalId:      partial.signalId      ?? makeSignalId(walletAddress, signalType, windowStart),
    walletAddress,
    chain:         partial.chain         ?? 'ethereum',
    signalType,
    strength:      partial.strength      ?? 'medium',
    confidence:    partial.confidence    ?? 'medium',
    windowStart,
    windowEnd:     partial.windowEnd     ?? new Date().toISOString(),
    detectedAt:    partial.detectedAt    ?? new Date().toISOString(),
    evidence:      partial.evidence      ?? {},
    caveats:       Array.isArray(partial.caveats) && partial.caveats.length > 0
                     ? partial.caveats
                     : ['Signal derived from on-chain data only; off-chain context not included.'],
    dataQuality:   partial.dataQuality   ?? makeDataQuality({ confidence: 'medium' }),
    sources:       Array.isArray(partial.sources) ? partial.sources : [makeSourceMetadata({ sourceType: 'computed' })],
  };
}
