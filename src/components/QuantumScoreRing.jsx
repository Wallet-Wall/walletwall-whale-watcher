import PropTypes from 'prop-types';
import { COLORS } from '../theme.js';

export const QUANTUM_SCORE_RING_COLORS = {
  resilient: '#16a34a',
  strong:    '#0d9488',
  moderate:  '#d97706',
  weak:      '#dc2626',
  unknown:   COLORS.brand.terracotta,
};

const BAND_LABELS = {
  resilient: 'resilient',
  strong:    'strong',
  moderate:  'moderate',
  weak:      'weak',
  unknown:   'unknown',
};

const DORMANCY_LABELS = {
  active_0_30d:              'active',
  warm_dormant_30_180d:      'warm dormant',
  cold_dormant_180_730d:     'cold dormant',
  ancient_dormant_730d_plus: 'ancient dormant',
  unknown:                   'dormancy unknown',
};

const SAFE_BANDS = new Set(Object.keys(BAND_LABELS));

function normalizeScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function normalizeBand(band) {
  const value = String(band ?? '').trim().toLowerCase();
  return SAFE_BANDS.has(value) ? value : 'unknown';
}

function normalizeText(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return text || null;
}

function normalizeDormancyBucket(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return DORMANCY_LABELS[key] ?? normalizeText(value);
}

export function normalizeQuantumScoreRingState(readiness = {}) {
  const score = normalizeScore(readiness?.score);
  const band = normalizeBand(readiness?.band);
  const exposureLevel = normalizeText(readiness?.exposureLevel);
  const dormancyBucket = normalizeDormancyBucket(
    readiness?.dormancyBucket ?? readiness?.exposure?.dormancyBucket,
  );

  return {
    score,
    band,
    label: BAND_LABELS[band],
    color: QUANTUM_SCORE_RING_COLORS[band],
    exposureLabel: exposureLevel ? `${exposureLevel} exposure` : null,
    dormancyLabel: dormancyBucket,
  };
}

export default function QuantumScoreRing({
  readiness,
  size = 60,
  strokeWidth = 6,
  showChips = true,
  ariaLabel,
}) {
  const state = normalizeQuantumScoreRingState(readiness);
  const safeSize = Math.max(40, Number.isFinite(size) ? size : 60);
  const safeStroke = Math.max(4, Math.min(strokeWidth, safeSize / 5));
  const radius = (safeSize - safeStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = state.score == null ? 0 : state.score / 100;
  const dashOffset = circumference * (1 - progress);
  const center = safeSize / 2;
  const labelSize = state.label.length > 8 ? 7 : 8;
  const chipLabels = showChips
    ? [state.exposureLabel, state.dormancyLabel].filter(Boolean)
    : [];

  return (
    <div
      aria-label={ariaLabel ?? `Quantum vault readiness: ${state.label}`}
      role="img"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        minWidth: safeSize,
      }}
    >
      <svg
        width={safeSize}
        height={safeSize}
        viewBox={`0 0 ${safeSize} ${safeSize}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="rgba(250,248,243,0.84)"
          stroke="rgba(191,78,50,0.16)"
          strokeWidth={safeStroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={state.color}
          strokeWidth={safeStroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fill={COLORS.brand.ink}
          fontSize={labelSize}
          fontWeight="700"
          letterSpacing="0"
          style={{ textTransform: 'uppercase' }}
        >
          {state.label}
        </text>
      </svg>
      {chipLabels.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap', maxWidth: Math.max(110, safeSize * 1.8) }}>
          {chipLabels.map(label => (
            <span
              key={label}
              style={{
                padding: '2px 6px',
                borderRadius: 3,
                border: '1px solid rgba(191,78,50,0.18)',
                background: 'rgba(191,78,50,0.06)',
                color: COLORS.brand.inkSubtle,
                fontSize: 9,
                lineHeight: 1.35,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

QuantumScoreRing.propTypes = {
  readiness: PropTypes.shape({
    score:         PropTypes.number,
    band:          PropTypes.string,
    exposureLevel: PropTypes.string,
    dormancyBucket: PropTypes.string,
    exposure:      PropTypes.shape({
      dormancyBucket: PropTypes.string,
    }),
  }),
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  showChips: PropTypes.bool,
  ariaLabel: PropTypes.string,
};
