import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import DataSourceBadge from './DataSourceBadge.jsx';
import {
  formatCacheAge,
  formatTimestamp,
  confidenceTone,
} from './dataSourceFormatting.js';

const INK = (a) => `rgba(30,26,20,${a})`;

/**
 * Display labels for the capability flags we surface explicitly.
 * Keys map to fields on the `capabilities` prop. We render a chip only when
 * the value is explicitly `false` — true/undefined stays silent so the ledger
 * doesn't grow when there's nothing to warn about.
 */
const CAPABILITY_DISCLAIMERS = {
  holderAnalyticsSupported: 'No holder analytics',
  marketDataSupported:      'No market data',
};

/**
 * Normalize the `sources` prop into an iterable list of { kind, provider } so
 * we can render one chip per contributing source.
 *
 * Accepts:
 *   - { marketData: 'dexscreener', holderData: 'dune' }   (record form)
 *   - [{ kind: 'marketData', provider: 'dexscreener' }]   (array form)
 *   - 'dexscreener'                                       (single provider)
 *   - null / undefined                                    (no sources)
 */
function normalizeSources(sources) {
  if (!sources) return [];
  if (typeof sources === 'string') return [{ kind: null, provider: sources }];
  if (Array.isArray(sources)) {
    return sources
      .filter(Boolean)
      .map(s => (typeof s === 'string' ? { kind: null, provider: s } : { kind: s.kind ?? null, provider: s.provider ?? null }))
      .filter(s => s.provider);
  }
  return Object.entries(sources)
    .filter(([, provider]) => provider != null && provider !== false)
    .map(([kind, provider]) => ({ kind, provider: String(provider) }));
}

/**
 * Product-friendly labels for known source-kind keys.
 * Avoids surfacing raw camelCase / snake_case keys in primary UI.
 */
const KIND_PRODUCT_LABELS = {
  liveWalletSample:  'Live sample',
  duneQuantumFacts:  'Quantum facts',
  duneActivity12w:   'Activity 12w',
  marketData:        'Market data',
  holderData:        'Holder data',
  dune_scheduled:    'Dune',
  dune_cached:       'Dune',
};

function prettyKind(kind) {
  if (!kind) return null;
  if (KIND_PRODUCT_LABELS[kind]) return KIND_PRODUCT_LABELS[kind];
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * For warnings that follow the pattern
 * "dune:<query-name>: Dune auto-run data unavailable",
 * translate the query-name segment into a short human-readable label.
 */
const DUNE_FACT_LABELS = {
  'dune:wallet-signature-exposure':   'Signature exposure',
  'dune:quantum-value-at-risk':        'Quantum value at risk',
  'dune:wallet-migration-readiness':   'Migration readiness',
  'dune:dormant-quantum-exposure':     'Dormant wallet exposure',
  'dune:quantum-exposure':             'Quantum exposure',
};

// Both the legacy "scheduled/cached" suffix and the current "auto-run" suffix
// are treated identically — either signals a Dune fact that failed to load.
const DUNE_UNAVAIL_SUFFIXES = [
  ': dune auto-run data unavailable',
  ': scheduled/cached dune data unavailable',
];

/**
 * Split the warning list into:
 *   - unavailableFacts: friendly names of Dune facts that couldn't load
 *   - otherWarnings:    warnings that don't match the unavailable pattern
 */
function splitWarnings(warnings) {
  const unavailableFacts = [];
  const otherWarnings = [];
  for (const w of warnings) {
    const lower = String(w).toLowerCase();
    const matchedSuffix = DUNE_UNAVAIL_SUFFIXES.find(s => lower.endsWith(s));
    if (matchedSuffix) {
      const prefix = lower.slice(0, lower.length - matchedSuffix.length).trim();
      const friendlyLabel = DUNE_FACT_LABELS[prefix] ?? prefix;
      unavailableFacts.push(friendlyLabel);
    } else {
      otherWarnings.push(w);
    }
  }
  return { unavailableFacts, otherWarnings };
}

/**
 * SourceConfidenceLedger — shared trust/provenance band used across surfaces
 * (Stable Seer, Whale Watcher, Quantum Readiness, Holder Wall).
 *
 * Renders compactly. When the input has nothing actionable to show (no
 * sources, no warnings, no capability disclaimers, no data note), returns
 * `null` so callers don't have to guard the call site themselves.
 */
export default function SourceConfidenceLedger({
  mode = null,
  sources = null,
  confidence = null,
  cacheHit = false,
  cacheAgeSeconds = null,
  generatedAt = null,
  queryRunAt = null,
  warnings = null,
  capabilities = null,
  dataNote = null,
  className = '',
  style,
}) {
  const sourceEntries = normalizeSources(sources);
  const rawWarnings = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  const { unavailableFacts, otherWarnings: warningList } = splitWarnings(rawWarnings);
  const disclaimers = capabilities
    ? Object.entries(CAPABILITY_DISCLAIMERS)
        .filter(([key]) => capabilities[key] === false)
        .map(([, label]) => label)
    : [];

  const cacheAge = cacheHit ? formatCacheAge(cacheAgeSeconds) : null;
  const queryRunLabel = queryRunAt ? formatTimestamp(queryRunAt) : null;
  const generatedLabel = generatedAt && !queryRunLabel ? formatTimestamp(generatedAt) : null;

  const hasAnyContent =
    sourceEntries.length > 0 ||
    rawWarnings.length > 0 ||
    disclaimers.length > 0 ||
    Boolean(dataNote) ||
    Boolean(queryRunLabel) ||
    Boolean(generatedLabel) ||
    Boolean(cacheAge);
  if (!hasAnyContent) return null;

  return (
    <section
      aria-label={mode ? `${mode} source and confidence ledger` : 'Source and confidence ledger'}
      data-mode={mode || undefined}
      className={['ww-card', 'ww-card-sharp', 'ww-source-ledger', className].filter(Boolean).join(' ')}
      style={{
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 12,
        color: INK(0.55),
        lineHeight: 1.5,
        ...style,
      }}
    >
      {/* Row 1 — sources, freshness, confidence */}
      {(sourceEntries.length > 0 || cacheAge || queryRunLabel || generatedLabel || confidence) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {sourceEntries.map(({ kind, provider }) => {
            const kindLabel = prettyKind(kind);
            return (
              <span
                key={`${kind ?? 'src'}-${provider}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {kindLabel && (
                  <span style={{ fontSize: 10, letterSpacing: 0.2, color: INK(0.48), fontWeight: 500 }}>
                    {kindLabel} ·
                  </span>
                )}
                <DataSourceBadge
                  compact
                  provider={provider}
                  sourceType={provider}
                  confidence={confidence}
                  isCached={cacheHit}
                  cacheAgeSeconds={cacheAgeSeconds}
                  method={dataNote || undefined}
                  warnings={rawWarnings.length > 0 ? rawWarnings : undefined}
                />
              </span>
            );
          })}

          {queryRunLabel && (
            <span style={{ fontSize: 11, color: INK(0.5) }}>
              Query run <strong style={{ color: INK(0.75) }}>{queryRunLabel}</strong>
            </span>
          )}

          {!queryRunLabel && generatedLabel && (
            <span style={{ fontSize: 11, color: INK(0.5) }}>
              Generated <strong style={{ color: INK(0.75) }}>{generatedLabel}</strong>
            </span>
          )}

          {confidence && sourceEntries.length === 0 && (
            <Badge variant="data" tone={confidenceTone(confidence)}>
              {String(confidence)} confidence
            </Badge>
          )}
        </div>
      )}

      {/* Row 2 — capability disclaimers + Dune unavailability summary + other warnings */}
      {(disclaimers.length > 0 || unavailableFacts.length > 0 || warningList.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(disclaimers.length > 0 || warningList.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {disclaimers.map(label => (
                <Badge key={label} variant="data" tone="muted">{label}</Badge>
              ))}
              {warningList.map(warning => (
                <Badge key={warning} variant="status" tone="warn" title={warning}>
                  {warning.length > 72 ? `${warning.slice(0, 72)}…` : warning}
                </Badge>
              ))}
            </div>
          )}

          {/* Dune unavailability — shown as a single calm summary badge with an expandable list */}
          {unavailableFacts.length > 0 && (
            <details style={{ fontSize: 11, color: INK(0.5) }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge variant="status" tone="warn" style={{ cursor: 'pointer' }}>
                  Dune snapshot partial
                </Badge>
                <span style={{ fontSize: 10, color: INK(0.42) }}>
                  {unavailableFacts.length} scheduled fact{unavailableFacts.length === 1 ? '' : 's'} unavailable
                </span>
              </summary>
              <ul style={{ margin: '6px 0 0 4px', padding: 0, listStyle: 'disc', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {unavailableFacts.map(fact => (
                  <li key={fact} style={{ color: INK(0.45), lineHeight: 1.45 }}>{fact}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Row 3 — short data note */}
      {dataNote && (
        <div style={{ fontSize: 11, color: INK(0.5) }}>{dataNote}</div>
      )}
    </section>
  );
}

SourceConfidenceLedger.propTypes = {
  mode:            PropTypes.string,
  sources:         PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.string]),
  confidence:      PropTypes.string,
  cacheHit:        PropTypes.bool,
  cacheAgeSeconds: PropTypes.number,
  generatedAt:     PropTypes.string,
  queryRunAt:      PropTypes.string,
  warnings:        PropTypes.arrayOf(PropTypes.string),
  capabilities:    PropTypes.object,
  dataNote:        PropTypes.string,
  className:       PropTypes.string,
  style:           PropTypes.object,
};
