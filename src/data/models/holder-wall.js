/**
 * HolderWallTile — one entry in the Holder Wall treemap.
 *
 * Balances come from the Dune historical source (scheduled/cached).
 * The optional liveSource field carries a 24-hour delta from a real-time
 * source such as Alchemy or Etherscan.  Both sources are labelled so the
 * UI can show data freshness explicitly.
 *
 * NOTE: HolderWallTile does NOT imply holder-count analytics or aggregate
 * distribution statistics — those belong in StableSeerResult.  This model
 * describes one holder's position, not the token's holder landscape.
 */

import { makeDataQuality, makeSourceMetadata } from './source-metadata.js';

/**
 * @typedef {'whale'|'institution'|'exchange'|'protocol'|'unknown'} HolderType
 */

/**
 * @typedef {Object} HolderWallTile
 * @property {string}      tokenSymbol      - Token symbol (e.g. 'ETH')
 * @property {string|null} tokenAddress     - ERC-20 contract address; null for native token
 * @property {string}      chain            - Chain identifier
 * @property {number}      rank             - Holder rank by USD balance (1 = largest)
 * @property {number}      balanceUSD       - USD balance from Dune historical source
 * @property {boolean}     balanceEstimated - True when USD price was estimated
 * @property {number|null} balanceDeltaUSD  - 24 h change in USD from liveSource; null if unavailable
 * @property {HolderType}  holderType       - Inferred holder classification
 * @property {string|null} holderLabel      - Known label (exchange name, protocol) or null
 * @property {import('./source-metadata.js').DataQuality}     dataQuality      - Aggregate quality metadata
 * @property {import('./source-metadata.js').SourceMetadata}  historicalSource - Must be dune_scheduled or dune_cached
 * @property {import('./source-metadata.js').SourceMetadata|null} liveSource   - Real-time delta source; null when unavailable
 */

/**
 * Factory for HolderWallTile.
 *
 * @param {Partial<HolderWallTile>} partial
 * @returns {HolderWallTile}
 */
export function makeHolderWallTile(partial = {}) {
  return {
    tokenSymbol:      partial.tokenSymbol      ?? 'UNKNOWN',
    tokenAddress:     partial.tokenAddress     ?? null,
    chain:            partial.chain            ?? 'ethereum',
    rank:             partial.rank             ?? 1,
    balanceUSD:       partial.balanceUSD       ?? 0,
    balanceEstimated: partial.balanceEstimated ?? false,
    balanceDeltaUSD:  partial.balanceDeltaUSD  ?? null,
    holderType:       partial.holderType       ?? 'unknown',
    holderLabel:      partial.holderLabel      ?? null,
    dataQuality:      partial.dataQuality      ?? makeDataQuality({ confidence: 'medium' }),
    historicalSource: partial.historicalSource ?? makeSourceMetadata({ sourceType: 'dune_scheduled' }),
    liveSource:       partial.liveSource       ?? null,
  };
}
