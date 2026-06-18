import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { fmtDate, fmtUSD } from '../utils.js';
import ActivityHeatmap from './ActivityHeatmap.jsx';
import Badge from './Badge.jsx';
import InsightsPulse from './InsightsPulse.jsx';
import useRecentNotableWalletExamples from '../hooks/useRecentNotableWalletExamples.js';
import WalletProfilePanel from './WalletProfilePanel.jsx';

const INK = (a) => `rgba(30,26,20,${a})`;
const P = '#BF4E32';
const GREEN = '#1E653C';
const WARN = '#8B6D3E';
const CARD = 'rgba(255,252,246,0.82)';

const DEMO_NODES = [
  {
    id: 'ww-demo-curve',
    fullAddress: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    label: 'Exchange whale',
    type: 'wallet',
    volumeUSD: 7_850_000,
    interactions: 96,
    riskScore: 6.4,
    lastActive: dateKeyFromOffset(1),
    topCounterparties: [{ label: 'Curve', volume: 2_100_000 }, { label: 'Uniswap', volume: 1_420_000 }],
    anomalies: [{ type: 'large_tx' }, { type: 'volume_spike' }],
    timeline: makeDemoTimeline(5),
  },
  {
    id: 'ww-demo-stable-router',
    fullAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    label: 'Stable router',
    type: 'wallet',
    volumeUSD: 2_420_000,
    interactions: 42,
    riskScore: 3.8,
    lastActive: dateKeyFromOffset(3),
    topCounterparties: [{ label: 'Aave', volume: 820_000 }, { label: 'Maker', volume: 510_000 }],
    anomalies: [{ type: 'large_tx' }],
    timeline: makeDemoTimeline(9),
  },
  {
    id: 'ww-demo-dormant',
    fullAddress: '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97',
    label: 'Dormant mega-holder',
    type: 'wallet',
    volumeUSD: 1_180_000,
    interactions: 18,
    riskScore: 2.2,
    lastActive: dateKeyFromOffset(14),
    topCounterparties: [{ label: 'Lido', volume: 440_000 }],
    anomalies: [],
    timeline: makeDemoTimeline(17),
  },
];

function isValidTarget(v) {
  const s = String(v ?? '').trim();
  return /^0x[0-9a-f]{40}$/i.test(s) || /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.eth$/i.test(s);
}

function shortAddr(addr) {
  const s = String(addr || '');
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function makeNode(target) {
  return {
    id: target,
    fullAddress: target,
    label: /^0x/i.test(target) ? shortAddr(target) : target,
    type: 'wallet',
  };
}

function dateKeyFromOffset(offsetDays) {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function makeDemoTimeline(seed = 0) {
  return Array.from({ length: 84 }, (_, i) => {
    const age = 83 - i;
    let pulse = 0;
    if ((i + seed) % 17 === 0) pulse += 9;
    if ((i + seed) % 11 === 0) pulse += 4;
    let count = pulse;
    if (!count && (i + seed) % 5 === 0) count = 2;
    if (!count && (i + seed) % 7 === 0) count = 1;
    return { date: dateKeyFromOffset(age), txCount: count, volumeUSD: count * 18_000 };
  });
}

function getNodeVolume(node) {
  return Number.isFinite(node?.volumeUSD) ? node.volumeUSD : 0;
}

function getNodeInteractions(node) {
  return Number.isFinite(node?.interactions) ? node.interactions : 0;
}

function getNodeRiskTone(node) {
  const score = Number.isFinite(node?.riskScore) ? node.riskScore : 0;
  if (score >= 6) return { color: P };
  if (score >= 3) return { color: WARN };
  return { color: GREEN };
}

function summarizeNodes(nodes) {
  const totalVolume = nodes.reduce((sum, node) => sum + getNodeVolume(node), 0);
  const totalInteractions = nodes.reduce((sum, node) => sum + getNodeInteractions(node), 0);
  const anomalyCount = nodes.reduce((sum, node) => sum + (node.anomalies?.length || 0), 0);
  const topNode = [...nodes].sort((a, b) => getNodeVolume(b) - getNodeVolume(a))[0] || null;
  const activeNodes = nodes.filter(node => getNodeInteractions(node) > 0).length;
  return { totalVolume, totalInteractions, anomalyCount, topNode, activeNodes };
}

function buildWatchCards(summary, nodeOptions) {
  const top = summary.topNode;
  return [
    {
      label: 'Observed volume',
      value: summary.totalVolume > 0 ? fmtUSD(summary.totalVolume, true) : 'No wallet loaded',
      detail: top ? `${top.label || shortAddr(top.fullAddress)} leads the current graph` : 'Search any 0x wallet or ENS to start',
    },
    {
      label: 'Tracked wallets',
      value: nodeOptions.length ? String(nodeOptions.length) : '30 max',
      detail: nodeOptions.length ? `${summary.activeNodes} have loaded activity` : 'Loaded graph nodes appear here',
    },
    {
      label: 'Risk flags',
      value: String(summary.anomalyCount),
      detail: summary.anomalyCount ? 'Open a node to inspect anomalies' : 'No anomaly flags in the current list',
    },
  ];
}

function getNodeClickTarget(node) {
  if (!node) return null;
  if (isValidTarget(node.fullAddress)) return node;
  return makeNode(node.fullAddress || node.label);
}

function nodeLabel(node) {
  return node?.label || shortAddr(node?.fullAddress);
}

function getLandingNodes(nodeOptions) {
  if (nodeOptions.length > 0) return { nodes: nodeOptions, demo: false };
  return { nodes: DEMO_NODES, demo: true };
}

function resolvePreviewNode(summary, landingSummary, landing) {
  return summary.topNode || landingSummary.topNode || landing.nodes[0] || null;
}

function EmptyPreviewHeatmap() {
  return (
    <div className="ww-card ww-card-sharp ww-whale-entry-panel" style={{ padding: 18 }}>
      <ActivityHeatmap timeline={makeDemoTimeline()} />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge variant="data">12 week cadence</Badge>
        <span style={{ color: INK(0.42), fontSize: 12, lineHeight: 1.5 }}>
          Node detail opens this heatmap with live activity once a wallet is selected.
        </span>
      </div>
    </div>
  );
}

function NodeFieldPreview({ nodes, activeNode, onSelectNode, demo }) {
  const topNodes = nodes.slice(0, 6);
  const maxVolume = Math.max(1, ...topNodes.map(getNodeVolume));
  const positions = [
    ['50%', '50%'],
    ['22%', '26%'],
    ['78%', '32%'],
    ['28%', '75%'],
    ['72%', '74%'],
    ['51%', '18%'],
  ];

  return (
    <div className="ww-card ww-card-sharp ww-whale-entry-node-field" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="ww-section-label">Node field</div>
          <div style={{ marginTop: 5, fontSize: 12, color: INK(0.48), lineHeight: 1.45 }}>
            {demo ? 'Preview cluster - pick one to inspect' : 'Loaded wallet cluster - pick a node'}
          </div>
        </div>
        <Badge variant={demo ? 'time' : 'data'}>{demo ? 'preview' : `${nodes.length} nodes`}</Badge>
      </div>
      <div className="ww-whale-node-map" aria-label="Whale Watcher node preview">
        <div className="ww-whale-node-link ww-whale-node-link-a" />
        <div className="ww-whale-node-link ww-whale-node-link-b" />
        <div className="ww-whale-node-link ww-whale-node-link-c" />
        {topNodes.map((node, index) => {
          const [left, top] = positions[index] || positions[0];
          const risk = getNodeRiskTone(node);
          const volumeRatio = getNodeVolume(node) / maxVolume;
          const size = 34 + Math.round(volumeRatio * 28);
          const active = activeNode?.id === node.id;
          return (
            <button
              key={node.id || node.fullAddress}
              type="button"
              className="ww-whale-map-node"
              onClick={() => onSelectNode(getNodeClickTarget(node))}
              style={{
                left,
                top,
                width: size,
                height: size,
                borderColor: active ? P : `${risk.color}66`,
                background: active ? 'rgba(191,78,50,0.20)' : `${risk.color}22`,
                color: risk.color,
              }}
              title={`${nodeLabel(node)} - ${fmtUSD(getNodeVolume(node), node.volumeEstimated)}`}
            >
              <span>{index + 1}</span>
            </button>
          );
        })}
      </div>
      <div className="ww-whale-node-map-legend">
        {topNodes.slice(0, 3).map((node, index) => (
          <button
            key={node.id || node.fullAddress}
            type="button"
            onClick={() => onSelectNode(getNodeClickTarget(node))}
            className="ww-whale-map-chip"
          >
            <span>{index + 1}</span>
            {nodeLabel(node)}
          </button>
        ))}
      </div>
    </div>
  );
}

NodeFieldPreview.propTypes = {
  nodes: PropTypes.array.isRequired,
  activeNode: PropTypes.object,
  onSelectNode: PropTypes.func.isRequired,
  demo: PropTypes.bool.isRequired,
};

function buildSignalRows(previewNode) {
  const counterpartyValue = previewNode?.topCounterparties?.length
    ? `${previewNode.topCounterparties.length} loaded`
    : 'on node open';
  return [
    ['Large movement spikes', previewNode ? fmtUSD(getNodeVolume(previewNode), previewNode.volumeEstimated) : 'waiting'],
    ['Counterparty review', counterpartyValue],
    ['Quantum exposure', previewNode?.fullAddress ? 'address ready' : 'requires address'],
  ];
}

export default function WhaleWatcherEntryPage({ walletData, onDeepDive, onNavigate, initialAddress = '' }) {
  const normalizedInitialAddress = String(initialAddress ?? '');
  const [query, setQuery] = useState(normalizedInitialAddress);
  const [error, setError] = useState(null);
  const [profileAddress, setProfileAddress] = useState(normalizedInitialAddress);
  const exampleWallets = useRecentNotableWalletExamples();

  useEffect(() => {
    if (normalizedInitialAddress) {
      setQuery(normalizedInitialAddress);
      setProfileAddress(normalizedInitialAddress);
    }
  }, [normalizedInitialAddress]);

  const nodeOptions = useMemo(() => {
    if (!walletData?.nodes) return [];
    return walletData.nodes
      .filter(n => n.fullAddress && isValidTarget(n.fullAddress))
      .slice(0, 30);
  }, [walletData]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodeOptions;
    return nodeOptions.filter(n =>
      (n.label || '').toLowerCase().includes(q) ||
      (n.fullAddress || '').toLowerCase().includes(q),
    );
  }, [nodeOptions, query]);

  const summary = useMemo(() => summarizeNodes(nodeOptions), [nodeOptions]);
  const watchCards = useMemo(() => buildWatchCards(summary, nodeOptions), [summary, nodeOptions]);
  const landing = useMemo(() => getLandingNodes(nodeOptions), [nodeOptions]);
  const landingSummary = useMemo(() => summarizeNodes(landing.nodes), [landing.nodes]);
  const previewNode = resolvePreviewNode(summary, landingSummary, landing);
  const previewTimeline = previewNode?.timeline?.length ? previewNode.timeline : null;
  const examples = exampleWallets.slice(0, 6);
  const visibleNodes = nodeOptions.length > 0 ? filteredOptions : landing.nodes;

  const handleSubmit = (e) => {
    e?.preventDefault();
    const v = query.trim();
    if (!v) { setError('Enter a wallet address or ENS name.'); return; }
    if (!isValidTarget(v)) { setError('Enter a valid 0x address or ENS name.'); return; }
    setError(null);
    setProfileAddress(v);
  };

  const sharedNav = (
    <nav style={{ padding: '14px 24px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => profileAddress ? setProfileAddress(null) : onNavigate?.('/')}
        style={{ background: 'none', border: 'none', color: INK(0.9), cursor: 'pointer', fontSize: 20, padding: '0 4px' }}
        aria-label={profileAddress ? 'Back to search' : 'Back to home'}
      >
        ←
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, color: INK(0.45), letterSpacing: 1.5, textTransform: 'uppercase' }}>
        Whale Watcher
      </span>
    </nav>
  );

  const searchBar = (
    <div className="ww-card ww-card-sharp ww-whale-entry-command" style={{ padding: 16, marginBottom: 28 }}>
      <form onSubmit={handleSubmit} className="ww-whale-entry-search" style={{ display: 'flex', gap: 10, marginBottom: error ? 8 : 0 }}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setError(null); }}
          placeholder="0x address or ENS name..."
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1, minWidth: 0, padding: '11px 13px',
            border: `1px solid ${error ? P : 'rgba(30,26,20,0.18)'}`,
            borderRadius: 4, fontSize: 14, background: '#fff', color: INK(0.9),
            outline: 'none', fontFamily: 'var(--font-mono, monospace)',
          }}
        />
        <button type="submit" className="ww-button-primary"
          style={{ padding: '10px 18px', borderRadius: 4, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Analyze
        </button>
      </form>
      {error && <p style={{ fontSize: 12, color: P, margin: '8px 0 0', lineHeight: 1.5 }}>{error}</p>}
    </div>
  );

  if (profileAddress) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#FAF8F3', color: INK(0.9), display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {sharedNav}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 56px', width: '100%' }}>
          {searchBar}
          <WalletProfilePanel
            address={profileAddress}
            onDeepDive={(node, data) => onDeepDive?.(node, data)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FAF8F3', color: INK(0.9), display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {sharedNav}

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 24px 42px', width: '100%' }}>
        <section className="ww-whale-entry-hero">
          <div style={{ minWidth: 0 }}>
            <div className="ww-eyebrow" style={{ marginBottom: 10 }}>Wallet activity workspace</div>
            <h1 className="font-editorial" style={{ fontSize: 'clamp(30px, 4vw, 52px)', lineHeight: 1.02, fontWeight: 650, marginBottom: 12 }}>
              Whale Watcher
            </h1>
            <p style={{ fontSize: 15, color: INK(0.58), maxWidth: 620, lineHeight: 1.65 }}>
              Inspect wallet-sized movement, activity cadence, large transfer spikes, counterparties, and quantum exposure from one focused surface.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
              {landing.nodes.slice(0, 3).map(node => (
                <button
                  key={node.id || node.fullAddress}
                  type="button"
                  onClick={() => { const t = getNodeClickTarget(node); setQuery(t.fullAddress); setProfileAddress(t.fullAddress); }}
                  className="ww-whale-hero-chip"
                >
                  {nodeLabel(node)}
                </button>
              ))}
            </div>
          </div>

          <div className="ww-card ww-card-sharp ww-whale-entry-command" style={{ padding: 16 }}>
            <form onSubmit={handleSubmit} className="ww-whale-entry-search" style={{ display: 'flex', gap: 10, marginBottom: error ? 8 : 12 }}>
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setError(null); }}
                placeholder="0x address or ENS name..."
                autoFocus
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, minWidth: 0, padding: '11px 13px',
                  border: `1px solid ${error ? P : 'rgba(30,26,20,0.18)'}`,
                  borderRadius: 4, fontSize: 14, background: '#fff', color: INK(0.9),
                  outline: 'none', fontFamily: 'var(--font-mono, monospace)',
                }}
              />
              <button type="submit" className="ww-button-primary"
                style={{ padding: '10px 18px', borderRadius: 4, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                Analyze
              </button>
            </form>

            {error && (
              <p style={{ fontSize: 12, color: P, margin: '0 0 12px', lineHeight: 1.5 }}>{error}</p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {examples.map(example => (
                <button
                  key={example.query}
                  type="button"
                  onClick={() => { setQuery(example.query); setError(null); setProfileAddress(example.query); }}
                  style={{
                    border: '1px solid rgba(139,49,32,0.14)',
                    background: 'rgba(191,78,50,0.06)',
                    color: INK(0.68),
                    borderRadius: 3,
                    padding: '5px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="ww-whale-entry-stats">
          {(nodeOptions.length > 0 ? watchCards : buildWatchCards(landingSummary, landing.nodes)).map(card => (
            <div key={card.label} className="ww-card ww-card-sharp" style={{ padding: 16, background: CARD }}>
              <div className="ww-label" style={{ marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, lineHeight: 1.05, fontWeight: 700, color: INK(0.86), overflowWrap: 'anywhere' }}>{card.value}</div>
              <div style={{ marginTop: 8, color: INK(0.46), fontSize: 12, lineHeight: 1.45 }}>{card.detail}</div>
            </div>
          ))}
        </section>

        <section className="ww-whale-entry-grid">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <div className="ww-section-label">
                {landing.demo ? 'Recent whale nodes' : 'Nodes from loaded wallet'}
              </div>
              {walletData?.address && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: INK(0.36) }}>
                  {shortAddr(walletData.address)}
                </span>
              )}
            </div>
            <div className="ww-card ww-card-sharp ww-whale-entry-list" style={{ padding: 8 }}>
              {visibleNodes.length > 0 ? visibleNodes.map(node => {
                const risk = getNodeRiskTone(node);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => { const t = getNodeClickTarget(node); setQuery(t.fullAddress); setProfileAddress(t.fullAddress); }}
                    className="ww-whale-entry-node"
                  >
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: risk.color, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.label || shortAddr(node.fullAddress)}
                      </span>
                      <span style={{ display: 'block', marginTop: 3, fontSize: 10, color: INK(0.38), fontFamily: 'var(--font-mono, monospace)' }}>
                        {shortAddr(node.fullAddress)}
                      </span>
                    </span>
                    <span style={{ display: 'grid', gap: 3, justifyItems: 'end', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtUSD(getNodeVolume(node), node.volumeEstimated)}</span>
                      <span style={{ fontSize: 10, color: INK(0.42) }}>{getNodeInteractions(node)} tx</span>
                    </span>
                  </button>
                );
              }) : (
                <div style={{ padding: 18, color: INK(0.48), fontSize: 13, lineHeight: 1.55 }}>
                  Search a wallet above to populate tracked nodes.
                </div>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <NodeFieldPreview
              nodes={landing.nodes}
              activeNode={previewNode}
              onSelectNode={(node) => { const t = getNodeClickTarget(node); setQuery(t.fullAddress); setProfileAddress(t.fullAddress); }}
              demo={landing.demo}
            />

            {previewTimeline ? (
              <div className="ww-card ww-card-sharp ww-whale-entry-panel" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div className="ww-section-label">12 week activity</div>
                    <div style={{ marginTop: 5, fontSize: 15, fontWeight: 700 }}>{previewNode.label || shortAddr(previewNode.fullAddress)}</div>
                  </div>
                  <Badge variant="time">{fmtDate(previewNode.lastActive)}</Badge>
                </div>
                <ActivityHeatmap timeline={previewTimeline} />
              </div>
            ) : <EmptyPreviewHeatmap />}

            <div className="ww-whale-entry-mini-grid">
              <div className="ww-card ww-card-sharp" style={{ padding: 16 }}>
                <div className="ww-label" style={{ marginBottom: 10 }}>Signal stack</div>
                {buildSignalRows(previewNode).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(139,49,32,0.08)' }}>
                    <span style={{ fontSize: 12, color: INK(0.48) }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="ww-card ww-card-sharp" style={{ padding: 16 }}>
                <div className="ww-label" style={{ marginBottom: 10 }}>What loads</div>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: INK(0.62), marginBottom: previewNode ? 12 : 0 }}>
                  Movements, counterparties, market context, narrative caveats, and vault readiness — for any selected wallet.
                </p>
                {previewNode && (
                  <button type="button" className="ww-button-primary"
                    onClick={() => { const t = getNodeClickTarget(previewNode); setQuery(t.fullAddress); setProfileAddress(t.fullAddress); }}
                    style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                    Inspect top node
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <InsightsPulse />
      </div>
    </div>
  );
}

WhaleWatcherEntryPage.propTypes = {
  walletData: PropTypes.object,
  onDeepDive: PropTypes.func,
  onNavigate: PropTypes.func,
  initialAddress: PropTypes.string,
};
