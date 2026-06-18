/**
 * Historical wallet baseline models, primarily sourced from Dune Analytics.
 *
 * IMPORTANT: Dune-backed baselines are always SCHEDULED or CACHED.
 * Estimated implementation-readiness baselines (e.g. from Etherscan) may be
 * used as a best-effort bridge but must be labeled with appropriate confidence.
 * Do not use these shapes for real-time wallet data.
 */

import { makeDataQuality, makeSourceMetadata } from './source-metadata.js';

/**
 * @typedef {Object} HistoricalTokenFlow
 * @property {string}      tokenSymbol     - Token symbol (e.g. 'ETH', 'USDC')
 * @property {string|null} tokenAddress    - ERC-20 contract address or null for native
 * @property {number}      volumeUSD       - Aggregate USD volume over the baseline window
 * @property {boolean}     volumeEstimated - True when price data was unavailable at tx time
 * @property {'in'|'out'|'net'} direction  - Dominant flow direction
 * @property {number}      txCount         - Number of transactions involving this token
 */

/**
 * @typedef {'dex'|'cex'|'bridge'|'protocol'|'wallet'|'unknown'} CounterpartyType
 *
 * @typedef {Object} HistoricalCounterparty
 * @property {string}          address          - Checksummed counterparty address
 * @property {string|null}     label            - Known label (protocol name, exchange) or null
 * @property {number}          volumeUSD        - Total USD exchanged with this counterparty
 * @property {number}          txCount          - Transaction count
 * @property {CounterpartyType} counterpartyType - Inferred counterparty classification
 */

/**
 * @typedef {'defi'|'nft'|'bridge'|'staking'|'other'} ProtocolType
 *
 * @typedef {Object} HistoricalProtocolUsage
 * @property {string}          protocolName           - Protocol name (e.g. 'Uniswap V3')
 * @property {string|null}     protocolAddress        - Primary contract address or null
 * @property {ProtocolType}    protocolType           - Protocol category
 * @property {number}          volumeUSD              - USD volume routed through protocol
 * @property {number}          txCount                - Transaction count
 * @property {import('./source-metadata.js').ConfidenceLevel} attributionConfidence - Protocol attribution confidence
 */

/**
 * @typedef {Object} HistoricalWalletBaseline
 * @property {string}                   walletAddress       - Lowercase hex wallet address
 * @property {string}                   chain               - Chain identifier (e.g. 'ethereum')
 * @property {string}                   baselineWindowStart - ISO 8601 start of Dune query window
 * @property {string}                   baselineWindowEnd   - ISO 8601 end of Dune query window
 * @property {number}                   totalVolumeUSD      - Aggregate USD volume over window
 * @property {boolean}                  totalVolumeEstimated - True when any price was estimated
 * @property {number}                   txCount             - Total transaction count in window
 * @property {number|null}              uniqueCounterparties - Unique counterparty count or null
 * @property {HistoricalTokenFlow[]}    topTokenFlows       - Top token flows, sorted by volumeUSD desc
 * @property {HistoricalCounterparty[]} topCounterparties   - Top counterparties, sorted by volumeUSD desc
 * @property {HistoricalProtocolUsage[]} protocolUsage      - Protocol usage breakdown
 * @property {import('./source-metadata.js').DataQuality}     dataQuality - Quality metadata
 * @property {import('./source-metadata.js').SourceMetadata}  source      - Provenance source (e.g. dune_scheduled, etherscan)
 */

/**
 * Factory for HistoricalWalletBaseline.
 *
 * @param {Partial<HistoricalWalletBaseline>} partial
 * @returns {HistoricalWalletBaseline}
 */
export function makeHistoricalWalletBaseline(partial = {}) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    walletAddress:        partial.walletAddress        ?? '0x0000000000000000000000000000000000000000',
    chain:                partial.chain                ?? 'ethereum',
    baselineWindowStart:  partial.baselineWindowStart  ?? thirtyDaysAgo.toISOString(),
    baselineWindowEnd:    partial.baselineWindowEnd    ?? now.toISOString(),
    totalVolumeUSD:       partial.totalVolumeUSD       ?? 0,
    totalVolumeEstimated: partial.totalVolumeEstimated ?? false,
    txCount:              partial.txCount              ?? 0,
    uniqueCounterparties: partial.uniqueCounterparties ?? null,
    topTokenFlows:        partial.topTokenFlows        ?? [],
    topCounterparties:    partial.topCounterparties    ?? [],
    protocolUsage:        partial.protocolUsage        ?? [],
    dataQuality:          partial.dataQuality          ?? makeDataQuality({ confidence: 'medium' }),
    source:               partial.source               ?? makeSourceMetadata({ sourceType: 'dune_scheduled' }),
  };
}
