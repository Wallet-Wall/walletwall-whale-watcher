/**
 * LiveWalletEvent — a single on-chain event observed in near real-time.
 *
 * These are ephemeral observations from live data sources (Alchemy, Etherscan
 * webhooks, etc.).  They complement historical baselines but are NOT a
 * substitute for them.  Always include source metadata so consumers know how
 * fresh the event is.
 */

import { makeDataQuality, makeSourceMetadata } from './source-metadata.js';

/**
 * @typedef {'transfer'|'swap'|'stake'|'unstake'|'nft_buy'|'nft_sell'|'bridge'|'contract_call'|'unknown'} LiveEventType
 */

/**
 * @typedef {Object} LiveWalletEvent
 * @property {string}        txHash              - Transaction hash (0x-prefixed)
 * @property {string}        walletAddress       - The wallet this event is attributed to
 * @property {string}        chain               - Chain identifier
 * @property {string}        timestamp           - ISO 8601 block timestamp
 * @property {LiveEventType} eventType           - Classified event type
 * @property {number|null}   valueUSD            - USD value; null when price unavailable
 * @property {boolean}       valueEstimated      - True when valueUSD is a price estimate
 * @property {string|null}   tokenSymbol         - Primary token involved; null for native-only
 * @property {string|null}   counterpartyAddress - The other side of the transaction, if known
 * @property {string|null}   counterpartyLabel   - Known label for counterparty, if any
 * @property {import('./source-metadata.js').DataQuality}    dataQuality - Quality metadata
 * @property {import('./source-metadata.js').SourceMetadata} source      - Live data source
 */

/**
 * Factory for LiveWalletEvent.
 *
 * @param {Partial<LiveWalletEvent>} partial
 * @returns {LiveWalletEvent}
 */
export function makeLiveWalletEvent(partial = {}) {
  return {
    txHash:              partial.txHash              ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
    walletAddress:       partial.walletAddress       ?? '0x0000000000000000000000000000000000000000',
    chain:               partial.chain               ?? 'ethereum',
    timestamp:           partial.timestamp           ?? new Date().toISOString(),
    eventType:           partial.eventType           ?? 'unknown',
    valueUSD:            partial.valueUSD            ?? null,
    valueEstimated:      partial.valueEstimated      ?? false,
    tokenSymbol:         partial.tokenSymbol         ?? null,
    counterpartyAddress: partial.counterpartyAddress ?? null,
    counterpartyLabel:   partial.counterpartyLabel   ?? null,
    dataQuality:         partial.dataQuality         ?? makeDataQuality({ confidence: 'medium' }),
    source:              partial.source              ?? makeSourceMetadata({ sourceType: 'alchemy' }),
  };
}
