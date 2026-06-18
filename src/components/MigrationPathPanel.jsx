import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import { COLORS } from '../theme.js';
import {
  MIGRATION_CONCEPT_COPY,
  MIGRATION_PATH_DESCRIPTIONS,
  MIGRATION_PATH_LABELS,
  PQC_ALGORITHM_NOTE,
  VAULT_PROTOTYPE_DISCLOSURE,
  WALLETWALL_VAULT_REPO_URL,
} from '../lib/migration-readiness.js';

const subFg = COLORS.brand.inkSubtle;
const bodyFg = 'rgba(30,26,20,0.78)';
const dimFg = 'rgba(30,26,20,0.42)';

const URGENCY_TONE = { monitor: 'muted', plan: 'warn', prioritize: 'risk' };
const LEVEL_TONE = { high: 'safe', medium: 'warn', low: 'risk', unknown: 'muted' };
const DIFFICULTY_TONE = { low: 'safe', medium: 'warn', high: 'risk', unknown: 'muted' };

const DEFAULT_MIGRATION = Object.freeze({
  recommendedPath: 'monitor',
  urgency: 'monitor',
  level: 'unknown',
  difficulty: 'unknown',
  blockers: [],
  nextAction: 'Keep monitoring signature exposure while recovery readiness data is unavailable.',
});

function Chip({ label, value, tone }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: subFg }}>
      <span style={{ color: dimFg }}>{label}</span>
      <Badge variant="status" tone={tone}>{value}</Badge>
    </span>
  );
}
Chip.propTypes = { label: PropTypes.string, value: PropTypes.string, tone: PropTypes.string };

function StatusRow({ label, value, tone = 'muted', detail }) {
  return (
    <div
      className="ww-orchestration-status-row"
      style={{
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '9px 10px',
        border: '1px solid rgba(30,26,20,0.1)',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.34)',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 12, color: bodyFg, fontWeight: 650 }}>{label}</strong>
        {detail && <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: subFg, lineHeight: 1.45 }}>{detail}</span>}
      </span>
      <Badge variant="status" tone={tone}>{value}</Badge>
    </div>
  );
}
StatusRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  tone: PropTypes.string,
  detail: PropTypes.string,
};

function ChecklistItem({ label, state, detail }) {
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          border: '1px solid rgba(191,78,50,0.42)',
          background: state === 'ready' ? 'rgba(191,78,50,0.72)' : 'transparent',
          marginTop: 5,
          flexShrink: 0,
        }}
      />
      <span style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 12, color: bodyFg, fontWeight: 600 }}>{label}</strong>
        <span style={{ display: 'block', fontSize: 11.5, color: subFg, lineHeight: 1.45 }}>{detail}</span>
      </span>
    </li>
  );
}
ChecklistItem.propTypes = {
  label: PropTypes.string.isRequired,
  state: PropTypes.string,
  detail: PropTypes.string.isRequired,
};

/**
 * Recovery-readiness slot: reads the shared wallet-security profile when present,
 * otherwise falls back to the migration readiness level. Kept as a flat helper so
 * the component stays free of nested ternaries.
 */
function buildRecoverySlot(recovery, level) {
  if (recovery) {
    return {
      ready: !['not-applicable', 'monitor-only'].includes(recovery.classification),
      value: recovery.label,
      tone: recovery.tone ?? 'muted',
      detail: recovery.rationale,
    };
  }
  return {
    ready: level !== 'unknown',
    value: level,
    tone: LEVEL_TONE[level] ?? 'muted',
    detail: 'Static placeholder using the current migration readiness level.',
  };
}

/** Vault-candidate slot: shared eligibility when present, else migration-path fallback. */
function buildVaultSlot(vaultEligibility, isVaultPath) {
  if (vaultEligibility) {
    return {
      value: vaultEligibility.eligible ? 'Vault candidate' : 'Monitor only',
      tone: vaultEligibility.eligible ? 'warn' : 'muted',
      detail: vaultEligibility.reason,
    };
  }
  return {
    value: isVaultPath ? 'Vault candidate' : 'Monitor only',
    tone: isVaultPath ? 'warn' : 'muted',
    detail: isVaultPath
      ? 'Existing rules qualify this wallet for research review.'
      : 'No vault candidate path from current signals.',
  };
}

function SignalChips({ pathLabel, isVaultPath, urgency, level, difficulty }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Badge variant="status" tone={isVaultPath ? 'warn' : 'safe'}>{pathLabel}</Badge>
      <Chip label="Urgency" value={urgency} tone={URGENCY_TONE[urgency] ?? 'muted'} />
      <Chip label="Readiness" value={level} tone={LEVEL_TONE[level] ?? 'muted'} />
      <Chip label="Difficulty" value={difficulty} tone={DIFFICULTY_TONE[difficulty] ?? 'muted'} />
    </div>
  );
}
SignalChips.propTypes = {
  pathLabel:  PropTypes.string,
  isVaultPath: PropTypes.bool,
  urgency:    PropTypes.string,
  level:      PropTypes.string,
  difficulty: PropTypes.string,
};

const slotShape = PropTypes.shape({
  value:  PropTypes.string,
  tone:   PropTypes.string,
  detail: PropTypes.string,
  ready:  PropTypes.bool,
});

function OrchestrationSlots({ recoverySlot, vaultSlot }) {
  return (
    <div
      className="ww-orchestration-slot-grid"
      data-testid="orchestration-placeholder-slots"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, minWidth: 0 }}
    >
      <StatusRow label="Recovery readiness" value={recoverySlot.value} tone={recoverySlot.tone} detail={recoverySlot.detail} />
      <StatusRow label="Vault candidate" value={vaultSlot.value} tone={vaultSlot.tone} detail={vaultSlot.detail} />
    </div>
  );
}
OrchestrationSlots.propTypes = { recoverySlot: slotShape, vaultSlot: slotShape };

function MigrationChecklist({ blockers, recoverySlot, recovery }) {
  const hasSignatureExposureBlocker = blockers.some(blocker => /public key|signature/i.test(blocker));
  const hasValueBlocker = blockers.some(blocker => /value|concentrated/i.test(blocker));
  return (
    <div
      data-testid="migration-path-checklist"
      style={{ border: '1px solid rgba(30,26,20,0.1)', borderRadius: 4, padding: '10px 12px', background: 'rgba(255,255,255,0.3)', minWidth: 0 }}
    >
      <div className="ww-soft-label" style={{ marginBottom: 8 }}>Migration path checklist</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <ChecklistItem
          label="Signature exposure"
          state={hasSignatureExposureBlocker ? 'ready' : 'pending'}
          detail={hasSignatureExposureBlocker ? 'Observed in current blockers.' : 'No current signature exposure blocker.'}
        />
        <ChecklistItem
          label="Value concentration"
          state={hasValueBlocker ? 'ready' : 'pending'}
          detail={hasValueBlocker ? 'Concentration is part of the current recommendation.' : 'No high-value concentration blocker.'}
        />
        <ChecklistItem
          label="Recovery readiness"
          state={recoverySlot.ready ? 'ready' : 'pending'}
          detail={recovery ? recovery.label : 'Placeholder until shared recovery readiness data is available.'}
        />
      </ul>
    </div>
  );
}
MigrationChecklist.propTypes = {
  blockers:     PropTypes.arrayOf(PropTypes.string),
  recoverySlot: slotShape,
  recovery:     PropTypes.shape({ label: PropTypes.string }),
};

function SecurityDisclosureCallout({ isVaultPath, disclosure, recovery }) {
  return (
    <div
      data-testid="security-disclosure-callout"
      style={{
        border: `1px solid ${isVaultPath ? 'rgba(191,78,50,0.32)' : 'rgba(30,26,20,0.1)'}`,
        background: isVaultPath ? 'rgba(191,78,50,0.06)' : 'rgba(255,255,255,0.34)',
        borderRadius: 'var(--ww-radius-panel)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12, fontWeight: 600, color: bodyFg }}>Security disclosure</strong>
        <Badge variant="status" tone="muted">Monitor only</Badge>
      </div>
      <div style={{ fontSize: 11.5, color: subFg, lineHeight: 1.55 }}>
        {disclosure ?? VAULT_PROTOTYPE_DISCLOSURE}
      </div>
      <div style={{ fontSize: 11.5, color: subFg, lineHeight: 1.55 }}>
        The current UI does not implement recovery flows, private key handling, seed phrase inputs, custody flows, or live vault writes.
      </div>
      <div style={{ fontSize: 11, color: dimFg, lineHeight: 1.55 }}>
        {PQC_ALGORITHM_NOTE}
      </div>
      <div data-testid="mobile-recovery-cta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <a
          href={WALLETWALL_VAULT_REPO_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 12px',
            border: '1px solid rgba(191,78,50,0.28)',
            borderRadius: 4,
            fontSize: 11.5,
            color: COLORS.brand.terracotta,
            textDecoration: 'none',
            fontWeight: 650,
          }}
        >
          Research repo
        </a>
        <span
          style={{
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 12px',
            border: '1px solid rgba(30,26,20,0.1)',
            borderRadius: 4,
            fontSize: 11.5,
            color: subFg,
          }}
        >
          {recovery ? `Recovery: ${recovery.label}` : 'Recovery readiness slot'}
        </span>
      </div>
      <a
        href={WALLETWALL_VAULT_REPO_URL}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 11.5, color: COLORS.brand.terracotta, textDecoration: 'underline', width: 'fit-content' }}
      >
        View the WalletWall Vault research repo →
      </a>
    </div>
  );
}
SecurityDisclosureCallout.propTypes = {
  isVaultPath: PropTypes.bool,
  disclosure:  PropTypes.string,
  recovery:    PropTypes.shape({ label: PropTypes.string }),
};

export default function MigrationPathPanel({ migration, vaultEligibility, recovery }) {
  const migrationView = migration ?? DEFAULT_MIGRATION;

  const {
    recommendedPath = DEFAULT_MIGRATION.recommendedPath,
    urgency = DEFAULT_MIGRATION.urgency,
    level = DEFAULT_MIGRATION.level,
    difficulty = DEFAULT_MIGRATION.difficulty,
    blockers = [],
    nextAction = DEFAULT_MIGRATION.nextAction,
    disclosure,
  } = migrationView;

  const isVaultPath = recommendedPath === 'vault-prototype';
  const pathLabel = MIGRATION_PATH_LABELS[recommendedPath] ?? recommendedPath;
  const pathDesc = MIGRATION_PATH_DESCRIPTIONS[recommendedPath] ?? '';

  // Orchestration slots read from the shared wallet-security profile when VaultPage
  // supplies it; otherwise they fall back to migration-derived signals so the panel
  // still renders standalone (Whale Watcher, Quantum, and unit tests pass no profile).
  const recoverySlot = buildRecoverySlot(recovery, level);
  const vaultSlot = buildVaultSlot(vaultEligibility, isVaultPath);

  return (
    <div
      data-testid="migration-path-panel"
      style={{ borderTop: '1px solid rgba(30,26,20,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}
    >
      <div>
        <div className="ww-soft-label" style={{ marginBottom: 6 }}>Migration path</div>
        <div style={{ fontSize: 11.5, color: dimFg, lineHeight: 1.55 }}>
          {MIGRATION_CONCEPT_COPY.quantumExposure}{' '}
          {MIGRATION_CONCEPT_COPY.migrationReadiness}{' '}
          {MIGRATION_CONCEPT_COPY.walletWallVault}
        </div>
      </div>

      {/* Recommendation + signal chips */}
      <SignalChips pathLabel={pathLabel} isVaultPath={isVaultPath} urgency={urgency} level={level} difficulty={difficulty} />

      {pathDesc && (
        <div style={{ fontSize: 12, color: bodyFg, lineHeight: 1.55 }}>{pathDesc}</div>
      )}

      {nextAction && (
        <div style={{ fontSize: 12, color: bodyFg, lineHeight: 1.55 }}>
          <strong style={{ fontWeight: 600 }}>Next step:</strong> {nextAction}
        </div>
      )}

      {blockers.length > 0 && (
        <div>
          <div className="ww-soft-label" style={{ marginBottom: 6 }}>Blockers</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {blockers.map((blocker) => (
              <li key={blocker} style={{ fontSize: 11.5, color: subFg, lineHeight: 1.5 }}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      {/* WalletWall Vault prototype reference — always shown as a research path. */}
      <OrchestrationSlots recoverySlot={recoverySlot} vaultSlot={vaultSlot} />

      <MigrationChecklist blockers={blockers} recoverySlot={recoverySlot} recovery={recovery} />

      {/* Orchestration slots above are wired to the shared wallet-security profile
          (vaultEligibility + recovery) when VaultPage provides it, with a migration-only
          fallback for surfaces that do not yet compute a profile. */}
      <SecurityDisclosureCallout isVaultPath={isVaultPath} disclosure={disclosure} recovery={recovery} />
    </div>
  );
}

MigrationPathPanel.propTypes = {
  migration: PropTypes.shape({
    recommendedPath: PropTypes.string,
    urgency:         PropTypes.string,
    level:           PropTypes.string,
    difficulty:      PropTypes.string,
    blockers:        PropTypes.arrayOf(PropTypes.string),
    nextAction:      PropTypes.string,
    disclosure:      PropTypes.string,
  }),
  // Optional shared wallet-security profile slices (from buildWalletSecurityProfile).
  // When absent, the orchestration slots fall back to migration-derived signals.
  vaultEligibility: PropTypes.shape({
    eligible: PropTypes.bool,
    reason:   PropTypes.string,
  }),
  recovery: PropTypes.shape({
    classification: PropTypes.string,
    label:          PropTypes.string,
    tone:           PropTypes.string,
    rationale:      PropTypes.string,
  }),
};
