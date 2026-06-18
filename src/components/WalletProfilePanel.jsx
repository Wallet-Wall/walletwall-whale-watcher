import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import DataSourceBadge from './DataSourceBadge.jsx';
import { fmtAddress, fmtTx, fmtUSD } from '../lib/holder-wall-formatting.js';
import { deriveAdversarialSignals } from '../lib/adversarial-heuristics.js';
import { walletDataToBaseline, walletDataToLiveEvents } from '../data/adapters/walletDataAdapter.js';
import WalletHoldingsStrip from './WalletHoldingsStrip.jsx';
import ActivityHeatmap from './ActivityHeatmap.jsx';
import { useWatchlist } from '../hooks/useWatchlist.js';

const INK = (a) => `rgba(30,26,20,${a})`;
const P = '#BF4E32';
const INBOUND = '#2F6F62';
const MAX_FLOW_EVENTS = 50;
const MAX_FLOW_COUNTERPARTIES = 10;

function formatDate(value) {
  if (!value) return '-';
  const date = /^\d+$/.test(String(value))
    ? new Date(Number(value) * 1000)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

// Relative-time label ("2 days ago"), falling back to the ISO date.
function relativeTime(value) {
  if (!value) return null;
  const ms = /^\d+$/.test(String(value)) ? Number(value) * 1000 : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Transfer/flow USD values are estimated and frequently sub-dollar or missing;
// rendering a literal "$0" everywhere reads as broken, so degrade honestly.
function fmtFlowUSD(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1) return '<$1';
  return fmtUSD(n);
}

function buildProfileNode(address, walletData) {
  return {
    id: address,
    fullAddress: address,
    label: walletData?.ens || fmtAddress(address),
    type: 'wallet',
  };
}

function normalizeAddressValue(value) {
  return String(value || '').trim().toLowerCase();
}

function toTxDateValue(value) {
  if (!value) return 0;
  const parsed = /^\d+$/.test(String(value))
    ? Number(value) * 1000
    : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCounterpartyLabel(address, nodes = []) {
  const key = normalizeAddressValue(address);
  const node = nodes.find(item => normalizeAddressValue(item.fullAddress) === key);
  return node?.label || null;
}

function dominantTransferDirection(item) {
  if (item.outUsd > item.inUsd) return 'out';
  if (item.inUsd > item.outUsd) return 'in';
  return item.outCount >= item.inCount ? 'out' : 'in';
}

function buildTransferFlowModel(walletData, limit = MAX_FLOW_EVENTS) {
  const wallet = normalizeAddressValue(walletData?.address);
  const transactions = Array.isArray(walletData?.transactions) ? walletData.transactions : [];
  if (!wallet || transactions.length === 0) return { events: [], counterparties: [] };

  const events = transactions
    .slice()
    .sort((a, b) => toTxDateValue(b.timeStamp) - toTxDateValue(a.timeStamp))
    .slice(0, limit)
    .map((tx) => {
      const from = normalizeAddressValue(tx.from);
      const to = normalizeAddressValue(tx.to);
      const direction = from === wallet ? 'out' : 'in';
      const counterparty = direction === 'out' ? to : from;
      return {
        txHash: tx.hash || `${from}-${to}-${tx.timeStamp}`,
        direction,
        counterparty,
        counterpartyLabel: getCounterpartyLabel(counterparty, walletData?.nodes || []),
        tokenSymbol: tx.tokenSymbol || 'ETH',
        valueUSD: Number.isFinite(Number(tx.valueUSD)) ? Number(tx.valueUSD) : 0,
        timestamp: tx.timeStamp,
      };
    })
    .filter(event => event.counterparty && event.counterparty !== wallet);

  const byCounterparty = new Map();
  for (const event of events) {
    const current = byCounterparty.get(event.counterparty) || {
      address: event.counterparty,
      label: event.counterpartyLabel,
      inUsd: 0, outUsd: 0, inCount: 0, outCount: 0,
      latestTimestamp: event.timestamp,
    };
    if (event.direction === 'out') { current.outUsd += event.valueUSD; current.outCount += 1; }
    else { current.inUsd += event.valueUSD; current.inCount += 1; }
    if (toTxDateValue(event.timestamp) > toTxDateValue(current.latestTimestamp)) {
      current.latestTimestamp = event.timestamp;
    }
    byCounterparty.set(event.counterparty, current);
  }

  const counterparties = [...byCounterparty.values()]
    .map(item => ({
      ...item,
      totalUsd: item.inUsd + item.outUsd,
      totalCount: item.inCount + item.outCount,
      dominantDirection: dominantTransferDirection(item),
    }))
    .sort((a, b) => (b.totalUsd || b.totalCount) - (a.totalUsd || a.totalCount))
    .slice(0, MAX_FLOW_COUNTERPARTIES);

  // Sample-level aggregates for the net-flow summary.
  const totals = events.reduce((acc, e) => {
    if (e.direction === 'in') { acc.inUsd += e.valueUSD; acc.inCount += 1; }
    else { acc.outUsd += e.valueUSD; acc.outCount += 1; }
    return acc;
  }, { inUsd: 0, outUsd: 0, inCount: 0, outCount: 0 });

  return { events, counterparties, totals };
}

// Daily transaction-count timeline for the activity heatmap. Counts are
// reliable even where per-transfer USD is missing, so the cadence stays
// honest — it reflects the sampled transfers, not the wallet's full history.
function buildActivityTimeline(walletData) {
  const txs = Array.isArray(walletData?.transactions) ? walletData.transactions : [];
  if (txs.length === 0) return [];
  const byDay = new Map();
  for (const tx of txs) {
    const ms = toTxDateValue(tx.timeStamp);
    if (!ms) continue;
    const date = new Date(ms).toISOString().slice(0, 10);
    byDay.set(date, (byDay.get(date) || 0) + 1);
  }
  return [...byDay.entries()].map(([date, txCount]) => ({ date, txCount }));
}

// Structural / activity descriptors and elevated risk signals are presented
// in separate groups so a long risk caveat never sits inline as a "pill".
function behaviorLabels(walletData, baseline, adversarialSignals) {
  const structural = [];
  const risk = [];
  const txCount = walletData?.txCount ?? 0;
  const cpCount = baseline?.uniqueCounterparties ?? 0;

  if (txCount <= 5) structural.push({ label: 'Fresh wallet', tone: 'muted' });
  if (txCount >= 75) structural.push({ label: 'High activity', tone: 'warn' });
  if (cpCount >= 10) structural.push({ label: 'Broad counterparty set', tone: 'safe' });
  if (walletData?.dataQuality?.isPartial) structural.push({ label: 'Sampled history', tone: 'warn' });

  const elevated = Object.entries(adversarialSignals || {})
    .filter(([, s]) => (s?.score ?? 0) >= 0.5)
    .sort(([, a], [, b]) => (b?.score ?? 0) - (a?.score ?? 0))
    .slice(0, 3);

  for (const [, signal] of elevated) {
    risk.push({ label: signal.reason, tone: signal.score >= 0.75 ? 'risk' : 'warn' });
  }

  if (!structural.length) structural.push({ label: 'Low signal volume', tone: 'muted' });
  return { structural, risk };
}

// Deterministic 5×5 mirrored identicon derived from the address — gives every
// wallet a recognisable visual fingerprint without an external dependency.
function Identicon({ address, size = 52 }) {
  const { cells, color } = useMemo(() => {
    const seed = String(address || '0x0').toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hue = Math.abs(h) % 360;
    const grid = [];
    let r = h >>> 0;
    for (let i = 0; i < 15; i += 1) {
      r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
      grid.push((r & 0xff) > 132);
    }
    const out = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const mirrored = col < 3 ? col : 4 - col;
        out.push(grid[row * 3 + mirrored]);
      }
    }
    return { cells: out, color: `hsl(${hue}, 42%, 46%)` };
  }, [address]);

  const unit = size / 5;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Wallet identicon"
      style={{ borderRadius: 8, border: '1px solid rgba(30,26,20,0.10)', background: 'rgba(255,252,246,0.9)', flexShrink: 0 }}
    >
      {cells.map((on, i) => on && (
        <rect
          key={i}
          x={(i % 5) * unit}
          y={Math.floor(i / 5) * unit}
          width={unit}
          height={unit}
          fill={color}
        />
      ))}
    </svg>
  );
}

Identicon.propTypes = { address: PropTypes.string, size: PropTypes.number };

// A single counterparty row with a proportional inline bar.
function ProportionRow({ label, href, value, meta, fraction, tone }) {
  const [hover, setHover] = useState(false);
  const accent = tone === 'in' ? INBOUND : tone === 'out' ? P : INK(0.4);
  const Label = href ? 'a' : 'span';
  const rowTitle = meta ? `${label} — ${value} (${meta})` : `${label} — ${value}`;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={rowTitle}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center',
        padding: '2px 4px', margin: '-2px -4px', borderRadius: 3,
        background: hover ? 'rgba(30,26,20,0.035)' : 'transparent',
        transition: 'background 0.12s ease',
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <Label
            href={href}
            target={href ? '_blank' : undefined}
            rel={href ? 'noreferrer' : undefined}
            style={{
              fontSize: 12.5, fontWeight: 700, color: hover && href ? P : INK(0.82),
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: 'none', transition: 'color 0.12s ease',
            }}
            title={label}
          >
            {label}
          </Label>
          <span style={{ fontSize: 12, color: INK(0.6), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        </div>
        <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'rgba(30,26,20,0.06)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(30,26,20,0.06)' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${Math.max(3, Math.min(100, fraction * 100))}%`, background: accent, opacity: hover ? 0.92 : 0.62, borderRadius: 3, transition: 'opacity 0.12s ease' }} />
        </div>
      </div>
      {meta && <span style={{ fontSize: 10.5, color: INK(0.4), whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{meta}</span>}
    </div>
  );
}

ProportionRow.propTypes = {
  label: PropTypes.string,
  href: PropTypes.string,
  value: PropTypes.node,
  meta: PropTypes.node,
  fraction: PropTypes.number,
  tone: PropTypes.oneOf(['in', 'out', 'neutral']),
};

// Only build a link for a well-formed 0x address. Validating against a fixed
// hex charset both avoids dead links for non-address values (ENS, protocol
// names) and prevents any untrusted value from reaching the anchor href —
// e.g. a `javascript:` URI (CodeQL js/xss-through-dom).
function etherscanAddress(address) {
  const addr = String(address ?? '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
    ? `https://etherscan.io/address/${addr}`
    : undefined;
}

// Two-column inflow/outflow ledger — replaces the previous SVG sankey, which
// distorted badly (preserveAspectRatio="none" stretched strokes into wedges).
function TransferFlowLedger({ model }) {
  const nodes = model.counterparties || [];
  const totals = model.totals || { inUsd: 0, outUsd: 0, inCount: 0, outCount: 0 };
  const hasData = nodes.length > 0;
  const usdMode = (totals.inUsd + totals.outUsd) > 0;

  const inflows = nodes
    .filter(n => n.inCount > 0)
    .sort((a, b) => (usdMode ? b.inUsd - a.inUsd : b.inCount - a.inCount))
    .slice(0, 6);
  const outflows = nodes
    .filter(n => n.outCount > 0)
    .sort((a, b) => (usdMode ? b.outUsd - a.outUsd : b.outCount - a.outCount))
    .slice(0, 6);

  const maxIn = Math.max(1, ...inflows.map(n => (usdMode ? n.inUsd : n.inCount)));
  const maxOut = Math.max(1, ...outflows.map(n => (usdMode ? n.outUsd : n.outCount)));

  const netUsd = totals.inUsd - totals.outUsd;
  const netLabel = usdMode
    ? `${netUsd >= 0 ? '+' : '−'}${fmtFlowUSD(Math.abs(netUsd))}`
    : `${totals.inCount} in · ${totals.outCount} out`;

  const column = (title, rows, tone, total, totalCount, max) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: tone === 'in' ? INBOUND : P, textTransform: 'uppercase' }}>
          {tone === 'in' ? '↘ Inflows' : '↗ Outflows'}
        </span>
        <span style={{ fontSize: 11, color: INK(0.46), fontVariantNumeric: 'tabular-nums' }}>
          {usdMode ? fmtFlowUSD(total) : `${totalCount} txns`}
        </span>
      </div>
      {rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(node => (
            <ProportionRow
              key={`${tone}-${node.address}`}
              label={node.label || fmtAddress(node.address)}
              href={etherscanAddress(node.address)}
              tone={tone}
              value={usdMode ? fmtFlowUSD(tone === 'in' ? node.inUsd : node.outUsd) : `${tone === 'in' ? node.inCount : node.outCount} txns`}
              meta={`${tone === 'in' ? node.inCount : node.outCount}×`}
              fraction={(usdMode ? (tone === 'in' ? node.inUsd : node.outUsd) : (tone === 'in' ? node.inCount : node.outCount)) / max}
            />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: INK(0.4), padding: '10px 0' }}>No {tone === 'in' ? 'inbound' : 'outbound'} transfers in sample.</div>
      )}
    </div>
  );

  return (
    <section className="ww-card ww-card-sharp" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div className="ww-label" style={{ marginBottom: 5 }}>Transfer flow</div>
          <div style={{ fontSize: 12, color: INK(0.48), lineHeight: 1.45 }}>
            Net movement across the last {Math.min(model.events.length, MAX_FLOW_EVENTS)} loaded transfers.
          </div>
        </div>
        {hasData && (
          <div style={{ textAlign: 'right' }}>
            <div className="ww-label" style={{ marginBottom: 4 }}>Net flow</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', color: usdMode ? (netUsd >= 0 ? INBOUND : P) : INK(0.78) }}>
              {netLabel}
            </div>
          </div>
        )}
      </div>

      {hasData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 28 }}>
          {column('Inflows', inflows, 'in', totals.inUsd, totals.inCount, maxIn)}
          {column('Outflows', outflows, 'out', totals.outUsd, totals.outCount, maxOut)}
        </div>
      ) : (
        <div className="ww-empty-panel" style={{ padding: 14, color: INK(0.48), fontSize: 13 }}>
          No transfer flow data available for this wallet sample.
        </div>
      )}
    </section>
  );
}

TransferFlowLedger.propTypes = {
  model: PropTypes.shape({ events: PropTypes.array, counterparties: PropTypes.array, totals: PropTypes.object }),
};

function MetricCard({ label, value, hint }) {
  return (
    <div className="ww-metric-card">
      <div className="ww-label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="ww-metric-value">{value}</div>
      {hint && <div style={{ color: INK(0.44), fontSize: 11, lineHeight: 1.4, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  hint: PropTypes.string,
};

function RankedList({ title, note, rows, empty, renderRow, footer }) {
  return (
    <section className="ww-card ww-card-sharp" style={{ padding: 18, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <div className="ww-label">{title}</div>
        {note && <div style={{ fontSize: 10, color: INK(0.38), fontStyle: 'italic' }}>{note}</div>}
      </div>
      {rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {rows.map(renderRow)}
        </div>
      ) : (
        <div className="ww-empty-panel" style={{ padding: 14, color: INK(0.48), fontSize: 13 }}>{empty}</div>
      )}
      {footer && (
        <div style={{ marginTop: 13, paddingTop: 11, borderTop: '1px solid rgba(30,26,20,0.07)', fontSize: 11, color: INK(0.42), lineHeight: 1.45 }}>
          {footer}
        </div>
      )}
    </section>
  );
}

RankedList.propTypes = {
  title: PropTypes.string.isRequired,
  note: PropTypes.string,
  rows: PropTypes.array.isRequired,
  empty: PropTypes.string.isRequired,
  renderRow: PropTypes.func.isRequired,
  footer: PropTypes.node,
};

export default function WalletProfilePanel({ address, onDeepDive }) {
  const normalizedAddress = useMemo(() => String(address || '').trim(), [address]);
  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const { isWatched, toggle: toggleWatch } = useWatchlist();

  useEffect(() => {
    if (!normalizedAddress) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    setWalletData(null);

    fetch(`/api/wallet?address=${encodeURIComponent(normalizedAddress)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({ error: 'Invalid response from server.' }));
        if (!res.ok || data.error) throw new Error(data.error || 'Could not load wallet.');
        return data;
      })
      .then((data) => { if (mounted) setWalletData(data); })
      .catch((err) => { if (mounted) setError(err.message || 'Could not load wallet.'); })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [normalizedAddress]);

  const baseline = useMemo(() => walletDataToBaseline(walletData), [walletData]);
  const liveEvents = useMemo(() => walletDataToLiveEvents(walletData).slice(0, 20), [walletData]);
  const transferFlowModel = useMemo(() => buildTransferFlowModel(walletData), [walletData]);
  const activityTimeline = useMemo(() => buildActivityTimeline(walletData), [walletData]);
  const profileNode = useMemo(() => buildProfileNode(normalizedAddress, walletData), [normalizedAddress, walletData]);
  const adversarialSignals = useMemo(
    () => deriveAdversarialSignals(profileNode, walletData, null),
    [profileNode, walletData],
  );
  const { structural, risk } = useMemo(
    () => behaviorLabels(walletData, baseline, adversarialSignals),
    [walletData, baseline, adversarialSignals],
  );
  const topTokens = useMemo(() => (baseline?.topTokenFlows || []).slice(0, 8), [baseline]);
  const counterparties = useMemo(() => (baseline?.topCounterparties || []).slice(0, 8), [baseline]);
  const protocolRows = useMemo(() => (baseline?.protocolUsage || []).slice(0, 5), [baseline]);

  const maxTokenVol = useMemo(() => Math.max(1, ...topTokens.map(t => t.volumeUSD || 0)), [topTokens]);
  const maxCpVol = useMemo(() => Math.max(1, ...counterparties.map(c => c.volumeUSD || 0)), [counterparties]);

  const nativeBalanceValue = typeof walletData?.ethBalance === 'number'
    ? `${walletData.ethBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH` : '—';
  const nativeBalanceHint = typeof walletData?.totalValueUSD === 'number'
    ? fmtUSD(walletData.totalValueUSD) : null;
  const lastActiveRel = relativeTime(walletData?.lastActive);
  const watched = isWatched(normalizedAddress, { type: 'wallet', chain: 'ethereum' });

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(normalizedAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [normalizedAddress]);

  const handleDeepDive = useCallback(() => {
    onDeepDive?.(profileNode, walletData);
  }, [onDeepDive, profileNode, walletData]);

  if (loading) {
    return (
      <div className="ww-card ww-card-sharp ww-async-skeleton" style={{ padding: 24 }} aria-live="polite" aria-busy="true">
        <div className="ww-async-skeleton-label">Syncing on-chain context…</div>
        <div className="ww-async-skeleton-grid">
          {[0, 1, 2].map(id => (
            <div key={id} className="ww-skeleton-card ww-metric-card">
              <span className="ww-skeleton-block" style={{ width: '42%', height: 9 }} />
              <span className="ww-skeleton-block" style={{ width: `${68 - id * 9}%`, height: 16, marginTop: 10 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ww-card ww-card-sharp" style={{ padding: 18, borderColor: 'rgba(191,78,50,0.32)', color: P, fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!walletData) return null;

  const walletName = walletData.ens || fmtAddress(normalizedAddress);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, minWidth: 0, alignItems: 'center' }}>
          <Identicon address={normalizedAddress} />
          <div style={{ minWidth: 0 }}>
            <p className="ww-holder-page-kicker" style={{ margin: '0 0 4px' }}>Wallet profile</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.5vw, 28px)', lineHeight: 1.05, margin: 0, overflowWrap: 'anywhere' }}>
              {walletName}
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <Badge variant="chain">Ethereum</Badge>
              <span className="ww-mono" style={{ color: INK(0.46), fontSize: 12, overflowWrap: 'anywhere' }}>{fmtAddress(normalizedAddress)}</span>
              <button
                type="button"
                onClick={handleCopy}
                title="Copy full address"
                style={{ border: 'none', background: 'transparent', color: copied ? INBOUND : INK(0.42), cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0, fontFamily: 'inherit' }}
              >
                {copied ? '✓ Copied' : '⧉ Copy'}
              </button>
              <a
                href={etherscanAddress(normalizedAddress)}
                target="_blank"
                rel="noreferrer"
                style={{ color: INK(0.42), fontSize: 11, fontWeight: 700, textDecoration: 'none' }}
              >
                Etherscan ↗
              </a>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => toggleWatch({ type: 'wallet', address: normalizedAddress, chain: 'ethereum', label: walletName })}
            style={{
              padding: '9px 13px', fontSize: 12, fontWeight: 700, borderRadius: 6,
              border: `1px solid ${watched ? P : 'rgba(191,78,50,0.3)'}`,
              background: watched ? `${P}12` : 'transparent',
              color: watched ? P : INK(0.55),
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            {watched ? '◈ Watching' : '◎ Watch'}
          </button>
          <button
            type="button"
            className="ww-button-explore"
            onClick={handleDeepDive}
            style={{ padding: '9px 16px', fontWeight: 700 }}
          >
            Deep Dive →
          </button>
        </div>
      </header>

      {/* Hero balance + supporting stats */}
      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(220px, 1.3fr) repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="ww-metric-card" style={{ background: 'rgba(191,78,50,0.05)', borderColor: 'rgba(191,78,50,0.18)' }}>
          <div className="ww-label" style={{ marginBottom: 6 }}>Native balance</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px, 2.4vw, 28px)', lineHeight: 1.05, color: INK(0.9) }}>
            {nativeBalanceValue}
          </div>
          {nativeBalanceHint && <div style={{ color: P, fontSize: 13, fontWeight: 700, marginTop: 5 }}>{nativeBalanceHint}</div>}
        </div>
        <MetricCard label="Transactions" value={fmtTx(walletData.txCount)} hint={walletData.transactionSample?.isSampled ? 'Recent sample' : null} />
        <MetricCard label="Counterparties" value={baseline.uniqueCounterparties ?? '—'} />
        <MetricCard label="Last active" value={lastActiveRel || formatDate(walletData.lastActive)} hint={lastActiveRel ? formatDate(walletData.lastActive) : null} />
      </section>

      <WalletHoldingsStrip address={normalizedAddress} />

      {activityTimeline.length > 0 && (
        <section className="ww-card ww-card-sharp" style={{ padding: 18 }}>
          <ActivityHeatmap timeline={activityTimeline} />
          <div style={{ marginTop: 10, fontSize: 11, color: INK(0.4), lineHeight: 1.45 }}>
            Transaction cadence from the {walletData.transactions?.length || 0} sampled transfers — not full history.
          </div>
        </section>
      )}

      <TransferFlowLedger model={transferFlowModel} />

      <section className="ww-card ww-card-sharp" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="ww-label">Behavior labels</div>
          <DataSourceBadge compact
            sourceId={walletData.provider || walletData.source || 'wallet-api'}
            sourceType={walletData.provider || walletData.source || 'wallet'}
            fetchedAt={new Date().toISOString()}
            confidence={walletData.dataQuality?.isFallback ? 'low' : 'medium'}
            warnings={walletData.dataQuality?.warnings || []}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {structural.map((item) => (
            <Badge key={item.label} variant="status" tone={item.tone}>{item.label}</Badge>
          ))}
        </div>
        {risk.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(30,26,20,0.07)' }}>
            <div className="ww-label" style={{ marginBottom: 8, color: 'rgba(139,49,32,0.7)' }}>Confidence caveats</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {risk.map((item) => (
                <li key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, color: INK(0.62), lineHeight: 1.45 }}>
                  <span style={{ color: item.tone === 'risk' ? P : '#8B6D3E', fontWeight: 900, flexShrink: 0 }}>•</span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <RankedList
          title="Top tokens by transfer volume"
          note="Flow, not holdings"
          footer="Cumulative notional moved through this wallet across the sampled transfers — throughput, not current value. See the Holdings card above for priced holdings."
          rows={topTokens}
          empty="No token flow data available for this wallet."
          renderRow={(row) => (
            <ProportionRow
              key={row.tokenAddress || row.tokenSymbol}
              label={row.tokenSymbol}
              tone="neutral"
              value={fmtUSD(row.volumeUSD)}
              meta={`${fmtTx(row.txCount)}×`}
              fraction={(row.volumeUSD || 0) / maxTokenVol}
            />
          )}
        />
        <RankedList
          title="Top counterparties"
          note="By transfer volume"
          rows={counterparties}
          empty="No counterparty data available for this wallet."
          renderRow={(row) => (
            <ProportionRow
              key={row.address}
              label={row.label || fmtAddress(row.address)}
              href={etherscanAddress(row.address)}
              tone="neutral"
              value={fmtUSD(row.volumeUSD)}
              meta={`${fmtTx(row.txCount)}×`}
              fraction={(row.volumeUSD || 0) / maxCpVol}
            />
          )}
        />
      </div>

      <RankedList
        title="Related pools and contracts"
        rows={protocolRows}
        empty="No related protocol or contract activity available."
        renderRow={(row) => (
          <div key={row.protocolAddress || row.protocolName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <a href={etherscanAddress(row.protocolAddress)} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: INK(0.82), textDecoration: 'none' }}>{row.protocolName}</a>
            <span style={{ color: INK(0.58), whiteSpace: 'nowrap' }}>{fmtUSD(row.volumeUSD)} · {fmtTx(row.txCount)} txns</span>
          </div>
        )}
      />

      <RankedList
        title="Last 20 transfers"
        rows={liveEvents}
        empty="No recent transfer data available."
        renderRow={(event) => (
          <div key={event.txHash} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: INK(0.46), fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{formatDate(event.timestamp)}</span>
            <a href={etherscanAddress(event.counterpartyAddress)} target="_blank" rel="noreferrer" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: INK(0.78), textDecoration: 'none' }}>
              {event.counterpartyLabel || fmtAddress(event.counterpartyAddress || '')}
            </a>
            <span style={{ color: INK(0.58), whiteSpace: 'nowrap' }}>{event.tokenSymbol || 'ETH'} · {fmtFlowUSD(event.valueUSD)}</span>
          </div>
        )}
      />

      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(30,26,20,0.08)', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="ww-button-explore"
          onClick={handleDeepDive}
          style={{ padding: '11px 24px', fontWeight: 700, fontSize: 14 }}
        >
          Deep Dive — full signal analysis →
        </button>
      </div>
    </div>
  );
}

WalletProfilePanel.propTypes = {
  address: PropTypes.string.isRequired,
  onDeepDive: PropTypes.func,
};
