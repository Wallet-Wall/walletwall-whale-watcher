import { emptyPayload, getAddressParam, readParameterizedRows, requireGetAllowance, safeNum, safeStr } from './_dune-feature-route.js';

function emptyDay() {
  return { buy: 0, sell: 0, swap: 0, stableSwap: 0, totalUsd: 0 };
}

function activityKey(type) {
  const text = safeStr(type)?.toLowerCase() ?? '';
  if (text === 'buy') return 'buy';
  if (text === 'sell') return 'sell';
  if (text === 'stable-swap' || text === 'stable_swap') return 'stableSwap';
  return 'swap';
}

function buildBreakdown(rows) {
  const breakdown = {};
  for (const row of rows) {
    const date = safeStr(row.block_date);
    if (!date) continue;
    if (!breakdown[date]) breakdown[date] = emptyDay();
    const key = activityKey(row.activity_type);
    breakdown[date][key] += 1;
    breakdown[date].totalUsd += safeNum(row.amount_usd);
  }
  return breakdown;
}

export default async function handler(req, res) {
  const allowed = await requireGetAllowance(req, res, 'wallet-activity-breakdown', 120);
  if (!allowed) return;
  const address = getAddressParam(req, res);
  if (!address) return;

  const queryId = process.env.DUNE_QUERY_WALLET_ACTIVITY_BREAKDOWN;
  const warnings = [];
  if (!queryId) {
    return res.status(200).json(emptyPayload({ breakdown: {} }));
  }

  const { rows, queryRunAt } = await readParameterizedRows(
    queryId,
    address,
    warnings,
    'wallet-activity-breakdown',
    'Wallet activity breakdown unavailable - Dune query did not return data',
  );

  // Filter snapshot rows to those matching this wallet address.
  const addrLc = address.toLowerCase();
  const walletRows = rows.filter(r => String(r.wallet_address ?? '').toLowerCase() === addrLc);

  return res.status(200).json({
    breakdown: buildBreakdown(walletRows),
    queryRunAt,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
