import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { fmtUSD, fmtDate, shortAddr, generateInShort } from '../utils.js';
import { COLORS } from '../theme.js';
import Badge from './Badge.jsx';
import QuantumExposureCard from './QuantumExposureCard.jsx';
import QuantumVaultReadinessCard from './QuantumVaultReadinessCard.jsx';
import { deriveWalletSignatureExposure, deriveQuantumExposureScore } from '../lib/quantum-exposure.js';
import { buildQuantumVaultReadiness } from '../lib/quantum-vault-readiness.js';
import { buildMigrationReadiness } from '../lib/migration-readiness.js';
import { getChainSignatureProfile } from '../data/quantum/chain-signature-profiles.js';
import {
  walletNodeToQuantumFacts,
  fetchDuneQuantumFacts,
  fetchQuantumReadiness,
  isValidEvmAddress,
  isWalletLikeQuantumNode,
  mergeDuneIntoWalletFacts,
  appendDuneSourceCaveats,
} from '../lib/quantum-exposure-adapter.js';
import { deriveAdversarialSignals } from '../lib/adversarial-heuristics.js';
import { formatTimestamp } from './dataSourceFormatting.js';
import WalletHoldingsStrip from './WalletHoldingsStrip.jsx';
import ProtocolAffinityBar, { buildFallbackProtocols } from './ProtocolAffinityBar.jsx';
import DataSourceBadge from './DataSourceBadge.jsx';
import SourceConfidenceLedger from './SourceConfidenceLedger.jsx';
import { deriveWhaleWatcherSignals } from '../lib/whale-watcher-signals.js';
import { buildNarrativeCard } from '../data/narratives/index.js';

/**
 * WhaleWatcher Component
 * Analyzes large movements, concentration, and spikes for a specific node.
 */

const THRESHOLD_HIGH_VALUE = 50_000;
const VOLUME_HIGH = 1_000_000;
const VOLUME_MEDIUM = 100_000;
const TX_COUNT_HIGH = 100;
const TX_COUNT_MEDIUM = 20;

// Terracotta RGB for the 12-week activity heatmap (no beige/gold ramp).
const TERRACOTTA = '191,78,50';

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getActivityTone(activityLevel) {
  if (activityLevel === 'High') return 'risk';
  if (activityLevel === 'Medium') return 'warn';
  return 'safe';
}

function getActivityColor(activityTone) {
  if (activityTone === 'safe') return '#1E653C';
  if (activityTone === 'warn') return '#8B6D3E';
  return '#8B3120';
}

function buildActivity12wGrid(dune12wData, fullAddress) {
  const address = fullAddress?.toLowerCase();
  if (!address || !dune12wData?.wallets) return null;
  const walletData12w = dune12wData.wallets[address];
  if (!walletData12w?.activity12w?.length) return null;

  const days = {};
  walletData12w.activity12w.forEach(d => { if (d.date) days[d.date] = d; });

  const allMs = Object.keys(days).map(k => new Date(k).getTime()).filter(Number.isFinite);
  const anchor = allMs.length ? Math.max(...allMs) : Date.now();

  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const week = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(anchor - (w * 7 + d) * 86_400_000).toISOString().slice(0, 10);
      week.push({ date: dt, ...(days[dt] || { intensity_score: 0, tx_count: null, usd_volume: null }) });
    }
    weeks.push(week);
  }
  return { weeks, walletData12w };
}

function getActivityDayTitle(day) {
  if (day.breakdown) {
    const parts = [];
    if (day.breakdown.buy) parts.push(`${day.breakdown.buy} buys`);
    if (day.breakdown.sell) parts.push(`${day.breakdown.sell} sells`);
    if (day.breakdown.stableSwap) parts.push(`${day.breakdown.stableSwap} stable swaps`);
    if (day.breakdown.swap) parts.push(`${day.breakdown.swap} swaps`);
    if (day.breakdown.totalUsd) parts.push(fmtUSD(day.breakdown.totalUsd, true));
    if (parts.length) return `${day.date}: ${parts.join(' · ')}`;
  }
  const txCount = day.tx_count ?? 0;
  const plural = day.tx_count === 1 ? '' : 's';
  const vol = day.usd_volume ? ' · ' + fmtUSD(day.usd_volume, true) : '';
  return `${day.date}: ${txCount} tx${plural}${vol}`;
}

function getBreakdownPill(day) {
  if (!day.breakdown) return null;
  const pieces = [];
  if (day.breakdown.buy) pieces.push(`${day.breakdown.buy} buys`);
  if (day.breakdown.sell) pieces.push(`${day.breakdown.sell} sells`);
  if (day.breakdown.totalUsd) pieces.push(fmtUSD(day.breakdown.totalUsd, true));
  if (pieces.length === 0) return null;
  return pieces.join(' · ');
}

function getActivityDayStyle(day) {
  const alpha = day.intensity_score > 0 ? (0.08 + day.intensity_score * 0.85).toFixed(3) : '0.06';
  const borderAlpha = day.intensity_score > 0 ? '0.12' : '0.08';
  return {
    width: '100%',
    paddingBottom: '100%',
    borderRadius: 2,
    background: `rgba(${TERRACOTTA},${alpha})`,
    border: `1px solid rgba(${TERRACOTTA},${borderAlpha})`,
  };
}

function normalizeTimestamp(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      const n = Number.parseInt(ts, 10);
      return n < 1e12 ? n * 1000 : n;
    }
    return new Date(ts).getTime() || 0;
  }
  return 0;
}

// Returns a DEX Screener search query for nodes that represent market-tradeable
// assets (token or dex type). Returns null for wallet/protocol/unknown nodes so
// the Stable Seer CTA is only shown when there is actionable market context.
function deriveStableSeerQuery(node) {
  if (!node) return null;
  const { type, id = '', label } = node;
  if (type !== 'token' && type !== 'dex' && !id.startsWith('token_')) return null;
  return label || null;
}

function hasMatchedReadinessSources(response) {
  return Array.isArray(response?.readiness?.provenance?.sources)
    && response.readiness.provenance.sources.length > 0;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function concentrationBarColor(pct) {
  if (pct > 70) return COLORS.status.riskDark;
  if (pct > 35) return COLORS.status.warnDark;
  return COLORS.status.safeDark;
}

const LEDGER_SOURCE_LABELS = {
  liveWalletSample: 'Live sample',
  duneQuantumFacts: 'Quantum facts',
  duneActivity12w:  'Activity 12w',
};
const LEDGER_PROVIDER_LABELS = {
  alchemy:        'Alchemy',
  dune_scheduled: 'Dune',
};

function WhaleSummaryCard({ metrics, activityColor, subFg, narrativeCard, inShort, ledgerProps }) {
  const [caveatsOpen, setCaveatsOpen] = useState(false);
  const hasNarrative = !!(narrativeCard || inShort);

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div className="ww-soft-label">Whale Watcher summary</div>
        {narrativeCard && (
          <Badge variant="status" tone={CONF_TONE[narrativeCard.confidence] ?? 'muted'}>
            {narrativeCard.confidence} confidence
          </Badge>
        )}
      </div>

      {/* Source / provenance */}
      {ledgerProps && (
        <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(30,26,20,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px 8px', fontSize: 11, color: subFg }}>
            {Object.entries(ledgerProps.sources).map(([key, provider], i) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span style={{ opacity: 0.4 }}>·</span>}
                <span>{LEDGER_SOURCE_LABELS[key] ?? key}</span>
                <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(30,26,20,0.07)', fontWeight: 700, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  {LEDGER_PROVIDER_LABELS[provider] ?? provider}
                </span>
              </span>
            ))}
            {ledgerProps.queryRunAt && <span style={{ opacity: 0.4 }}>·</span>}
            {ledgerProps.queryRunAt && (
              <span>Query run <strong>{formatTimestamp(ledgerProps.queryRunAt)}</strong></span>
            )}
          </div>
          {ledgerProps.warnings.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {ledgerProps.warnings.map(w => (
                <span key={w} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, background: 'rgba(191,78,50,0.08)', border: '1px solid rgba(191,78,50,0.20)', color: 'rgba(191,78,50,0.8)' }}>
                  {w}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: subFg, marginTop: 4, lineHeight: 1.5 }}>{ledgerProps.dataNote}</div>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>Activity Level</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: activityColor, letterSpacing: 0.5, marginTop: 4 }}>
            {metrics.activityLevel}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>Largest Movement</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtUSD(metrics.largestMovement, true)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>Concentration</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{metrics.concentration.toFixed(1)}%</div>
          <div style={{ marginTop: 5, height: 3, borderRadius: 2, background: 'rgba(30,26,20,0.07)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, metrics.concentration)}%`,
              background: concentrationBarColor(metrics.concentration),
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>High-value Movements</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{metrics.signalCount}</div>
        </div>
      </div>

      {/* Narrative / AI analysis */}
      {hasNarrative && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid rgba(30,26,20,0.08)', margin: '16px 0' }} />
          {inShort && (
            <>
              <p style={{ lineHeight: 1.8, fontSize: 15, margin: 0 }}>{inShort.s1}</p>
              {inShort.s2 && <p style={{ lineHeight: 1.8, fontSize: 15, color: subFg, margin: '6px 0 0' }}>{inShort.s2}</p>}
              <p style={{ lineHeight: 1.8, fontSize: 15, color: subFg, margin: '6px 0 0' }}>{inShort.s3}</p>
            </>
          )}
          {narrativeCard && (
            <>
              {inShort && <hr style={{ border: 'none', borderTop: '1px solid rgba(30,26,20,0.06)', margin: '14px 0' }} />}
              <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.4, marginBottom: 10 }}>
                {narrativeCard.headline}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: narrativeCard.keyPoints.length > 0 ? 12 : 0 }}>
                {narrativeCard.body}
              </p>
              {narrativeCard.keyPoints.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.75, color: subFg }}>
                  {narrativeCard.keyPoints.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
              )}
              {narrativeCard.caveats.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setCaveatsOpen(o => !o)}
                    style={{ background: 'none', border: 'none', fontSize: 11, color: subFg, cursor: 'pointer', padding: 0, letterSpacing: 0.3 }}
                  >
                    {caveatsOpen ? '▲' : '▼'} {narrativeCard.caveats.length} caveat{narrativeCard.caveats.length === 1 ? '' : 's'}
                  </button>
                  {caveatsOpen && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, color: subFg, lineHeight: 1.55 }}>
                      {narrativeCard.caveats.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <p style={{ fontSize: 11, color: subFg, marginTop: 14, fontStyle: 'italic' }}>
        * High-value movements are transactions exceeding {fmtUSD(THRESHOLD_HIGH_VALUE)} or daily volume spikes detected in node history.
      </p>
    </div>
  );
}

WhaleSummaryCard.propTypes = {
  metrics: PropTypes.shape({
    activityLevel: PropTypes.string.isRequired,
    largestMovement: PropTypes.number.isRequired,
    concentration: PropTypes.number.isRequired,
    signalCount: PropTypes.number.isRequired,
  }).isRequired,
  activityColor: PropTypes.string.isRequired,
  subFg: PropTypes.string.isRequired,
  narrativeCard: PropTypes.object,
  inShort: PropTypes.object,
  ledgerProps: PropTypes.object,
};

function Activity12wPanel({ activity12wGrid, dune12wData, activityBreakdown, subFg }) {
  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="ww-soft-label">Activity · 12 weeks</div>
        {activity12wGrid.walletData12w.activity_tier && (
          <Badge variant="data">{activity12wGrid.walletData12w.activity_tier}</Badge>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3, marginBottom: 12 }}>
        {activity12wGrid.weeks.map((week, wi) => (
          <div key={week[0]?.date || `week-${wi}`} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map(day => {
              const decoratedDay = { ...day, breakdown: activityBreakdown?.[day.date] };
              const pill = getBreakdownPill(decoratedDay);
              return (
                <div key={day.date} className="ww-heatmap-breakdown-cell" style={{ position: 'relative' }}>
                  <div
                    title={getActivityDayTitle(decoratedDay)}
                    style={getActivityDayStyle(decoratedDay)}
                  />
                  {pill && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: 'calc(100% + 5px)',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        opacity: 0,
                        pointerEvents: 'none',
                        background: 'rgba(30,26,20,0.88)',
                        color: '#fff',
                        borderRadius: 3,
                        padding: '3px 6px',
                        fontSize: 10,
                        zIndex: 2,
                      }}
                      className="ww-heatmap-breakdown-pill"
                    >
                      {pill}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* Intensity legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: subFg }}>Activity intensity:</span>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {[
            { alpha: 0.06, label: 'None' },
            { alpha: 0.22, label: 'Low' },
            { alpha: 0.45, label: 'Moderate' },
            { alpha: 0.72, label: 'High' },
            { alpha: 0.93, label: 'Peak' },
          ].map(({ alpha, label }) => (
            <span
              key={alpha}
              title={label}
              style={{
                display: 'inline-block',
                width: 10, height: 10,
                borderRadius: 2,
                background: `rgba(${TERRACOTTA},${alpha})`,
                border: `1px solid rgba(${TERRACOTTA},${alpha < 0.15 ? 0.1 : 0.2})`,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 10, color: subFg }}>Low → Peak</span>
      </div>

      {/* Freshness footer — Dune Analytics · scheduled wallet data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: subFg, letterSpacing: 0.5 }}>
          Dune Analytics · scheduled wallet data
        </span>
        {dune12wData?.metadata?.queryRunAt && (
          <span style={{ fontSize: 10, color: subFg }}>
            · last run: {formatTimestamp(dune12wData.metadata.queryRunAt)}
          </span>
        )}
        {dune12wData?.metadata?.isStale && (
          <Badge variant="time" tone="risk">stale</Badge>
        )}
      </div>
    </div>
  );
}

Activity12wPanel.propTypes = {
  activity12wGrid: PropTypes.shape({
    weeks: PropTypes.array.isRequired,
    walletData12w: PropTypes.shape({
      activity_tier: PropTypes.string,
    }).isRequired,
  }).isRequired,
  dune12wData: PropTypes.shape({
    metadata: PropTypes.shape({
      queryRunAt: PropTypes.string,
      isStale: PropTypes.bool,
    }),
  }),
  activityBreakdown: PropTypes.object,
  subFg: PropTypes.string.isRequired,
};

function ActivitySampledFallbackPanel({ metrics, activityColor, subFg }) {
  const dataNote = metrics.isSynthetic
    ? 'Aggregated node activity · in-graph data'
    : 'Sampled transaction history · live wallet data';
  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div className="ww-soft-label" style={{ marginBottom: 12 }}>Recent activity</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>Tx Count</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {metrics.topMovements.length > 0 ? metrics.topMovements.length : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>Peak Volume</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtUSD(metrics.largestMovement, true)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: subFg, textTransform: 'uppercase', marginBottom: 4 }}>Activity</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: activityColor }}>
            {metrics.activityLevel}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 10, color: subFg, letterSpacing: 0.5 }}>{dataNote}</span>
      </div>
    </div>
  );
}

ActivitySampledFallbackPanel.propTypes = {
  metrics: PropTypes.shape({
    topMovements: PropTypes.array.isRequired,
    largestMovement: PropTypes.number.isRequired,
    activityLevel: PropTypes.string.isRequired,
    isSynthetic: PropTypes.bool,
  }).isRequired,
  activityColor: PropTypes.string.isRequired,
  subFg: PropTypes.string.isRequired,
};

const SKELETON_CELL_IDS = Array.from({ length: 84 }, (_, i) => `heatmap-${i}`);

function ActivityLoadingPanel({ subFg }) {
  return (
    <div className="ww-card ww-card-sharp ww-skeleton-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div>
          <div className="ww-soft-label" style={{ marginBottom: 6 }}>Activity - 12 weeks</div>
          <div style={{ fontSize: 12, color: subFg }}>Indexing scheduled wallet activity.</div>
        </div>
        <Badge variant="time">syncing</Badge>
      </div>
      <div className="ww-skeleton-heatmap" aria-label="Loading 12 week activity">
        {SKELETON_CELL_IDS.map(id => (
          <span key={id} className="ww-skeleton-cell" />
        ))}
      </div>
    </div>
  );
}

ActivityLoadingPanel.propTypes = {
  subFg: PropTypes.string.isRequired,
};

function ActivityCoverageNotice({ subFg }) {
  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 16, borderColor: 'rgba(191,78,50,0.18)', background: 'rgba(191,78,50,0.045)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(30,26,20,0.82)' }}>Scheduled activity unavailable</div>
          <div style={{ fontSize: 12, color: subFg, lineHeight: 1.45, marginTop: 3 }}>
            Showing sampled or graph-derived activity until the scheduled Dune feed is available.
          </div>
        </div>
        <Badge variant="status" tone="warn">partial coverage</Badge>
      </div>
    </div>
  );
}

ActivityCoverageNotice.propTypes = {
  subFg: PropTypes.string.isRequired,
};

function MovementsGrid({ metrics, subFg }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
      <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
        <div className="ww-soft-label" style={{ marginBottom: 16 }}>
          {metrics.isSynthetic ? 'Largest daily spikes' : 'Largest movements'}
        </div>
        {metrics.topMovements.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {metrics.topMovements.map((tx) => (
              <div key={tx.hash || `${tx.timeStamp}-${tx.valueUSD}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{fmtUSD(tx.valueUSD || 0, true)}</span>
                  <span style={{ fontSize: 11, color: subFg }}>{fmtDate(normalizeTimestamp(tx.timeStamp))}</span>
                </div>
                {tx.hash && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: subFg }}>{shortAddr(tx.hash)}</span>}
                {tx.isDaily && <Badge variant="time">Daily total</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: subFg }}>No large movements detected.</div>
        )}
      </div>

      <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
        <div className="ww-soft-label" style={{ marginBottom: 16 }}>Top counterparties</div>
        {metrics.topCounterparties.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {metrics.topCounterparties.map((cp, idx) => (
              <div key={cp.address || cp.label || `counterparty-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{cp.label || shortAddr(cp.address)}</span>
                  {cp.count > 0 && <div style={{ marginTop: 4 }}><Badge variant="data">{cp.count} signal{cp.count === 1 ? '' : 's'}</Badge></div>}
                </div>
                <span style={{ fontWeight: 600 }}>{fmtUSD(cp.volume, true)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: subFg }}>No counterparty data available.</div>
        )}
      </div>
    </div>
  );
}

MovementsGrid.propTypes = {
  metrics: PropTypes.shape({
    isSynthetic: PropTypes.bool.isRequired,
    topMovements: PropTypes.array.isRequired,
    topCounterparties: PropTypes.array.isRequired,
  }).isRequired,
  subFg: PropTypes.string.isRequired,
};

// CTA band shown only for token/dex nodes where DEX Screener market data exists.
// Manages its own loading and no-result state so no parent re-render is needed.
function StableSeerContextBand({ query, onOpenStableSeer, subFg }) {
  const [loading, setLoading] = useState(false);
  const [noResult, setNoResult] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setNoResult(false);
    setLoading(true);
    try {
      const result = await onOpenStableSeer(query);
      if (!result) setNoResult(true);
    } catch {
      setNoResult(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div className="ww-soft-label" style={{ marginBottom: 12 }}>Market context</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong>{query}</strong> may have active DEX pairs or pool data.
          </div>
          <div style={{ fontSize: 11, color: subFg, marginTop: 4, lineHeight: 1.5 }}>
            DEX Screener · market data only, no holder analytics
          </div>
          {noResult && (
            <div style={{ fontSize: 11, color: subFg, marginTop: 6 }}>
              No active pairs found for <strong>{query}</strong> in Stable Seer.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            background: loading ? 'rgba(191,78,50,0.06)' : 'rgba(191,78,50,0.10)',
            border: '1px solid rgba(191,78,50,0.28)',
            borderRadius: 4,
            color: '#BF4E32',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            letterSpacing: 0.2,
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Resolving markets…' : 'Stable Seer →'}
        </button>
      </div>
    </div>
  );
}

StableSeerContextBand.propTypes = {
  query: PropTypes.string.isRequired,
  onOpenStableSeer: PropTypes.func.isRequired,
  subFg: PropTypes.string.isRequired,
};

function getActivity12wLabel(dune12wLoading, activity12wGrid, dune12wError) {
  if (dune12wLoading) return '12-week activity loading';
  if (activity12wGrid) return '12-week activity loaded';
  if (dune12wError) return 'scheduled activity unavailable';
  return 'live sample only';
}

function WhaleWatcherDecisionStrip({ metrics, ledgerProps, activity12wGrid, dune12wLoading, dune12wError, stableSeerQuery, subFg }) {
  const chips = [
    {
      label: `${ledgerProps.confidence} confidence`,
      tone: ledgerProps.confidence === 'high' ? 'safe' : 'warn',
    },
    {
      label: getActivity12wLabel(dune12wLoading, activity12wGrid, dune12wError),
      tone: activity12wGrid ? 'safe' : 'warn',
    },
    {
      label: `${metrics.activityLevel.toLowerCase()} activity`,
      tone: getActivityTone(metrics.activityLevel),
    },
    {
      label: stableSeerQuery ? 'market handoff available' : 'wallet analysis focus',
      tone: stableSeerQuery ? 'safe' : 'muted',
    },
  ];

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(220px, 0.65fr)', gap: 18, alignItems: 'center' }} className="ww-decision-strip">
        <div>
          <div className="ww-soft-label" style={{ marginBottom: 8 }}>Decision snapshot</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(30,26,20,0.82)' }}>
            Summary confidence is based on available live samples, scheduled activity, counterparties, holdings, and quantum source facts.
          </div>
          <div style={{ fontSize: 11, color: subFg, marginTop: 6, lineHeight: 1.45 }}>
            {ledgerProps.dataNote}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          {chips.map(chip => (
            <Badge key={chip.label} variant="status" tone={chip.tone}>{chip.label}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

WhaleWatcherDecisionStrip.propTypes = {
  metrics: PropTypes.shape({
    activityLevel: PropTypes.string.isRequired,
  }).isRequired,
  ledgerProps: PropTypes.shape({
    confidence: PropTypes.string.isRequired,
    dataNote: PropTypes.string.isRequired,
  }).isRequired,
  activity12wGrid: PropTypes.object,
  dune12wLoading: PropTypes.bool.isRequired,
  dune12wError: PropTypes.bool.isRequired,
  stableSeerQuery: PropTypes.string,
  subFg: PropTypes.string.isRequired,
};

// ── Narrative card section ────────────────────────────────────────────────────

const CONF_TONE = { high: 'safe', medium: 'warn', low: 'muted' };
const SIGNAL_LABELS = {
  accumulation:            'Sustained Accumulation',
  distribution:            'Sustained Distribution',
  bridge:                  'Bridge Activity',
  cex_deposit:             'CEX Deposit',
  cex_withdrawal:          'CEX Withdrawal',
  new_counterparty:        'New High-Value Counterparty',
  protocol_rotation:       'Protocol Rotation',
  large_move_vs_baseline:  'Large Move vs Baseline',
  unusual_activity:        'Unusual Activity',
  unusual_volume:          'Unusual Volume',
  dormant_wallet_revival:  'Dormant Wallet Revival',
  protocol_entry:          'Protocol Entry',
  protocol_exit:           'Protocol Exit',
  staking_entry:           'Staking Entry',
  staking_exit:            'Staking Exit',
};
const RANK = { high: 3, medium: 2, low: 1 };

function sortSignals(signals) {
  return [...signals].sort((a, b) => {
    const confDelta = (RANK[b.confidence] ?? 2) - (RANK[a.confidence] ?? 2);
    if (confDelta !== 0) return confDelta;
    return (RANK[b.strength] ?? 2) - (RANK[a.strength] ?? 2);
  });
}

function signalLabel(signalType) {
  return SIGNAL_LABELS[signalType] ?? String(signalType || 'signal').replaceAll('_', ' ');
}

function sourceBadgeKey(source, index) {
  return `${source.sourceId || source.sourceType || 'source'}-${source.queryId || index}`;
}

function SignalSourceBadges({ sources, confidence }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {sources.map((source, index) => (
        <DataSourceBadge
          key={sourceBadgeKey(source, index)}
          compact
          source={source}
          confidence={confidence}
        />
      ))}
    </div>
  );
}

SignalSourceBadges.propTypes = {
  sources: PropTypes.array,
  confidence: PropTypes.string,
};

function sourceFooterEntry(source) {
  if (!source) return null;
  return {
    kind:     source.sourceId || source.queryName || source.sourceType || 'signalSource',
    provider: source.sourceType || source.provider || source.sourceId || 'computed',
  };
}

function collectSourceFooterSources({ ledgerProps, walletSignals, narrativeCard }) {
  const seen = new Set();
  const out = [];

  function add(entry) {
    if (!entry?.provider) return;
    const key = `${entry.kind || 'source'}:${entry.provider}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  }

  Object.entries(ledgerProps?.sources ?? {}).forEach(([kind, provider]) => add({ kind, provider }));
  walletSignals.forEach(signal => (signal.sources ?? []).forEach(source => add(sourceFooterEntry(source))));
  (narrativeCard?.sources ?? []).forEach(source => add(sourceFooterEntry(source)));

  return out;
}

function WhaleWatcherSourceFooter({ ledgerProps, walletSignals, narrativeCard }) {
  const sources = collectSourceFooterSources({ ledgerProps, walletSignals, narrativeCard });
  const warnings = [
    ...(Array.isArray(ledgerProps?.warnings) ? ledgerProps.warnings : []),
    ...(narrativeCard?.caveats ?? []).filter(caveat => /source|sample|partial|estimated|stale|scheduled/i.test(caveat)),
  ];

  return (
    <SourceConfidenceLedger
      mode="whale-watcher"
      sources={sources}
      confidence={ledgerProps?.confidence}
      generatedAt={narrativeCard?.generatedAt}
      queryRunAt={ledgerProps?.queryRunAt}
      warnings={warnings}
      dataNote={ledgerProps?.dataNote}
    />
  );
}

WhaleWatcherSourceFooter.propTypes = {
  ledgerProps: PropTypes.shape({
    sources:    PropTypes.object,
    confidence: PropTypes.string,
    queryRunAt: PropTypes.string,
    warnings:   PropTypes.array,
    dataNote:   PropTypes.string,
  }).isRequired,
  walletSignals: PropTypes.arrayOf(PropTypes.object).isRequired,
  narrativeCard: PropTypes.object,
};

function WhaleWatcherSignalRail({ signals, subFg, selectedSignalId, onSelectSignal }) {
  const sortedSignals = sortSignals(signals);

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div>
          <div className="ww-soft-label" style={{ marginBottom: 6 }}>Signal rail</div>
          <div style={{ fontSize: 13, color: subFg, lineHeight: 1.5 }}>
            Deterministic wallet signals from the formal signal engine.
          </div>
        </div>
        <Badge variant="data">{sortedSignals.length} signal{sortedSignals.length === 1 ? '' : 's'}</Badge>
      </div>

      {sortedSignals.length === 0 ? (
        <div style={{ border: '1px dashed rgba(30,26,20,0.16)', borderRadius: 4, padding: 14, fontSize: 13, color: subFg, lineHeight: 1.55 }}>
          No deterministic signals detected for this window. Whale Watcher is still showing sampled activity and graph-derived context below.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {sortedSignals.map(signal => {
            const selected = signal.signalId === selectedSignalId;
            return (
            <div
              key={signal.signalId}
              style={{
                border: '1px solid rgba(30,26,20,0.08)',
                borderRadius: 4,
                background: selected ? 'rgba(191,78,50,0.08)' : 'rgba(255,252,246,0.62)',
                boxShadow: selected ? 'inset 0 0 0 1px rgba(191,78,50,0.36)' : 'none',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => onSelectSignal?.(signal.signalId)}
                aria-pressed={selected}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  padding: 14,
                  cursor: onSelectSignal ? 'pointer' : 'default',
                  font: 'inherit',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(30,26,20,0.84)', lineHeight: 1.35 }}>
                    {signalLabel(signal.signalType)}
                  </div>
                  <Badge variant="status" tone={CONF_TONE[signal.confidence] ?? 'muted'}>
                    {signal.confidence}
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Badge variant="data">{signal.strength} strength</Badge>
                  <Badge variant="time">{formatTimestamp(signal.detectedAt) || 'computed'}</Badge>
                </div>
              </button>
              {signal.caveats?.length > 0 && (
                <details style={{ margin: '0 14px 14px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11, color: subFg }}>
                    {signal.caveats.length} caveat{signal.caveats.length === 1 ? '' : 's'}
                  </summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16, color: subFg, fontSize: 11, lineHeight: 1.5 }}>
                    {signal.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}
                  </ul>
                </details>
              )}
              <div style={{ padding: '0 14px 14px' }}>
                <SignalSourceBadges sources={signal.sources} confidence={signal.confidence} />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

WhaleWatcherSignalRail.propTypes = {
  signals: PropTypes.arrayOf(PropTypes.object).isRequired,
  subFg: PropTypes.string.isRequired,
  selectedSignalId: PropTypes.string,
  onSelectSignal: PropTypes.func,
};

function NarrativeCardSection({ card, subFg }) {
  const [caveatsOpen, setCaveatsOpen] = useState(false);
  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div className="ww-soft-label">Intelligence briefing</div>
        <Badge variant="status" tone={CONF_TONE[card.confidence] ?? 'muted'}>
          {card.confidence} confidence
        </Badge>
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.4, marginBottom: 10 }}>
        {card.headline}
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: card.keyPoints.length > 0 ? 12 : 0 }}>
        {card.body}
      </p>
      {card.keyPoints.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.75, color: subFg }}>
          {card.keyPoints.map((pt) => <li key={pt}>{pt}</li>)}
        </ul>
      )}
      {card.caveats.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setCaveatsOpen(o => !o)}
            style={{ background: 'none', border: 'none', fontSize: 11, color: subFg, cursor: 'pointer', padding: 0, letterSpacing: 0.3 }}
          >
            {caveatsOpen ? '▲' : '▼'} {card.caveats.length} caveat{card.caveats.length === 1 ? '' : 's'}
          </button>
          {caveatsOpen && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, color: subFg, lineHeight: 1.55 }}>
              {card.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>
      )}
      <SignalSourceBadges sources={card.sources} confidence={card.confidence} />
    </div>
  );
}

NarrativeCardSection.propTypes = {
  card: PropTypes.shape({
    headline:   PropTypes.string.isRequired,
    body:       PropTypes.string.isRequired,
    keyPoints:  PropTypes.arrayOf(PropTypes.string).isRequired,
    confidence: PropTypes.string.isRequired,
    caveats:    PropTypes.arrayOf(PropTypes.string).isRequired,
    sources:    PropTypes.array,
  }).isRequired,
  subFg: PropTypes.string.isRequired,
};

// ── Main component ────────────────────────────────────────────────────────────

function isPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function formatFactDate(value) {
  if (!value) return 'Unknown';
  const ms = normalizeTimestamp(value);
  return ms ? fmtDate(ms) : 'Unknown';
}

function formatFactNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : 'Unknown';
}

function formatFactBool(value, yes = 'Detected', no = 'Not detected') {
  if (value === true) return yes;
  if (value === false) return no;
  return 'Unknown';
}

function exposureStatusLabel(status) {
  if (status === 'signature_exposure_observed') return 'Signature observed';
  if (status === 'no_outgoing_signature_observed') return 'No outgoing signature observed';
  if (status === 'contract_wallet') return 'Contract wallet';
  return 'Unknown';
}

function dormancyLabel(bucket, daysDormant) {
  const days = typeof daysDormant === 'number' ? `${daysDormant.toLocaleString()} days` : null;
  if (bucket === 'active_0_30d') return days ? `Active - ${days}` : 'Active';
  if (bucket === 'warm_dormant_30_180d') return days ? `Warm dormant - ${days}` : 'Warm dormant';
  if (bucket === 'cold_dormant_180_730d') return days ? `Cold dormant - ${days}` : 'Cold dormant';
  if (bucket === 'ancient_dormant_730d_plus') return days ? `Ancient dormant - ${days}` : 'Ancient dormant';
  return days ?? 'Unknown';
}

function sourceLabel(duneQuantumResponse) {
  if (!duneQuantumResponse) return 'Live wallet sample';
  const warnings = duneQuantumResponse.metadata?.warnings ?? [];
  if (warnings.some(w => String(w).toLowerCase().includes('dune auto-run data unavailable'))) return 'Partial Dune auto-run';
  if (warnings.some(w => String(w).toLowerCase().includes('days old'))) return 'Dune auto-run — stale';
  return 'Dune auto-run';
}

function getSignatureFactTone(status) {
  if (status === 'signature_exposure_observed') return 'observed';
  if (status === 'unknown') return 'unknown';
  return 'partial';
}

function getDormancyFactTone(bucket) {
  if (bucket === 'unknown') return 'unknown';
  if (bucket === 'active_0_30d') return 'ready';
  return 'partial';
}

function getWalletStructureLabel(facts, migrationReadiness, contractWallet) {
  if (!contractWallet) {
    return formatFactBool(facts?.isContract, 'Contract wallet', 'EOA');
  }

  if (migrationReadiness?.contractWalletType) return migrationReadiness.contractWalletType;
  if (facts?.isSafeWallet) return 'Safe wallet';
  if (facts?.isMultisig) return 'Multisig';
  return 'Contract wallet';
}

function getWalletStructureTone(contractWallet, facts) {
  if (contractWallet) return 'ready';
  if (facts?.isContract === false) return 'partial';
  return 'unknown';
}

function getMigrationSignalLabel(migrationReadiness) {
  if (migrationReadiness?.recentMigrationSignal) return 'Migration-like activity observed';
  if (migrationReadiness?.recentSplitFundsSignal) return 'Split-funds signal observed';
  return 'None observed';
}

function buildSourceFactRows({ facts, exposure, valueAtRisk, migrationReadiness }) {
  const status = exposure?.exposureStatus ?? 'unknown';
  const contractWallet =
    facts?.isContract === true ||
    facts?.isSafeWallet === true ||
    facts?.isMultisig === true ||
    facts?.isAccountAbstractionWallet === true;

  return [
    {
      label: 'Signature status',
      value: exposureStatusLabel(status),
      detail: facts?.firstOutgoingTxAt ? `first outgoing ${formatFactDate(facts.firstOutgoingTxAt)}` : 'based on outgoing tx evidence',
      tone: getSignatureFactTone(status),
    },
    {
      label: 'Dormancy',
      value: dormancyLabel(exposure?.dormancyBucket, facts?.daysDormant),
      detail: facts?.lastOutgoingTxAt ? `last outgoing ${formatFactDate(facts.lastOutgoingTxAt)}` : 'last active source fact',
      tone: getDormancyFactTone(exposure?.dormancyBucket),
    },
    {
      label: 'Value at risk',
      value: typeof facts?.totalBalanceUsd === 'number' ? fmtUSD(facts.totalBalanceUsd, true) : 'Unknown',
      detail: valueAtRisk?.topTokenSymbol
        ? `top asset ${valueAtRisk.topTokenSymbol} ${fmtUSD(valueAtRisk.topTokenBalanceUsd, true)}`
        : 'native plus token snapshot',
      tone: typeof facts?.totalBalanceUsd === 'number' ? 'observed' : 'unknown',
    },
    {
      label: 'Wallet structure',
      value: getWalletStructureLabel(facts, migrationReadiness, contractWallet),
      detail: facts?.isAccountAbstractionWallet ? 'account abstraction signal detected' : 'EOA/contract classification',
      tone: getWalletStructureTone(contractWallet, facts),
    },
    {
      label: 'Lifetime activity',
      value: `${formatFactNumber(facts?.signedTxCount)} signed / ${formatFactNumber(facts?.txCountLifetime)} total`,
      detail: facts?.firstSeenAt ? `first seen ${formatFactDate(facts.firstSeenAt)}` : 'indexed transaction count',
      tone: isPresent(facts?.signedTxCount) || isPresent(facts?.txCountLifetime) ? 'observed' : 'unknown',
    },
    {
      label: 'Migration signals',
      value: getMigrationSignalLabel(migrationReadiness),
      detail: migrationReadiness?.lastSecurityHygieneAt
        ? `security hygiene ${formatFactDate(migrationReadiness.lastSecurityHygieneAt)}`
        : `${formatFactNumber(migrationReadiness?.riskyApprovalCount)} risky approvals`,
      tone: migrationReadiness?.recentMigrationSignal || migrationReadiness?.recentSplitFundsSignal ? 'ready' : 'unknown',
    },
  ];
}

const PARTIAL_COVERAGE_COPY =
  'Scheduled Dune quantum facts are unavailable right now. WalletWall is showing live/sample-derived signals where available. Treat this as a partial risk view, not a complete quantum readiness assessment.';
const STALE_COVERAGE_COPY =
  'One or more scheduled Dune quantum queries have not run recently. Source-backed facts may not reflect the latest on-chain state.';

function classifyCoverage(warnings) {
  const lower = warnings.map(w => String(w).toLowerCase());
  const hasUnavailable = lower.some(w => w.includes('dune auto-run data unavailable'));
  const hasStale = lower.some(w => w.includes('days old'));
  if (hasUnavailable) {
    return { title: 'Limited source coverage', body: PARTIAL_COVERAGE_COPY };
  }
  if (hasStale) {
    return { title: 'Scheduled facts may be stale', body: STALE_COVERAGE_COPY };
  }
  return { title: 'Source caveats', body: 'Some source-backed facts could not be confirmed for this wallet.' };
}

function PartialCoverageNotice({ warnings, subFg }) {
  const { title, body } = classifyCoverage(warnings);
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid rgba(139,49,32,0.10)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge variant="status" tone="warn">{title}</Badge>
        <span style={{ fontSize: 11, color: subFg, letterSpacing: 0.4 }}>
          Confidence downgraded · partial source coverage
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(30,26,20,0.75)', lineHeight: 1.5 }}>
        {body}
      </div>
      <details style={{ marginTop: 2 }}>
        <summary
          style={{
            fontSize: 11,
            color: subFg,
            cursor: 'pointer',
            letterSpacing: 0.4,
          }}
        >
          Show source warnings
        </summary>
        <ul
          style={{
            margin: '6px 0 0',
            padding: '0 0 0 14px',
            listStyle: 'disc',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {warnings.map(warning => (
            <li key={warning} style={{ color: subFg, fontSize: 11, lineHeight: 1.45 }}>
              {warning}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

PartialCoverageNotice.propTypes = {
  warnings: PropTypes.arrayOf(PropTypes.string).isRequired,
  subFg: PropTypes.string.isRequired,
};

function SourceBackedFactsPanel({ facts, exposure, scoreResult, duneQuantumResponse, valueAtRisk, migrationReadiness, adversarialSignals, duneProvenance, subFg }) {
  const rows = buildSourceFactRows({ facts, exposure, valueAtRisk, migrationReadiness });
  const meta = duneQuantumResponse?.metadata ?? {};
  const timestamps = [
    meta.signatureQueryRunAt,
    meta.valueAtRiskQueryRunAt,
    meta.migrationQueryRunAt,
  ].filter(Boolean).sort((a, b) => b.localeCompare(a));
  const latestRunAt = timestamps[0] ?? null;
  const warnings = meta.warnings ?? [];

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div className="ww-soft-label" style={{ marginBottom: 6 }}>
            Quantum source facts
          </div>
          <div style={{ fontSize: 13, color: subFg, lineHeight: 1.5 }}>
            Facts are provenance fields for the heuristic score, not claims of current exploitability.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge variant="data">{sourceLabel(duneQuantumResponse)}</Badge>
          {scoreResult?.confidence && <Badge variant="status" tone={CONF_TONE[scoreResult.confidence] ?? 'muted'}>{scoreResult.confidence} confidence</Badge>}
          {latestRunAt && <Badge variant="time">{formatTimestamp(latestRunAt)}</Badge>}
        </div>
      </div>

      <div className="ww-source-facts-grid">
        {rows.map(row => (
          <div key={row.label} className="ww-source-fact">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 7 }}>
              <div className="ww-label">{row.label}</div>
              <span className={`ww-source-fact-dot ww-source-fact-dot--${row.tone}`} />
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: 'rgba(30,26,20,0.84)' }}>
              {row.value}
            </div>
            <div style={{ marginTop: 6, color: subFg, fontSize: 11, lineHeight: 1.45 }}>
              {row.detail}
            </div>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <PartialCoverageNotice warnings={warnings} subFg={subFg} />
      )}

      <QuantumExposureCard
        isSubsection={true}
        exposure={exposure}
        scoreResult={scoreResult}
        adversarialSignals={adversarialSignals}
        duneProvenance={duneProvenance}
      />
    </div>
  );
}

SourceBackedFactsPanel.propTypes = {
  facts: PropTypes.object,
  exposure: PropTypes.object,
  scoreResult: PropTypes.object,
  duneQuantumResponse: PropTypes.object,
  valueAtRisk: PropTypes.object,
  migrationReadiness: PropTypes.object,
  adversarialSignals: PropTypes.object,
  duneProvenance: PropTypes.object,
  subFg: PropTypes.string.isRequired,
};

function getActivityLevel(volume, interactions) {
  if (volume > VOLUME_HIGH || interactions > TX_COUNT_HIGH) return 'High';
  if (volume > VOLUME_MEDIUM || interactions > TX_COUNT_MEDIUM) return 'Medium';
  return 'Low';
}

function normalizeCounterparties(counterparties) {
  return (counterparties || []).map(cp => ({
    address: cp.address,
    label: cp.label,
    volume: cp.volumeUSD || cp.volume,
    count: cp.interactions || cp.count,
  }));
}

function buildSyntheticMetrics(node) {
  const volume = node.volumeUSD || 0;
  const interactions = node.interactions || 0;
  const timelineMovements = (node.timeline || [])
    .filter(d => (d.volumeUSD || 0) > 0)
    .sort((a, b) => (b.volumeUSD || 0) - (a.volumeUSD || 0))
    .slice(0, 5)
    .map(d => ({ valueUSD: d.volumeUSD, timeStamp: d.date, isDaily: true }));

  const largestMovement = timelineMovements.length > 0 ? timelineMovements[0].valueUSD : 0;
  const concentration = volume > 0 ? (largestMovement / volume) * 100 : 0;
  const anomalySignals = (node.anomalies || []).filter(a => a.type === 'large_tx').length;
  const dailySpikes = timelineMovements.filter(m => m.valueUSD > THRESHOLD_HIGH_VALUE).length;

  return {
    activityLevel: getActivityLevel(volume, interactions),
    largestMovement,
    concentration,
    signalCount: Math.max(anomalySignals, dailySpikes),
    topMovements: timelineMovements,
    topCounterparties: normalizeCounterparties(node.topCounterparties),
    isSynthetic: true,
  };
}

function getNodeTransactions(node, walletData) {
  const txs = walletData?.transactions || [];
  const nodeAddrLc = node.fullAddress.toLowerCase();
  return txs.filter(t => {
    const to = t.to?.toLowerCase();
    const from = t.from?.toLowerCase();
    return to === nodeAddrLc || from === nodeAddrLc;
  });
}

function buildCounterpartyCounts(nodeTxs, nodeAddrLc) {
  const cpCounts = {};
  nodeTxs.forEach(tx => {
    const from = tx.from?.toLowerCase();
    const other = from === nodeAddrLc ? tx.to : tx.from;
    if (!other || other === nodeAddrLc) return;
    if (!cpCounts[other]) cpCounts[other] = { address: other, volume: 0, count: 0 };
    cpCounts[other].volume += tx.valueUSD || 0;
    cpCounts[other].count += 1;
  });
  return Object.values(cpCounts).sort((a, b) => b.volume - a.volume).slice(0, 5);
}

function buildAddressMetrics(node, walletData) {
  const nodeTxs = getNodeTransactions(node, walletData);
  const values = nodeTxs.map(t => t.valueUSD || 0).filter(v => v > 0);
  const largestMovement = values.length ? Math.max(...values) : 0;
  const totalVolume = values.reduce((s, v) => s + v, 0);
  const concentration = totalVolume > 0 ? (largestMovement / totalVolume) * 100 : 0;
  const nodeAddrLc = node.fullAddress.toLowerCase();

  return {
    activityLevel: getActivityLevel(totalVolume, nodeTxs.length),
    largestMovement,
    concentration,
    signalCount: nodeTxs.filter(t => (t.valueUSD || 0) > THRESHOLD_HIGH_VALUE).length,
    topMovements: [...nodeTxs].sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0)).slice(0, 5),
    topCounterparties: buildCounterpartyCounts(nodeTxs, nodeAddrLc),
    isSynthetic: false,
  };
}

function buildWhaleWatcherMetrics(node, walletData) {
  const nodeId = node.id || '';
  const isSynthetic = !node.fullAddress || nodeId.startsWith('token_') || nodeId.startsWith('protocol_');
  return isSynthetic ? buildSyntheticMetrics(node) : buildAddressMetrics(node, walletData);
}

export default function WhaleWatcher({ node, walletData, dune12wData, dune12wLoading = false, dune12wError = false, onOpenStableSeer, selectedSignalId, onSelectSignal }) {
  const subFg = COLORS.brand.inkSubtle;

  // ── Metrics & Analytics ──────────────────────────────────────────────────
  const metrics = useMemo(() => buildWhaleWatcherMetrics(node, walletData), [node, walletData]);

  const activityTone  = getActivityTone(metrics.activityLevel);
  const activityColor = getActivityColor(activityTone);

  // ── 12-week activity grid from Dune scheduled data ────────────────────────
  const activity12wGrid = useMemo(
    () => buildActivity12wGrid(dune12wData, node?.fullAddress),
    [dune12wData, node?.fullAddress],
  );
  const walletApiAddress = useMemo(() => {
    if (isValidEvmAddress(walletData?.address)) return walletData.address;
    if (isValidEvmAddress(node?.fullAddress)) return node.fullAddress;
    return null;
  }, [node?.fullAddress, walletData?.address]);

  const stableSeerQuery = useMemo(() => deriveStableSeerQuery(node), [node]);
  const isQuantumWalletNode = useMemo(() => isWalletLikeQuantumNode(node), [node]);

  // ── Quantum Intelligence ──────────────────────────────────────────────────
  const [duneQuantumResponse, setDuneQuantumResponse] = useState(null);
  const [quantumReadinessResponse, setQuantumReadinessResponse] = useState(null);
  const [activityBreakdown, setActivityBreakdown] = useState({});

  useEffect(() => {
    if (!walletApiAddress) {
      setActivityBreakdown({});
      return;
    }
    let mounted = true;
    fetch(`/api/wallet-activity-breakdown?address=${encodeURIComponent(walletApiAddress)}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!mounted) return;
        setActivityBreakdown(data?.breakdown ?? {});
      })
      .catch(() => {
        if (mounted) setActivityBreakdown({});
      });
    return () => { mounted = false; };
  }, [walletApiAddress]);

  useEffect(() => {
    const address = node?.fullAddress;
    if (!isQuantumWalletNode) { setDuneQuantumResponse(null); return; }
    let mounted = true;
    (async () => {
      const data = await fetchDuneQuantumFacts(address);
      if (mounted) setDuneQuantumResponse(data);
    })();
    return () => { mounted = false; };
  }, [isQuantumWalletNode, node?.fullAddress]);

  useEffect(() => {
    const address = node?.fullAddress;
    if (!isQuantumWalletNode || !isValidEvmAddress(address)) { setQuantumReadinessResponse(null); return; }
    let mounted = true;
    (async () => {
      const data = await fetchQuantumReadiness(address);
      if (mounted) setQuantumReadinessResponse(data);
    })();
    return () => { mounted = false; };
  }, [isQuantumWalletNode, node?.fullAddress]);

  const quantumResult = useMemo(() => {
    const liveFacts          = isQuantumWalletNode ? walletNodeToQuantumFacts(node, walletData) : null;
    const facts              = mergeDuneIntoWalletFacts(liveFacts, duneQuantumResponse);
    const chainProfile       = getChainSignatureProfile(facts?.chain ?? null);
    const exposure           = deriveWalletSignatureExposure(facts, chainProfile);
    const rawScore           = deriveQuantumExposureScore(exposure);
    const scoreResult        = appendDuneSourceCaveats(rawScore, duneQuantumResponse);
    const adversarialSignals = deriveAdversarialSignals(node, walletData, dune12wData);
    const heuristicReadiness = buildQuantumVaultReadiness(walletData, {
      node,
      exposure,
      walletFacts: facts,
      totalBalanceUsd: facts?.totalBalanceUsd ?? node?.volumeUSD,
      isContract: facts?.isContract === true,
      isSafeWallet: facts?.isSafeWallet === true,
      isMultisig: facts?.isMultisig === true,
      canDetectContract: facts?.isContract != null,
      canDetectMultisig: facts?.isSafeWallet != null || facts?.isMultisig != null,
    });
    const readiness = hasMatchedReadinessSources(quantumReadinessResponse)
      ? quantumReadinessResponse.readiness
      : {
        ...heuristicReadiness,
        sourceMode: 'heuristic',
        provenance: {
          sourceMode: 'heuristic',
          dataNote: 'wallet heuristics',
          queryRunAt: null,
        },
      };
    const migration = buildMigrationReadiness(facts, exposure, scoreResult, {
      totalValueUsd: facts?.totalBalanceUsd ?? node?.volumeUSD ?? null,
    });
    return { facts, liveFacts, exposure, scoreResult, adversarialSignals, readiness, migration };
  }, [isQuantumWalletNode, node, walletData, dune12wData, duneQuantumResponse, quantumReadinessResponse]);

  const duneProvenance = useMemo(() => {
    if (!duneQuantumResponse) return null;
    const wf   = duneQuantumResponse.walletFacts;
    const meta = duneQuantumResponse.metadata ?? {};
    const sources = ['on-chain signature activity'];
    if (wf?.daysDormant          != null) sources.push('dormant quantum exposure');
    if (wf?.totalBalanceUsd      != null) sources.push('value at risk');
    if (duneQuantumResponse.migrationReadiness) sources.push('migration readiness');
    const timestamps = [
      meta.signatureQueryRunAt,
      meta.valueAtRiskQueryRunAt,
      meta.migrationQueryRunAt,
    ].filter(Boolean).sort((a, b) => b.localeCompare(a));
    const queryRunAt = timestamps[0] ?? null;
    return { sources, queryRunAtFormatted: queryRunAt ? formatTimestamp(queryRunAt) : null };
  }, [duneQuantumResponse]);

  const walletSignals = useMemo(
    () => deriveWhaleWatcherSignals(node, walletData, dune12wData),
    [node, walletData, dune12wData],
  );
  const protocolAffinityFallback = useMemo(
    () => buildFallbackProtocols(walletData),
    [walletData],
  );

  useEffect(() => {
    if (!selectedSignalId) return;
    if (walletSignals.some(signal => signal.signalId === selectedSignalId)) return;
    onSelectSignal?.(null);
  }, [onSelectSignal, selectedSignalId, walletSignals]);

  const narrativeCard = useMemo(
    () => buildNarrativeCard(walletSignals),
    [walletSignals],
  );

  const inShort = useMemo(() => generateInShort(node), [node]);

  // ── Source & Confidence Ledger inputs ─────────────────────────────────────
  // Live wallet sample is always present (even when synthetic, the node itself
  // is sourced from the graph). Dune scheduled facts join when available.
  const ledgerProps = useMemo(() => {
    const sources = { liveWalletSample: 'alchemy' };
    if (duneQuantumResponse) sources.duneQuantumFacts = 'dune_scheduled';
    if (dune12wData)         sources.duneActivity12w  = 'dune_scheduled';

    const queryTimestamps = [
      dune12wData?.metadata?.queryRunAt,
      duneQuantumResponse?.metadata?.signatureQueryRunAt,
      duneQuantumResponse?.metadata?.valueAtRiskQueryRunAt,
      duneQuantumResponse?.metadata?.migrationQueryRunAt,
    ].filter(Boolean).sort((a, b) => b.localeCompare(a));
    const queryRunAt = queryTimestamps[0] ?? null;

    const warnings = [
      ...(Array.isArray(duneQuantumResponse?.metadata?.warnings) ? duneQuantumResponse.metadata.warnings : []),
      ...(dune12wData?.metadata?.isStale ? ['12-week activity data may be stale'] : []),
    ];

    const hasDune = Boolean(duneQuantumResponse || dune12wData);
    const confidence = hasDune && warnings.length === 0 ? 'high' : 'medium';

    let dataNote;
    if (metrics.isSynthetic) {
      dataNote = 'Aggregated node activity from graph data - no per-wallet on-chain sample available.';
    } else if (dune12wLoading) {
      dataNote = 'Live wallet sample loaded - scheduled Dune facts are still loading for this node.';
    } else if (hasDune) {
      dataNote = 'Combines live wallet sample with scheduled Dune queries; on-chain facts are never real-time.';
    } else if (dune12wError) {
      dataNote = 'Live wallet sample only - scheduled Dune facts are unavailable for this node.';
    } else {
      dataNote = 'Live wallet sample only - scheduled Dune facts not loaded for this node.';
    }

    return { sources, queryRunAt, warnings, confidence, dataNote };
  }, [duneQuantumResponse, dune12wData, dune12wError, dune12wLoading, metrics.isSynthetic]);

  let activityPanel;
  if (activity12wGrid) {
    activityPanel = <Activity12wPanel activity12wGrid={activity12wGrid} dune12wData={dune12wData} activityBreakdown={activityBreakdown} subFg={subFg} />;
  } else if (dune12wLoading) {
    activityPanel = <ActivityLoadingPanel subFg={subFg} />;
  } else {
    activityPanel = <ActivitySampledFallbackPanel metrics={metrics} activityColor={activityColor} subFg={subFg} />;
  }

  return (
    <div className="whale-watcher fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <WhaleSummaryCard
        metrics={metrics}
        activityColor={activityColor}
        subFg={subFg}
        narrativeCard={null}
        inShort={inShort}
        ledgerProps={ledgerProps}
      />

      <WhaleWatcherDecisionStrip
        metrics={metrics}
        ledgerProps={ledgerProps}
        activity12wGrid={activity12wGrid}
        dune12wLoading={dune12wLoading}
        dune12wError={dune12wError}
        stableSeerQuery={stableSeerQuery}
        subFg={subFg}
      />

      <WhaleWatcherSignalRail
        signals={walletSignals}
        subFg={subFg}
        selectedSignalId={selectedSignalId}
        onSelectSignal={onSelectSignal}
      />

      {narrativeCard && (
        <NarrativeCardSection card={narrativeCard} subFg={subFg} />
      )}

      {dune12wError && !activity12wGrid && <ActivityCoverageNotice subFg={subFg} />}

      {activityPanel}

      <MovementsGrid metrics={metrics} subFg={subFg} />

      <WalletHoldingsStrip address={walletApiAddress} />

      <ProtocolAffinityBar address={walletApiAddress} fallbackProtocols={protocolAffinityFallback} />

      <WhaleWatcherSourceFooter
        ledgerProps={ledgerProps}
        walletSignals={walletSignals}
        narrativeCard={narrativeCard}
      />

      {stableSeerQuery && onOpenStableSeer && (
        <StableSeerContextBand query={stableSeerQuery} onOpenStableSeer={onOpenStableSeer} subFg={subFg} />
      )}

      {/* Quantum Intelligence Section */}
      {isQuantumWalletNode && (
      <div style={{ marginTop: 32 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(30,26,20,0.84)', margin: '0 0 6px' }}>
            Quantum Intelligence
          </h2>
          <div style={{ fontSize: 13, color: subFg, lineHeight: 1.5 }}>
            Post-quantum exposure, migration readiness, and wallet structure signals.
          </div>
          <div style={{ fontSize: 11, color: subFg, letterSpacing: 0.5, marginTop: 4 }}>
            No signatures requested · No custody · No funds movement
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SourceBackedFactsPanel
            facts={quantumResult.facts}
            exposure={quantumResult.exposure}
            scoreResult={quantumResult.scoreResult}
            duneQuantumResponse={duneQuantumResponse}
            valueAtRisk={duneQuantumResponse?.valueAtRisk}
            migrationReadiness={duneQuantumResponse?.migrationReadiness}
            adversarialSignals={quantumResult.adversarialSignals}
            duneProvenance={duneProvenance}
            subFg={subFg}
          />
          <QuantumVaultReadinessCard readiness={quantumResult.readiness} migration={quantumResult.migration} />
        </div>
      </div>
      )}
    </div>
  );
}

WhaleWatcher.propTypes = {
  node: PropTypes.shape({
    fullAddress: PropTypes.string,
    id: PropTypes.string,
    volumeUSD: PropTypes.number,
    interactions: PropTypes.number,
    timeline: PropTypes.array,
    anomalies: PropTypes.array,
    topCounterparties: PropTypes.array,
  }),
  walletData: PropTypes.shape({
    transactions: PropTypes.array,
    address: PropTypes.string,
  }),
  dune12wData: PropTypes.shape({
    wallets: PropTypes.object,
    metadata: PropTypes.shape({
      queryRunAt: PropTypes.string,
      isStale: PropTypes.bool,
    }),
  }),
  dune12wLoading: PropTypes.bool,
  dune12wError: PropTypes.bool,
  onOpenStableSeer: PropTypes.func,
  selectedSignalId: PropTypes.string,
  onSelectSignal: PropTypes.func,
};
