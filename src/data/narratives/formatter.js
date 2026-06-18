/**
 * Narrative formatting helpers — issue #105.
 *
 * Pure functions that convert signal evidence objects and source metadata into
 * human-readable strings.  No AI involvement, no external dependencies.
 *
 * Intentionally self-contained: does not import from the UI component layer
 * so it can be tested in Node.js without a browser environment.
 */

// ── Source label table (mirrors dataSourceFormatting.js SOURCE_LABELS) ────────

const SOURCE_LABEL_MAP = {
  alchemy:        'Alchemy',
  bigquery:       'BigQuery',
  coingecko:      'CoinGecko',
  computed:       'Signal Engine',
  dexscreener:    'DEX Screener',
  dune_cached:    'Dune',
  dune_scheduled: 'Dune',
  etherscan:      'Etherscan',
  ai_narrative:   'AI Narrative',
  the_graph:      'The Graph',
  mock:           'Demo',
};

function getSourceLabel(sourceType) {
  return SOURCE_LABEL_MAP[String(sourceType || '').toLowerCase()] ?? String(sourceType || 'Unknown');
}

// ── Cache-age helper ───────────────────────────────────────────────────────────

function formatCacheAge(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 60)    return `${Math.round(n)}s old`;
  if (n < 3600)  return `${Math.round(n / 60)}m old`;
  if (n < 86400) return `${Math.round(n / 3600)}h old`;
  return `${Math.round(n / 86400)}d old`;
}

// ── USD formatting ─────────────────────────────────────────────────────────────

/**
 * Compact USD formatter.  Returns null for non-finite inputs.
 *
 * @param {number|null|undefined} value
 * @returns {string|null}
 */
export function formatUSD(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000_000) return `$${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${+(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/**
 * Format a deviation ratio as "Nx".  Returns null for non-finite inputs.
 *
 * @param {number|null} ratio
 * @returns {string|null}
 */
export function formatMultiplier(ratio) {
  if (ratio == null) return null;
  const n = Number(ratio);
  if (!Number.isFinite(n)) return null;
  return `${+n.toFixed(1)}×`;
}

// ── Source footnotes ───────────────────────────────────────────────────────────

function describeSource(src) {
  const label = getSourceLabel(src.sourceType);
  if (src.sourceType === 'computed') return label;
  if (src.sourceType === 'dune_scheduled') return `${label} (scheduled, not live)`;
  if (src.sourceType === 'dune_cached') {
    const age = src.cacheAgeSeconds == null ? null : formatCacheAge(src.cacheAgeSeconds);
    const cacheDesc = age ? `scheduled cache, ${age}` : 'scheduled cache';
    return `${label} (${cacheDesc})`;
  }
  const age      = src.isCached && src.cacheAgeSeconds != null
    ? formatCacheAge(src.cacheAgeSeconds) : null;
  let freshness = 'provider data';
  if (src.isCached) freshness = age ? `cached, ${age}` : 'cached';
  return `${label} (${freshness})`;
}

/**
 * Produce a single "Data sources: ..." footnote string from a SourceMetadata array.
 *
 * @param {import('../models/source-metadata.js').SourceMetadata[]} sources
 * @returns {string|null}
 */
export function formatSourceFootnotes(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return `Data sources: ${sources.map(describeSource).join(', ')}`;
}

// ── Per-signal-type evidence formatters ───────────────────────────────────────

function evAccumulation(ev) {
  const inflow = formatUSD(ev.netInflowUSD);
  if (!inflow) return null;
  const token = ev.primaryToken  ? ` in ${ev.primaryToken}` : '';
  const days  = ev.baselineDays  ? ` over ${ev.baselineDays} days` : '';
  const pct   = ev.inflowRatio   ? ` (${Math.round(ev.inflowRatio * 100)}% inflows)` : '';
  return `Net inflow of ${inflow}${token}${days}${pct}`;
}

function evDistribution(ev) {
  const outflow = formatUSD(ev.netOutflowUSD);
  if (!outflow) return null;
  const token = ev.primaryToken  ? ` in ${ev.primaryToken}` : '';
  const days  = ev.baselineDays  ? ` over ${ev.baselineDays} days` : '';
  const pct   = ev.outflowRatio  ? ` (${Math.round(ev.outflowRatio * 100)}% outflows)` : '';
  return `Net outflow of ${outflow}${token}${days}${pct}`;
}

function evBridge(ev) {
  const count    = ev.bridgeEventCount ?? 0;
  const vol      = formatUSD(ev.bridgeVolumeUSD);
  const labels   = ev.bridgeLabels?.length ? ` via ${ev.bridgeLabels.join(', ')}` : '';
  const plural = count === 1 ? '' : 's';
  const countStr = count > 0
    ? `${count} bridge transaction${plural}`
    : 'Bridge activity';
  return vol ? `${countStr}${labels} totaling ${vol}` : `${countStr}${labels} detected`;
}

function evCexDeposit(ev) {
  const vol   = formatUSD(ev.depositVolumeUSD);
  const names = ev.cexNames?.length ? ` to ${ev.cexNames.join(', ')}` : '';
  return vol
    ? `CEX deposit${names}: ${vol} outbound`
    : `CEX deposit activity${names} detected`;
}

function evCexWithdrawal(ev) {
  const vol   = formatUSD(ev.withdrawalVolumeUSD);
  const names = ev.cexNames?.length ? ` from ${ev.cexNames.join(', ')}` : '';
  return vol
    ? `CEX withdrawal${names}: ${vol} inbound`
    : `CEX withdrawal activity${names} detected`;
}

function evUnusualActivity(ev) {
  const vol  = formatUSD(ev.observedVolumeUSD);
  const mult = ev.volumeDeviationRatio == null
    ? '' : ` (${formatMultiplier(ev.volumeDeviationRatio)} above expected)`;
  const txNote = ev.txCountTriggered && ev.observedTxCount != null
    ? `, ${ev.observedTxCount} txns vs ${ev.expectedTxCount} expected` : '';
  return vol
    ? `Observed ${vol}${mult}${txNote}`
    : `Elevated activity detected${mult}`;
}

function evNewCounterparty(ev) {
  const count   = ev.newCounterpartyCount ?? 0;
  const vol     = formatUSD(ev.totalNewVolumeUSD);
  const top     = ev.topNewCounterparties?.[0];
  const valueStr = top?.valueUSD == null ? '' : ` (${formatUSD(top.valueUSD)})`;
  const topDesc = top
    ? ` — largest: ${top.label ?? top.address}${valueStr}`
    : '';
  const totalStr = vol ? `, ${vol} total` : '';
  return `${count} new counterpart${count === 1 ? 'y' : 'ies'}${totalStr}${topDesc}`;
}

function evProtocolRotation(ev) {
  const newLabels = ev.newProtocolLabels?.slice(0, 2).join(', ') ?? 'new protocol';
  const share     = ev.volumeShare == null
    ? '' : ` (${Math.round(ev.volumeShare * 100)}% of event volume)`;
  const prev      = ev.previousPrimaryProtocol
    ? `, shifting from ${ev.previousPrimaryProtocol}` : '';
  return `Activity routed through ${newLabels}${share}${prev}`;
}

function evLargeMove(ev) {
  const val  = formatUSD(ev.largestEventValueUSD);
  if (!val) return null;
  const type  = ev.largestEventType ? ` ${ev.largestEventType}` : '';
  const daily = formatUSD(ev.usualDailyVolumeUSD);
  const dailySuffix = daily ? ` of ${daily}` : '';
  const mult  = ev.deviationVsDailyAvg == null
    ? '' : ` (${formatMultiplier(ev.deviationVsDailyAvg)} above daily avg${dailySuffix})`;
  return `Single${type} of ${val}${mult}`;
}

function evDormancyRevival(ev) {
  const days = ev.dormancyMinDays;
  const vol  = formatUSD(ev.revivalVolumeUSD);
  const daysStr = days ? `after ${days}+ days dormant` : 'after dormancy period';
  const countStr = ev.revivalEventCount > 1 ? ` across ${ev.revivalEventCount} transactions` : '';
  return vol
    ? `Wallet active again ${daysStr}${countStr} — ${vol} in revival events`
    : `Wallet active again ${daysStr}${countStr}`;
}

const EV_FNS = {
  accumulation:           evAccumulation,
  distribution:           evDistribution,
  bridge:                 evBridge,
  cex_deposit:            evCexDeposit,
  cex_withdrawal:         evCexWithdrawal,
  unusual_activity:       evUnusualActivity,
  unusual_volume:         evUnusualActivity,
  new_counterparty:       evNewCounterparty,
  protocol_rotation:      evProtocolRotation,
  large_move_vs_baseline: evLargeMove,
  dormant_wallet_revival: evDormancyRevival,
};

/**
 * Format the evidence of a signal into a one-line human-readable string.
 *
 * Returns null for unknown signal types or when required evidence fields are missing.
 *
 * @param {string} signalType
 * @param {Object} evidence
 * @returns {string|null}
 */
export function formatEvidenceLine(signalType, evidence) {
  const fn = EV_FNS[signalType];
  if (!fn) return null;
  return fn(evidence ?? {}) ?? null;
}