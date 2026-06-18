import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import DataSourceBadge from './DataSourceBadge.jsx';
import { fmtAddress, fmtTx, fmtUSD } from '../lib/holder-wall-formatting.js';
import { deriveAdversarialSignals } from '../lib/adversarial-heuristics.js';
import { walletDataToBaseline, walletDataToLiveEvents } from '../data/adapters/walletDataAdapter.js';
import WalletHoldingsStrip from './WalletHoldingsStrip.jsx';
import { useWatchlist } from '../hooks/useWatchlist.js';

const INK = (a) => `rgba(30,26,20,${a})`;
const P = '#BF4E32';
const BG = '#FAF8F3';
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

  return { events, counterparties };
}

function behaviorLabels(walletData, baseline, adversarialSignals) {
  const labels = [];
  const txCount = walletData?.txCount ?? 0;
  const cpCount = baseline?.uniqueCounterparties ?? 0;

  if (txCount <= 5) labels.push({ label: 'Fresh wallet', tone: 'muted' });
  if (txCount >= 75) labels.push({ label: 'High activity', tone: 'warn' });
  if (cpCount >= 10) labels.push({ label: 'Broad counterparty set', tone: 'safe' });
  if (walletData?.dataQuality?.isPartial) labels.push({ label: 'Sampled history', tone: 'warn' });

  const elevated = Object.entries(adversarialSignals || {})
    .filter(([, s]) => (s?.score ?? 0) >= 0.5)
    .sort(([, a], [, b]) => (b?.score ?? 0) - (a?.score ?? 0))
    .slice(0, 2);

  for (const [, signal] of elevated) {
    labels.push({ label: signal.reason, tone: signal.score >= 0.75 ? 'risk' : 'warn' });
  }

  if (!labels.length) labels.push({ label: 'Low signal volume', tone: 'muted' });
  return labels;
}

function FlowNodeLabel({ node }) {
  const display = node.label || fmtAddress(node.address);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: INK(0.86), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {display}
      </div>
      <div style={{ fontSize: 10, color: INK(0.44), fontFamily: 'var(--font-mono)', marginTop: 2 }}>
        {node.totalCount} txns - {fmtUSD(node.totalUsd)}
      </div>
    </div>
  );
}

FlowNodeLabel.propTypes = {
  node: PropTypes.shape({ address: PropTypes.string, label: PropTypes.string, totalCount: PropTypes.number, totalUsd: PropTypes.number }),
};

function TransferFlowVisualizer({ model, walletLabel }) {
  const nodes = model.counterparties || [];
  const inbound = nodes.filter(n => n.dominantDirection === 'in');
  const outbound = nodes.filter(n => n.dominantDirection === 'out');
  const hasData = nodes.length > 0;
  const xCenter = 50;
  const yCenter = 50;
  const sideY = (items, index) => items.length <= 1 ? yCenter : 18 + (index / (items.length - 1)) * 64;
  const strokeWidth = (node) => Math.min(8, Math.max(2, Math.log10((node.totalUsd || node.totalCount || 1) + 10) * 1.45));

  return (
    <section className="ww-card ww-card-sharp" style={{ padding: 18, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div className="ww-label" style={{ marginBottom: 5 }}>Transfer Flow Visualizer</div>
          <div style={{ fontSize: 12, color: INK(0.48), lineHeight: 1.45 }}>
            Last {Math.min(model.events.length, MAX_FLOW_EVENTS)} loaded transfers from the wallet provider sample.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: INK(0.48), fontSize: 11, flexWrap: 'wrap' }}>
          <span><span style={{ color: INBOUND, fontWeight: 900 }}>In</span> to this wallet</span>
          <span><span style={{ color: P, fontWeight: 900 }}>Out</span> from this wallet</span>
        </div>
      </div>

      {hasData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(240px, 0.8fr)', gap: 16 }}>
          <div style={{ minHeight: 260, position: 'relative', border: '1px solid rgba(191,78,50,0.14)', background: 'rgba(255,255,255,0.42)', overflow: 'hidden' }}>
            <svg role="img" aria-label="Recent transfer flow graph" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <defs>
                <marker id="wpp-flow-arrow-in" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill={INBOUND} />
                </marker>
                <marker id="wpp-flow-arrow-out" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill={P} />
                </marker>
              </defs>
              {inbound.map((node, index) => {
                const y = sideY(inbound, index);
                return (
                  <path key={`in-${node.address}`}
                    d={`M18 ${y} C34 ${y}, 35 ${yCenter}, ${xCenter - 6} ${yCenter}`}
                    fill="none" stroke={INBOUND} strokeOpacity="0.5"
                    strokeWidth={strokeWidth(node)} markerEnd="url(#wpp-flow-arrow-in)" />
                );
              })}
              {outbound.map((node, index) => {
                const y = sideY(outbound, index);
                return (
                  <path key={`out-${node.address}`}
                    d={`M${xCenter + 6} ${yCenter} C65 ${yCenter}, 66 ${y}, 82 ${y}`}
                    fill="none" stroke={P} strokeOpacity="0.52"
                    strokeWidth={strokeWidth(node)} markerEnd="url(#wpp-flow-arrow-out)" />
                );
              })}
            </svg>
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 128, padding: '10px 12px', border: '1px solid rgba(191,78,50,0.32)', background: BG, boxShadow: '0 10px 26px rgba(30,26,20,0.08)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: P, fontWeight: 800, marginBottom: 4 }}>This wallet</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: INK(0.86), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{walletLabel}</div>
            </div>
            {inbound.map((node, index) => (
              <div key={`in-label-${node.address}`} style={{ position: 'absolute', left: 14, top: `${sideY(inbound, index)}%`, transform: 'translateY(-50%)', width: 150, padding: '8px 10px', border: '1px solid rgba(47,111,98,0.2)', background: 'rgba(250,248,243,0.92)' }}>
                <FlowNodeLabel node={node} />
              </div>
            ))}
            {outbound.map((node, index) => (
              <div key={`out-label-${node.address}`} style={{ position: 'absolute', right: 14, top: `${sideY(outbound, index)}%`, transform: 'translateY(-50%)', width: 150, padding: '8px 10px', border: '1px solid rgba(191,78,50,0.22)', background: 'rgba(250,248,243,0.92)' }}>
                <FlowNodeLabel node={node} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {model.events.slice(0, 8).map(event => (
              <div key={event.txHash} style={{ display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: '8px 10px', border: '1px solid rgba(30,26,20,0.08)', background: 'rgba(255,255,255,0.36)' }}>
                <span style={{ color: event.direction === 'out' ? P : INBOUND, fontSize: 11, fontWeight: 900 }}>{event.direction === 'out' ? 'OUT' : 'IN'}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: INK(0.72) }}>
                  {event.counterpartyLabel || fmtAddress(event.counterparty)}
                </span>
                <span style={{ fontSize: 11, color: INK(0.48), whiteSpace: 'nowrap' }}>{event.tokenSymbol} - {fmtUSD(event.valueUSD)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="ww-empty-panel" style={{ padding: 14, color: INK(0.48), fontSize: 13 }}>
          No transfer flow data available for this wallet sample.
        </div>
      )}
    </section>
  );
}

TransferFlowVisualizer.propTypes = {
  model: PropTypes.shape({ events: PropTypes.array, counterparties: PropTypes.array }),
  walletLabel: PropTypes.string,
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

function RowList({ title, rows, empty, renderRow }) {
  return (
    <section className="ww-card ww-card-sharp" style={{ padding: 18, minHeight: 0 }}>
      <div className="ww-label" style={{ marginBottom: 12 }}>{title}</div>
      {rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(renderRow)}
        </div>
      ) : (
        <div className="ww-empty-panel" style={{ padding: 14, color: INK(0.48), fontSize: 13 }}>{empty}</div>
      )}
    </section>
  );
}

RowList.propTypes = {
  title: PropTypes.string.isRequired,
  rows: PropTypes.array.isRequired,
  empty: PropTypes.string.isRequired,
  renderRow: PropTypes.func.isRequired,
};

export default function WalletProfilePanel({ address, onDeepDive }) {
  const normalizedAddress = useMemo(() => String(address || '').trim(), [address]);
  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  const profileNode = useMemo(() => buildProfileNode(normalizedAddress, walletData), [normalizedAddress, walletData]);
  const adversarialSignals = useMemo(
    () => deriveAdversarialSignals(profileNode, walletData, null),
    [profileNode, walletData],
  );
  const labels = useMemo(
    () => behaviorLabels(walletData, baseline, adversarialSignals),
    [walletData, baseline, adversarialSignals],
  );
  const topTokens = useMemo(() => (baseline?.topTokenFlows || []).slice(0, 8), [baseline]);
  const counterparties = useMemo(() => (baseline?.topCounterparties || []).slice(0, 8), [baseline]);
  const protocolRows = useMemo(() => (baseline?.protocolUsage || []).slice(0, 5), [baseline]);

  const nativeBalanceValue = typeof walletData?.ethBalance === 'number'
    ? `${walletData.ethBalance.toFixed(4)} ETH` : '-';
  const nativeBalanceHint = typeof walletData?.totalValueUSD === 'number'
    ? fmtUSD(walletData.totalValueUSD) : null;
  const watched = isWatched(normalizedAddress, { type: 'wallet', chain: 'ethereum' });

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p className="ww-holder-page-kicker" style={{ margin: '0 0 4px' }}>Wallet profile</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.5vw, 28px)', lineHeight: 1.05, margin: 0, overflowWrap: 'anywhere' }}>
            {walletData.ens || fmtAddress(normalizedAddress)}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <Badge variant="chain">Ethereum</Badge>
            <span className="ww-mono" style={{ color: INK(0.46), fontSize: 12, overflowWrap: 'anywhere' }}>{normalizedAddress}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => toggleWatch({ type: 'wallet', address: normalizedAddress, chain: 'ethereum', label: walletData.ens || fmtAddress(normalizedAddress) })}
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

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <MetricCard label="Native balance" value={nativeBalanceValue} hint={nativeBalanceHint} />
        <MetricCard label="Transactions" value={fmtTx(walletData.txCount)} hint={walletData.transactionSample?.isSampled ? 'Recent sample loaded' : null} />
        <MetricCard label="Counterparties" value={baseline.uniqueCounterparties ?? '-'} />
        <MetricCard label="Last active" value={formatDate(walletData.lastActive)} />
      </section>

      <WalletHoldingsStrip address={normalizedAddress} />

      <TransferFlowVisualizer
        model={transferFlowModel}
        walletLabel={walletData.ens || fmtAddress(normalizedAddress)}
      />

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
          {labels.map((item) => (
            <Badge key={item.label} variant="status" tone={item.tone}>{item.label}</Badge>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <RowList
          title="Top tokens by value"
          rows={topTokens}
          empty="No token balance data available for this wallet."
          renderRow={(row) => (
            <div key={row.tokenAddress || row.tokenSymbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{row.tokenSymbol}</span>
              <span style={{ color: INK(0.58) }}>{fmtUSD(row.volumeUSD)} · {fmtTx(row.txCount)} txns</span>
            </div>
          )}
        />
        <RowList
          title="Top counterparties"
          rows={counterparties}
          empty="No counterparty data available for this wallet."
          renderRow={(row) => (
            <div key={row.address} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{row.label || fmtAddress(row.address)}</span>
              <span style={{ color: INK(0.58), whiteSpace: 'nowrap' }}>{fmtUSD(row.volumeUSD)} · {fmtTx(row.txCount)} txns</span>
            </div>
          )}
        />
      </div>

      <RowList
        title="Related pools and contracts"
        rows={protocolRows}
        empty="No related protocol or contract activity available."
        renderRow={(row) => (
          <div key={row.protocolAddress || row.protocolName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>{row.protocolName}</span>
            <span style={{ color: INK(0.58) }}>{fmtUSD(row.volumeUSD)} · {fmtTx(row.txCount)} txns</span>
          </div>
        )}
      />

      <RowList
        title="Last 20 transfers"
        rows={liveEvents}
        empty="No recent transfer data available."
        renderRow={(event) => (
          <div key={event.txHash} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: INK(0.46) }}>{formatDate(event.timestamp)}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{event.counterpartyLabel || fmtAddress(event.counterpartyAddress || '')}</span>
            <span style={{ color: INK(0.58), whiteSpace: 'nowrap' }}>{event.tokenSymbol || 'ETH'} · {fmtUSD(event.valueUSD)}</span>
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
