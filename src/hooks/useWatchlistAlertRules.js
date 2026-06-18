import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeWatchlistId } from '../lib/watchlist-storage.js';
import {
  createWatchlistAlertRule,
  loadWatchlistAlertRules,
  normalizeAlertThresholdUsd,
  pruneWatchlistAlertRules,
  saveWatchlistAlertRules,
  PEG_DEVIATION_OPTIONS_PCT,
  DEFAULT_PEG_DEVIATION_PCT,
} from '../lib/watchlist-alert-rules.js';

export function useWatchlistAlertRules(watchlistItems = []) {
  const [rules, setRules] = useState(loadWatchlistAlertRules);

  useEffect(() => {
    setRules(prev => pruneWatchlistAlertRules(prev, watchlistItems));
  }, [watchlistItems]);

  useEffect(() => {
    saveWatchlistAlertRules(rules);
  }, [rules]);

  const rulesByWatchlistId = useMemo(() => {
    return new Map(rules.map(rule => [rule.watchlistId, rule]));
  }, [rules]);

  const getRule = useCallback((item) => {
    const watchlistId = makeWatchlistId(item);
    return watchlistId ? rulesByWatchlistId.get(watchlistId) || null : null;
  }, [rulesByWatchlistId]);

  const setRuleEnabled = useCallback((item, enabled) => {
    const watchlistId = makeWatchlistId(item);
    if (!watchlistId) return;

    setRules(prev => {
      const existing = prev.find(rule => rule.watchlistId === watchlistId);
      if (!enabled && !existing) return prev;
      const nextRule = existing
        ? { ...existing, enabled, updatedAt: Date.now() }
        : createWatchlistAlertRule(item, { enabled });
      return [...prev.filter(rule => rule.watchlistId !== watchlistId), nextRule].filter(Boolean);
    });
  }, []);

  const setRuleThresholdUsd = useCallback((item, thresholdUsd) => {
    const watchlistId = makeWatchlistId(item);
    if (!watchlistId) return;

    setRules(prev => {
      const existing = prev.find(rule => rule.watchlistId === watchlistId);
      const nextRule = existing
        ? { ...existing, thresholdUsd: normalizeAlertThresholdUsd(thresholdUsd), updatedAt: Date.now() }
        : createWatchlistAlertRule(item, { enabled: true, thresholdUsd });
      return [...prev.filter(rule => rule.watchlistId !== watchlistId), nextRule].filter(Boolean);
    });
  }, []);

  const setPegAlertEnabled = useCallback((item, enabled) => {
    const watchlistId = makeWatchlistId(item);
    if (!watchlistId) return;
    setRules(prev => {
      const existing = prev.find(rule => rule.watchlistId === watchlistId);
      const nextRule = existing
        ? { ...existing, pegAlertEnabled: !!enabled, updatedAt: Date.now() }
        : createWatchlistAlertRule(item, { pegAlertEnabled: !!enabled });
      return [...prev.filter(rule => rule.watchlistId !== watchlistId), nextRule].filter(Boolean);
    });
  }, []);

  const setPegDeviationPct = useCallback((item, pct) => {
    const watchlistId = makeWatchlistId(item);
    if (!watchlistId) return;
    const normalized = PEG_DEVIATION_OPTIONS_PCT.includes(Number(pct)) ? Number(pct) : DEFAULT_PEG_DEVIATION_PCT;
    setRules(prev => {
      const existing = prev.find(rule => rule.watchlistId === watchlistId);
      const nextRule = existing
        ? { ...existing, pegDeviationPct: normalized, updatedAt: Date.now() }
        : createWatchlistAlertRule(item, { pegAlertEnabled: true, pegDeviationPct: normalized });
      return [...prev.filter(rule => rule.watchlistId !== watchlistId), nextRule].filter(Boolean);
    });
  }, []);

  const removeRule = useCallback((item) => {
    const watchlistId = makeWatchlistId(item);
    if (!watchlistId) return;
    setRules(prev => prev.filter(rule => rule.watchlistId !== watchlistId));
  }, []);

  return { rules, getRule, setRuleEnabled, setRuleThresholdUsd, setPegAlertEnabled, setPegDeviationPct, removeRule };
}
