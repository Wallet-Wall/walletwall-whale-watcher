import { useState } from 'react';
import fixture from './data/whale-watcher.fixture.json';
import Disclaimer from './components/Disclaimer.jsx';
import './WhaleWatcher.css';

function getEntityColor(type) {
  switch (type) {
    case 'exchange':    return '#5B7EA6';
    case 'protocol':    return '#7A6B9E';
    case 'whale':       return '#BF4E32';
    case 'institution': return '#2F8F67';
    default:            return '#C9A47A';
  }
}

const QUANTUM_LABEL = { ok: 'On Track', watch: 'Watch', review: 'Review' };
const QUANTUM_CLASS = { ok: 'ww-badge--safe', watch: 'ww-badge--warn', review: 'ww-badge--risk' };
const TREND_LABEL = { accumulating: 'Accumulating', distributing: 'Distributing', dormant: 'Dormant' };

function fmtUSD(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="ww-kpi">
      <div className="ww-kpi__label">{label}</div>
      <div className="ww-kpi__value">{value}</div>
      {sub && <div className="ww-kpi__sub">{sub}</div>}
    </div>
  );
}

function CadenceChart({ weeks }) {
  const max = Math.max(1, ...weeks);
  return (
    <div className="ww-cadence" aria-label="12-week activity cadence">
      {weeks.map((count, i) => (
        <div
          key={i}
          className="ww-cadence__bar"
          style={{ height: `${Math.max((count / max) * 100, 3)}%` }}
          title={`Week ${i + 1}: ${count} tx (demo)`}
          aria-label={`Week ${i + 1}: ${count} transactions`}
        />
      ))}
    </div>
  );
}

export default function WhaleWatcher() {
  const [selectedRank, setSelectedRank] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const { kpis, network } = fixture;
  const TYPES = ['all', 'whale', 'exchange', 'institution', 'protocol'];

  const filtered = typeFilter === 'all'
    ? fixture.wallets
    : fixture.wallets.filter((w) => w.type === typeFilter);

  const selected = selectedRank
    ? fixture.wallets.find((w) => w.rank === selectedRank)
    : null;

  return (
    <div className="ww-root" data-testid="whale-watcher">
      <div className="ww-head">
        <div>
          <div className="ww-label" style={{ marginBottom: 4 }}>Whale Watcher</div>
          <h1 className="ww-heading">
            Large-Wallet Activity
            <span className="ww-chain-badge">{network}</span>
          </h1>
          <p className="ww-subheading">
            Read-only movement, cadence, and exposure lens — demo fixture data only.
          </p>
        </div>
      </div>

      <Disclaimer />

      <div className="ww-kpis">
        <KpiCard label="Tracked Wallets" value={kpis.tracked_wallets.toLocaleString()} />
        <KpiCard label="Active (7d)" value={kpis.active_7d} sub="moved in last 7d" />
        <KpiCard label="Volume (7d)" value={fmtUSD(kpis.total_moved_usd_7d)} sub="demo" />
        <KpiCard label="Largest Spike" value={fmtUSD(kpis.largest_spike_usd)} sub="single transfer" />
        <KpiCard label="Median Readiness" value={kpis.median_quantum_readiness} sub="quantum exposure" />
      </div>

      <div className="ww-filters">
        {TYPES.map((t) => (
          <button
            key={t}
            className={`ww-filter-btn${typeFilter === t ? ' ww-filter-btn--active' : ''}`}
            onClick={() => { setTypeFilter(t); setSelectedRank(null); }}
            style={typeFilter === t && t !== 'all'
              ? { borderColor: getEntityColor(t), color: getEntityColor(t) }
              : undefined}
          >
            {t === 'all' ? 'All wallets' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
          </button>
        ))}
      </div>

      <div className="ww-body">
        <div className="ww-leaderboard">
          <div className="ww-label" style={{ marginBottom: 10 }}>Watched Wallets</div>
          {filtered.map((w) => (
            <button
              key={w.rank}
              className={`ww-lb-row${selectedRank === w.rank ? ' ww-lb-row--selected' : ''}`}
              onClick={() => setSelectedRank(selectedRank === w.rank ? null : w.rank)}
              aria-pressed={selectedRank === w.rank}
              aria-label={`${w.label}, balance ${fmtUSD(w.balance_usd)}, ${w.activity_7d} transactions in 7 days`}
            >
              <span className="ww-lb-rank">#{w.rank}</span>
              <span
                className="ww-lb-dot"
                style={{ background: getEntityColor(w.type) }}
                aria-hidden="true"
              />
              <span className="ww-lb-label">{w.label}</span>
              <span className="ww-lb-type">{w.type}</span>
              <span className="ww-lb-balance">{fmtUSD(w.balance_usd)}</span>
              <span className="ww-lb-activity">{w.activity_7d} tx</span>
              <span className={`ww-badge ${QUANTUM_CLASS[w.quantum_status]} ww-lb-q`}>
                {QUANTUM_LABEL[w.quantum_status]}
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="ww-detail" data-testid="wallet-detail">
            <div className="ww-label" style={{ marginBottom: 10 }}>Wallet Detail</div>
            <div className="ww-detail__title">{selected.label}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <span
                className="ww-badge"
                style={{
                  background: getEntityColor(selected.type) + '22',
                  color: getEntityColor(selected.type),
                  border: `1px solid ${getEntityColor(selected.type)}44`,
                }}
              >
                {selected.type}
              </span>
              <span className={`ww-badge ${QUANTUM_CLASS[selected.quantum_status]}`}>
                {QUANTUM_LABEL[selected.quantum_status]}
              </span>
            </div>

            <div className="ww-label" style={{ marginBottom: 6 }}>12-Week Cadence</div>
            <CadenceChart weeks={selected.cadence_12w} />

            <div style={{ marginTop: 16 }}>
              {[
                ['Rank',               `#${selected.rank}`],
                ['Balance (demo)',     fmtUSD(selected.balance_usd)],
                ['Activity (7d)',      `${selected.activity_7d} tx`],
                ['Largest Transfer',   fmtUSD(selected.largest_transfer_usd)],
                ['Counterparties',     selected.counterparties.toLocaleString()],
                ['Trend',              TREND_LABEL[selected.trend]],
                ['Address (demo)',     selected.address_demo],
              ].map(([k, v]) => (
                <div key={k} className="ww-detail__row">
                  <span className="ww-detail__key">{k}</span>
                  <span className="ww-detail__val">{v}</span>
                </div>
              ))}
            </div>

            <button className="ww-detail__close" onClick={() => setSelectedRank(null)}>
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
