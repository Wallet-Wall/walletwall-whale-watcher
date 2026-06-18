/**
 * QuantumExposureCard
 *
 * Compact Quantum Intelligence risk card for Whale Watcher surfaces.
 * Renders from the output of deriveWalletSignatureExposure +
 * deriveQuantumExposureScore.  Shows "Unknown / insufficient data"
 * gracefully when wallet facts are unavailable.
 *
 * Props:
 *   exposure    — WalletSignatureExposure (from deriveWalletSignatureExposure)
 *   scoreResult — QuantumExposureScoreResult (from deriveQuantumExposureScore)
 *
 * Both props may be null; the card renders a safe unknown state in that case.
 */

import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import { formatReasonCode, formatConfidence, labelTone, visibleSignals } from '../lib/quantum-exposure-formatting.js';
import { COLORS } from '../theme.js';

const subFg  = COLORS.brand.inkSubtle;
const bodyFg = 'rgba(30,26,20,0.75)';
const dimFg  = 'rgba(30,26,20,0.38)';

const TONE_COLOR = {
  safe:  COLORS.status.safeDark,
  warn:  COLORS.status.warnDark,
  risk:  COLORS.status.riskDark,
  muted: COLORS.brand.inkSubtle,
};

export default function QuantumExposureCard({ exposure, scoreResult, adversarialSignals, duneProvenance, isSubsection = false }) {
  const label = scoreResult?.label ?? 'Unknown / insufficient data';
  const tone  = labelTone(label);

  const reasonCodes    = (scoreResult?.reasonCodes ?? []).filter(Boolean);
  const hints          = (exposure?.migrationReadinessHints ?? []).filter(Boolean);
  let caveats;
  if (Array.isArray(scoreResult?.caveats)) {
    caveats = scoreResult.caveats.filter(Boolean);
  } else if (scoreResult?.caveat) {
    caveats = [scoreResult.caveat];
  } else {
    caveats = [];
  }
  const behaviorSignals = visibleSignals(adversarialSignals);

  const provSuffix    = duneProvenance?.queryRunAtFormatted ? ` · ${duneProvenance.queryRunAtFormatted}` : '';
  const provenanceText = duneProvenance
    ? `Source: ${(duneProvenance.sources || []).join(' · ')} · Dune auto-run${provSuffix}`
    : 'Source: heuristic · on-chain signature activity';

  let behavioralExposureContent = null;
  if (behaviorSignals.length > 0) {
    behavioralExposureContent = (
      <div>
        <div className="ww-soft-label" style={{ marginBottom: 6 }}>
          Behavioral exposure signals
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {behaviorSignals.map(({ key, signal }) => (
            <li key={key} style={{ fontSize: 12, color: bodyFg, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.55 }}>
              <span style={{ color: subFg, flexShrink: 0, marginTop: 1 }}>—</span>
              <span>
                {signal.reason}
                <span style={{ fontSize: 11, color: dimFg, marginLeft: 6 }}>
                  ({signal.confidence} confidence)
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (adversarialSignals && Object.keys(adversarialSignals).length > 0) {
    behavioralExposureContent = (
      <div style={{ fontSize: 11.5, color: subFg }}>
        Behavioral exposure: no elevated patterns observed
      </div>
    );
  }

  const sections = [
    reasonCodes.length > 0 && (
      <div key="reasons">
        <div className="ww-soft-label" style={{ marginBottom: 6 }}>Observed signals</div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {reasonCodes.map(code => (
            <li key={code} style={{ fontSize: 12, color: bodyFg, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.55 }}>
              <span style={{ color: subFg, flexShrink: 0, marginTop: 1 }}>—</span>
              {formatReasonCode(code)}
            </li>
          ))}
        </ul>
      </div>
    ),
    hints.length > 0 && (
      <div key="hints">
        <div className="ww-soft-label" style={{ marginBottom: 6 }}>Migration-readiness hints</div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hints.map((hint) => (
            <li
              key={hint}
              style={{ fontSize: 12, color: bodyFg, lineHeight: 1.55, display: 'flex', alignItems: 'flex-start', gap: 8 }}
            >
              <span style={{ color: subFg, flexShrink: 0, marginTop: 1 }}>—</span>
              {hint}
            </li>
          ))}
        </ul>
      </div>
    ),
    behavioralExposureContent && <div key="behavior">{behavioralExposureContent}</div>,
    caveats.length > 0 && (
      <div key="caveats">
        {caveats.map((c, i) => (
          <p
            key={c}
            style={{ fontSize: 11.5, color: subFg, fontStyle: 'italic', margin: i === 0 ? '0' : '4px 0 0', lineHeight: 1.6 }}
          >
            {c}
          </p>
        ))}
      </div>
    ),
  ].filter(Boolean);

  const coreContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sections}
    </div>
  );

  if (isSubsection) {
    return (
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(30,26,20,0.08)' }}>
        {coreContent}
      </div>
    );
  }

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header — softer than the previous all-caps "QUANTUM INTELLIGENCE" eyebrow. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h3 className="ww-trust-panel-title" style={{ margin: 0 }}>Quantum Intelligence</h3>
        <span style={{ fontSize: 11, color: dimFg }}>{provenanceText}</span>
      </div>

      {/* Label + score + confidence row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Badge variant="status" tone={tone}>{label}</Badge>
        {scoreResult?.score != null && (
          <span style={{ fontSize: 14, fontWeight: 700, color: TONE_COLOR[tone] }}>
            {scoreResult.score}/100
          </span>
        )}
        {scoreResult?.confidence && (
          <span style={{ fontSize: 11, color: subFg }}>
            {formatConfidence(scoreResult.confidence)}
          </span>
        )}
      </div>

      {coreContent}
    </div>
  );
}

const adversarialSignalShape = PropTypes.shape({
  score:      PropTypes.number,
  confidence: PropTypes.string,
  reason:     PropTypes.string,
  evidence:   PropTypes.object,
});

QuantumExposureCard.propTypes = {
  exposure: PropTypes.shape({
    migrationReadinessHints: PropTypes.arrayOf(PropTypes.string),
  }),
  scoreResult: PropTypes.shape({
    label:       PropTypes.string,
    score:       PropTypes.number,
    confidence:  PropTypes.string,
    reasonCodes: PropTypes.arrayOf(PropTypes.string),
    caveat:      PropTypes.string,
    caveats:     PropTypes.arrayOf(PropTypes.string),
  }),
  adversarialSignals: PropTypes.objectOf(adversarialSignalShape),
  isSubsection: PropTypes.bool,
  duneProvenance: PropTypes.shape({
    sources:              PropTypes.arrayOf(PropTypes.string),
    queryRunAtFormatted:  PropTypes.string,
  }),
};
