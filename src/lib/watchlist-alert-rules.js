import { makeWatchlistId } from './watchlist-storage.js';

export const WATCHLIST_ALERT_RULES_STORAGE_KEY = 'ww_watchlist_alert_rules_v1';
export const DEFAULT_ALERT_THRESHOLD_USD = 50000;
export const ALERT_THRESHOLD_OPTIONS_USD = [10000, 50000, 100000, 250000];
export const DEFAULT_PEG_DEVIATION_PCT = 0.5;
export const PEG_DEVIATION_OPTIONS_PCT = [0.1, 0.5, 1, 2];

const ALERT_EVENT_TYPE = 'large_transfer';

export function normalizeAlertThresholdUsd(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_ALERT_THRESHOLD_USD;
  return Math.round(numeric);
}

export function makeWatchlistAlertRuleId(watchlistItem) {
  const watchlistId = typeof watchlistItem === 'string'
    ? watchlistItem.trim()
    : makeWatchlistId(watchlistItem);
  if (!watchlistId) return null;
  return `${ALERT_EVENT_TYPE}:${watchlistId}`;
}

export function normalizeWatchlistAlertRule(rule, now = Date.now()) {
  const watchlistId = String(rule?.watchlistId || '').trim();
  const id = makeWatchlistAlertRuleId(watchlistId);
  if (!id) return null;

  const createdAt = Number(rule?.createdAt);
  const updatedAt = Number(rule?.updatedAt);
  const rawPegPct = Number(rule?.pegDeviationPct);
  return {
    id,
    watchlistId,
    eventType: ALERT_EVENT_TYPE,
    enabled: rule?.enabled !== false,
    thresholdUsd: normalizeAlertThresholdUsd(rule?.thresholdUsd),
    pegAlertEnabled: rule?.pegAlertEnabled === true,
    pegDeviationPct: Number.isFinite(rawPegPct) && rawPegPct > 0 ? rawPegPct : DEFAULT_PEG_DEVIATION_PCT,
    createdAt: Number.isFinite(createdAt) ? createdAt : now,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now,
  };
}

export function createWatchlistAlertRule(watchlistItem, options = {}, now = Date.now()) {
  const watchlistId = makeWatchlistId(watchlistItem);
  if (!watchlistId) return null;

  return normalizeWatchlistAlertRule({
    watchlistId,
    enabled: options.enabled,
    thresholdUsd: options.thresholdUsd,
    pegAlertEnabled: options.pegAlertEnabled,
    pegDeviationPct: options.pegDeviationPct,
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  }, now);
}

export function evaluateWatchlistSnapshotAlerts(rule, item, snapshot) {
  if (!rule || item?.type !== 'token' || rule.pegAlertEnabled !== true) {
    return { triggered: false, pegDeviationPct: null };
  }

  const price = Number(snapshot?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { triggered: false, pegDeviationPct: null };
  }

  const threshold = Number(rule.pegDeviationPct);
  const pegThresholdPct = Number.isFinite(threshold) && threshold > 0
    ? threshold
    : DEFAULT_PEG_DEVIATION_PCT;
  const pegDeviationPct = Math.abs(price - 1) * 100;

  return {
    triggered: pegDeviationPct >= pegThresholdPct,
    pegDeviationPct,
  };
}

export function normalizeWatchlistAlertRules(rules, now = Date.now()) {
  if (!Array.isArray(rules)) return [];

  const byId = new Map();
  for (const rule of rules) {
    const normalized = normalizeWatchlistAlertRule(rule, now);
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

export function pruneWatchlistAlertRules(rules, watchlistItems) {
  const activeIds = new Set((watchlistItems || []).map(item => makeWatchlistId(item)).filter(Boolean));
  return normalizeWatchlistAlertRules(rules).filter(rule => activeIds.has(rule.watchlistId));
}

export function loadWatchlistAlertRules(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(WATCHLIST_ALERT_RULES_STORAGE_KEY);
    if (!raw) return [];
    return normalizeWatchlistAlertRules(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWatchlistAlertRules(rules, storage = globalThis.localStorage) {
  try {
    storage?.setItem(WATCHLIST_ALERT_RULES_STORAGE_KEY, JSON.stringify(normalizeWatchlistAlertRules(rules)));
  } catch {
    // quota exceeded or private browsing - silent fail
  }
}
