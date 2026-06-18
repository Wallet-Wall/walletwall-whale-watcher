import { isValidEvmAddress } from './quantum-exposure-adapter.js';

export const VAULT_READINESS_LOADING = 'Checking vault readiness...';
export const VAULT_READINESS_UNAVAILABLE = 'Vault readiness unavailable';
export const VAULT_READINESS_DUNE_SOURCE = 'Dune auto-run data';
export const VAULT_READINESS_HEURISTIC_SOURCE = 'wallet heuristics';

const FORBIDDEN_DETAIL_PATTERN = new RegExp(
  [
    ['DUNE', 'QUERY'].join('_'),
    ['DUNE', 'API', 'KEY'].join('_'),
    String.raw`\b\d{6,}\b`,
    'api[_-]?key',
  ].join('|'),
  'i',
);

export function isValidVaultReadinessAddress(address) {
  return isValidEvmAddress(address);
}

function titleCaseWords(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatReadinessBand(value) {
  return titleCaseWords(value) || 'Unknown';
}

export function formatExposureLevel(value) {
  const label = titleCaseWords(value) || 'Unknown';
  return /\bexposure\b/i.test(label) ? label : `${label} Exposure`;
}

export function vaultReadinessSourceCopy(readiness) {
  const sourceMode = readiness?.sourceMode ?? readiness?.provenance?.sourceMode;
  if (sourceMode === 'source-backed') return VAULT_READINESS_DUNE_SOURCE;
  return VAULT_READINESS_HEURISTIC_SOURCE;
}

function safeTitle(text) {
  const value = String(text ?? '');
  if (!value || FORBIDDEN_DETAIL_PATTERN.test(value)) return null;
  return value;
}

export function normalizeVaultReadinessBadgeState({
  address,
  payload,
  loading = false,
  failed = false,
} = {}) {
  if (!isValidVaultReadinessAddress(address)) return null;

  if (loading) {
    return {
      label: VAULT_READINESS_LOADING,
      tone: 'muted',
      title: VAULT_READINESS_LOADING,
    };
  }

  const readiness = payload?.readiness;
  if (failed || !readiness || typeof readiness !== 'object') {
    return {
      label: VAULT_READINESS_UNAVAILABLE,
      tone: 'muted',
      title: VAULT_READINESS_UNAVAILABLE,
    };
  }

  const band = formatReadinessBand(readiness.band);
  const exposure = formatExposureLevel(readiness.exposureLevel);
  const source = vaultReadinessSourceCopy(readiness);
  const titleParts = [
    `Source: ${source}`,
    Number.isFinite(readiness.score) ? `Score: ${readiness.score}/100` : null,
    safeTitle(readiness.confidence ? `Confidence: ${titleCaseWords(readiness.confidence)}` : null),
  ].filter(Boolean);

  return {
    label: `Vault Readiness: ${band} · ${exposure}`,
    tone: band.toLowerCase() === 'weak' || /elevated|high|critical/i.test(exposure) ? 'warn' : 'safe',
    title: titleParts.join(' · '),
  };
}
