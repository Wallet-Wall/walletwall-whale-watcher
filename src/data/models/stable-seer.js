/**
 * StableSeerResult — trending token/pair data from the Stable Seer feed.
 *
 * Stable Seer focuses on token-level volume and price momentum signals.
 * It does NOT contain holder analytics — holder data is in HolderWallTile.
 * Keep these two models completely separate in the UI and data pipeline.
 *
 * Results are sourced from DEX aggregators, price feeds, and Dune scheduled
 * queries.  They are never real-time (liveness is bounded by source TTL).
 */

import { makeDataQuality, makeSourceMetadata } from './source-metadata.js';

/**
 * @typedef {'rising'|'falling'|'stable'|'unknown'} MarketTrend
 */

/**
 * @typedef {Object} StableSeerResult
 * @property {string}       tokenSymbol        - Token symbol
 * @property {string|null}  tokenAddress       - Contract address; null for native token
 * @property {string}       chain              - Chain identifier
 * @property {string}       scanWindowStart    - ISO 8601 scan window start
 * @property {string}       scanWindowEnd      - ISO 8601 scan window end
 * @property {number}       volumeUSD          - USD volume in scan window
 * @property {boolean}      volumeEstimated    - True when any price was estimated
 * @property {number}       txCount            - Transaction count in scan window
 * @property {number|null}  priceUSD           - Spot price at scanWindowEnd; null if unavailable
 * @property {number|null}  priceChangePercent - % price change over scan window; null if unavailable
 * @property {MarketTrend}  trend              - Inferred volume/price trend
 * @property {string[]}     trendSignals       - Human-readable trend observations (not advice)
 * @property {import('./source-metadata.js').DataQuality}    dataQuality - Quality metadata
 * @property {import('./source-metadata.js').SourceMetadata} source      - Data source
 */

/**
 * Factory for StableSeerResult.
 *
 * @param {Partial<StableSeerResult>} partial
 * @returns {StableSeerResult}
 */
export function makeStableSeerResult(partial = {}) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    tokenSymbol:        partial.tokenSymbol        ?? 'UNKNOWN',
    tokenAddress:       partial.tokenAddress       ?? null,
    chain:              partial.chain              ?? 'ethereum',
    scanWindowStart:    partial.scanWindowStart    ?? oneDayAgo.toISOString(),
    scanWindowEnd:      partial.scanWindowEnd      ?? now.toISOString(),
    volumeUSD:          partial.volumeUSD          ?? 0,
    volumeEstimated:    partial.volumeEstimated    ?? false,
    txCount:            partial.txCount            ?? 0,
    priceUSD:           partial.priceUSD           ?? null,
    priceChangePercent: partial.priceChangePercent ?? null,
    trend:              partial.trend              ?? 'unknown',
    trendSignals:       Array.isArray(partial.trendSignals) ? partial.trendSignals : [],
    dataQuality:        partial.dataQuality        ?? makeDataQuality({ confidence: 'medium' }),
    source:             partial.source             ?? makeSourceMetadata({ sourceType: 'coingecko' }),
  };
}
