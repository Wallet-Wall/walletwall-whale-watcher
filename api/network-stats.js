/**
 * GET /api/network-stats
 *
 * Returns a slim set of live network stats for the homepage strip:
 *   - ETH gas (standard / fast Gwei) from Etherscan gas oracle
 *   - Total DeFi TVL (USD) from DeFiLlama global chart
 *   - Stablecoin dominance % and approximate total USD from CoinGecko /global
 *
 * Each data source fails independently — missing keys or provider errors
 * leave that field null; the strip renders what it can.
 *
 * Cache: 2-minute CDN edge (gas changes quickly, TVL/stablecoins can lag a bit).
 */
import { getClientIp, takeRequestAllowance, sendRateLimitResponse } from './_ratelimit.js';

const STABLE_SYMS = ['usdt', 'usdc', 'dai', 'busd', 'usde', 'usds', 'pyusd', 'frax', 'tusd', 'gusd', 'lusd'];

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchGas(etherscanKey) {
  if (!etherscanKey) return null;
  const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${etherscanKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  const standard = safeNum(data?.result?.ProposeGasPrice);
  const fast     = safeNum(data?.result?.FastGasPrice);
  if (standard == null && fast == null) return null;
  return { standard, fast };
}

async function fetchTvl() {
  const res = await fetch('https://api.llama.fi/charts', {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const last = data.at(-1);
  const total = safeNum(last?.totalLiquidityUSD);
  return total == null ? null : { total };
}

async function fetchStablecoins(cgKey) {
  if (!cgKey) return null;
  const res = await fetch('https://api.coingecko.com/api/v3/global', {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json', 'x-cg-demo-api-key': cgKey },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pcts     = data?.data?.market_cap_percentage;
  const totalMcap = safeNum(data?.data?.total_market_cap?.usd);
  if (!pcts || totalMcap == null) return null;
  const dominancePct = STABLE_SYMS.reduce((sum, sym) => sum + (safeNum(pcts[sym]) ?? 0), 0);
  return {
    dominancePct: Math.round(dominancePct * 10) / 10,
    totalUsd:     Math.round(totalMcap * dominancePct / 100),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ip = getClientIp(req);
  const allowance = await takeRequestAllowance('network-stats', ip, { limit: 60, windowSeconds: 3600 });
  const rateLimitResponse = sendRateLimitResponse(res, allowance);
  if (rateLimitResponse) return rateLimitResponse;

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  const [gasResult, tvlResult, stableResult] = await Promise.allSettled([
    fetchGas(process.env.ETHERSCAN_API_KEY),
    fetchTvl(),
    fetchStablecoins(process.env.COINGECKO_API_KEY),
  ]);

  return res.status(200).json({
    gas:         gasResult.status   === 'fulfilled' ? gasResult.value   : null,
    tvl:         tvlResult.status   === 'fulfilled' ? tvlResult.value   : null,
    stablecoins: stableResult.status === 'fulfilled' ? stableResult.value : null,
    updatedAt:   new Date().toISOString(),
  });
}
