import PropTypes from 'prop-types';
import './loading.css';

/* ─────────────────────────────────────────────
   Skeleton helpers — shared across variants
───────────────────────────────────────────── */

function Sk({ w, h = 12, r = 3, mb = 0, mt = 0, style = {}, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`ww-skeleton-block ${className}`}
      style={{ display: 'block', width: w, height: h, borderRadius: r, marginBottom: mb || undefined, marginTop: mt || undefined, ...style }}
    />
  );
}

Sk.propTypes = {
  w: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  h: PropTypes.number,
  r: PropTypes.number,
  mb: PropTypes.number,
  mt: PropTypes.number,
  style: PropTypes.object,
  className: PropTypes.string,
};

function SkLine({ w = '100%', mb = 0, mt = 0 }) {
  return (
    <span
      aria-hidden="true"
      className="ww-skeleton-line"
      style={{ display: 'block', width: w, marginBottom: mb || undefined, marginTop: mt || undefined }}
    />
  );
}

SkLine.propTypes = {
  w: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  mb: PropTypes.number,
  mt: PropTypes.number,
};

function SweepBar() {
  return <span aria-hidden="true" className="ww-signal-sweep" />;
}

/* Fake nav bar skeleton matching the ww-page-nav height */
function NavSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        alignItems: 'center',
        borderBottom: '1px solid rgba(30,26,20,0.07)',
        display: 'flex',
        gap: 10,
        padding: '12px 20px',
        position: 'sticky',
        top: 0,
        background: '#FFFDF8',
        zIndex: 10,
      }}
    >
      <Sk w={24} h={24} r={4} />
      <Sk w={110} h={14} />
      <div style={{ flex: 1 }} />
      <Sk w={56} h={14} r={3} />
      <Sk w={56} h={14} r={3} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Variant: page
   Generic page/route shell. Thin signal sweep
   + content block skeletons.
───────────────────────────────────────────── */
function PageVariant() {
  return (
    <>
      <SweepBar />
      <NavSkeleton />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Sk w="38%" h={20} mb={4} />
        <Sk w="62%" h={13} />
        <Sk w="48%" h={13} mb={12} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="ww-skeleton-card ww-card" style={{ padding: 16, minHeight: 80 }}>
              <Sk w="50%" h={10} mb={8} />
              <Sk w="70%" h={18} />
            </div>
          ))}
        </div>
        <div className="ww-skeleton-card ww-card" style={{ padding: 16, minHeight: 120 }}>
          <Sk w="28%" h={10} mb={12} />
          <SkLine w="90%" mb={8} />
          <SkLine w="75%" mb={8} />
          <SkLine w="55%" />
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   Variant: graph
   Ghost nodes + connecting lines. One centre
   node slightly larger. Optional side panel.
───────────────────────────────────────────── */
function GraphVariant({ compact }) {
  const nodes = [
    { cx: 48, cy: 42, r: 10 },
    { cx: 82, cy: 24, r: 8 },
    { cx: 120, cy: 44, r: 9 },
    { cx: 148, cy: 22, r: 7 },
    { cx: 36, cy: 76, r: 8 },
    { cx: 148, cy: 74, r: 9 },
    { cx: 96, cy: 88, r: 8 },
  ];
  const centre = { cx: 96, cy: 52, r: 16 };
  const lines = [
    [centre, nodes[0]], [centre, nodes[1]], [centre, nodes[2]],
    [centre, nodes[3]], [centre, nodes[4]], [centre, nodes[5]], [centre, nodes[6]],
    [nodes[0], nodes[4]], [nodes[2], nodes[5]],
  ];
  const h = compact ? 160 : 220;
  return (
    <div style={{ display: 'flex', gap: 0, minHeight: compact ? undefined : '100vh', background: '#FAF8F3' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: h }}>
        <SweepBar />
        <svg
          aria-hidden="true"
          viewBox="0 0 200 110"
          style={{ width: '100%', maxWidth: 520, height: h, display: 'block', margin: '0 auto', overflow: 'visible' }}
        >
          {lines.map(([a, b]) => (
            <line
              key={`${a.cx}-${a.cy}:${b.cx}-${b.cy}`}
              x1={a.cx} y1={a.cy}
              x2={b.cx} y2={b.cy}
              stroke="rgba(30,26,20,0.07)"
              strokeWidth={1}
            />
          ))}
          {nodes.map((n) => (
            <circle key={`gn-${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r={n.r}
              fill="rgba(30,26,20,0.04)"
              stroke="rgba(191,78,50,0.15)"
              strokeWidth={1.2}
            />
          ))}
          <circle
            cx={centre.cx} cy={centre.cy} r={centre.r}
            fill="rgba(191,78,50,0.06)"
            stroke="rgba(191,78,50,0.30)"
            strokeWidth={1.5}
          />
        </svg>
      </div>
      {!compact && (
        <div style={{ width: 260, borderLeft: '1px solid rgba(30,26,20,0.07)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Sk w="60%" h={12} mb={4} />
          {['gp0', 'gp1', 'gp2', 'gp3'].map(id => (
            <div key={id} className="ww-skeleton-card ww-card" style={{ padding: 12, minHeight: 56 }}>
              <Sk w="45%" h={9} mb={6} />
              <Sk w="65%" h={14} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

GraphVariant.propTypes = { compact: PropTypes.bool };

/* ─────────────────────────────────────────────
   Variant: market
   Pool/result-card skeletons matching the
   Stable Seer result layout.
───────────────────────────────────────────── */
function MarketVariant() {
  return (
    <>
      <SweepBar />
      <NavSkeleton />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <Sk w="100%" h={36} r={5} style={{ flex: 1 }} />
          <Sk w={88} h={36} r={5} />
        </div>
        {/* filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[56, 72, 60, 52].map((w) => (
            <span key={w} aria-hidden="true" className="ww-skeleton-pill" style={{ width: w, height: 22 }} />
          ))}
        </div>
        {/* result cards */}
        {['mr0', 'mr1', 'mr2', 'mr3', 'mr4'].map((id, i) => (
          <div key={id} className="ww-signal-market-card" style={{ animationDelay: `${i * 0.06}s` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Sk w={28} h={28} r={14} />
              <div style={{ flex: 1 }}>
                <Sk w="38%" h={12} mb={5} />
                <Sk w="22%" h={9} />
              </div>
              <span aria-hidden="true" className="ww-skeleton-pill" style={{ width: 52, height: 18 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[['Price', '55%'], ['Liquidity', '68%'], ['Volume', '48%']].map(([, w]) => (
                <div key={w}>
                  <Sk w="55%" h={8} mb={4} />
                  <Sk w={w} h={13} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   Variant: quantum
   Risk bar, assumption chips, metric cards.
───────────────────────────────────────────── */
function QuantumVariant() {
  return (
    <>
      <SweepBar />
      <NavSkeleton />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* score + ring */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <span aria-hidden="true" className="ww-skeleton-circle" style={{ width: 80, height: 80, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Sk w="45%" h={18} />
            <Sk w="32%" h={10} />
          </div>
        </div>
        {/* segmented risk bar */}
        <div>
          <Sk w="30%" h={9} mb={8} />
          <div style={{ display: 'flex', gap: 3, height: 10 }}>
            {[20, 18, 22, 17, 23].map((flex) => (
              <span key={flex} aria-hidden="true" className="ww-signal-quantum-bar-seg" style={{ flex }} />
            ))}
          </div>
        </div>
        {/* assumption chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[80, 100, 72, 88, 64].map((w) => (
            <span key={w} aria-hidden="true" className="ww-skeleton-pill" style={{ width: w, height: 22 }} />
          ))}
        </div>
        {/* metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {['qm0', 'qm1', 'qm2', 'qm3'].map(id => (
            <div key={id} className="ww-skeleton-card ww-card" style={{ padding: 14, minHeight: 68 }}>
              <Sk w="50%" h={9} mb={8} />
              <Sk w="70%" h={16} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   Variant: whale
   Ghost nodes + terracotta trace, activity
   panel skeletons.
───────────────────────────────────────────── */
function WhaleVariant() {
  const nodes = [
    { cx: 60,  cy: 50, r: 12 },
    { cx: 140, cy: 32, r: 9 },
    { cx: 200, cy: 62, r: 11 },
    { cx: 100, cy: 88, r: 8 },
    { cx: 168, cy: 100, r: 9 },
  ];
  const centre = { cx: 108, cy: 54, r: 18 };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF8F3', position: 'relative' }}>
        <SweepBar />
        {/* graph area */}
        <div style={{ flex: 1, position: 'relative', minHeight: 280, overflow: 'hidden' }}>
          <svg
            aria-hidden="true"
            viewBox="0 0 280 140"
            style={{ width: '100%', maxWidth: 560, height: 260, display: 'block', margin: '28px auto 0' }}
          >
            {nodes.map((n) => (
              <line key={`wl-${n.cx}-${n.cy}`}
                x1={centre.cx} y1={centre.cy}
                x2={n.cx} y2={n.cy}
                stroke="rgba(30,26,20,0.06)" strokeWidth={1}
              />
            ))}
            {/* terracotta movement trace */}
            <polyline
              className="ww-signal-whale-trace"
              points={`${nodes[0].cx},${nodes[0].cy} ${centre.cx},${centre.cy} ${nodes[2].cx},${nodes[2].cy} ${nodes[4].cx},${nodes[4].cy}`}
              fill="none"
            />
            {nodes.map((n) => (
              <circle key={`wc-${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r={n.r}
                fill="rgba(30,26,20,0.04)"
                stroke="rgba(191,78,50,0.14)"
                strokeWidth={1.2}
              />
            ))}
            <circle
              cx={centre.cx} cy={centre.cy} r={centre.r}
              fill="rgba(191,78,50,0.06)"
              stroke="rgba(191,78,50,0.28)"
              strokeWidth={1.5}
            />
          </svg>
        </div>
        {/* side panel */}
        <div style={{ width: 300, borderLeft: '1px solid rgba(30,26,20,0.07)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <Sk w="55%" h={13} mb={4} />
          {/* activity heatmap placeholder */}
          <div className="ww-skeleton-card ww-card" style={{ padding: 14 }}>
            <Sk w="40%" h={9} mb={10} />
            <div className="ww-skeleton-heatmap">
              {Array.from({ length: 36 }, (_, i) => (
                <span key={`hc-${i}`} className="ww-skeleton-cell" />
              ))}
            </div>
          </div>
          {['wp0', 'wp1', 'wp2'].map(id => (
            <div key={id} className="ww-skeleton-card ww-card" style={{ padding: 12, minHeight: 52 }}>
              <Sk w="42%" h={9} mb={6} />
              <Sk w="62%" h={13} />
            </div>
          ))}
        </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Variant: brief
   AI summary line skeletons, source chips,
   confidence badge. Inline — no full height.
───────────────────────────────────────────── */
function BriefVariant() {
  return (
    <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500, margin: '0 auto' }}>
      {/* summary lines */}
      <SkLine w="92%" mb={4} />
      <SkLine w="78%" mb={4} />
      <SkLine w="84%" mb={4} />
      <SkLine w="60%" mb={12} />
      {/* source chips */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[68, 82, 58].map((w) => (
          <span key={w} aria-hidden="true" className="ww-skeleton-pill" style={{ width: w, height: 18 }} />
        ))}
      </div>
      {/* confidence badge */}
      <div style={{ marginTop: 4 }}>
        <span aria-hidden="true" className="ww-skeleton-pill" style={{ width: 100, height: 20 }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Variant: button
   Internal background sweep only. No spinner.
   No resizing. Apply to button container.
───────────────────────────────────────────── */
function ButtonVariant({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className="ww-btn-loading"
      style={{ display: 'contents' }}
    >
      <span className={`ww-btn-sweep ${className}`} />
    </span>
  );
}

ButtonVariant.propTypes = { className: PropTypes.string };

/* ─────────────────────────────────────────────
   SignalLoader — main branded loader
───────────────────────────────────────────── */

const DEFAULT_LABELS = {
  page:    'Syncing on-chain context',
  graph:   'Mapping wallet relationships',
  market:  'Resolving stablecoin market signals',
  quantum: 'Building quantum exposure context',
  whale:   'Indexing wallet activity',
  brief:   'Preparing wallet intelligence',
  button:  '',
};

export default function SignalLoader({
  variant = 'page',
  label,
  compact = false,
  inline = false,
  className = '',
}) {
  if (variant === 'button') {
    return <ButtonVariant className={className} />;
  }

  const cls = [
    'ww-signal-loader',
    `ww-signal-loader--${variant}`,
    compact && 'ww-signal-loader--compact',
    inline  && 'ww-signal-loader--inline',
    className,
  ].filter(Boolean).join(' ');

  const body = (() => {
    switch (variant) {
      case 'page':    return <PageVariant />;
      case 'graph':   return <GraphVariant compact={compact} />;
      case 'market':  return <MarketVariant />;
      case 'quantum': return <QuantumVariant />;
      case 'whale':   return <WhaleVariant />;
      case 'brief':   return <BriefVariant />;
      default:        return <PageVariant />;
    }
  })();

  return (
    <div className={cls} aria-label={label ?? DEFAULT_LABELS[variant]} aria-busy="true">
      {body}
    </div>
  );
}

SignalLoader.DEFAULT_LABELS = DEFAULT_LABELS;

SignalLoader.propTypes = {
  variant:   PropTypes.oneOf(['page', 'graph', 'market', 'quantum', 'whale', 'brief', 'button']),
  label:     PropTypes.string,
  compact:   PropTypes.bool,
  inline:    PropTypes.bool,
  className: PropTypes.string,
};
