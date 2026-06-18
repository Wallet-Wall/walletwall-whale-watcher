/**
 * Deterministic NarrativeCard builder — issue #105.
 *
 * Converts WalletSignal[] into a NarrativeCard without any AI API calls.
 * Signals must come from the deterministic signal engine (#104).
 *
 * The AI layer (api/analyze.js) may optionally refine the text, but the
 * output of this module is correct and complete without AI involvement.
 */

import { makeNarrativeCard, makeNarrativeInput } from '../models/narrative.js';
import { formatUSD, formatEvidenceLine, formatSourceFootnotes } from './formatter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONF_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Card-level confidence is taken from the primary (highest-ranked) signal.
 * Using the minimum across all signals causes a single low-confidence label-
 * match to drag down an otherwise high-confidence card, which is misleading.
 * Individual signal confidence is preserved in each WalletSignal object.
 */
function cardConfidence(signals) {
  const sorted = sortedSignals(signals);
  return sorted[0]?.confidence ?? 'medium';
}

function signalToCardType(signalType) {
  switch (signalType) {
    case 'accumulation':
    case 'distribution':
      return 'whale_watcher';
    case 'bridge':
    case 'cex_deposit':
    case 'cex_withdrawal':
    case 'new_counterparty':
      return 'intel_brief';
    case 'dormant_wallet_revival':
      return 'intel_brief';
    case 'protocol_rotation':
    case 'protocol_entry':
    case 'protocol_exit':
      return 'defi_digest';
    case 'staking_entry':
    case 'staking_exit':
      return 'staking_update';
    default:
      return 'intel_brief';
  }
}

function makeDeterministicCardId(walletAddress, signalType, windowStart) {
  const input = `${walletAddress.toLowerCase()}:${signalType}:${windowStart}`;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) ^ input.codePointAt(i)) >>> 0;
  }
  return `card-${h.toString(16).padStart(8, '0')}`;
}

function sortedSignals(signals) {
  return [...signals].sort((a, b) => {
    const cd = (CONF_RANK[b.confidence] ?? 2) - (CONF_RANK[a.confidence] ?? 2);
    if (cd !== 0) return cd;
    return (CONF_RANK[b.strength] ?? 2) - (CONF_RANK[a.strength] ?? 2);
  });
}

function gatherUniqueSources(signals) {
  const seen = new Set();
  const out  = [];
  for (const sig of signals) {
    for (const src of sig.sources) {
      if (!seen.has(src.sourceId)) {
        seen.add(src.sourceId);
        out.push(src);
      }
    }
  }
  return out;
}

function gatherUniqueCaveats(signals) {
  const seen = new Set();
  const out  = [];
  for (const sig of signals) {
    for (const c of sig.caveats) {
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
  }
  return out;
}

// ── Headline generation ───────────────────────────────────────────────────────

const HEADLINE_FNS = {
  accumulation(signal) {
    const { netInflowUSD, primaryToken, baselineDays } = signal.evidence;
    const v    = formatUSD(netInflowUSD);
    const token = primaryToken ? ` in ${primaryToken}` : '';
    const days  = baselineDays ? ` over ${baselineDays} days` : '';
    return v ? `Wallet accumulated ${v}${token}${days}` : 'Sustained accumulation detected';
  },
  distribution(signal) {
    const { netOutflowUSD, primaryToken, baselineDays } = signal.evidence;
    const v     = formatUSD(netOutflowUSD);
    const token = primaryToken ? ` in ${primaryToken}` : '';
    const days  = baselineDays ? ` over ${baselineDays} days` : '';
    return v ? `Wallet distributed ${v}${token}${days}` : 'Sustained distribution detected';
  },
  bridge(signal) {
    const { bridgeEventCount, bridgeVolumeUSD } = signal.evidence;
    const v = formatUSD(bridgeVolumeUSD);
    const plural = bridgeEventCount === 1 ? '' : 's';
    const n = bridgeEventCount
      ? `${bridgeEventCount} cross-chain bridge transaction${plural}`
      : 'Cross-chain bridge activity';
    return v ? `${n} totaling ${v}` : `${n} detected`;
  },
  cex_deposit(signal) {
    const { depositVolumeUSD, cexNames } = signal.evidence;
    const v    = formatUSD(depositVolumeUSD);
    const dest = cexNames?.length ? ` to ${cexNames[0]}` : '';
    return v ? `CEX deposit${dest}: ${v} moved off-chain` : `CEX deposit activity${dest} detected`;
  },
  cex_withdrawal(signal) {
    const { withdrawalVolumeUSD, cexNames } = signal.evidence;
    const v   = formatUSD(withdrawalVolumeUSD);
    const src = cexNames?.length ? ` from ${cexNames[0]}` : '';
    return v ? `CEX withdrawal${src}: ${v} moved on-chain` : `CEX withdrawal activity${src} detected`;
  },
  unusual_activity(signal) {
    const { volumeDeviationRatio, windowDays: wDays } = signal.evidence;
    const mult = volumeDeviationRatio == null
      ? null : `${+Number(volumeDeviationRatio).toFixed(1)}×`;
    const days = wDays ? ` over ${wDays} days` : '';
    return mult
      ? `Volume ${mult} above baseline${days} — worth monitoring`
      : 'Unusual on-chain activity detected';
  },
  new_counterparty(signal) {
    const { newCounterpartyCount, totalNewVolumeUSD } = signal.evidence;
    const v = formatUSD(totalNewVolumeUSD);
    const n = newCounterpartyCount ?? 0;
    const totalStr = v ? `, ${v} total` : '';
    return `${n} new high-value counterpart${n === 1 ? 'y' : 'ies'}${totalStr} detected`;
  },
  protocol_rotation(signal) {
    const { newProtocolLabels, volumeShare, previousPrimaryProtocol } = signal.evidence;
    const newP = newProtocolLabels?.[0] ?? 'new protocol';
    const pct  = volumeShare == null ? '' : ` (${Math.round(volumeShare * 100)}% of volume)`;
    const prev = previousPrimaryProtocol ? `, shifting from ${previousPrimaryProtocol}` : '';
    return `Activity consistent with protocol rotation toward ${newP}${pct}${prev}`;
  },
  dormant_wallet_revival(signal) {
    const { dormancyMinDays, revivalVolumeUSD, revivalEventCount } = signal.evidence;
    const days    = dormancyMinDays ? `${dormancyMinDays}+` : 'unknown number of';
    const vol     = revivalVolumeUSD == null ? '' : ` — $${(revivalVolumeUSD / 1000).toFixed(0)}K in activity`;
    const txCount = revivalEventCount > 1 ? ` (${revivalEventCount} transactions)` : '';
    return `Dormant wallet revived after ${days} days${txCount}${vol}`;
  },
  large_move_vs_baseline(signal) {
    const { largestEventValueUSD, deviationVsDailyAvg, largestEventType } = signal.evidence;
    const v    = formatUSD(largestEventValueUSD);
    const type = largestEventType ? ` ${largestEventType}` : '';
    const mult = deviationVsDailyAvg == null
      ? '' : ` (${+Number(deviationVsDailyAvg).toFixed(1)}× daily avg)`;
    return v
      ? `Single${type} of ${v}${mult} — large move vs baseline`
      : 'Large single move detected';
  },
};

// Alias for signal types that share evidence shape with unusual_activity
HEADLINE_FNS.unusual_volume = HEADLINE_FNS.unusual_activity;

function generateHeadline(primarySignal) {
  const fn       = HEADLINE_FNS[primarySignal.signalType];
  const headline = fn
    ? fn(primarySignal)
    : `${primarySignal.signalType.replaceAll('_', ' ')} detected`;
  return headline.slice(0, 120);
}

// ── Body + keyPoints generation ───────────────────────────────────────────────

function generateBody(signals, sources) {
  const sorted  = sortedSignals(signals);
  const primary = sorted[0];

  const primaryLine = formatEvidenceLine(primary.signalType, primary.evidence)
    ?? `${primary.signalType.replaceAll('_', ' ')} detected`;

  const confidenceNote = primary.confidence === 'high'
    ? ''
    : ` Confidence is ${primary.confidence} — treat as a flag for further review, not a confirmed conclusion.`;

  const secondaryLines = sorted.slice(1, 4)
    .map(s => formatEvidenceLine(s.signalType, s.evidence))
    .filter(Boolean);
  const secondaryText = secondaryLines.length > 0
    ? ` Additionally: ${secondaryLines.join('; ')}.`
    : '';

  const footnote = formatSourceFootnotes(sources);
  const footnoteText = footnote ? ` ${footnote}.` : '';

  return `${primaryLine}.${secondaryText}${confidenceNote}${footnoteText}`.trim();
}

function generateKeyPoints(signals, sources) {
  const sorted = sortedSignals(signals);
  const points = [];

  for (const sig of sorted.slice(0, 5)) {
    const line = formatEvidenceLine(sig.signalType, sig.evidence);
    if (line) points.push(line);
  }

  const footnoteLine = formatSourceFootnotes(sources);
  if (footnoteLine) points.push(footnoteLine);

  return points.slice(0, 6);
}

// ── Public API ────────────────────────────────────────────────────────────────

const FINANCIAL_ADVICE_CAVEAT =
  'This narrative is based on publicly available on-chain data and does not constitute financial or investment advice.';

/**
 * Build a deterministic NarrativeCard from a non-empty WalletSignal array.
 *
 * Returns null if signals is empty — a card with no signal backing is never produced.
 *
 * @param {import('../models/signals.js').WalletSignal[]} signals
 * @param {Object} [opts]
 * @param {string} [opts.cardId]       - override the generated card ID
 * @param {string} [opts.generatedAt]  - override the generation timestamp (useful for tests)
 * @returns {import('../models/narrative.js').NarrativeCard|null}
 */
export function buildNarrativeCard(signals, opts = {}) {
  if (!Array.isArray(signals) || signals.length === 0) return null;

  const sorted  = sortedSignals(signals);
  const primary = sorted[0];

  const sources    = gatherUniqueSources(signals);
  const caveats    = gatherUniqueCaveats(signals);
  const confidence = cardConfidence(signals);

  if (!caveats.some(c => c.toLowerCase().includes('not constitute'))) {
    caveats.push(FINANCIAL_ADVICE_CAVEAT);
  }

  return makeNarrativeCard({
    cardId:        opts.cardId ?? makeDeterministicCardId(primary.walletAddress, primary.signalType, primary.windowStart),
    walletAddress: primary.walletAddress,
    headline:      generateHeadline(primary),
    body:          generateBody(signals, sources),
    keyPoints:     generateKeyPoints(signals, sources),
    cardType:      signalToCardType(primary.signalType),
    confidence,
    caveats,
    generatedAt:   opts.generatedAt ?? new Date().toISOString(),
    sources,
    signals,
  });
}

/**
 * Build a NarrativeInput ready to pass to api/analyze.js.
 *
 * Returns null if signals is empty.
 *
 * @param {import('../models/signals.js').WalletSignal[]} signals
 * @param {import('../models/historical-baseline.js').HistoricalWalletBaseline|null} [baseline]
 * @param {import('../models/live-events.js').LiveWalletEvent[]} [events]
 * @param {Object} [opts]
 * @param {string[]} [opts.focusTopics]
 * @param {import('../models/narrative.js').NarrativeTone} [opts.requestedTone]
 * @returns {import('../models/narrative.js').NarrativeInput|null}
 */
export function buildNarrativeInput(signals, baseline = null, events = [], opts = {}) {
  if (!Array.isArray(signals) || signals.length === 0) return null;

  const autoTopics  = [...new Set(signals.map(s => s.signalType))];
  const focusTopics = opts.focusTopics?.length ? opts.focusTopics : autoTopics;

  return makeNarrativeInput({
    walletAddress: signals[0].walletAddress,
    chain:         signals[0].chain,
    signals,
    baseline:      baseline ?? null,
    recentEvents:  Array.isArray(events) ? events : [],
    focusTopics,
    requestedTone: opts.requestedTone ?? null,
  });
}
