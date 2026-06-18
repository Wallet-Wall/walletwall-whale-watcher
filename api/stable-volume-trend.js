import { emptyPayload, readScheduledRows, requireGetAllowance, safeNum, safeStr } from './_dune-feature-route.js';

const CACHE_TTL = 3_600;

function normalizeTrendRow(row) {
  const symbol = safeStr(row.symbol)?.toUpperCase();
  const day = safeStr(row.day);
  if (!symbol || !day) return null;
  return {
    symbol,
    day,
    totalVolumeUsd: safeNum(row.total_volume_usd),
    tradeCount: safeNum(row.trade_count),
    uniqueTraders: safeNum(row.unique_traders),
  };
}

export function buildTrend(rows) {
  const trend = {};
  for (const row of rows) {
    const normalized = normalizeTrendRow(row);
    if (!normalized) continue;
    if (!trend[normalized.symbol]) trend[normalized.symbol] = [];
    trend[normalized.symbol].push({
      day: normalized.day,
      totalVolumeUsd: normalized.totalVolumeUsd,
      tradeCount: normalized.tradeCount,
      uniqueTraders: normalized.uniqueTraders,
    });
  }
  for (const symbol of Object.keys(trend)) {
    trend[symbol].sort((a, b) => a.day.localeCompare(b.day));
  }
  return trend;
}

export default async function handler(req, res) {
  const allowed = await requireGetAllowance(req, res, 'stable-volume-trend', 60);
  if (!allowed) return;

  const queryId = process.env.DUNE_QUERY_STABLE_VOLUME_TREND;
  const warnings = [];
  if (!queryId) {
    return res.status(200).json(emptyPayload({ trend: {} }));
  }

  const { rows, queryRunAt } = await readScheduledRows(
    queryId,
    { ttlSeconds: CACHE_TTL, limit: 2_000 },
    warnings,
    'stable-volume-trend',
    'Stable volume trend unavailable - Dune scheduled query did not return data',
  );

  return res.status(200).json({
    trend: buildTrend(rows),
    queryRunAt,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
