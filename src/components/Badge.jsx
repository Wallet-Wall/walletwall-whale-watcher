import PropTypes from 'prop-types';

const INK = 'rgba(30,26,20,0.84)';

const VARIANTS = {
  entity: {
    background: 'rgba(255,252,246,0.9)',
    border: 'rgba(191,78,50,0.15)',
    color: INK,
  },
  data: {
    background: 'rgba(250,248,243,0.92)',
    border: 'rgba(201,164,122,0.28)',
    color: 'rgba(90,62,38,0.9)',
  },
  chain: {
    background: 'rgba(255,252,246,0.88)',
    border: 'rgba(191,78,50,0.12)',
    color: INK,
  },
  status: {
    background: 'rgba(255,252,246,0.9)',
    border: 'rgba(191,78,50,0.13)',
    color: INK,
  },
  time: {
    background: 'rgba(201,164,122,0.12)',
    border: 'rgba(201,164,122,0.26)',
    color: 'rgba(90,62,38,0.9)',
  },
};

const TONES = {
  safe: {
    background: 'rgba(34,197,94,0.09)',
    border: 'rgba(30,101,60,0.20)',
    color: '#1E653C',
  },
  warn: {
    background: 'rgba(201,164,122,0.14)',
    border: 'rgba(139,109,62,0.22)',
    color: '#8B6D3E',
  },
  risk: {
    background: 'rgba(191,78,50,0.10)',
    border: 'rgba(139,49,32,0.20)',
    color: '#8B3120',
  },
  selected: {
    background: 'rgba(245,200,66,0.18)',
    border: 'rgba(201,164,122,0.36)',
    color: '#5A3E26',
  },
  muted: {
    background: 'rgba(250,248,243,0.78)',
    border: 'rgba(30,26,20,0.10)',
    color: 'rgba(30,26,20,0.56)',
  },
  glass: {
    background: 'rgba(255,252,246,0.45)',
    border: 'rgba(139,49,32,0.12)',
    color: 'rgba(30,26,20,0.62)',
  },
};

export default function Badge({ children, variant = 'entity', tone, title, style }) {
  const base = VARIANTS[variant] || VARIANTS.entity;
  const toneStyle = tone ? TONES[tone] : null;
  const palette = toneStyle ? { ...base, ...toneStyle } : base;

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        width: 'fit-content',
        maxWidth: '100%',
        minHeight: 22,
        padding: '3px 8px',
        borderRadius: 'var(--ww-radius-badge, 3px)',
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: 10,
        lineHeight: 1.25,
        fontWeight: 700,
        letterSpacing: 0.75,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

Badge.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.string,
  tone: PropTypes.string,
  title: PropTypes.string,
  style: PropTypes.object,
};
