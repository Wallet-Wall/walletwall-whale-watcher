import { emptyPayload, isEvmAddress, readScheduledRows, requireGetAllowance, safeNum, safeStr } from './_dune-feature-route.js';

const CACHE_TTL = 3_600;

function normalizeWallet(row) {
  const address = safeStr(row.wallet_address);
  if (!isEvmAddress(address)) return null;
  return {
    address,
    tradeCount: safeNum(row.trade_count),
    totalVolumeUsd: safeNum(row.total_volume_usd),
    lastActiveAt: safeStr(row.last_active_at),
  };
}

function buildWallets(rows) {
  return rows.map(normalizeWallet).filter(Boolean).slice(0, 20);
}

export default async function handler(req, res) {
  const allowed = await requireGetAllowance(req, res, 'recent-notable-wallets', 120);
  if (!allowed) return;

  const queryId = process.env.DUNE_QUERY_RECENT_NOTABLE_WALLETS;
  const warnings = [];
  if (!queryId) {
    return res.status(200).json(emptyPayload({ wallets: [] }));
  }

  const { rows, queryRunAt } = await readScheduledRows(
    queryId,
    { ttlSeconds: CACHE_TTL, limit: 20 },
    warnings,
    'recent-notable-wallets',
    'Recent notable wallets unavailable - Dune scheduled query did not return data',
  );

  return res.status(200).json({
    wallets: buildWallets(rows),
    queryRunAt,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
