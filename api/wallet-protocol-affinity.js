import { emptyPayload, getAddressParam, readParameterizedRows, requireGetAllowance, safeNum, safeStr } from './_dune-feature-route.js';

function normalizeProtocol(row) {
  const protocol = safeStr(row.protocol);
  if (!protocol) return null;
  return {
    protocol,
    tradeCount: safeNum(row.trade_count),
    totalVolumeUsd: safeNum(row.total_volume_usd),
    pctOfTrades: safeNum(row.pct_of_trades),
  };
}

function buildProtocols(rows) {
  return rows
    .map(normalizeProtocol)
    .filter(Boolean)
    .sort((a, b) => b.pctOfTrades - a.pctOfTrades);
}

export default async function handler(req, res) {
  const allowed = await requireGetAllowance(req, res, 'wallet-protocol-affinity', 120);
  if (!allowed) return;
  const address = getAddressParam(req, res);
  if (!address) return;

  const queryId = process.env.DUNE_QUERY_WALLET_PROTOCOL_AFFINITY;
  const warnings = [];
  if (!queryId) {
    return res.status(200).json(emptyPayload({ protocols: [] }));
  }

  const { rows, queryRunAt } = await readParameterizedRows(
    queryId,
    address,
    warnings,
    'wallet-protocol-affinity',
    'Wallet protocol affinity unavailable - Dune query did not return data',
  );

  // Filter snapshot rows to those matching this wallet address.
  const addrLc = address.toLowerCase();
  const walletRows = rows.filter(r => String(r.wallet_address ?? '').toLowerCase() === addrLc);

  return res.status(200).json({
    protocols: buildProtocols(walletRows),
    queryRunAt,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
