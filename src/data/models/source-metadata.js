/**
 * SourceMetadata — reusable provenance record attached to every major model.
 * DataQuality — structured quality/confidence annotation.
 *
 * Every user-facing or narrative-ready model must carry at least one
 * SourceMetadata entry so consumers can trace where numbers came from
 * and how fresh they are.
 */

/**
 * @typedef {'dune_scheduled'|'dune_cached'|'alchemy'|'etherscan'|'coingecko'|'the_graph'|'bigquery'|'ai_narrative'|'computed'|'mock'} SourceType
 *
 * dune_scheduled — result of a Dune query run on a schedule (never live).
 * dune_cached    — Dune result served from Redis cache (never live).
 * computed       — derived from other sources in-process.
 * mock           — fixture / fallback data, no real on-chain source.
 */

/**
 * @typedef {Object} SourceMetadata
 * @property {string}      sourceId        - Stable identifier for this source
 * @property {SourceType}  sourceType      - How data was obtained
 * @property {string|null} queryId         - Dune query ID when sourceType starts with 'dune_'
 * @property {string}      fetchedAt       - ISO 8601 timestamp of when WalletWall retrieved the data
 * @property {string|null} queryRunAt      - ISO 8601 timestamp of Dune query execution (execution_ended_at); null when unavailable or non-Dune
 * @property {boolean}     isCached        - True when served from Redis or in-process cache
 * @property {number|null} cacheAgeSeconds - Age of cached entry in seconds; null when fresh
 * @property {string|null} schemaVersion   - Optional data schema version tag
 */

/**
 * @typedef {'high'|'medium'|'low'} ConfidenceLevel
 */

/**
 * @typedef {Object} DataQuality
 * @property {boolean}         isEstimated - Any numeric value is estimated, not exact
 * @property {boolean}         isPartial   - Dataset is incomplete (e.g. tx window limited)
 * @property {boolean}         isFallback  - Serving mock/demo data due to missing real data
 * @property {ConfidenceLevel} confidence  - Overall confidence in the data
 * @property {string[]}        warnings    - Specific quality warnings for display or logging
 * @property {SourceMetadata[]} sources    - Provenance trail for all contributing sources
 */

/**
 * Factory for SourceMetadata.  Missing fields default to safe values.
 *
 * @param {Partial<SourceMetadata>} partial
 * @returns {SourceMetadata}
 */
export function makeSourceMetadata(partial = {}) {
  return {
    sourceId:        partial.sourceId        ?? 'unknown',
    sourceType:      partial.sourceType      ?? 'mock',
    queryId:         partial.queryId         ?? null,
    fetchedAt:       partial.fetchedAt       ?? new Date().toISOString(),
    queryRunAt:      partial.queryRunAt      ?? null,
    isCached:        partial.isCached        ?? false,
    cacheAgeSeconds: partial.cacheAgeSeconds ?? null,
    schemaVersion:   partial.schemaVersion   ?? null,
  };
}

/**
 * Factory for DataQuality.
 *
 * @param {Partial<DataQuality>} partial
 * @returns {DataQuality}
 */
export function makeDataQuality(partial = {}) {
  return {
    isEstimated: partial.isEstimated ?? false,
    isPartial:   partial.isPartial   ?? false,
    isFallback:  partial.isFallback  ?? false,
    confidence:  partial.confidence  ?? 'medium',
    warnings:    Array.isArray(partial.warnings) ? partial.warnings.filter(Boolean) : [],
    sources:     Array.isArray(partial.sources)  ? partial.sources  : [],
  };
}

/**
 * Merge multiple DataQuality objects into one aggregate.
 * Confidence resolves to the lowest value across all inputs.
 *
 * @param {DataQuality[]} qualities
 * @returns {DataQuality}
 */
export function mergeDataQuality(qualities) {
  const rank = { high: 2, medium: 1, low: 0 };
  let minRank = 2;
  const warnings = [];
  const sources = [];
  let isEstimated = false, isPartial = false, isFallback = false;

  for (const q of qualities) {
    if (rank[q.confidence] < minRank) minRank = rank[q.confidence];
    isEstimated = isEstimated || q.isEstimated;
    isPartial   = isPartial   || q.isPartial;
    isFallback  = isFallback  || q.isFallback;
    warnings.push(...q.warnings);
    sources.push(...q.sources);
  }

  const confidence = Object.entries(rank).find(([, v]) => v === minRank)?.[0] ?? 'low';
  return makeDataQuality({ isEstimated, isPartial, isFallback, confidence, warnings, sources });
}
