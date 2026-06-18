/**
 * Adapter: bridges WhaleWatcher inputs (walletData, dune12wData) into the
 * formal HistoricalWalletBaseline + LiveWalletEvent shapes that detectSignals
 * expects, then returns the resulting WalletSignal[].
 *
 * Returns [] for synthetic nodes (no fullAddress), when data is insufficient,
 * or when detectSignals finds nothing actionable — the caller always gets a
 * valid array back.
 */

import { detectSignals } from '../data/signals/engine.js';
import { makeHistoricalWalletBaseline } from '../data/models/historical-baseline.js';
import { makeLiveWalletEvent } from '../data/models/live-events.js';
import { makeSourceMetadata, makeDataQuality } from '../data/models/source-metadata.js';
import { walletDataToBaseline } from '../data/adapters/walletDataAdapter.js';

// ── Timestamp normalisation ───────────────────────────────────────────────────

function tsToIso(ts) {
  if (!ts) return new Date().toISOString();
  let ms;
  if (typeof ts === 'number') {
    ms = ts < 1e12 ? ts * 1000 : ts;
  } else if (typeof ts === 'string' && /^\d+$/.test(ts)) {
    const n = Number.parseInt(ts, 10);
    ms = n < 1e12 ? n * 1000 : n;
  } else {
    ms = new Date(ts).getTime();
  }
  const d = new Date(Number.isFinite(ms) ? ms : Number.NaN);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

// ── Baseline builder from Dune 12w heatmap data ───────────────────────────────

/**
 * Build a partial HistoricalWalletBaseline from dune12wData activity entries.
 * Returns null when data is absent or too sparse to be useful as a baseline.
 *
 * @param {string} address
 * @param {object|null} dune12wData
 * @returns {import('../data/models/historical-baseline.js').HistoricalWalletBaseline|null}
 */
export function buildBaselineFrom12w(address, dune12wData) {
  const entry = dune12wData?.wallets?.[address.toLowerCase()];
  if (!entry?.activity12w?.length) return null;

  const days = entry.activity12w.filter(d => d.date && d.usd_volume != null && d.usd_volume > 0);
  if (days.length < 7) return null;

  const totalVolumeUSD = days.reduce((s, d) => s + (d.usd_volume || 0), 0);
  const txCount = days.reduce((s, d) => s + (d.tx_count || 0), 0);
  if (!totalVolumeUSD) return null;

  const ts = days
    .map(d => new Date(d.date).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const meta = dune12wData.metadata ?? {};
  const source = makeSourceMetadata({
    sourceId:   'dune-12w-activity',
    sourceType: 'dune_scheduled',
    queryRunAt: meta.queryRunAt ?? null,
    fetchedAt:  meta.queryRunAt ?? new Date().toISOString(),
    isCached:   !!meta.queryRunAt,
  });

  return makeHistoricalWalletBaseline({
    walletAddress:        address.toLowerCase(),
    chain:                'ethereum',
    baselineWindowStart:  new Date(ts[0]).toISOString(),
    baselineWindowEnd:    new Date(ts[ts.length - 1]).toISOString(),
    totalVolumeUSD,
    totalVolumeEstimated: true,
    txCount,
    uniqueCounterparties: null,
    topTokenFlows:        [],
    topCounterparties:    [],
    protocolUsage:        [],
    dataQuality: makeDataQuality({
      isEstimated: true,
      isPartial:   true,
      confidence:  'medium',
      sources:     [source],
    }),
    source,
  });
}

// ── Live-event converter from raw wallet transactions ─────────────────────────

/**
 * Convert raw API transactions (walletData.transactions) to LiveWalletEvent[].
 *
 * @param {object[]} txs
 * @param {string}   address
 * @returns {import('../data/models/live-events.js').LiveWalletEvent[]}
 */
export function txsToLiveEvents(txs, address) {
  if (!Array.isArray(txs) || !address) return [];
  const addrLc = address.toLowerCase();
  const source = makeSourceMetadata({
    sourceId:   'wallet-api-live',
    sourceType: 'etherscan',
    fetchedAt:  new Date().toISOString(),
    isCached:   true,
  });
  return txs.map(tx => {
    const hasValue = typeof tx.valueUSD === 'number' && tx.valueUSD > 0;
    return makeLiveWalletEvent({
      txHash:              tx.hash ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      walletAddress:       address,
      chain:               'ethereum',
      timestamp:           tsToIso(tx.timeStamp),
      eventType:           tx.eventType ?? 'transfer',
      valueUSD:            hasValue ? tx.valueUSD : null,
      valueEstimated:      !hasValue,
      counterpartyAddress: tx.from?.toLowerCase() === addrLc ? (tx.to ?? null) : (tx.from ?? null),
      counterpartyLabel:   tx.toLabel ?? tx.fromLabel ?? null,
      source,
      dataQuality: makeDataQuality({
        confidence:  hasValue ? 'medium' : 'low',
        isEstimated: !hasValue,
        sources:     [source],
      }),
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derive WalletSignals for a real wallet address using the full signal engine.
 *
 * Uses Dune 12w heatmap data as a partial HistoricalWalletBaseline when
 * available, and converts raw wallet transactions to LiveWalletEvents.
 * Signals are limited to those the engine can detect without token-level or
 * counterparty-level breakdown (i.e. large_move_vs_baseline and
 * unusual_activity from the baseline aggregate; bridge/cex if transaction
 * labels are present in walletData).
 *
 * Returns [] for synthetic nodes (no node.fullAddress) or when data is absent.
 *
 * @param {object|null} node
 * @param {object|null} walletData
 * @param {object|null} dune12wData
 * @returns {import('../data/models/signals.js').WalletSignal[]}
 */
export function deriveWhaleWatcherSignals(node, walletData, dune12wData) {
  const address = node?.fullAddress;
  if (!address) return [];

  const events   = txsToLiveEvents(walletData?.transactions ?? [], address);
  const baseline = buildBaselineFrom12w(address, dune12wData)
    ?? (walletData ? walletDataToBaseline(walletData) : null);

  const windowEnd   = new Date().toISOString();
  const windowStart = baseline?.baselineWindowStart
    ?? new Date(Date.now() - 30 * 86_400_000).toISOString();

  return detectSignals({
    walletAddress: address,
    chain:         'ethereum',
    baseline,
    events,
    windowStart,
    windowEnd,
  });
}
