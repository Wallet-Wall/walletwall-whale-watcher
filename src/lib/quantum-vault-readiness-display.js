export const BAND_TONE = {
  weak:      'risk',
  moderate:  'warn',
  strong:    'safe',
  resilient: 'safe',
};

export const CONTROL_LABELS = {
  multisig:           'Multisig / Safe',
  timelock:           'Timelock',
  guardian:           'Guardian recovery',
  freshWalletPattern: 'Fresh wallet pattern',
  freshWallet:        'Fresh wallet',
  contractWallet:     'Contract wallet',
};

export const STATUS_LABELS = {
  detected:     'detected',
  not_detected: 'not detected',
  unknown:      'unknown',
};

export const POLICY_LABELS = {
  withdrawalDelay24h:        '24h withdrawal delay',
  withdrawalDelay72h:        '72h withdrawal delay',
  multisig2of3:             '2-of-3 multisig',
  guardianCancelKey:        'Guardian cancel key',
  freshDestinationEnforced: 'Fresh destination enforcement',
  emergencyFreeze:          'Emergency freeze',
  coldWalletCustody:        'Hardware wallet storage',
};

export function formatSourceRunAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   'numeric',
    minute: '2-digit',
  });
}

const SAFE_BANDS = new Set(['weak', 'moderate', 'strong', 'resilient']);
const SAFE_EXPOSURE_LEVELS = new Set(['low', 'moderate', 'elevated', 'high']);
const SAFE_STATUSES = new Set(Object.keys(STATUS_LABELS));
const SAFE_SEVERITIES = new Set(['info', 'low', 'medium', 'high']);
const FORBIDDEN_UI_PATTERNS = [
  /\b[A-Z][A-Z0-9_]{5,}\s*=\s*[^,\s;]+/g,
  /\bDUNE_API_KEY\b/gi,
  /\bDUNE_QUERY_[A-Z0-9_]+\b/gi,
  /\bquery\s+\d{4,}\b/gi,
  /\bDune\s+query\s+\d{4,}\b/gi,
  /\bapi[_-]?key\b/gi,
  /\bprovider internals?\b/gi,
];

function safeText(value, fallback = '') {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  let text = String(value).trim();
  if (!text) return fallback;
  for (const pattern of FORBIDDEN_UI_PATTERNS) {
    text = text.replace(pattern, 'source detail');
  }
  return text;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeFinding(item, index) {
  const row = safeObject(item);
  const severity = safeText(row.severity, 'info').toLowerCase();
  return {
    id:       safeText(row.id, `finding-${index}`),
    severity: SAFE_SEVERITIES.has(severity) ? severity : 'info',
    label:    safeText(row.label, 'Wallet signal'),
    detail:   safeText(row.detail, 'No additional source-backed detail is available.'),
  };
}

function normalizeRecommendation(item, index) {
  if (typeof item === 'string' || typeof item === 'number') {
    return { id: `recommendation-${index}`, text: safeText(item) };
  }
  const row = safeObject(item);
  return {
    id:   safeText(row.id, `recommendation-${index}`),
    text: safeText(row.text),
  };
}

export function normalizeReadinessForDisplay(readiness) {
  if (!readiness) return null;
  const controls = Object.fromEntries(
    Object.entries(safeObject(readiness.controls)).map(([key, status]) => [
      key,
      SAFE_STATUSES.has(status) ? status : 'unknown',
    ]),
  );
  const band = safeText(readiness.band, 'unknown').toLowerCase();
  const exposureLevel = safeText(readiness.exposureLevel, 'unknown').toLowerCase();

  return {
    ...readiness,
    score:           normalizeScore(readiness.score),
    band:            SAFE_BANDS.has(band) ? band : 'unknown',
    exposureLevel:   SAFE_EXPOSURE_LEVELS.has(exposureLevel) ? exposureLevel : 'unknown',
    sourceMode:      safeText(readiness.sourceMode),
    provenance:      safeObject(readiness.provenance),
    controls,
    findings:        safeArray(readiness.findings).map((item, index) => normalizeFinding(item, index)),
    recommendations: safeArray(readiness.recommendations)
      .map((item, index) => normalizeRecommendation(item, index))
      .filter(item => item.text),
    caveats: safeArray(readiness.caveats ?? readiness.disclaimers)
      .map(item => safeText(item))
      .filter(Boolean),
  };
}

export function provenanceText(provenance, sourceMode) {
  if (sourceMode === 'source-backed' || provenance?.sourceMode === 'source-backed') {
    return 'Source: Dune auto-run data';
  }
  return 'Source: wallet heuristics';
}

export function statusTone(status) {
  if (status === 'detected') return 'safe';
  if (status === 'not_detected') return 'warn';
  return 'muted';
}

export function severityTone(severity) {
  if (severity === 'high') return 'risk';
  if (severity === 'medium') return 'warn';
  return 'muted';
}

export const EMPTY_RECOMMENDATIONS_TEXT = "No source-backed recommendations available yet.";

export const GUARDRAIL_COPY = [
  'Hypothetical and non-custodial.',
  'It does not move funds or request signatures.'
];
