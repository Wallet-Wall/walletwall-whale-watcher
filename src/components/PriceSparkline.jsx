import PropTypes from 'prop-types';

/**
 * Tiny sparkline built from DexScreener's h24/h6/h1 price-change percentages.
 * Reconstructs 4 relative price points (24h ago → 6h ago → 1h ago → now = 100).
 * Renders a polyline showing the general trend direction.
 */
export default function PriceSparkline({ priceChange24h, priceChange6h, priceChange1h, width = 80, height = 28 }) {
  const h24 = priceChange24h;
  const h6  = priceChange6h;
  const h1  = priceChange1h;

  // Need at least the 24h change to draw anything useful
  if (h24 == null || !Number.isFinite(h24)) return null;

  // Work backwards from now=100 using available percentage deltas.
  // Each change is relative to the start of that window, so we invert.
  const now   = 100;
  const ago1h = h1  != null && Number.isFinite(h1)  ? now  / (1 + h1  / 100) : null;
  const ago6h = h6  != null && Number.isFinite(h6)  ? now  / (1 + h6  / 100) : null;
  const ago24h = now / (1 + h24 / 100);

  const rawPts = [
    ago24h,
    ago6h,
    ago1h,
    now,
  ].filter(v => v != null && Number.isFinite(v));

  if (rawPts.length < 2) return null;

  const min = Math.min(...rawPts);
  const max = Math.max(...rawPts);
  const range = max - min || 1;

  const padX = 2;
  const padY = 3;
  const innerW = width  - padX * 2;
  const innerH = height - padY * 2;
  const step   = innerW / (rawPts.length - 1);

  const pts = rawPts.map((v, i) => {
    const x = padX + i * step;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const positive = h24 >= 0;
  const color = positive ? '#16a34a' : '#dc2626';
  const trackColor = 'rgba(30,26,20,0.07)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
    >
      <line
        x1={padX} y1={padY + innerH}
        x2={padX + innerW} y2={padY + innerH}
        stroke={trackColor}
        strokeWidth={1}
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

PriceSparkline.propTypes = {
  priceChange24h: PropTypes.number,
  priceChange6h:  PropTypes.number,
  priceChange1h:  PropTypes.number,
  width:  PropTypes.number,
  height: PropTypes.number,
};
