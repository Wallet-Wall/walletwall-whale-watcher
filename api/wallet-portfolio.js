/**
 * GET /api/wallet-portfolio
 *
 * Returns approximate ERC-20 token holdings for a single wallet from a
 * scheduled Dune query. Read-only — never triggers execution.
 *
 * The Dune query covers a set of active whale wallets and is refreshed daily.
 * Wallets not in the Dune result set return an empty holdings array — this is
 * expected and communicated in metadata.inDataset = false.
 *
 * Env vars:
 *   DUNE_API_KEY
 *   DUNE_QUERY_WALLET_PORTFOLIO — scheduled query ID (Option A: balance_usd cols
 *                                 OR Option B: total_traded_usd cols — both handled)
 *
 * Query params:
 *   address  — required; 0x EVM address (case-insensitive)
 *
 * Response:
 *   {
 *     holdings: [{ tokenSymbol, tokenAddress, balance, balanceUsd, tradeCount?, lastTradeAt? }]
 *     metadata: { walletAddress, inDataset, queryRunAt, dataMode, dataNote, warnings, generatedAt }
 *   }
 */

import { readOrCache } from './_dune.js';
import { createDuneRouteDiagnostics } from './_dune-diagnostics.js';
import { getClientIp, takeRequestAllowance } from './_ratelimit.js';

const CACHE_TTL        = 3600;          // 1 h — daily Dune cadence
const STALE_THRESHOLD  = 30 * 3_600_000; // 30 h warning window
const MAX_HOLDINGS     = 15;
const portfolioDiagnostics = createDuneRouteDiagnostics({
  routeName:  '/api/wallet-portfolio',
  envVarName: 'DUNE_QUERY_WALLET_PORTFOLIO',
});

function isEthAddress(v) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(v ?? ''));
}

function safeStr(v) {
  const s = String(v ?? '').trim();
  return (s && s !== 'null' && s !== 'undefined') ? s : null;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Detect which query shape was returned.
 * Option A: transfer-derived balances  → has `balance_usd` column
 * Option B: DEX trading exposure       → has `total_traded_usd` column
 */
function detectDataMode(rows) {
  if (!rows.length) return 'unknown';
  const first = rows[0];
  if ('balance_usd' in first || 'balanceUsd' in first) return 'balance';
  if ('total_traded_usd' in first || 'totalTradedUsd' in first) return 'trading';
  return 'unknown';
}

function normalizeHolding(row, mode) {
  const tokenSymbol  = safeStr(row.token_symbol)  ?? safeStr(row.tokenSymbol)  ?? '';
  const tokenAddress = safeStr(row.token_address) ?? safeStr(row.tokenAddress) ?? null;

  if (mode === 'balance') {
    const balanceUsd = safeNum(row.balance_usd) ?? safeNum(row.balanceUsd) ?? 0;
    const balance    = safeNum(row.balance) ?? null;
    if (balanceUsd <= 0) return null;
    return { tokenSymbol, tokenAddress, balance, balanceUsd };
  }

  // trading mode
  const balanceUsd  = safeNum(row.total_traded_usd) ?? safeNum(row.totalTradedUsd) ?? 0;
  const tradeCount  = safeNum(row.trade_count) ?? safeNum(row.tradeCount) ?? null;
  const lastTradeAt = safeStr(row.last_trade_at) ?? safeStr(row.lastTradeAt) ?? null;
  if (balanceUsd <= 0) return null;
  return { tokenSymbol, tokenAddress, balance: null, balanceUsd, tradeCount, lastTradeAt };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ip        = getClientIp(req);
  const allowance = await takeRequestAllowance('wallet-portfolio', ip, { limit: 120, windowSeconds: 3600 });
  if (allowance.configError) {
    return res.status(allowance.status || 503).json({ error: allowance.error, detail: allowance.detail });
  }
  if (!allowance.allowed) {
    res.setHeader('Retry-After', String(allowance.resetInSeconds));
    return res.status(429).json({
      error: 'Too many portfolio requests.',
      retryAfterSeconds: allowance.resetInSeconds,
    });
  }

  const rawAddress = String(req.query.address ?? '').trim();
  if (!isEthAddress(rawAddress)) {
    return res.status(400).json({ error: 'address must be a valid 0x EVM address' });
  }
  const addressLc = rawAddress.toLowerCase();

  const queryId = process.env.DUNE_QUERY_WALLET_PORTFOLIO;
  const warnings = [];

  if (!queryId) {
    warnings.push('DUNE_QUERY_WALLET_PORTFOLIO not configured');
    portfolioDiagnostics.queryNotConfigured({
      queryId,
      warning: warnings[0],
    });
    return res.status(200).json({
      holdings: [],
      metadata: { walletAddress: rawAddress, inDataset: false, queryRunAt: null, dataMode: 'unknown', dataNote: 'Query not configured', warnings, generatedAt: new Date().toISOString() },
    });
  }

  let rows = [], queryRunAt = null, duneResult = null;
  try {
    duneResult = await readOrCache(queryId, { ttlSeconds: CACHE_TTL, limit: 5000 });
    ({ rows, queryRunAt } = duneResult);
  } catch (err) {
    portfolioDiagnostics.readFailure({
      queryId,
      err,
      warnings,
      fallbackWarning: 'Portfolio data unavailable',
    });
    warnings.push('Portfolio data unavailable — Dune scheduled query did not return data');
  }

  // Staleness check
  if (queryRunAt) {
    const ageMs = Date.now() - new Date(queryRunAt).getTime();
    if (ageMs > STALE_THRESHOLD) {
      const days = Math.round(ageMs / 86_400_000);
      warnings.push(`Portfolio data is ${days} day${days === 1 ? '' : 's'} old — Dune auto-run may be delayed`);
    }
  }

  const mode            = detectDataMode(rows);
  const walletRows      = rows.filter(r => {
    const addr = safeStr(r.wallet_address) ?? safeStr(r.walletAddress);
    return addr?.toLowerCase() === addressLc;
  });
  const inDataset       = walletRows.length > 0;

  const holdings = walletRows
    .map(r => normalizeHolding(r, mode))
    .filter(Boolean)
    .sort((a, b) => (b.balanceUsd ?? 0) - (a.balanceUsd ?? 0))
    .slice(0, MAX_HOLDINGS);
  portfolioDiagnostics.readSuccess({
    queryId,
    result: duneResult,
    rowsAfterLocalFiltering: holdings.length,
    warnings,
  });

  let dataNote;
  if (mode === 'trading') {
    dataNote = 'DEX trading exposure (last 90 days) — not exact holdings';
  } else if (mode === 'balance') {
    dataNote = 'Approximate holdings from 2yr transfer window — not exact current balance';
  } else {
    dataNote = 'Scheduled Dune portfolio data';
  }

  return res.status(200).json({
    holdings,
    metadata: {
      walletAddress: rawAddress,
      inDataset,
      queryRunAt,
      dataMode: mode,
      dataNote,
      warnings,
      generatedAt: new Date().toISOString(),
    },
  });
}
