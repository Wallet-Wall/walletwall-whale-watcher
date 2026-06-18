/**
 * Shared contract types between wallet API routes and providers.
 *
 * buildDataQuality     — server-side factory that mirrors src/data/models/source-metadata.js
 * normalizeWalletGraphResponse — enforces consistent shape on the final API response object
 */

/**
 * @param {{ isDemo?: boolean, isFallback?: boolean, isPartial?: boolean, warnings?: string[] }} opts
 */
export function buildDataQuality({ isDemo = false, isFallback = false, isPartial = false, warnings = [] } = {}) {
  const degraded = isDemo || isFallback;
  return {
    isEstimated: degraded,
    isPartial:   Boolean(isPartial),
    isFallback:  degraded,
    confidence:  isDemo ? 'low' : isPartial || isFallback ? 'medium' : 'high',
    warnings:    Array.isArray(warnings) ? warnings.filter(Boolean) : [],
    sources:     [],
  };
}

/**
 * Normalizes a wallet provider payload into a consistent API response shape.
 * Guarantees arrays where the frontend expects arrays and a dataQuality object.
 *
 * @param {object} payload
 * @returns {object}
 */
export function normalizeWalletGraphResponse(payload = {}) {
  return {
    ...payload,
    nodes:       Array.isArray(payload.nodes)       ? payload.nodes       : [],
    edges:       Array.isArray(payload.edges)       ? payload.edges       : [],
    apiErrors:   Array.isArray(payload.apiErrors)   ? payload.apiErrors   : [],
    transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
    dataQuality: payload.dataQuality ?? buildDataQuality({}),
  };
}
