/**
 * GET /api/stable-peg-history
 *
 * Returns 30-day daily average peg deviation per stablecoin from a
 * scheduled Dune query. Read-only — never triggers execution.
 *
 * Env vars:
 *   DUNE_API_KEY
 *   DUNE_QUERY_STABLE_PEG_HISTORY — scheduled query ID (daily, no params)
 *
 * Response:
 *   {
 *     history: {
 *       USDT: [{ day: "2026-05-01", avgPegDeviationPct: 0.02 }, ...],
 *       USDC: [...],
 *       ...
 *     },
 *     queryRunAt: string | null,
 *     warnings: string[],
 *     generatedAt: string,
 *   }
 */

import { readOrCache } from './_dune.js';
import { createDuneRouteDiagnostics } from './_dune-diagnostics.js';
import { getClientIp, takeRequestAllowance } from './_ratelimit.js';

const CACHE_TTL       = 3_600;              // 1h — daily Dune cadence
const STALE_THRESHOLD = 30 * 3_600_000;    // 30h warning window
const pegDiagnostics  = createDuneRouteDiagnostics({
  routeName:  '/api/stable-peg-history',
  envVarName: 'DUNE_QUERY_STABLE_PEG_HISTORY',
});

const SUPPORTED_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'FRAX', 'PYUSD', 'USDE', 'GHO', 'LUSD',
]);

function safeStr(v) {
  const s = String(v ?? '').trim();
  return (s && s !== 'null' && s !== 'undefined') ? s : null;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(row) {
  const symbol = safeStr(row.symbol)?.toUpperCase();
  const day    = safeStr(row.day);
  const avgPegDeviationPct =
    safeNum(row.avg_peg_deviation_pct) ??
    safeNum(row.avgPegDeviationPct);
  if (!symbol || !day || avgPegDeviationPct == null) return null;
  return { symbol, day, avgPegDeviationPct: Math.max(0, avgPegDeviationPct) };
}

function buildHistory(rows) {
  const history = {};
  for (const row of rows) {
    const normalized = normalizeRow(row);
    if (!normalized || !SUPPORTED_SYMBOLS.has(normalized.symbol)) continue;
    if (!history[normalized.symbol]) history[normalized.symbol] = [];
    history[normalized.symbol].push({
      day:                normalized.day,
      avgPegDeviationPct: normalized.avgPegDeviationPct,
    });
  }
  for (const sym of Object.keys(history)) {
    history[sym].sort((a, b) => a.day.localeCompare(b.day));
  }
  return history;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ip        = getClientIp(req);
  const allowance = await takeRequestAllowance('stable-peg-history', ip, { limit: 60, windowSeconds: 3_600 });
  if (allowance.configError) {
    return res.status(allowance.status || 503).json({ error: allowance.error, detail: allowance.detail });
  }
  if (!allowance.allowed) {
    return res.status(429).json({ error: 'Too many requests.', retryAfterSeconds: allowance.resetInSeconds });
  }

  const queryId  = process.env.DUNE_QUERY_STABLE_PEG_HISTORY;
  const warnings = [];

  if (!queryId) {
    pegDiagnostics.queryNotConfigured({
      queryId,
      warning: 'DUNE_QUERY_STABLE_PEG_HISTORY not configured',
    });
    return res.status(200).json({
      history:      {},
      queryRunAt:   null,
      warnings:     ['DUNE_QUERY_STABLE_PEG_HISTORY not configured'],
      generatedAt:  new Date().toISOString(),
    });
  }

  let rows = [], queryRunAt = null, duneResult = null;
  try {
    duneResult = await readOrCache(queryId, { ttlSeconds: CACHE_TTL, limit: 2000 });
    ({ rows, queryRunAt } = duneResult);
  } catch (err) {
    pegDiagnostics.readFailure({
      queryId,
      err,
      warnings,
      fallbackWarning: 'Peg history data unavailable',
    });
    warnings.push('Peg history data unavailable — Dune scheduled query did not return data');
  }

  if (queryRunAt) {
    const ageMs = Date.now() - new Date(queryRunAt).getTime();
    if (ageMs > STALE_THRESHOLD) {
      const days = Math.round(ageMs / 86_400_000);
      warnings.push(`Peg history data is ${days} day${days === 1 ? '' : 's'} old — Dune auto-run may be delayed`);
    }
  }

  const history = buildHistory(rows);
  const rowsAfterLocalFiltering = Object.values(history).reduce((total, entries) => total + entries.length, 0);
  pegDiagnostics.readSuccess({
    queryId,
    result: duneResult,
    rowsAfterLocalFiltering,
    warnings,
  });

  return res.status(200).json({
    history,
    queryRunAt,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
