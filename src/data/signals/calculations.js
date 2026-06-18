/**
 * Pure calculation helpers for the signal engine.
 *
 * All functions are stateless and dependency-free.  They take plain JS
 * objects (HistoricalWalletBaseline, LiveWalletEvent) and return numbers
 * or confidence strings.  No side-effects, no imports from non-model deps.
 *
 * Confidence degradation rule (applied in order, first match wins):
 *   1. No baseline at all                  → 'low'
 *   2. baseline.dataQuality.confidence === 'low'  → 'low'
 *   3. baseline.dataQuality.isPartial              → 'medium' (max)
 *   4. baseline.dataQuality.isEstimated            → 'medium' (max)
 *   5. baseline.totalVolumeEstimated               → 'medium' (max)
 *   6. Any event has valueUSD === null             → 'medium' (max)
 *   7. baseline.dataQuality.confidence === 'medium'→ 'medium'
 *   8. Everything complete                         → 'high'
 */

/**
 * Number of calendar days covered by a baseline window (minimum 1).
 *
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline} baseline
 * @returns {number}
 */
export function baselineWindowDays(baseline) {
  const ms = new Date(baseline.baselineWindowEnd) - new Date(baseline.baselineWindowStart);
  return Math.max(1, ms / (1000 * 60 * 60 * 24));
}

/**
 * Average USD volume per day over the baseline window.
 *
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline} baseline
 * @returns {number}
 */
export function usualDailyVolumeUSD(baseline) {
  return baseline.totalVolumeUSD / baselineWindowDays(baseline);
}

/**
 * Average transaction count per day over the baseline window.
 *
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline} baseline
 * @returns {number}
 */
export function usualDailyTxCount(baseline) {
  return baseline.txCount / baselineWindowDays(baseline);
}

/**
 * Ratio of a single event value to the usual daily baseline volume.
 * Returns null when the baseline daily volume is zero (division undefined).
 *
 * @param {number} valueUSD
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline} baseline
 * @returns {number|null}
 */
export function baselineDeviation(valueUSD, baseline) {
  const daily = usualDailyVolumeUSD(baseline);
  return daily > 0 ? valueUSD / daily : null;
}

/**
 * Ratio of an observed tx count to the usual daily baseline tx count.
 * Returns null when the baseline daily count is zero.
 *
 * @param {number} count
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline} baseline
 * @returns {number|null}
 */
export function txCountDeviation(count, baseline) {
  const daily = usualDailyTxCount(baseline);
  return daily > 0 ? count / daily : null;
}

/**
 * Sum of known USD values across a set of events.
 * Events with valueUSD === null are excluded from the sum.
 * Returns null when ALL events have null values.
 *
 * @param {import('../models/live-events.js').LiveWalletEvent[]} events
 * @returns {number|null}
 */
export function sumEventValues(events) {
  let sum = 0;
  let anyKnown = false;
  for (const e of events) {
    if (e.valueUSD !== null) {
      sum += e.valueUSD;
      anyKnown = true;
    }
  }
  return anyKnown ? sum : null;
}

/**
 * Returns true if any event in the set has an unknown (null) USD value.
 *
 * @param {import('../models/live-events.js').LiveWalletEvent[]} events
 * @returns {boolean}
 */
export function hasUnknownValues(events) {
  return events.some(e => e.valueUSD === null);
}

/**
 * Derive signal confidence from baseline availability and data quality.
 * Missing or partial data degrades confidence rather than faking precision.
 *
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline|null} baseline
 * @param {import('../models/live-events.js').LiveWalletEvent[]} events
 * @returns {'high'|'medium'|'low'}
 */
export function deriveConfidence(baseline, events) {
  if (!baseline)                                          return 'low';
  if (baseline.dataQuality.confidence === 'low')         return 'low';
  if (baseline.dataQuality.isPartial)                    return 'medium';
  if (baseline.dataQuality.isEstimated)                  return 'medium';
  if (baseline.totalVolumeEstimated)                     return 'medium';
  if (events.length > 0 && hasUnknownValues(events))     return 'medium';
  if (baseline.dataQuality.confidence === 'medium')      return 'medium';
  return 'high';
}

/**
 * Map a deviation ratio to a signal strength level.
 *
 * @param {number|null} deviation     - ratio vs baseline (e.g. 8.0 means 8×)
 * @param {number}      mediumThresh  - ratio at or above which strength is 'medium'
 * @param {number}      highThresh    - ratio at or above which strength is 'high'
 * @returns {'high'|'medium'|'low'}
 */
export function strengthFromDeviation(deviation, mediumThresh = 3, highThresh = 7) {
  if (deviation === null || deviation < mediumThresh) return 'low';
  if (deviation >= highThresh)                        return 'high';
  return 'medium';
}

/**
 * Number of calendar days between a reference ISO timestamp and the
 * earliest matching event timestamp.  Returns null when no events match.
 *
 * @param {string}                                                    referenceIso
 * @param {import('../models/live-events.js').LiveWalletEvent[]}      events
 * @returns {number|null}
 */
export function daysSinceEarliest(referenceIso, events) {
  if (!events.length) return null;
  const refMs = new Date(referenceIso).getTime();
  const earliest = Math.min(...events.map(e => new Date(e.timestamp).getTime()));
  return (refMs - earliest) / (1000 * 60 * 60 * 24);
}

/**
 * Length in days of the engine's observation window (windowEnd − windowStart).
 * Minimum 1 to avoid division-by-zero comparisons.
 *
 * @param {string} windowStart  ISO 8601
 * @param {string} windowEnd    ISO 8601
 * @returns {number}
 */
export function windowDays(windowStart, windowEnd) {
  const ms = new Date(windowEnd) - new Date(windowStart);
  return Math.max(1, ms / (1000 * 60 * 60 * 24));
}
