/**
 * walletDataAdapter — issue #70.
 *
 * Adapts the api/wallet.js walletData response shape to the model-layer types
 * expected by the signal engine (#104) and narrative engine (#105).
 *
 * This adapter provides an estimated "implementation-readiness" baseline derived
 * from Etherscan, serving as a best-effort bridge until full Dune scheduled/cached
 * query integration is complete.
 *
 * walletData is sourced from Etherscan (transactions, max 200) plus CoinGecko
 * (retroactive USD prices).  This imposes hard limits on confidence:
 *
 *   - Confidence is capped at 'medium' — never 'high'.
 *   - isEstimated is always true (prices applied retroactively).
 *   - isPartial is true when the wallet has more transactions than the
 *     200-transaction sample limit.
 *   - Token flow direction is 'net' because node aggregates don't preserve
 *     inbound vs outbound breakdown; a full Dune query would be needed for 'in'/'out'.
 *
 * These are intentional limitations, not bugs.  The signal engine's confidence
 * degradation rules handle them correctly.
 */

import { makeHistoricalWalletBaseline } from '../models/historical-baseline.js';
import { makeLiveWalletEvent }           from '../models/live-events.js';
import { makeSourceMetadata, makeDataQuality } from '../models/source-metadata.js';

const ETHERSCAN_SAMPLE_LIMIT = 200;
const MAX_LIVE_EVENTS        = 50;

// ── Internal helpers ──────────────────────────────────────────────────────────

function numericTimestampToISO(n) {
  const ms = n < 1e12 ? n * 1000 : n;
  const d  = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toISO(ts) {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === 'number') return numericTimestampToISO(ts);
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) return numericTimestampToISO(Number.parseInt(ts, 10));
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function buildCounterpartyMap(txs, walletLc) {
  const cpMap = new Map();
  for (const tx of txs) {
    const from = tx.from?.toLowerCase();
    const to   = tx.to?.toLowerCase();
    if (!from || !to) continue;
    const other = from === walletLc ? to : from;
    if (other === walletLc) continue;
    const entry = cpMap.get(other) ?? {
      address: other, label: null, volumeUSD: 0, txCount: 0, counterpartyType: 'wallet',
    };
    entry.volumeUSD += tx.valueUSD ?? 0;
    entry.txCount   += 1;
    cpMap.set(other, entry);
  }
  return cpMap;
}

function enrichWithProtocolLabels(cpMap, nodes) {
  for (const n of nodes) {
    if (n.type !== 'defi' && n.type !== 'protocol') continue;
    const addrLc = n.fullAddress?.toLowerCase();
    if (!addrLc) continue;
    const entry = cpMap.get(addrLc);
    if (entry) {
      entry.label            = n.label ?? entry.label;
      entry.counterpartyType = 'protocol';
    }
  }
}

function etherscanSource(fetchedAt) {
  return makeSourceMetadata({
    sourceId:   'etherscan-wallet-api',
    sourceType: 'etherscan',
    fetchedAt,
    isCached:   false,
    queryId:    null,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a best-effort HistoricalWalletBaseline from api/wallet.js walletData.
 *
 * @param {Object|null}  walletData
 * @param {Object}       [opts]
 * @param {string}       [opts.fetchedAt]  ISO timestamp of when walletData was fetched
 * @returns {import('../models/historical-baseline.js').HistoricalWalletBaseline}
 */
export function walletDataToBaseline(walletData, opts = {}) {
  const data          = walletData ?? {};
  const walletAddress = data.address ?? '0x0000000000000000000000000000000000000000';
  const dq            = data.dataQuality ?? {};
  const fetchedAt     = opts.fetchedAt ?? new Date().toISOString();

  const src         = etherscanSource(fetchedAt);
  const txCount     = data.txCount ?? (data.transactions?.length ?? 0);
  const isSampled   = txCount > ETHERSCAN_SAMPLE_LIMIT;

  const warnings = [
    `Etherscan returns at most ${ETHERSCAN_SAMPLE_LIMIT} recent transactions; full history is not loaded.`,
    'USD values are estimated from CoinGecko prices applied retroactively.',
    ...(Array.isArray(dq.warnings) ? dq.warnings : []),
  ].filter(Boolean);

  const isPartial   = isSampled || (dq.isPartial ?? false);
  const confidence  = dq.isFallback ? 'low' : 'medium';

  const dataQuality = makeDataQuality({
    isEstimated: true,
    isPartial,
    isFallback:  dq.isFallback ?? false,
    confidence,
    warnings,
    sources:     [src],
  });

  const nodes        = data.nodes         ?? [];
  const txs          = data.transactions  ?? [];
  const walletLc     = walletAddress.toLowerCase();

  // ── Token flows ─────────────────────────────────────────────────────────────
  const topTokenFlows = nodes
    .filter(n => n.type === 'token' && (n.volumeUSD ?? 0) > 0)
    .sort((a, b) => (b.volumeUSD ?? 0) - (a.volumeUSD ?? 0))
    .slice(0, 10)
    .map(n => ({
      tokenSymbol:      n.label ?? 'UNKNOWN',
      tokenAddress:     n.fullAddress ?? null,
      volumeUSD:        n.volumeUSD ?? 0,
      volumeEstimated:  n.volumeEstimated ?? true,
      direction:        'net',
      txCount:          n.interactions ?? 0,
    }));

  // ── Counterparties from raw transactions ─────────────────────────────────────
  const cpMap = buildCounterpartyMap(txs, walletLc);
  enrichWithProtocolLabels(cpMap, nodes);

  const topCounterparties = [...cpMap.values()]
    .sort((a, b) => b.volumeUSD - a.volumeUSD)
    .slice(0, 10);

  // ── Protocol usage ───────────────────────────────────────────────────────────
  const protocolUsage = nodes
    .filter(n => (n.type === 'defi' || n.type === 'protocol') && (n.volumeUSD ?? 0) > 0)
    .sort((a, b) => (b.volumeUSD ?? 0) - (a.volumeUSD ?? 0))
    .slice(0, 10)
    .map(n => ({
      protocolName:           n.label ?? 'Unknown',
      protocolAddress:        n.fullAddress ?? null,
      protocolType:           n.type === 'defi' ? 'defi' : 'other',
      volumeUSD:              n.volumeUSD ?? 0,
      txCount:                n.interactions ?? 0,
      attributionConfidence:  'medium',
    }));

  // ── Window ───────────────────────────────────────────────────────────────────
  const baselineWindowStart =
    toISO(data.firstSeen)  ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const baselineWindowEnd   =
    toISO(data.lastActive) ?? new Date().toISOString();

  const totalVolumeUSD =
    topTokenFlows.reduce((s, f) => s + f.volumeUSD, 0) || data.totalValueUSD || 0;

  return makeHistoricalWalletBaseline({
    walletAddress,
    chain:                'ethereum',
    baselineWindowStart,
    baselineWindowEnd,
    totalVolumeUSD,
    totalVolumeEstimated:  true,
    txCount,
    uniqueCounterparties:  cpMap.size > 0 ? cpMap.size : null,
    topTokenFlows,
    topCounterparties,
    protocolUsage,
    dataQuality,
    source:                src,
  });
}

/**
 * Build LiveWalletEvent[] from api/wallet.js transactions.
 *
 * Returns at most MAX_LIVE_EVENTS (50), sorted most-recent first.
 *
 * @param {Object|null}  walletData
 * @param {Object}       [opts]
 * @param {string}       [opts.fetchedAt]
 * @returns {import('../models/live-events.js').LiveWalletEvent[]}
 */
export function walletDataToLiveEvents(walletData, opts = {}) {
  const data          = walletData ?? {};
  const walletAddress = data.address ?? '0x0000000000000000000000000000000000000000';
  const fetchedAt     = opts.fetchedAt ?? new Date().toISOString();
  const txs           = data.transactions ?? [];

  const src = etherscanSource(fetchedAt);
  const dq  = makeDataQuality({ isEstimated: true, confidence: 'medium', sources: [src] });

  return txs
    .slice()
    .sort((a, b) => {
      const ta = toISO(a.timeStamp) ?? '';
      const tb = toISO(b.timeStamp) ?? '';
      return tb.localeCompare(ta);
    })
    .slice(0, MAX_LIVE_EVENTS)
    .map(tx => {
      const counterparty = tx.from?.toLowerCase() === walletAddress.toLowerCase()
        ? tx.to
        : tx.from;
      return makeLiveWalletEvent({
        txHash:              tx.hash    ?? '0x0',
        walletAddress,
        chain:               'ethereum',
        timestamp:           toISO(tx.timeStamp) ?? fetchedAt,
        eventType:           tx.tokenSymbol ? 'token_transfer' : 'transfer',
        valueUSD:            tx.valueUSD ?? null,
        valueEstimated:      true,
        tokenSymbol:         tx.tokenSymbol ?? null,
        counterpartyAddress: counterparty   ?? null,
        counterpartyLabel:   null,
        dataQuality:         dq,
        source:              src,
      });
    });
}
