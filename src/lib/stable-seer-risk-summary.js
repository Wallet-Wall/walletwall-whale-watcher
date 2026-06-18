/**
 * Pure aggregation helper for the Stable Seer Risk Console.
 *
 * Consumes the normalized result array from /api/stable-seer (each item
 * matches the shape returned by normalizeRadarPair in api/stable-seer.js)
 * and derives a summary the UI can render above the results table.
 *
 * Stable Seer is market/pool data only — none of these metrics imply
 * holder analytics or investment advice.
 */

const CONCENTRATION_WARN_THRESHOLD = 0.7; // ≥70% in one bucket
const DAY_MS = 24 * 60 * 60 * 1000;

function emptySummary() {
  return {
    total: 0,
    totalLiquidity: 0,
    liquidityByChain: [],
    topDex: null,
    pairTypeShare: { stableStable: 0, stableVolatile: 0, volatileVolatile: 0 },
    pairPunnett: { stableStable: 0, stableVolatile: 0, volatileStable: 0, volatileVolatile: 0, unclassifiedCount: 0, total: 0 },
    maxPegDeviationPct: null,
    pegRiskCounts: { ok: 0, watch: 0, alert: 0 },
    newestPoolAgeDays: null,
    concentrationWarning: null,
  };
}

function safeLiquidity(r) {
  const v = r?.liquidityUsd;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function safeDev(r) {
  const v = r?.pegDeviationPct;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

function pickTopByLiquidity(map) {
  let topKey = null;
  let topLiquidity = 0;
  for (const [key, { liquidity }] of map.entries()) {
    if (liquidity > topLiquidity) {
      topKey = key;
      topLiquidity = liquidity;
    }
  }
  return topKey == null ? null : { key: topKey, liquidity: topLiquidity };
}

function addLiquidityBucket(map, key, liquidity) {
  const prev = map.get(key) || { count: 0, liquidity: 0 };
  map.set(key, { count: prev.count + 1, liquidity: prev.liquidity + liquidity });
}

function countKnown(counter, key) {
  if (key && counter[key] != null) counter[key] += 1;
}

function newestTimestamp(current, candidate) {
  if (!Number.isFinite(candidate)) return current;
  if (current == null || candidate > current) return candidate;
  return current;
}

function updateMaxDev(current, row) {
  const dev = safeDev(row);
  if (dev == null) return current;
  if (current == null || dev > current) return dev;
  return current;
}

function aggregateRows(list) {
  const buckets = {
    totalLiquidity: 0,
    byChain: new Map(),
    byDex: new Map(),
    pegRiskCounts: { ok: 0, watch: 0, alert: 0 },
    pairTypeCounts: { 'stable-stable': 0, 'stable-volatile': 0, 'volatile-volatile': 0 },
    // Four-cell Punnett counts — uses per-row isBaseStable/isQuoteStable booleans when
    // available; falls back to pairType for S:S and V:V; marks 'stable-volatile' rows
    // without booleans as unclassified (direction is ambiguous from pairType alone).
    pairPunnettCounts: { ss: 0, sv: 0, vs: 0, vv: 0, unclassified: 0 },
    maxDev: null,
    newestCreatedAt: null,
  };

  for (const r of list) {
    const liquidity = safeLiquidity(r);
    buckets.totalLiquidity += liquidity;
    addLiquidityBucket(buckets.byChain, r.chain || 'unknown', liquidity);
    addLiquidityBucket(buckets.byDex, r.dex || 'unknown', liquidity);
    countKnown(buckets.pegRiskCounts, r.pegRisk);
    countKnown(buckets.pairTypeCounts, r.pairType);
    buckets.maxDev = updateMaxDev(buckets.maxDev, r);
    buckets.newestCreatedAt = newestTimestamp(buckets.newestCreatedAt, r.pairCreatedAt);

    // Punnett cell — boolean fields take priority over pairType string
    if (typeof r.isBaseStable === 'boolean' && typeof r.isQuoteStable === 'boolean') {
      if (r.isBaseStable  && r.isQuoteStable)  buckets.pairPunnettCounts.ss++;
      else if (r.isBaseStable)                 buckets.pairPunnettCounts.sv++;
      else if (r.isQuoteStable)                buckets.pairPunnettCounts.vs++;
      else                                     buckets.pairPunnettCounts.vv++;
    } else if (r.pairType === 'stable-stable') {
      buckets.pairPunnettCounts.ss++;
    } else if (r.pairType === 'volatile-volatile') {
      buckets.pairPunnettCounts.vv++;
    } else {
      // pairType 'stable-volatile' without per-row booleans: direction unknown
      buckets.pairPunnettCounts.unclassified++;
    }
  }

  return buckets;
}

function getPairPunnett(counts, total) {
  if (total === 0) {
    return { stableStable: 0, stableVolatile: 0, volatileStable: 0, volatileVolatile: 0, unclassifiedCount: 0, total: 0 };
  }
  const { ss, sv, vs, vv, unclassified } = counts;
  const allClassified = unclassified === 0;
  // S:S and V:V: unclassified 'stable-volatile' rows can never belong to either cell,
  // so a zero count is genuinely 0%.  S:V and V:S are uncertain when rows exist that
  // couldn't be placed — show null (→ "—" in UI) rather than a false 0%.
  return {
    stableStable:    ss / total,
    stableVolatile:  sv > 0 || allClassified ? sv / total : null,
    volatileStable:  vs > 0 || allClassified ? vs / total : null,
    volatileVolatile: vv / total,
    unclassifiedCount: unclassified,
    total,
  };
}

function shareOf(value, total) {
  return total > 0 ? value / total : 0;
}

function getLiquidityByChain(byChain, totalLiquidity) {
  return [...byChain.entries()]
    .map(([chain, { liquidity }]) => ({
      chain,
      liquidity,
      share: shareOf(liquidity, totalLiquidity),
    }))
    .sort((a, b) => b.liquidity - a.liquidity);
}

function getTopDex(byDex, totalLiquidity) {
  const topDexEntry = pickTopByLiquidity(byDex);
  if (!topDexEntry) return null;

  return {
    dex: topDexEntry.key,
    liquidity: topDexEntry.liquidity,
    share: shareOf(topDexEntry.liquidity, totalLiquidity),
  };
}

function getPairTypeShare(pairTypeCounts, total) {
  return {
    stableStable: shareOf(pairTypeCounts['stable-stable'], total),
    stableVolatile: shareOf(pairTypeCounts['stable-volatile'], total),
    volatileVolatile: shareOf(pairTypeCounts['volatile-volatile'], total),
  };
}

function getNewestPoolAgeDays(newestCreatedAt, now) {
  if (newestCreatedAt == null) return null;
  return Math.max(0, (now - newestCreatedAt) / DAY_MS);
}

function getConcentrationWarning({ totalLiquidity, byChain, byDex, liquidityByChain, topDex }) {
  if (totalLiquidity <= 0) return null;

  const topChain = liquidityByChain[0];
  if (byChain.size > 1 && topChain?.share >= CONCENTRATION_WARN_THRESHOLD) {
    return { kind: 'chain', key: topChain.chain, share: topChain.share };
  }
  if (byDex.size > 1 && topDex?.share >= CONCENTRATION_WARN_THRESHOLD) {
    return { kind: 'dex', key: topDex.dex, share: topDex.share };
  }
  return null;
}

/**
 * Summarize an array of Stable Seer results.
 *
 * Empty/missing values degrade gracefully — fields are null when the
 * input has nothing to derive them from. Callers should check `total === 0`
 * before rendering the band.
 *
 * @param {Array<Object>} results
 * @returns {{
 *   total: number,
 *   totalLiquidity: number,
 *   liquidityByChain: Array<{ chain: string, liquidity: number, share: number }>,
 *   topDex: { dex: string, liquidity: number, share: number } | null,
 *   pairTypeShare: { stableStable: number, stableVolatile: number, volatileVolatile: number },
 *   pairPunnett: { stableStable: number, stableVolatile: number|null, volatileStable: number|null, volatileVolatile: number, unclassifiedCount: number, total: number },
 *   maxPegDeviationPct: number | null,
 *   pegRiskCounts: { ok: number, watch: number, alert: number },
 *   newestPoolAgeDays: number | null,
 *   concentrationWarning: { kind: 'chain'|'dex', key: string, share: number } | null,
 * }}
 */
export function summarizeStableSeerRisk(results, { now = Date.now() } = {}) {
  const list = Array.isArray(results) ? results.filter(Boolean) : [];

  if (list.length === 0) return emptySummary();

  const total = list.length;
  const buckets = aggregateRows(list);
  const {
    totalLiquidity, byChain, byDex, pegRiskCounts,
    pairTypeCounts, pairPunnettCounts, maxDev, newestCreatedAt,
  } = buckets;

  const liquidityByChain = getLiquidityByChain(byChain, totalLiquidity);
  const topDex = getTopDex(byDex, totalLiquidity);
  const pairTypeShare = getPairTypeShare(pairTypeCounts, total);
  const pairPunnett = getPairPunnett(pairPunnettCounts, total);
  const newestPoolAgeDays = getNewestPoolAgeDays(newestCreatedAt, now);

  // Concentration warning: ≥70% of liquidity in one chain or one DEX.
  // Only meaningful when totalLiquidity > 0 AND there's more than one bucket
  // in that dimension (otherwise "concentration" is trivially 100%).
  const concentrationWarning = getConcentrationWarning({
    totalLiquidity, byChain, byDex, liquidityByChain, topDex,
  });

  return {
    total,
    totalLiquidity,
    liquidityByChain,
    topDex,
    pairTypeShare,
    pairPunnett,
    maxPegDeviationPct: maxDev,
    pegRiskCounts,
    newestPoolAgeDays,
    concentrationWarning,
  };
}
