import { emptyPayload, readScheduledRows, requireGetAllowance, safeNum, safeStr } from './_dune-feature-route.js';

const CACHE_TTL = 3_600;
const STALE_THRESHOLD = 30 * 3_600_000;
const MIN_FLOW_USD = 100_000;

function normalizeFlow(row) {
  const time = safeStr(row.evt_block_time);
  const symbol = safeStr(row.symbol)?.toUpperCase();
  const amountUsd = safeNum(row.amount_usd, null);
  const fromAddress = safeStr(row.from_address);
  const toAddress = safeStr(row.to_address);
  const txHash = safeStr(row.tx_hash);
  if (!time || !symbol || amountUsd == null || amountUsd < MIN_FLOW_USD) return null;
  return { time, symbol, amountUsd, fromAddress, toAddress, txHash };
}

function buildFlows(rows, symbolFilter) {
  const filter = safeStr(symbolFilter)?.toUpperCase() ?? null;
  return rows
    .map(normalizeFlow)
    .filter(flow => {
      if (!flow) return false;
      if (!filter) return true;
      return flow.symbol === filter;
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function addStalenessWarning(warnings, queryRunAt) {
  if (!queryRunAt) return;
  const ageMs = Date.now() - new Date(queryRunAt).getTime();
  if (ageMs <= STALE_THRESHOLD) return;
  const days = Math.round(ageMs / 86_400_000);
  const suffix = days === 1 ? '' : 's';
  warnings.push(`Stable whale flow data is ${days} day${suffix} old — Dune auto-run may be delayed`);
}

export default async function handler(req, res) {
  const allowed = await requireGetAllowance(req, res, 'stable-whale-flows', 60);
  if (!allowed) return;

  const queryId = process.env.DUNE_QUERY_STABLE_WHALE_FLOWS;
  const warnings = [];
  if (!queryId) {
    return res.status(200).json(emptyPayload({ flows: [] }));
  }

  const { rows, queryRunAt } = await readScheduledRows(
    queryId,
    { ttlSeconds: CACHE_TTL, limit: 500 },
    warnings,
    'stable-whale-flows',
    'Stable whale flow data unavailable - Dune scheduled query did not return data',
  );

  addStalenessWarning(warnings, queryRunAt);

  return res.status(200).json({
    flows: buildFlows(rows, req.query.symbol),
    queryRunAt,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
