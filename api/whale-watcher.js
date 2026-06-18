/**
 * GET /api/whale-watcher
 *
 * Returns normalized 12-week wallet activity from a Dune Analytics scheduled
 * query. Read-only — never triggers Dune query execution.
 *
 * Dune queries are scheduled every 4 hours in Dune. WalletWall reads the
 * latest cached result using readOrCache (GET /query/{id}/results) — no
 * execution credits are consumed, no POST /execute is ever sent.
 *
 * Env vars:
 *   DUNE_API_KEY         — required
 *   DUNE_QUERY_12WK_ACTIVE_WALLETS — 12-week wallet activity scheduled query ID
 *                          (optional: omit to disable 12-week activity)
 *
 * Optional query params:
 *   ?address=0x...  — filter response to a single wallet address (case-insensitive)
 *
 * Response shape:
 *   {
 *     wallets: {
 *       [address]: {
 *         address, label, category, activity_tier, last_seen,
 *         tx_count_48h, unique_receivers_48h, usd_volume_48h,
 *         activity12w: [{
 *           date, week_number, day_of_week,
 *           tx_count, unique_receivers, usd_volume,
 *           intensity_score,   // clamped 0–1
 *           activity_tier,
 *         }]
 *       }
 *     },
 *     metadata: {
 *       queryRunAt, dataNote, isStale, staleWindowHours,
 *       walletCount, totalWallets, warnings, generatedAt
 *     }
 *   }
 */

import { readOrCache } from './_dune.js';
import { logDuneRouteDiagnostic, sanitizeDiagnosticMessage } from './_dune-diagnostics.js';
import { getClientIp, takeRequestAllowance } from './_ratelimit.js';

const CACHE_TTL       = 3600;  // 1 h — Dune schedule runs every 4 h
const STALE_WINDOW_H  = 8;     // warn when data is older than 8 h (2× schedule)
const STALE_THRESHOLD = STALE_WINDOW_H * 3_600_000;
const DATA_NOTE       = 'Dune Analytics · scheduled wallet data';

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeStr(v) {
  const s = String(v ?? '').trim();
  return (s && s !== 'null' && s !== 'undefined') ? s : null;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function baseMetadata() {
  return { walletCount: 0, queryRunAt: null, dataNote: DATA_NOTE, isStale: false, generatedAt: new Date().toISOString() };
}

/**
 * Normalize raw Dune 12-week rows into a per-wallet map.
 * Exported as a named export for unit testing (pure function, no side effects).
 *
 * Groups by address, preserves 48h summary fields from the first row per
 * wallet, and builds an activity12w array of daily buckets sorted chronologically.
 * intensity_score is clamped to 0..1. Null/missing fields are tolerated safely.
 *
 * @param {object[]} rows  Raw Dune query rows
 * @returns {{ [address: string]: object }} normalized wallet map
 */
export function normalizeRows(rows) {
  const wallets = {};

  for (const row of rows) {
    const address = safeStr(row.address)?.toLowerCase();
    if (!address) continue;

    if (!wallets[address]) {
      wallets[address] = {
        address,
        label:                safeStr(row.label),
        category:             safeStr(row.category),
        activity_tier:        safeStr(row.activity_tier),
        last_seen:            safeStr(row.last_seen),
        tx_count_48h:         safeNum(row.tx_count_48h),
        unique_receivers_48h: safeNum(row.unique_receivers_48h),
        usd_volume_48h:       safeNum(row.usd_volume_48h),
        activity12w:          [],
      };
    }

    // Only add a day bucket when activity_day is present.
    // Rows without it are treated as 48h-summary-only rows.
    const activityDay = safeStr(row.activity_day);
    if (activityDay) {
      wallets[address].activity12w.push({
        date:             activityDay,
        week_number:      safeNum(row.week_number),
        day_of_week:      safeNum(row.day_of_week),
        tx_count:         safeNum(row.tx_count_day),
        unique_receivers: safeNum(row.unique_receivers_day),
        usd_volume:       safeNum(row.usd_volume_day),
        intensity_score:  clamp01(row.intensity_score),
        activity_tier:    safeStr(row.day_activity_tier),
      });
    }
  }

  for (const w of Object.values(wallets)) {
    w.activity12w.sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
  }

  return wallets;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ip        = getClientIp(req);
  const allowance = await takeRequestAllowance('whale-watcher', ip, { limit: 120, windowSeconds: 3600 });
  if (allowance.configError) {
    return res.status(allowance.status || 503).json({
      error:             allowance.error,
      detail:            allowance.detail,
      retryAfterSeconds: allowance.retryAfterSeconds,
    });
  }
  if (!allowance.allowed) {
    res.setHeader('Retry-After', String(allowance.resetInSeconds));
    return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: allowance.resetInSeconds });
  }

  // Data is scheduled/cached — label cache headers honestly.
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  if (!process.env.DUNE_API_KEY) {
    return res.status(503).json({
      error:    'Whale Watcher requires DUNE_API_KEY. See .env.example for setup.',
      metadata: baseMetadata(),
    });
  }

  const Q_12W = process.env.DUNE_QUERY_12WK_ACTIVE_WALLETS;
  if (!Q_12W) {
    logDuneRouteDiagnostic({
      routeName: '/api/whale-watcher',
      envVarName: 'DUNE_QUERY_12WK_ACTIVE_WALLETS',
      queryId: Q_12W,
      rowsAfterLocalFiltering: 0,
      warnings: ['DUNE_QUERY_12WK_ACTIVE_WALLETS not configured'],
    });
    return res.status(200).json({
      wallets:  {},
      metadata: {
        ...baseMetadata(),
        staleWindowHours: STALE_WINDOW_H,
        warnings:         ['DUNE_QUERY_12WK_ACTIVE_WALLETS not configured — 12-week activity unavailable'],
      },
    });
  }

  let rows, queryRunAt, duneResult;
  try {
    duneResult = await readOrCache(Q_12W, { ttlSeconds: CACHE_TTL, limit: 5000 });
    ({ rows, queryRunAt } = duneResult);
  } catch (err) {
    console.error('[whale-watcher] scheduled Dune read failed', sanitizeDiagnosticMessage(err, Q_12W));
    logDuneRouteDiagnostic({
      routeName: '/api/whale-watcher',
      envVarName: 'DUNE_QUERY_12WK_ACTIVE_WALLETS',
      queryId: Q_12W,
      rowsAfterLocalFiltering: 0,
      errors: [err],
    });
    return res.status(503).json({
      error:    'Whale Watcher data is temporarily unavailable. Showing cached WalletWall data where available.',
      metadata: baseMetadata(),
    });
  }

  const allWallets    = normalizeRows(rows);
  const addressFilter = String(req.query?.address || '').trim().toLowerCase();
  let wallets;
  if (!addressFilter) {
    wallets = allWallets;
  } else if (allWallets[addressFilter]) {
    wallets = { [addressFilter]: allWallets[addressFilter] };
  } else {
    wallets = {};
  }

  const ageMs   = queryRunAt ? Date.now() - new Date(queryRunAt).getTime() : 0;
  const isStale = Boolean(queryRunAt && ageMs > STALE_THRESHOLD);
  const warnings = [];
  if (isStale) {
    const hours = Math.round(ageMs / 3_600_000);
    warnings.push(
      `12-week data is ${hours}h old — Dune auto-run may be delayed (expected refresh every ${STALE_WINDOW_H}h)`
    );
  }
  logDuneRouteDiagnostic({
    routeName: '/api/whale-watcher',
    envVarName: 'DUNE_QUERY_12WK_ACTIVE_WALLETS',
    queryId: Q_12W,
    result: duneResult,
    rowsAfterLocalFiltering: Object.keys(wallets).length,
    warnings,
  });

  return res.status(200).json({
    wallets,
    metadata: {
      walletCount:      Object.keys(wallets).length,
      totalWallets:     Object.keys(allWallets).length,
      queryRunAt,
      dataNote:         DATA_NOTE,
      isStale,
      staleWindowHours: STALE_WINDOW_H,
      warnings,
      generatedAt:      new Date().toISOString(),
    },
  });
}
