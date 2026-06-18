/**
 * Deterministic Wallet Signal Engine — issue #104.
 *
 * Takes a HistoricalWalletBaseline (from Dune, scheduled/cached) plus an
 * array of LiveWalletEvents and produces an array of WalletSignal objects.
 *
 * Design invariants:
 *   - Pure function: same inputs always produce the same output.
 *   - No I/O, no AI calls, no external dependencies.
 *   - Missing or partial data lowers confidence instead of faking precision.
 *   - Every signal carries source metadata and non-empty caveats.
 *   - Signals are facts. AI narratives in #105 must consume these, not invent them.
 *
 * Detection coverage:
 *   accumulation          — sustained net inflows over the baseline window
 *   distribution          — sustained net outflows over the baseline window
 *   bridge                — cross-chain bridge activity from events or baseline
 *   cex_deposit           — outflows to known CEX counterparties
 *   cex_withdrawal        — inflows from known CEX counterparties
 *   unusual_activity      — volume or tx-count deviation above threshold vs baseline
 *   new_counterparty      — high-value event to a counterparty absent from baseline
 *   protocol_rotation     — events use a protocol not seen in the baseline top list
 *   large_move_vs_baseline — single event value >> usual daily volume
 */

import { makeWalletSignal } from '../models/signals.js';
import { makeDataQuality, makeSourceMetadata } from '../models/source-metadata.js';
import {
  baselineWindowDays,
  usualDailyVolumeUSD,
  usualDailyTxCount,
  baselineDeviation,
  sumEventValues,
  hasUnknownValues,
  deriveConfidence,
  strengthFromDeviation,
  windowDays,
} from './calculations.js';
import {
  isCexLabel,
  isBridgeLabel,
  isCexCounterpartyType,
  isBridgeCounterpartyType,
  normaliseCexName,
} from './known-labels.js';

// ── Engine defaults ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} SignalEngineOptions
 * @property {number} [largeMovThresholdMultiplier=5]   - event.valueUSD must be ≥ N × usualDailyVolumeUSD
 * @property {number} [unusualVolumeMultiplier=3]       - period volume must be ≥ N × baseline period avg
 * @property {number} [unusualTxMultiplier=3]           - period tx count must be ≥ N × baseline period avg
 * @property {number} [minSignalValueUSD=10000]         - skip signals below this USD threshold
 * @property {number} [newCounterpartyMinUSD=50000]     - new counterparty events below this are ignored
 * @property {number} [accumulationNetInflowRatio=0.6]  - inflow must be ≥ 60% of total to call accumulation
 * @property {number} [distributionNetOutflowRatio=0.6] - outflow must be ≥ 60% of total to call distribution
 * @property {number} [protocolRotationVolumeShare=0.2] - new protocol must handle ≥ 20% of event value
 */

export const DEFAULT_OPTIONS = {
  largeMovThresholdMultiplier:  5,
  unusualVolumeMultiplier:      3,
  unusualTxMultiplier:          3,
  minSignalValueUSD:            10_000,
  newCounterpartyMinUSD:        50_000,
  accumulationNetInflowRatio:   0.6,
  distributionNetOutflowRatio:  0.6,
  protocolRotationVolumeShare:  0.2,
};

// ── Input type ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SignalEngineInput
 * @property {string}                                                           walletAddress
 * @property {string}                                                           chain
 * @property {import('../models/historical-baseline.js').HistoricalWalletBaseline|null} baseline
 * @property {import('../models/live-events.js').LiveWalletEvent[]}             events
 * @property {string}                                                           windowStart  ISO 8601
 * @property {string}                                                           windowEnd    ISO 8601
 */

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Stable SourceMetadata for all signals produced by this engine. */
function engineSource(detectedAt) {
  return makeSourceMetadata({
    sourceId:   'signal-engine-v1',
    sourceType: 'computed',
    fetchedAt:  detectedAt,
    isCached:   false,
  });
}

/**
 * Filter an array of strings, removing falsy entries, and ensure at least
 * one caveat remains (appending a universal fallback if needed).
 *
 * @param {(string|null|false|undefined)[]} items
 * @returns {string[]}
 */
function buildCaveats(items) {
  const filtered = items.filter(Boolean);
  if (filtered.length === 0) {
    filtered.push('Signal derived from on-chain data only; off-chain context not included.');
  }
  return filtered;
}

/**
 * Collect all SourceMetadata from baseline (if any) and each event.
 *
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline|null} baseline
 * @param {import('../models/live-events.js').LiveWalletEvent[]} events
 * @param {import('../models/source-metadata.js').SourceMetadata} engineSrc
 * @returns {import('../models/source-metadata.js').SourceMetadata[]}
 */
function gatherSources(baseline, events, engineSrc) {
  const seen  = new Set();
  const srcs  = [];
  const add   = s => { if (s && !seen.has(s.sourceId)) { seen.add(s.sourceId); srcs.push(s); } };
  if (baseline) add(baseline.source);
  for (const e of events) add(e.source);
  add(engineSrc);
  return srcs;
}

// ── Pre-computed baseline statistics ─────────────────────────────────────────

/**
 * @typedef {Object} BaselineStats
 * @property {number}   days
 * @property {number}   dailyVolumeUSD
 * @property {number}   dailyTxCount
 * @property {number}   inVolumeUSD
 * @property {number}   outVolumeUSD
 * @property {number}   netFlowVolumeUSD
 * @property {'in'|'out'|'balanced'} netFlowDirection
 * @property {Set<string>} knownCounterpartyAddresses   lowercase hex
 * @property {Set<string>} knownProtocolNames            lowercase
 * @property {import('../models/historical-baseline.js').HistoricalProtocolUsage|null} primaryProtocol
 * @property {import('../models/historical-baseline.js').HistoricalCounterparty[]} cexCounterparties
 * @property {import('../models/historical-baseline.js').HistoricalCounterparty[]} bridgeCounterparties
 */

/**
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline} baseline
 * @returns {BaselineStats}
 */
function buildBaselineStats(baseline) {
  const days           = baselineWindowDays(baseline);
  const dailyVolumeUSD = usualDailyVolumeUSD(baseline);
  const dailyTxCount   = usualDailyTxCount(baseline);

  let inVolumeUSD  = 0;
  let outVolumeUSD = 0;
  for (const flow of baseline.topTokenFlows) {
    if      (flow.direction === 'in')  inVolumeUSD  += flow.volumeUSD;
    else if (flow.direction === 'out') outVolumeUSD += flow.volumeUSD;
    // 'net' direction is ambiguous — omit from directional totals
  }
  const netFlowVolumeUSD = inVolumeUSD - outVolumeUSD;
  let netFlowDirection = 'balanced';
  if (netFlowVolumeUSD > 0) netFlowDirection = 'in';
  else if (netFlowVolumeUSD < 0) netFlowDirection = 'out';

  const knownCounterpartyAddresses = new Set(
    baseline.topCounterparties.map(c => c.address.toLowerCase()),
  );
  const knownProtocolNames = new Set(
    baseline.protocolUsage.map(p => p.protocolName.toLowerCase()),
  );
  const primaryProtocol = baseline.protocolUsage.reduce(
    (best, p) => best === null || p.volumeUSD > best.volumeUSD ? p : best,
    null,
  );

  const cexCounterparties = baseline.topCounterparties.filter(
    c => isCexCounterpartyType(c.counterpartyType) || isCexLabel(c.label),
  );
  const bridgeCounterparties = baseline.topCounterparties.filter(
    c => isBridgeCounterpartyType(c.counterpartyType) || isBridgeLabel(c.label),
  );

  return {
    days, dailyVolumeUSD, dailyTxCount,
    inVolumeUSD, outVolumeUSD, netFlowVolumeUSD, netFlowDirection,
    knownCounterpartyAddresses, knownProtocolNames, primaryProtocol,
    cexCounterparties, bridgeCounterparties,
  };
}

// ── Signal detectors ──────────────────────────────────────────────────────────

function detectAccumulation(input, stats, opts, detectedAt) {
  if (!stats) return null;

  const { inVolumeUSD, outVolumeUSD, dailyVolumeUSD } = stats;
  const total = inVolumeUSD + outVolumeUSD;
  if (total < opts.minSignalValueUSD)            return null;

  const inflowRatio = total > 0 ? inVolumeUSD / total : 0;
  if (inflowRatio < opts.accumulationNetInflowRatio) return null;

  const netInflow    = inVolumeUSD - outVolumeUSD;
  const confidence   = deriveConfidence(input.baseline, input.events);
  const deviation    = dailyVolumeUSD > 0 ? netInflow / dailyVolumeUSD : null;
  const strength     = strengthFromDeviation(deviation, 3, 10);
  const inFlows      = input.baseline.topTokenFlows.filter(f => f.direction === 'in');
  const primaryToken = inFlows.length > 0
    ? inFlows.reduce((a, b) => a.volumeUSD > b.volumeUSD ? a : b).tokenSymbol
    : null;
  const src = engineSource(detectedAt);
  const dq  = input.baseline.dataQuality;

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'accumulation',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      netInflowUSD:       Math.round(netInflow),
      inVolumeUSD:        Math.round(inVolumeUSD),
      outVolumeUSD:       Math.round(outVolumeUSD),
      inflowRatio:        Math.round(inflowRatio * 100) / 100,
      primaryToken,
      baselineDays:       Math.round(stats.days),
      usualDailyVolumeUSD: Math.round(dailyVolumeUSD),
    },
    caveats: buildCaveats([
      'Accumulation inferred from net token flow direction over the baseline window.',
      'Does not reflect off-chain purchases, OTC trades, or custodial holdings.',
      dq.isEstimated && 'Baseline USD volumes are estimates; exact values may differ.',
      dq.isPartial   && 'Baseline dataset is incomplete; signal may not reflect full activity.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: dq.isEstimated,
      isPartial:   dq.isPartial,
      confidence,
      sources:     [input.baseline.source, src],
    }),
    sources: gatherSources(input.baseline, [], src),
  });
}

function detectDistribution(input, stats, opts, detectedAt) {
  if (!stats) return null;

  const { inVolumeUSD, outVolumeUSD, dailyVolumeUSD } = stats;
  const total = inVolumeUSD + outVolumeUSD;
  if (total < opts.minSignalValueUSD) return null;

  const outflowRatio = total > 0 ? outVolumeUSD / total : 0;
  if (outflowRatio < opts.distributionNetOutflowRatio) return null;

  const netOutflow   = outVolumeUSD - inVolumeUSD;
  const confidence   = deriveConfidence(input.baseline, input.events);
  const deviation    = dailyVolumeUSD > 0 ? netOutflow / dailyVolumeUSD : null;
  const strength     = strengthFromDeviation(deviation, 3, 10);
  const outFlows     = input.baseline.topTokenFlows.filter(f => f.direction === 'out');
  const primaryToken = outFlows.length > 0
    ? outFlows.reduce((a, b) => a.volumeUSD > b.volumeUSD ? a : b).tokenSymbol
    : null;
  const src = engineSource(detectedAt);
  const dq  = input.baseline.dataQuality;

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'distribution',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      netOutflowUSD:       Math.round(netOutflow),
      inVolumeUSD:         Math.round(inVolumeUSD),
      outVolumeUSD:        Math.round(outVolumeUSD),
      outflowRatio:        Math.round(outflowRatio * 100) / 100,
      primaryToken,
      baselineDays:        Math.round(stats.days),
      usualDailyVolumeUSD: Math.round(dailyVolumeUSD),
    },
    caveats: buildCaveats([
      'Distribution inferred from net token flow direction over the baseline window.',
      'Does not reflect off-chain disposals, OTC sales, or staking withdrawals.',
      dq.isEstimated && 'Baseline USD volumes are estimates; exact values may differ.',
      dq.isPartial   && 'Baseline dataset is incomplete; signal may not reflect full activity.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: dq.isEstimated,
      isPartial:   dq.isPartial,
      confidence,
      sources:     [input.baseline.source, src],
    }),
    sources: gatherSources(input.baseline, [], src),
  });
}

function detectBridgeActivity(input, stats, opts, detectedAt) {
  // Detect bridge events from live events first
  const bridgeEvents = input.events.filter(
    e => e.eventType === 'bridge' ||
         isBridgeLabel(e.counterpartyLabel) ||
         isBridgeCounterpartyType(e.dataQuality?.sources?.[0]?.counterpartyType),
  );

  // Fall back to baseline bridge counterparties when no live events
  const hasBridgeBaseline = stats && stats.bridgeCounterparties.length > 0;

  if (bridgeEvents.length === 0 && !hasBridgeBaseline) return null;

  const eventValueUSD = sumEventValues(bridgeEvents);
  const hasLiveData   = bridgeEvents.length > 0;
  const confidence    = hasLiveData
    ? deriveConfidence(input.baseline, bridgeEvents)
    : 'low';
  const deviation     = (stats && eventValueUSD !== null)
    ? baselineDeviation(eventValueUSD, input.baseline)
    : null;
  const strength      = hasLiveData
    ? strengthFromDeviation(deviation, 2, 5)
    : 'low';

  const bridgeLabels = [
    ...new Set([
      ...bridgeEvents.map(e => e.counterpartyLabel).filter(Boolean),
      ...(stats ? stats.bridgeCounterparties.map(c => c.label).filter(Boolean) : []),
    ]),
  ];

  const src = engineSource(detectedAt);

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'bridge',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      bridgeEventCount:     bridgeEvents.length,
      bridgeVolumeUSD:      eventValueUSD,
      bridgeLabels:         bridgeLabels.slice(0, 5),
      fromBaselineHistory:  !hasLiveData && hasBridgeBaseline,
      baselineBridgeVolumeUSD: hasBridgeBaseline
        ? Math.round(stats.bridgeCounterparties.reduce((s, c) => s + c.volumeUSD, 0))
        : null,
    },
    caveats: buildCaveats([
      'Bridge activity detected from counterparty label matching; may include false positives.',
      !hasLiveData && 'No live bridge events found; signal derived from Dune historical baseline only.',
      'Cross-chain destination chain and amount are not verified by this engine.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: hasUnknownValues(bridgeEvents),
      isPartial:   !hasLiveData,
      confidence,
      sources:     gatherSources(input.baseline, bridgeEvents, src),
    }),
    sources: gatherSources(input.baseline, bridgeEvents, src),
  });
}

function detectCexDeposit(input, stats, opts, detectedAt) {
  // Live events to known CEX counterparties (LiveWalletEvent has no counterpartyType field;
  // label matching is the only live-event path).
  const cexOutEvents = input.events.filter(
    e => isCexLabel(e.counterpartyLabel),
  );

  // Baseline evidence: CEX counterparty + net outflow direction
  const hasCexBaselineOut = stats &&
    stats.cexCounterparties.length > 0 &&
    stats.netFlowDirection === 'out';

  if (cexOutEvents.length === 0 && !hasCexBaselineOut) return null;

  const eventValueUSD = sumEventValues(cexOutEvents);
  const hasLiveData   = cexOutEvents.length > 0;
  const confidence    = hasLiveData
    ? deriveConfidence(input.baseline, cexOutEvents)
    : 'low';
  const strength      = eventValueUSD !== null && stats
    ? strengthFromDeviation(baselineDeviation(eventValueUSD, input.baseline), 2, 5)
    : 'low';

  const cexNames = [
    ...new Set([
      ...cexOutEvents.map(e => normaliseCexName(e.counterpartyLabel)).filter(Boolean),
      ...(hasCexBaselineOut ? stats.cexCounterparties.map(c => normaliseCexName(c.label)).filter(Boolean) : []),
    ]),
  ];

  const src = engineSource(detectedAt);

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'cex_deposit',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      cexEventCount:       cexOutEvents.length,
      depositVolumeUSD:    eventValueUSD,
      cexNames:            cexNames.slice(0, 5),
      fromBaselineHistory: !hasLiveData && hasCexBaselineOut,
      directionNote:       'Outbound direction inferred from counterparty label and net flow pattern.',
    },
    caveats: buildCaveats([
      'CEX identification is based on counterparty label matching; not verified against on-chain address registries.',
      'Outbound direction inferred from net flow pattern; individual transaction direction not verified.',
      !hasLiveData && 'No live CEX events found; signal derived from Dune historical baseline only.',
      'This does not constitute evidence of regulatory reporting obligations or KYC activity.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: hasUnknownValues(cexOutEvents),
      isPartial:   !hasLiveData,
      confidence,
      sources:     gatherSources(input.baseline, cexOutEvents, src),
    }),
    sources: gatherSources(input.baseline, cexOutEvents, src),
  });
}

function detectCexWithdrawal(input, stats, opts, detectedAt) {
  // Baseline evidence: CEX counterparty + net inflow direction
  const hasCexBaselineIn = stats &&
    stats.cexCounterparties.length > 0 &&
    stats.netFlowDirection === 'in';

  // Collect all live CEX-labelled events unconditionally — baseline direction is used for
  // evidence context but must not gate detection, since a historically net-out wallet can
  // still be actively withdrawing from a CEX today.
  const cexInEvents = input.events.filter(e => isCexLabel(e.counterpartyLabel));

  if (cexInEvents.length === 0 && !hasCexBaselineIn) return null;

  const eventValueUSD = sumEventValues(cexInEvents);
  const hasLiveData   = cexInEvents.length > 0;
  const confidence    = hasLiveData
    ? deriveConfidence(input.baseline, cexInEvents)
    : 'low';
  const strength      = eventValueUSD !== null && stats
    ? strengthFromDeviation(baselineDeviation(eventValueUSD, input.baseline), 2, 5)
    : 'low';

  const cexNames = [
    ...new Set([
      ...cexInEvents.map(e => normaliseCexName(e.counterpartyLabel)).filter(Boolean),
      ...(hasCexBaselineIn ? stats.cexCounterparties.map(c => normaliseCexName(c.label)).filter(Boolean) : []),
    ]),
  ];

  const src = engineSource(detectedAt);

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'cex_withdrawal',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      cexEventCount:        cexInEvents.length,
      withdrawalVolumeUSD:  eventValueUSD,
      cexNames:             cexNames.slice(0, 5),
      fromBaselineHistory:  !hasLiveData && hasCexBaselineIn,
      directionNote:        'Inbound direction inferred from net flow pattern and CEX counterparty label.',
    },
    caveats: buildCaveats([
      'CEX identification is based on counterparty label matching; not verified against on-chain address registries.',
      'Inbound direction inferred from aggregate flow pattern; individual transaction direction not verified.',
      !hasLiveData && 'No live CEX events found; signal derived from Dune historical baseline only.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: hasUnknownValues(cexInEvents),
      isPartial:   !hasLiveData,
      confidence,
      sources:     gatherSources(input.baseline, cexInEvents, src),
    }),
    sources: gatherSources(input.baseline, cexInEvents, src),
  });
}

function detectUnusualActivity(input, stats, opts, detectedAt) {
  if (!stats) return null;  // can't know what's "unusual" without a baseline

  const wDays         = windowDays(input.windowStart, input.windowEnd);
  const totalEvents   = input.events;
  const eventTotal    = sumEventValues(totalEvents);
  const eventTxCount  = totalEvents.length;

  // Expected values for the observation window
  const expectedVolume = stats.dailyVolumeUSD * wDays;
  const expectedTxCount = stats.dailyTxCount * wDays;

  const volDeviation = expectedVolume > 0 && eventTotal !== null
    ? eventTotal / expectedVolume
    : null;
  const txDeviation  = expectedTxCount > 0
    ? eventTxCount / expectedTxCount
    : null;

  const volTriggered = volDeviation !== null && volDeviation >= opts.unusualVolumeMultiplier;
  const txTriggered  = txDeviation  !== null && txDeviation  >= opts.unusualTxMultiplier;

  if (!volTriggered && !txTriggered) return null;

  const confidence = deriveConfidence(input.baseline, totalEvents);
  const maxDev     = Math.max(volDeviation ?? 0, txDeviation ?? 0);
  const strength   = strengthFromDeviation(maxDev, opts.unusualVolumeMultiplier, opts.unusualVolumeMultiplier * 2.5);
  const src        = engineSource(detectedAt);
  const dq         = input.baseline.dataQuality;

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'unusual_activity',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      observedVolumeUSD:     eventTotal,
      expectedVolumeUSD:     Math.round(expectedVolume),
      volumeDeviationRatio:  volDeviation === null ? null : Math.round(volDeviation * 100) / 100,
      observedTxCount:       eventTxCount,
      expectedTxCount:       Math.round(expectedTxCount),
      txCountDeviationRatio: txDeviation  === null ? null : Math.round(txDeviation  * 100) / 100,
      volumeTriggered:       volTriggered,
      txCountTriggered:      txTriggered,
      windowDays:            Math.round(wDays),
      usualDailyVolumeUSD:   Math.round(stats.dailyVolumeUSD),
    },
    caveats: buildCaveats([
      'Unusual activity measured against Dune historical baseline averages; baseline window may not reflect long-term norms.',
      eventTotal === null && 'Event USD values partially unavailable; volume deviation may be understated.',
      dq.isEstimated && 'Baseline USD volumes are estimates; deviation ratios may be imprecise.',
      dq.isPartial   && 'Baseline dataset is incomplete; expected volume may be understated.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: dq.isEstimated || hasUnknownValues(totalEvents),
      isPartial:   dq.isPartial,
      confidence,
      sources:     gatherSources(input.baseline, totalEvents, src),
    }),
    sources: gatherSources(input.baseline, totalEvents, src),
  });
}

function detectNewCounterparty(input, stats, opts, detectedAt) {
  // Without baseline we have no "known" set to compare against
  if (!stats) return null;

  const newCpEvents = input.events.filter(e => {
    if (!e.counterpartyAddress)                               return false;
    if ((e.valueUSD ?? 0) < opts.newCounterpartyMinUSD)       return false;
    return !stats.knownCounterpartyAddresses.has(e.counterpartyAddress.toLowerCase());
  });

  if (newCpEvents.length === 0) return null;

  const totalValue = sumEventValues(newCpEvents);
  const confidence = deriveConfidence(input.baseline, newCpEvents);
  const deviation  = totalValue === null ? null : baselineDeviation(totalValue, input.baseline);
  const strength   = strengthFromDeviation(deviation, 2, 5);
  const src        = engineSource(detectedAt);
  const dq         = input.baseline.dataQuality;

  // Surface up to 5 new counterparty addresses (never full PII, just observable on-chain addresses)
  const topNew = newCpEvents
    .slice()
    .sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0))
    .slice(0, 5)
    .map(e => ({
      address:  e.counterpartyAddress,
      label:    e.counterpartyLabel ?? null,
      valueUSD: e.valueUSD,
    }));

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'new_counterparty',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      newCounterpartyCount:  newCpEvents.length,
      totalNewVolumeUSD:     totalValue,
      topNewCounterparties:  topNew,
      knownCounterpartyCount: stats.knownCounterpartyAddresses.size,
      minValueThresholdUSD:  opts.newCounterpartyMinUSD,
    },
    caveats: buildCaveats([
      'Counterparty is "new" only relative to the Dune baseline top-counterparty list; it may appear in full transaction history.',
      'Counterparty addresses are publicly observable on-chain data; no identity inference is made.',
      dq.isPartial && 'Baseline counterparty list may be incomplete; new counterparty detection may undercount.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: hasUnknownValues(newCpEvents),
      isPartial:   dq.isPartial,
      confidence,
      sources:     gatherSources(input.baseline, newCpEvents, src),
    }),
    sources: gatherSources(input.baseline, newCpEvents, src),
  });
}

function detectProtocolRotation(input, stats, opts, detectedAt) {
  if (!stats || stats.knownProtocolNames.size === 0) return null;

  const eventTotal = sumEventValues(input.events);
  if (eventTotal === null || eventTotal === 0) return null;

  // Group events by the protocol implied by counterpartyLabel
  // Use substring matching in both directions: a label like "Uniswap V3: USDC-ETH Pool"
  // must match the known protocol name "uniswap v3", and a short label like "curve" must
  // match a known name like "curve finance".  Exact Set.has() misses these cases.
  const knownProtocolList = [...stats.knownProtocolNames];
  const newProtocolEvents = input.events.filter(e => {
    if (!e.counterpartyLabel) return false;
    const lower = e.counterpartyLabel.toLowerCase();
    return !knownProtocolList.some(p => lower.includes(p) || p.includes(lower));
  });

  if (newProtocolEvents.length === 0) return null;

  const newProtoValue = sumEventValues(newProtocolEvents);
  if (newProtoValue === null) return null;
  const volumeShare = eventTotal > 0 ? newProtoValue / eventTotal : 0;
  if (volumeShare < opts.protocolRotationVolumeShare) return null;

  const newProtocolLabels = [
    ...new Set(newProtocolEvents.map(e => e.counterpartyLabel).filter(Boolean)),
  ];

  const confidence = deriveConfidence(input.baseline, newProtocolEvents);
  const strength   = strengthFromDeviation(volumeShare / opts.protocolRotationVolumeShare, 1.5, 4);
  const src        = engineSource(detectedAt);
  const dq         = input.baseline.dataQuality;

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'protocol_rotation',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      newProtocolLabels:    newProtocolLabels.slice(0, 5),
      newProtocolVolumeUSD: Math.round(newProtoValue),
      totalEventVolumeUSD:  Math.round(eventTotal),
      volumeShare:          Math.round(volumeShare * 100) / 100,
      previousPrimaryProtocol: stats.primaryProtocol?.protocolName ?? null,
      knownProtocols:       [...stats.knownProtocolNames],
    },
    caveats: buildCaveats([
      'Protocol identification is based on counterparty label matching; not verified against on-chain bytecode.',
      'Volume share calculated against live event set only, which may be a partial sample.',
      dq.isPartial && 'Baseline protocol list may be incomplete; rotation detection may be imprecise.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: hasUnknownValues(newProtocolEvents),
      isPartial:   dq.isPartial,
      confidence,
      sources:     gatherSources(input.baseline, newProtocolEvents, src),
    }),
    sources: gatherSources(input.baseline, newProtocolEvents, src),
  });
}

function detectLargeMoveVsBaseline(input, stats, opts, detectedAt) {
  if (!stats) return null;

  const { dailyVolumeUSD } = stats;
  if (dailyVolumeUSD === 0) return null;

  const threshold = dailyVolumeUSD * opts.largeMovThresholdMultiplier;
  const largeEvents = input.events.filter(
    e => e.valueUSD !== null && e.valueUSD >= threshold,
  );

  if (largeEvents.length === 0) return null;

  // Use the single largest event as the primary signal anchor
  const largest  = largeEvents.reduce((a, b) => (b.valueUSD > a.valueUSD ? b : a));
  const deviation = baselineDeviation(largest.valueUSD, input.baseline);
  const confidence = deriveConfidence(input.baseline, largeEvents);
  const strength   = strengthFromDeviation(deviation, opts.largeMovThresholdMultiplier, opts.largeMovThresholdMultiplier * 2);
  const src        = engineSource(detectedAt);
  const dq         = input.baseline.dataQuality;

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'large_move_vs_baseline',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      largestEventValueUSD:    largest.valueUSD,
      largestEventTxHash:      largest.txHash,
      largestEventType:        largest.eventType,
      deviationVsDailyAvg:     deviation === null ? null : Math.round(deviation * 100) / 100,
      thresholdMultiplier:     opts.largeMovThresholdMultiplier,
      usualDailyVolumeUSD:     Math.round(dailyVolumeUSD),
      thresholdUSD:            Math.round(threshold),
      totalLargeEventCount:    largeEvents.length,
      totalLargeVolumeUSD:     sumEventValues(largeEvents),
    },
    caveats: buildCaveats([
      'Large move threshold is a multiple of the baseline daily average; a higher baseline means a higher threshold.',
      dq.isEstimated && 'Baseline daily volume is an estimate; threshold USD value may be inaccurate.',
      dq.isPartial   && 'Baseline dataset is incomplete; usualDailyVolumeUSD may be understated, lowering the effective threshold.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: dq.isEstimated || largest.valueEstimated,
      isPartial:   dq.isPartial,
      confidence,
      sources:     gatherSources(input.baseline, largeEvents, src),
    }),
    sources: gatherSources(input.baseline, largeEvents, src),
  });
}

function detectDormancyRevival(input, stats, opts, detectedAt) {
  if (!stats) return null;
  if (input.events.length === 0) return null;

  // Only fire when the Dune baseline window shows zero transactions — the
  // clearest available proxy for dormancy.  Low-activity wallets with txCount > 0
  // are better handled by unusual_activity.
  if (input.baseline.txCount !== 0) return null;

  // Minimum dormancy = full baseline window + gap from window end to first live event
  const baselineDays     = stats.days;
  const windowEndMs      = new Date(input.baseline.baselineWindowEnd).getTime();
  const earliestEventMs  = Math.min(...input.events.map(e => new Date(e.timestamp).getTime()));
  const gapDays          = Math.max(0, (earliestEventMs - windowEndMs) / (1000 * 60 * 60 * 24));
  const dormancyMinDays  = Math.round(baselineDays + gapDays);

  const eventTotal   = sumEventValues(input.events);
  const baseConf     = deriveConfidence(input.baseline, input.events);
  // Cap at 'medium': we can prove dormancy during the Dune window but cannot
  // confirm the full dormancy period without last_outgoing_tx_at from Dune.
  const confidence   = baseConf === 'high' ? 'medium' : baseConf;

  // Strength: based on revival volume and event count (no baseline to deviate from)
  let strength = 'low';
  if (eventTotal !== null && eventTotal >= 50_000)    strength = 'high';
  else if (eventTotal !== null && eventTotal >= opts.minSignalValueUSD) strength = 'medium';
  else if (input.events.length >= 3)                  strength = 'medium';

  const src = engineSource(detectedAt);
  const dq  = input.baseline.dataQuality;

  return makeWalletSignal({
    walletAddress: input.walletAddress,
    chain:         input.chain,
    signalType:    'dormant_wallet_revival',
    strength,
    confidence,
    windowStart:   input.windowStart,
    windowEnd:     input.windowEnd,
    detectedAt,
    evidence: {
      dormancyMinDays,
      baselineWindowDays: Math.round(baselineDays),
      gapDays:            Math.round(gapDays),
      revivalEventCount:  input.events.length,
      revivalVolumeUSD:   eventTotal,
      baselineTxCount:    0,
    },
    caveats: buildCaveats([
      `Dormancy inferred from zero transactions in the ${Math.round(baselineDays)}-day Dune baseline window; actual dormancy may be longer.`,
      'Last on-chain transaction date is not available from this data source — use Etherscan or a full transaction history for confirmation.',
      dq.isPartial && 'Baseline dataset is incomplete; dormancy inference may be imprecise.',
    ]),
    dataQuality: makeDataQuality({
      isEstimated: hasUnknownValues(input.events),
      isPartial:   true,  // full dormancy period is always unknown from this source
      confidence,
      sources:     gatherSources(input.baseline, input.events, src),
    }),
    sources: gatherSources(input.baseline, input.events, src),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all signal detectors against the provided input and return every
 * WalletSignal that passes its detection threshold.
 *
 * Signals are emitted in a stable order matching the DETECTORS array.
 * An empty array is a valid result — it means no signal thresholds were met.
 *
 * @param {SignalEngineInput}          input
 * @param {Partial<SignalEngineOptions>} [options]
 * @returns {import('../models/signals.js').WalletSignal[]}
 */
export function detectSignals(input, options = {}) {
  const opts      = { ...DEFAULT_OPTIONS, ...options };
  const detectedAt = new Date().toISOString();
  const stats      = input.baseline ? buildBaselineStats(input.baseline) : null;

  const DETECTORS = [
    detectAccumulation,
    detectDistribution,
    detectBridgeActivity,
    detectCexDeposit,
    detectCexWithdrawal,
    detectUnusualActivity,
    detectNewCounterparty,
    detectProtocolRotation,
    detectLargeMoveVsBaseline,
    detectDormancyRevival,
  ];

  return DETECTORS
    .map(fn => fn(input, stats, opts, detectedAt))
    .filter(Boolean);
}

export {
  buildBaselineStats,
  // individual detectors exported for unit testing
  detectAccumulation,
  detectDistribution,
  detectBridgeActivity,
  detectCexDeposit,
  detectCexWithdrawal,
  detectUnusualActivity,
  detectNewCounterparty,
  detectProtocolRotation,
  detectLargeMoveVsBaseline,
  detectDormancyRevival,
};
