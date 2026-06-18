import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import QuantumScoreRing from './QuantumScoreRing.jsx';
import SourceConfidenceLedger from './SourceConfidenceLedger.jsx';
import MigrationPathPanel from './MigrationPathPanel.jsx';
import { COLORS } from '../theme.js';
import { simulateVaultPolicy } from '../lib/quantum-vault-readiness.js';
import { formatTimestamp } from './dataSourceFormatting.js';
import {
  BAND_TONE,
  CONTROL_LABELS,
  EMPTY_RECOMMENDATIONS_TEXT,
  GUARDRAIL_COPY,
  POLICY_LABELS,
  STATUS_LABELS,
  normalizeReadinessForDisplay,
  severityTone,
} from '../lib/quantum-vault-readiness-display.js';

const subFg = COLORS.brand.inkSubtle;
const bodyFg = 'rgba(30,26,20,0.78)';
const dimFg = 'rgba(30,26,20,0.42)';

const TRUST_BODY_COPY =
  'Wallet Wall estimates migration readiness from available wallet signals. It never moves funds or requests signatures.';

function MetaChip({ tone = 'info', children }) {
  return (
    <span className="ww-meta-chip" data-tone={tone}>
      <span className="ww-meta-chip-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
MetaChip.propTypes = { tone: PropTypes.string, children: PropTypes.node };

function FindingList({ title, rows, empty, renderRow }) {
  return (
    <div>
      <div className="ww-soft-label" style={{ marginBottom: 8 }}>{title}</div>
      {rows.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(renderRow)}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: subFg, lineHeight: 1.55 }}>{empty}</div>
      )}
    </div>
  );
}

FindingList.propTypes = {
  title: PropTypes.string.isRequired,
  rows: PropTypes.array.isRequired,
  empty: PropTypes.string.isRequired,
  renderRow: PropTypes.func.isRequired,
};

export default function QuantumVaultReadinessCard({ readiness, migration, vaultEligibility, recovery }) {
  const [selectedPolicies, setSelectedPolicies] = useState({});
  const displayReadiness = useMemo(
    () => normalizeReadinessForDisplay(readiness),
    [readiness],
  );
  const simulated = useMemo(
    () => simulateVaultPolicy(displayReadiness, selectedPolicies),
    [displayReadiness, selectedPolicies],
  );

  const controls = Object.entries(displayReadiness?.controls ?? {});
  const findings = displayReadiness?.findings ?? [];
  const recommendations = displayReadiness?.recommendations ?? [];
  const caveats = displayReadiness?.caveats ?? [];
  const isSourceBacked =
    displayReadiness?.sourceMode === 'source-backed' ||
    displayReadiness?.provenance?.sourceMode === 'source-backed';

  const ledgerDataNote = isSourceBacked
    ? 'Dune auto-run facts — not real-time. Wallet Wall does not provide investment advice.'
    : 'Wallet heuristics only — no Dune auto-run readiness facts loaded for this address.';

  const queryRunAtRaw = displayReadiness?.provenance?.queryRunAt ?? null;
  const queryRunAtPretty = queryRunAtRaw ? formatTimestamp(queryRunAtRaw) : null;
  const hasUnknownControls = Object.values(displayReadiness?.controls ?? {})
    .includes('unknown');

  const togglePolicy = (policy) => {
    setSelectedPolicies(current => ({ ...current, [policy]: !current[policy] }));
  };

  if (!displayReadiness) return null;

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Trust panel header — replaces stacked all-caps disclaimer chips. */}
      <div className="ww-trust-panel">
        <div className="ww-trust-panel-header">
          <div className="ww-trust-panel-title-group">
            <h3 className="ww-trust-panel-title">Quantum Readiness</h3>
          </div>
          <div className="ww-trust-panel-meta">
            <span className="ww-source-chip">
              {isSourceBacked ? 'Dune' : 'Heuristic'}
            </span>
            <span>
              {isSourceBacked ? 'Cached snapshot' : 'On-chain only'}
              {queryRunAtPretty && (
                <>
                  {' · '}
                  <time dateTime={queryRunAtRaw || undefined}>{queryRunAtPretty}</time>
                </>
              )}
            </span>
          </div>
        </div>

        <p className="ww-trust-panel-body">{TRUST_BODY_COPY}</p>

        <div className="ww-trust-panel-badges">
          <MetaChip>Estimate only</MetaChip>
          {hasUnknownControls && <MetaChip tone="warn">Unknown controls possible</MetaChip>}
          <MetaChip>{isSourceBacked ? 'Cached data' : 'Heuristic data'}</MetaChip>
          <MetaChip>Not investment advice</MetaChip>
        </div>
      </div>

      {/* Score row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <QuantumScoreRing readiness={displayReadiness} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge variant="status" tone={BAND_TONE[displayReadiness.band] ?? 'muted'}>
              {displayReadiness.band}
            </Badge>
            {displayReadiness.score === null ? (
              <span style={{ fontSize: 12, color: subFg }}>Insufficient data for score</span>
            ) : (
              <span style={{ fontSize: 18, fontWeight: 700, color: bodyFg }}>
                {displayReadiness.score}/100
              </span>
            )}
          </div>
          {displayReadiness.exposureLevel !== 'unknown' && (
            <span style={{ fontSize: 11, color: subFg }}>
              {displayReadiness.exposureLevel} exposure
            </span>
          )}
        </div>
      </div>

      {/* Findings + Recommendations grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: recommendations.length > 0 ? 'repeat(auto-fit, minmax(190px, 1fr))' : 'minmax(0, 1fr)',
          gap: 18,
        }}
      >
        <FindingList
          title="Findings"
          rows={findings}
          empty="No elevated vault-readiness findings from available wallet signals."
          renderRow={(item) => (
            <li key={item.id} style={{ fontSize: 12, color: bodyFg, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontWeight: 600 }}>{item.label}</strong>
                <Badge variant="status" tone={severityTone(item.severity)}>
                  {item.severity}
                </Badge>
              </div>
              <div style={{ color: subFg, marginTop: 3 }}>{item.detail}</div>
            </li>
          )}
        />

        {recommendations.length > 0 ? (
          <FindingList
            title="Recommendations"
            rows={recommendations}
            empty={EMPTY_RECOMMENDATIONS_TEXT}
            renderRow={(item) => (
              <li key={item.id ?? item} style={{ fontSize: 12, color: bodyFg, lineHeight: 1.55 }}>
                {item.text}
              </li>
            )}
          />
        ) : (
          <div style={{ fontSize: 12, color: subFg, lineHeight: 1.55 }}>
            {EMPTY_RECOMMENDATIONS_TEXT}
          </div>
        )}
      </div>

      {/* Compact control status — replaces the row of all-caps status badges. */}
      {controls.length > 0 && (
        <div>
          <div className="ww-soft-label" style={{ marginBottom: 8 }}>Controls</div>
          <div className="ww-status-row">
            {controls.map(([key, status]) => (
              <span key={key} className="ww-status-row-item">
                <span className="ww-status-dot" data-status={status} aria-hidden="true" />
                <strong>{CONTROL_LABELS[key] ?? key}</strong>
                <em>{STATUS_LABELS[status] ?? status}</em>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Policy simulator — only shown when a baseline score exists */}
      {displayReadiness.score !== null && (
      <div style={{ borderTop: '1px solid rgba(30,26,20,0.08)', paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div className="ww-soft-label">Vault policy simulator</div>
            <div style={{ fontSize: 11.5, color: dimFg, marginTop: 4, lineHeight: 1.5 }}>
              {GUARDRAIL_COPY.join(' ')}
            </div>
          </div>
          <div style={{ fontSize: 12, color: bodyFg, fontWeight: 700 }}>
            {displayReadiness.score}/100 {'->'} {simulated.score}/100
            {simulated.delta > 0 && <span style={{ color: COLORS.status.safeDark }}> +{simulated.delta}</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
          {Object.entries(POLICY_LABELS).map(([policy, label]) => {
            const selected = Boolean(selectedPolicies[policy]);
            return (
              <label
                key={policy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: bodyFg,
                  padding: '8px 10px',
                  border: `1px solid ${selected ? 'rgba(191,78,50,0.32)' : 'rgba(30,26,20,0.08)'}`,
                  borderRadius: 4,
                  background: selected ? 'rgba(191,78,50,0.06)' : 'rgba(255,255,255,0.34)',
                  cursor: 'pointer',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => togglePolicy(policy)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>
      )}

      {/* Migration path recommendation — surfaces the WalletWall Vault prototype
          as one experimental research path inside Migration Readiness. */}
      <MigrationPathPanel migration={migration} vaultEligibility={vaultEligibility} recovery={recovery} />

      {/* Provenance footer — kept for source/ledger integrations.
          Rendered as an inline note (no nested card). */}
      <SourceConfidenceLedger
        mode="quantum-readiness"
        sources={isSourceBacked ? 'dune_scheduled' : 'computed'}
        confidence={isSourceBacked ? 'high' : 'medium'}
        queryRunAt={displayReadiness?.provenance?.queryRunAt}
        warnings={caveats}
        dataNote={ledgerDataNote}
        className="ww-source-ledger-inline"
      />
    </div>
  );
}

const findingShape = PropTypes.shape({
  id:       PropTypes.string.isRequired,
  severity: PropTypes.string.isRequired,
  label:    PropTypes.string.isRequired,
  detail:   PropTypes.string.isRequired,
});

QuantumVaultReadinessCard.propTypes = {
  readiness: PropTypes.shape({
    score:           PropTypes.number,
    band:            PropTypes.string.isRequired,
    exposureLevel:   PropTypes.string.isRequired,
    sourceMode:      PropTypes.string,
    provenance:      PropTypes.shape({
      sourceMode: PropTypes.string,
      dataNote:   PropTypes.string,
      queryRunAt: PropTypes.string,
    }),
    controls:        PropTypes.objectOf(PropTypes.string).isRequired,
    findings:        PropTypes.arrayOf(findingShape).isRequired,
    recommendations: PropTypes.arrayOf(PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        id:   PropTypes.string,
        text: PropTypes.string,
      }),
    ])).isRequired,
    caveats:     PropTypes.arrayOf(PropTypes.string),
    disclaimers: PropTypes.arrayOf(PropTypes.string),
  }),
  migration: PropTypes.shape({
    recommendedPath: PropTypes.string,
    urgency:         PropTypes.string,
    level:           PropTypes.string,
    difficulty:      PropTypes.string,
    blockers:        PropTypes.arrayOf(PropTypes.string),
    nextAction:      PropTypes.string,
    disclosure:      PropTypes.string,
  }),
  // Optional wallet-security profile slices forwarded to MigrationPathPanel's
  // orchestration slots. Absent on surfaces that do not compute a profile.
  vaultEligibility: PropTypes.object,
  recovery:         PropTypes.object,
};
