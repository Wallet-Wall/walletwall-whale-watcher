import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { StableSeerIcon, SecurityIcon } from './icons/index.js';
import { fmtAddress } from '../lib/holder-wall-formatting.js';

const P = '#BF4E32';
const INK = (a) => `rgba(30,26,20,${a})`;

function prettyLabel(value) {
  if (!value) return '—';
  return String(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatCompactUsd(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  return `$${num.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 })}`;
}

function formatPriceUsd(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `$${num.toLocaleString(undefined, { maximumSignificantDigits: 6 })}`;
}

function formatDate(tsMs) {
  if (tsMs == null) return '—';
  try {
    const d = new Date(tsMs);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatShortDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function FieldRow({ label, value, mono = false, fullWidth = false }) {
  const hasValue = value != null && value !== '' && value !== '—';
  const display = hasValue ? String(value) : '—';
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 9, color: INK(0.4), textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        fontSize: mono ? 11 : 13,
        fontWeight: hasValue ? 600 : 400,
        color: hasValue ? INK(0.85) : INK(0.3),
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        wordBreak: 'break-all',
        lineHeight: 1.4,
      }}>
        {display}
      </div>
    </div>
  );
}

FieldRow.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  mono: PropTypes.bool,
  fullWidth: PropTypes.bool,
};

function SectionHeading({ children }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: 2.2, color: P, fontWeight: 700,
      textTransform: 'uppercase', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

SectionHeading.propTypes = {
  children: PropTypes.node,
};

const PEG_BORDER  = { ok: 'rgba(34,197,94,0.28)',  watch: 'rgba(217,119,6,0.28)',  alert: 'rgba(220,38,38,0.28)' };
const PEG_BG      = { ok: 'rgba(34,197,94,0.05)',  watch: 'rgba(217,119,6,0.05)',  alert: 'rgba(220,38,38,0.06)' };
const PEG_COLOR   = { ok: '#16a34a',               watch: '#d97706',               alert: '#dc2626'              };
const PEG_CHIP_BG = { ok: 'rgba(34,197,94,0.12)',  watch: 'rgba(217,119,6,0.12)',  alert: 'rgba(220,38,38,0.12)' };
const PEG_CHIP_BD = { ok: '1px solid rgba(34,197,94,0.32)', watch: '1px solid rgba(217,119,6,0.32)', alert: '1px solid rgba(220,38,38,0.32)' };

function getPegLabel(pegRisk, isSoftPeg) {
  if (pegRisk === 'ok') return isSoftPeg ? 'Soft Peg OK' : 'On Peg';
  if (pegRisk === 'watch') return 'Watch';
  return 'Depeg Alert';
}

function getPegNote(pegRisk, isSoftPeg) {
  if (pegRisk === 'ok') {
    return isSoftPeg
      ? 'Price is within soft-peg tolerance (< 0.5% deviation). Algorithmically maintained stables have wider normal ranges.'
      : 'Price is within normal peg tolerance (< 0.1% deviation).';
  }
  if (pegRisk === 'watch') return 'Minor deviation detected. Monitor for further movement.';
  return 'Significant depeg detected. Elevated risk — exercise caution.';
}

const GAUGE_RANGE = 2; // ±2%

const GAUGE_TICK_BASES = [
  { devPct: -1,   label: '−1%' },
  { devPct: -0.5, label: '−0.5%' },
  { devPct: -0.1, label: '−0.1%' },
  { devPct:  0,   label: '$1.00' },
  { devPct:  0.1, label: '+0.1%' },
  { devPct:  0.5, label: '+0.5%' },
  { devPct:  1,   label: '+1%' },
];

function buildGaugeTicks(centerLabel) {
  return GAUGE_TICK_BASES.map(t => t.devPct === 0 ? { ...t, label: centerLabel ?? t.label } : t);
}

function devToPos(devPct) {
  return ((devPct + GAUGE_RANGE) / (GAUGE_RANGE * 2)) * 100;
}

function PegGauge({ pegDeviationPct, pegRisk, isSoftPeg, centerLabel }) {
  const clamped = Math.max(-GAUGE_RANGE, Math.min(GAUGE_RANGE, pegDeviationPct));
  const positionPct = devToPos(clamped);
  const okEdge = isSoftPeg ? 0.5 : 0.1;
  const okLeft  = devToPos(-okEdge);
  const okRight = devToPos(okEdge);
  const watchLeft  = devToPos(-1);
  const watchRight = devToPos(1);
  const ticks = buildGaugeTicks(centerLabel);

  return (
    <div style={{ margin: '16px 0 4px' }}>
      {/* Track */}
      <div style={{ position: 'relative', height: 10, borderRadius: 1 }}>
        {/* Alert zone (full background) */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 1, background: 'rgba(220,38,38,0.22)' }} />
        {/* Watch zone */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, borderRadius: 1,
          left: `${watchLeft}%`, width: `${watchRight - watchLeft}%`,
          background: 'rgba(217,119,6,0.28)',
        }} />
        {/* OK zone */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, borderRadius: 1,
          left: `${okLeft}%`, width: `${okRight - okLeft}%`,
          background: 'rgba(34,197,94,0.42)',
        }} />
        {/* Zone boundary lines */}
        {[watchLeft, watchRight, okLeft, okRight].map((pos) => (
          <div key={pos} style={{
            position: 'absolute', left: `${pos}%`, top: -2, bottom: -2,
            width: 1, background: 'rgba(30,26,20,0.12)',
            transform: 'translateX(-50%)',
          }} />
        ))}
        {/* Center peg line */}
        <div style={{
          position: 'absolute', left: '50%', top: -4, bottom: -4,
          width: 1, background: 'rgba(30,26,20,0.25)',
          transform: 'translateX(-50%)',
        }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute', left: `${positionPct}%`, top: '50%',
          width: 14, height: 14, borderRadius: '50%',
          background: PEG_COLOR[pegRisk],
          border: '2px solid rgba(255,252,246,0.95)',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
          zIndex: 1,
        }} />
      </div>

      {/* Tick labels — only show a subset to avoid crowding */}
      <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
        {ticks.map(({ devPct, label }) => {
          const skip = !isSoftPeg && (devPct === -0.5 || devPct === 0.5);
          if (skip) return null;
          return (
            <span
              key={devPct}
              style={{
                position: 'absolute',
                left: `${devToPos(devPct)}%`,
                transform: 'translateX(-50%)',
                fontSize: 8,
                color: devPct === 0 ? INK(0.5) : INK(0.3),
                fontWeight: devPct === 0 ? 700 : 400,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          );
        })}
      </div>

      {/* Zone legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        {[
          { color: 'rgba(34,197,94,0.7)', label: `OK  < ${isSoftPeg ? '0.5' : '0.1'}%` },
          { color: 'rgba(217,119,6,0.7)',  label: 'Watch  < 1%' },
          { color: 'rgba(220,38,38,0.7)',  label: 'Alert  ≥ 1%' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 1, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: INK(0.4), letterSpacing: 0.2 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

PegGauge.propTypes = {
  pegDeviationPct: PropTypes.number,
  pegRisk: PropTypes.string,
  isSoftPeg: PropTypes.bool,
  centerLabel: PropTypes.string,
};

const FIAT_PEG_LABELS = {
  eur: 'EUR', gbp: 'GBP', sgd: 'SGD', idr: 'IDR',
  jpy: 'JPY', nzd: 'NZD', cad: 'CAD', other: 'Non-USD fiat',
};

function YieldBearingSection({ yieldPremiumPct }) {
  const hasPremium = typeof yieldPremiumPct === 'number' && Number.isFinite(yieldPremiumPct);
  const belowPar = hasPremium && yieldPremiumPct < 0;
  const risk = belowPar ? 'alert' : 'ok';
  return (
    <div style={{
      padding: '16px', borderRadius: 1,
      border: `1px solid ${hasPremium ? PEG_BORDER[risk] : 'rgba(30,26,20,0.10)'}`,
      background: hasPremium ? PEG_BG[risk] : 'rgba(30,26,20,0.03)',
    }}>
      <SectionHeading>Yield-Bearing NAV</SectionHeading>
      {hasPremium ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 9, color: INK(0.4), textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
                Premium over $1.00
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: belowPar ? PEG_COLOR.alert : '#16a34a' }}>
                {yieldPremiumPct >= 0 ? '+' : ''}{yieldPremiumPct.toFixed(2)}%
              </div>
            </div>
            <div style={{
              padding: '6px 14px', borderRadius: 1, alignSelf: 'center',
              background: PEG_CHIP_BG[risk], border: PEG_CHIP_BD[risk],
              color: PEG_COLOR[risk], fontSize: 12, fontWeight: 700,
            }}>
              {belowPar ? 'Below NAV' : 'Accruing'}
            </div>
          </div>
          <div style={{ fontSize: 11, color: INK(0.5), marginTop: 10, lineHeight: 1.5 }}>
            {belowPar
              ? 'Price is below $1.00, which is unusual for a yield-bearing stablecoin. This may indicate a depeg or redemption pressure — verify with the issuer.'
              : 'Yield-bearing stablecoin — price accrues over time as yield is earned. The premium above $1.00 represents accumulated yield and is expected.'}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: INK(0.55), lineHeight: 1.6 }}>
          Yield-bearing stablecoin — price accrues over time and is not fixed to $1.00.
          The gauge is not applicable here.
        </div>
      )}
    </div>
  );
}

YieldBearingSection.propTypes = {
  yieldPremiumPct: PropTypes.number,
};

function FiatPegSection({ pegCurrency, fiatPegDeviationPct, fiatPegTargetUsd, fiatPegRisk }) {
  const label = FIAT_PEG_LABELS[pegCurrency] ?? pegCurrency.toUpperCase();
  const hasFiatGauge = typeof fiatPegDeviationPct === 'number' && Number.isFinite(fiatPegDeviationPct) && fiatPegRisk;
  const activeRisk = hasFiatGauge ? fiatPegRisk : null;
  const centerLabel = fiatPegTargetUsd ? `${label} peg ($${fiatPegTargetUsd.toFixed(4)})` : `${label} peg`;
  return (
    <div style={{
      padding: '16px', borderRadius: 1,
      border: `1px solid ${hasFiatGauge ? PEG_BORDER[activeRisk] : 'rgba(30,26,20,0.10)'}`,
      background: hasFiatGauge ? PEG_BG[activeRisk] : 'rgba(30,26,20,0.03)',
    }}>
      <SectionHeading>{label} Peg Health</SectionHeading>
      {hasFiatGauge ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 9, color: INK(0.4), textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
                {label} Peg · Deviation from target
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: PEG_COLOR[activeRisk] }}>
                ±{fiatPegDeviationPct.toFixed(2)}%
              </div>
            </div>
            <div style={{
              padding: '6px 14px', borderRadius: 1, alignSelf: 'center',
              background: PEG_CHIP_BG[activeRisk], border: PEG_CHIP_BD[activeRisk],
              color: PEG_COLOR[activeRisk], fontSize: 12, fontWeight: 700,
            }}>
              {getPegLabel(activeRisk, false)}
            </div>
          </div>
          <PegGauge pegDeviationPct={fiatPegDeviationPct} pegRisk={activeRisk} isSoftPeg={false} centerLabel={centerLabel} />
          <div style={{ fontSize: 11, color: INK(0.5), marginTop: 4, lineHeight: 1.5 }}>
            {getPegNote(activeRisk, false)} Deviation is measured relative to the live {label}/USD exchange rate.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: INK(0.55), lineHeight: 1.6 }}>
          {label}-pegged stablecoin — price tracks the {label}/USD exchange rate, not $1.00.
          Live FX rate data is currently unavailable; the deviation gauge could not be computed.
        </div>
      )}
    </div>
  );
}

FiatPegSection.propTypes = {
  pegCurrency: PropTypes.string,
  fiatPegDeviationPct: PropTypes.number,
  fiatPegTargetUsd: PropTypes.number,
  fiatPegRisk: PropTypes.string,
};

function UsdPegSection({ pegDeviationPct, pegRisk, isSoftPeg }) {
  if (pegDeviationPct == null) return null;
  return (
    <div style={{
      padding: '16px', borderRadius: 1,
      border: `1px solid ${PEG_BORDER[pegRisk]}`,
      background: PEG_BG[pegRisk],
    }}>
      <SectionHeading>Peg Health</SectionHeading>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, color: INK(0.4), textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
            {isSoftPeg ? 'Soft Peg · Deviation from $1.00' : 'Deviation from $1.00'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: PEG_COLOR[pegRisk] }}>
            ±{pegDeviationPct.toFixed(2)}%
          </div>
        </div>
        <div style={{
          padding: '6px 14px', borderRadius: 1, alignSelf: 'center',
          background: PEG_CHIP_BG[pegRisk], border: PEG_CHIP_BD[pegRisk],
          color: PEG_COLOR[pegRisk], fontSize: 12, fontWeight: 700,
        }}>
          {getPegLabel(pegRisk, isSoftPeg)}
        </div>
      </div>
      <PegGauge pegDeviationPct={pegDeviationPct} pegRisk={pegRisk} isSoftPeg={isSoftPeg} />
      <div style={{ fontSize: 11, color: INK(0.5), marginTop: 4, lineHeight: 1.5 }}>
        {getPegNote(pegRisk, isSoftPeg)}
      </div>
    </div>
  );
}

UsdPegSection.propTypes = {
  pegDeviationPct: PropTypes.number,
  pegRisk: PropTypes.string,
  isSoftPeg: PropTypes.bool,
};

function PegHealthSection({ pegDeviationPct, pegRisk, isYieldBearing, isSoftPeg, pegCurrency,
  fiatPegDeviationPct, fiatPegTargetUsd, fiatPegRisk, yieldPremiumPct }) {
  if (isYieldBearing) return <YieldBearingSection yieldPremiumPct={yieldPremiumPct} />;
  if (pegCurrency && pegCurrency !== 'usd') {
    return <FiatPegSection pegCurrency={pegCurrency} fiatPegDeviationPct={fiatPegDeviationPct}
      fiatPegTargetUsd={fiatPegTargetUsd} fiatPegRisk={fiatPegRisk} />;
  }
  return <UsdPegSection pegDeviationPct={pegDeviationPct} pegRisk={pegRisk} isSoftPeg={isSoftPeg} />;
}

PegHealthSection.propTypes = {
  pegDeviationPct: PropTypes.number,
  pegRisk: PropTypes.string,
  isYieldBearing: PropTypes.bool,
  isSoftPeg: PropTypes.bool,
  pegCurrency: PropTypes.string,
  fiatPegDeviationPct: PropTypes.number,
  fiatPegTargetUsd: PropTypes.number,
  fiatPegRisk: PropTypes.string,
  yieldPremiumPct: PropTypes.number,
};

function pairClassificationDescription(isStableStable, isBaseStable, symbol, quoteTokenSymbol) {
  if (isStableStable) return 'Both sides of this pair are known stablecoins.';
  if (isBaseStable) return `${symbol} is a stablecoin paired with a volatile asset.`;
  return `${quoteTokenSymbol || 'Quote'} is a stablecoin; base token is volatile.`;
}

function PairClassificationSection({ pairType, isBaseStable, symbol, quoteTokenSymbol }) {
  if (!pairType || pairType === 'volatile-volatile') return null;
  const isStableStable = pairType === 'stable-stable';
  const description = pairClassificationDescription(isStableStable, isBaseStable, symbol, quoteTokenSymbol);
  return (
    <div>
      <SectionHeading>Pair Classification</SectionHeading>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{
          padding: '4px 12px', borderRadius: 1, fontSize: 12, fontWeight: 700,
          background: isStableStable ? 'rgba(34,197,94,0.10)' : 'rgba(30,26,20,0.06)',
          border: isStableStable ? '1px solid rgba(34,197,94,0.30)' : '1px solid rgba(30,26,20,0.14)',
          color: isStableStable ? '#16a34a' : INK(0.6),
        }}>
          {isStableStable ? 'Stable · Stable' : 'Stable · Volatile'}
        </div>
        <span style={{ fontSize: 12, color: INK(0.5), lineHeight: 1.5 }}>{description}</span>
      </div>
    </div>
  );
}

function FlowSkeletonRows() {
  return Array.from({ length: 3 }, (_, index) => (
    <div
      key={`flow-skeleton-${index}`}
      aria-hidden="true"
      style={{
        height: 34,
        borderRadius: 1,
        background: INK(0.05),
        animation: 'pulse 1.4s ease-in-out infinite',
      }}
    />
  ));
}

function WhaleFlowsSection({ flows, loading }) {
  if (loading) {
    return (
      <div>
        <SectionHeading>Large Flows · 7d</SectionHeading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FlowSkeletonRows />
        </div>
      </div>
    );
  }

  if (!flows) return null;
  if (flows.length === 0) {
    return (
      <div>
        <SectionHeading>Large Flows · 7d</SectionHeading>
        <div style={{ fontSize: 12, color: INK(0.48), lineHeight: 1.5 }}>
          No flows &gt;= $100k in the last 7 days.
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading>Large Flows · 7d</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {flows.slice(0, 8).map(flow => (
          <div
            key={flow.txHash || `${flow.time}-${flow.fromAddress}-${flow.toAddress}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 74px minmax(0,1fr)',
              gap: 9,
              alignItems: 'center',
              fontSize: 11,
              padding: '7px 0',
              borderTop: '1px solid rgba(139,49,32,0.08)',
            }}
          >
            <span style={{ color: INK(0.45) }}>{formatShortDate(flow.time)}</span>
            <span style={{ color: P, fontWeight: 700 }}>{formatCompactUsd(flow.amountUsd)}</span>
            <span style={{ color: INK(0.58), fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fmtAddress(flow.fromAddress)} → {fmtAddress(flow.toAddress)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

WhaleFlowsSection.propTypes = {
  flows: PropTypes.array,
  loading: PropTypes.bool.isRequired,
};

PairClassificationSection.propTypes = {
  pairType: PropTypes.string,
  isBaseStable: PropTypes.bool,
  symbol: PropTypes.string,
  quoteTokenSymbol: PropTypes.string,
};

const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default function StableSeerDrawer({ result, onClose, onHolderWallCta, onNavigate }) {
  const [flowState, setFlowState] = useState({ loading: false, flows: null });

  useEffect(() => {
    if (result?.pairAddress) {
      const url = new URL(globalThis.window.location.href);
      url.searchParams.set('pair', result.pairAddress);
      globalThis.window.history.pushState({ ww: true }, '', url.toString());
      return () => {
        const u = new URL(globalThis.window.location.href);
        u.searchParams.delete('pair');
        const next = u.searchParams.toString() ? `?${u.searchParams}` : u.pathname;
        globalThis.window.history.replaceState(globalThis.window.history.state, '', next);
      };
    }
  }, [result]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    const handlePop = () => {
      const p = new URLSearchParams(globalThis.window.location.search).get('pair');
      if (!p) onClose();
    };
    document.addEventListener('keydown', handler);
    globalThis.window.addEventListener('popstate', handlePop);
    return () => {
      document.removeEventListener('keydown', handler);
      globalThis.window.removeEventListener('popstate', handlePop);
    };
  }, [onClose]);

  useEffect(() => {
    const symbol = result?.symbol;
    if (!symbol) {
      setFlowState({ loading: false, flows: null });
      return;
    }
    let mounted = true;
    setFlowState({ loading: true, flows: null });
    fetch(`/api/stable-whale-flows?symbol=${encodeURIComponent(symbol)}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!mounted) return;
        const flows = Array.isArray(data?.flows) ? data.flows : [];
        if (flows.length === 0 && !data?.queryRunAt) {
          setFlowState({ loading: false, flows: null });
          return;
        }
        setFlowState({ loading: false, flows });
      })
      .catch(() => {
        if (mounted) setFlowState({ loading: false, flows: null });
      });
    return () => { mounted = false; };
  }, [result?.symbol]);

  if (!result) return null;

  const priceChange = Number(result.priceChange24h);
  const sign = priceChange > 0 ? '+' : '';
  const priceChangeDisplay = result.priceChange24h != null && Number.isFinite(priceChange)
    ? `${sign}${priceChange}%`
    : null;

  const hasQuoteToken = result.quoteTokenSymbol || result.quoteTokenName || result.quoteTokenAddress;
  const hasTxns = result.buys24h != null || result.sells24h != null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(30,26,20,0.32)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <dialog
        open
        aria-label={`Stable Seer detail: ${result.pairName || 'pair'}`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(460px, 100vw)',
          margin: 0, padding: 0, border: 'none',
          maxWidth: 'none', maxHeight: 'none', height: '100%',
          zIndex: 201,
          background: 'rgba(255,252,246,0.99)',
          borderLeft: '1px solid rgba(191,78,50,0.20)',
          boxShadow: '-8px 0 40px rgba(63,38,24,0.16)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 20px 16px',
          borderBottom: '1px solid rgba(191,78,50,0.10)',
          background: 'rgba(250,244,232,0.92)',
          backdropFilter: 'blur(8px)',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: P, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <StableSeerIcon aria-hidden="true" style={{ width: 14, height: 14 }} />
              Stable Seer · Pair Detail
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: INK(0.92), letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              {result.pairName || '—'}
            </div>
            {result.tokenName && (
              <div style={{ fontSize: 13, color: INK(0.5), marginTop: 3 }}>
                {result.tokenName}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close detail"
            style={{
              flexShrink: 0, marginLeft: 12,
              width: 32, height: 32, borderRadius: 1,
              border: '1px solid rgba(191,78,50,0.18)',
              background: 'rgba(255,252,246,0.95)',
              color: INK(0.55), fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >
            ✕
          </button>
        </div>

        {/* Price banner */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,255,255,0.5)',
        }}>
          <div>
            <div style={{ fontSize: 9, color: INK(0.4), textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
              Price USD
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: INK(0.9) }}>
              {formatPriceUsd(result.priceUsd)}
            </div>
          </div>
          {priceChangeDisplay && (
            <div style={{
              marginTop: 18,
              padding: '4px 10px', borderRadius: 1,
              background: priceChange >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
              border: priceChange >= 0 ? '1px solid rgba(34,197,94,0.30)' : '1px solid rgba(239,68,68,0.30)',
              color: priceChange >= 0 ? '#16a34a' : '#dc2626',
              fontSize: 13, fontWeight: 700,
            }}>
              {priceChangeDisplay}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>

          <PegHealthSection
            pegDeviationPct={result.pegDeviationPct}
            pegRisk={result.pegRisk}
            isYieldBearing={result.isYieldBearing}
            isSoftPeg={result.isSoftPeg}
            pegCurrency={result.pegCurrency}
            fiatPegDeviationPct={result.fiatPegDeviationPct}
            fiatPegTargetUsd={result.fiatPegTargetUsd}
            fiatPegRisk={result.fiatPegRisk}
            yieldPremiumPct={result.yieldPremiumPct}
          />

          <PairClassificationSection
            pairType={result.pairType}
            isBaseStable={result.isBaseStable}
            symbol={result.symbol}
            quoteTokenSymbol={result.quoteTokenSymbol}
          />

          <WhaleFlowsSection flows={flowState.flows} loading={flowState.loading} />

          {/* Market section */}
          <div>
            <SectionHeading>Market</SectionHeading>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
              <FieldRow label="Chain" value={prettyLabel(result.chain)} />
              <FieldRow label="DEX" value={prettyLabel(result.dex)} />
              <FieldRow label="Liquidity" value={formatCompactUsd(result.liquidityUsd)} />
              <FieldRow label="24h Volume" value={formatCompactUsd(result.volume24h)} />
              <FieldRow label="FDV" value={formatCompactUsd(result.fdv)} />
              <FieldRow label="Market Cap" value={formatCompactUsd(result.marketCap)} />
              {hasTxns && <FieldRow label="24h Buys" value={result.buys24h?.toLocaleString() ?? '—'} />}
              {hasTxns && <FieldRow label="24h Sells" value={result.sells24h?.toLocaleString() ?? '—'} />}
              {result.pairCreatedAt != null && (
                <FieldRow label="Pair Created" value={formatDate(result.pairCreatedAt)} fullWidth />
              )}
            </div>
          </div>

          {/* Base token section */}
          <div>
            <SectionHeading>Base Token</SectionHeading>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
              <FieldRow label="Symbol" value={result.symbol} />
              <FieldRow label="Name" value={result.tokenName} />
              <FieldRow label="Address" value={result.baseTokenAddress} mono fullWidth />
            </div>
          </div>

          {/* Quote token section */}
          {hasQuoteToken && (
            <div>
              <SectionHeading>Quote Token</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
                <FieldRow label="Symbol" value={result.quoteTokenSymbol} />
                <FieldRow label="Name" value={result.quoteTokenName} />
                {result.quoteTokenAddress && (
                  <FieldRow label="Address" value={result.quoteTokenAddress} mono fullWidth />
                )}
              </div>
            </div>
          )}

          {/* Holder Wall cross-link — EVM tokens only */}
          {result.baseTokenAddress && EVM_ADDR_RE.test(result.baseTokenAddress) && (onHolderWallCta || onNavigate) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {onHolderWallCta && (
                <button
                  type="button"
                  onClick={() => onHolderWallCta(result.baseTokenAddress)}
                  className="ww-button-explore"
                  style={{ fontSize: 12, fontWeight: 700, padding: '9px 16px', cursor: 'pointer', borderRadius: 4 }}
                >
                  View holder cohorts in Holder Wall →
                </button>
              )}
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/token/${result.chain}/${result.baseTokenAddress}`)}
                  className="ww-button"
                  style={{ fontSize: 12, fontWeight: 700, padding: '9px 16px', cursor: 'pointer', borderRadius: 4 }}
                >
                  Token Detail →
                </button>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <div className="ww-card ww-card-sharp" style={{
            padding: '10px 14px',
            background: 'rgba(191,78,50,0.05)',
            fontSize: 11, color: INK(0.55), lineHeight: 1.6,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <SecurityIcon aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, color: P, opacity: 0.55 }} />
            <span>
              Stable Seer shows public DEX market/pool data from DEX Screener. Holder analytics are only available where Wallet Wall explicitly supports holder data.
              {result.chain === 'solana' && ' Solana holder analytics are not supported.'}
            </span>
          </div>

        </div>
      </dialog>
    </>
  );
}

StableSeerDrawer.propTypes = {
  result: PropTypes.shape({
    pairAddress:       PropTypes.string,
    pairName:          PropTypes.string,
    tokenName:         PropTypes.string,
    chain:             PropTypes.string,
    dex:               PropTypes.string,
    symbol:            PropTypes.string,
    priceUsd:          PropTypes.string,
    priceChange24h:    PropTypes.number,
    liquidityUsd:      PropTypes.number,
    volume24h:         PropTypes.number,
    fdv:               PropTypes.number,
    marketCap:         PropTypes.number,
    buys24h:           PropTypes.number,
    sells24h:          PropTypes.number,
    pairCreatedAt:     PropTypes.number,
    baseTokenAddress:  PropTypes.string,
    quoteTokenSymbol:  PropTypes.string,
    quoteTokenName:    PropTypes.string,
    quoteTokenAddress: PropTypes.string,
    url:               PropTypes.string,
    isBaseStable:      PropTypes.bool,
    isQuoteStable:     PropTypes.bool,
    isYieldBearing:    PropTypes.bool,
    isSoftPeg:         PropTypes.bool,
    pegCurrency:       PropTypes.string,
    pairType:          PropTypes.string,
    pegDeviationPct:     PropTypes.number,
    pegRisk:             PropTypes.string,
    fiatPegDeviationPct: PropTypes.number,
    fiatPegTargetUsd:    PropTypes.number,
    fiatPegRisk:         PropTypes.string,
    yieldPremiumPct:     PropTypes.number,
  }),
  onClose: PropTypes.func.isRequired,
  onHolderWallCta: PropTypes.func,
  onNavigate: PropTypes.func,
};
