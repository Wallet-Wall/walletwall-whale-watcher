/**
 * GET /api/insights
 *
 * Auto-generates DeFi trend signals and an AI narrative from Dune historical
 * data layered with live CoinGecko prices. The full response is cached in
 * Redis for 1 hour so Dune and AI are only hit once per hour, not per user.
 *
 * ── Required Dune queries ──────────────────────────────────────────────────
 * Create each query on https://dune.com, save, copy the numeric ID, and add
 * it to your .env. None have parameters — they run on Dune's schedule or
 * via Vercel Cron (recommended: every 2 hours).
 *
 * DUNE_QUERY_PROTOCOL_VOLUME — DeFi protocol DEX volume, last 30 days
 *   SELECT DATE_TRUNC('day', block_time) AS day,
 *     project AS protocol,
 *     SUM(amount_usd) AS volume_usd,
 *     COUNT(*) AS trade_count
 *   FROM dex.trades
 *   WHERE block_time >= NOW() - INTERVAL '30' day
 *     AND amount_usd > 10 AND project IS NOT NULL
 *   GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC LIMIT 600
 *
 * DUNE_QUERY_TOKEN_FLOWS — Top tokens by 24h DEX volume
 *   SELECT token_bought_symbol AS symbol,
 *     SUM(amount_usd) AS volume_usd,
 *     COUNT(*) AS trade_count,
 *     COUNT(DISTINCT taker) AS unique_traders
 *   FROM dex.trades
 *   WHERE block_time >= NOW() - INTERVAL '24' hour
 *     AND amount_usd > 100 AND token_bought_symbol IS NOT NULL
 *     AND LENGTH(token_bought_symbol) <= 10
 *   GROUP BY 1 ORDER BY 2 DESC LIMIT 25
 *
 * DUNE_QUERY_CHAIN_ACTIVITY — DEX volume by chain, last 14 days
 *   SELECT DATE_TRUNC('day', block_time) AS day,
 *     blockchain AS chain,
 *     SUM(amount_usd) AS volume_usd,
 *     COUNT(*) AS trades,
 *     COUNT(DISTINCT taker) AS unique_traders
 *   FROM dex.trades
 *   WHERE block_time >= NOW() - INTERVAL '14' day AND amount_usd > 10
 *   GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC LIMIT 300
 *
 * DUNE_QUERY_WHALE_TRADES — Trades ≥ $100k in last 24h
 *   SELECT taker AS wallet, project AS protocol, blockchain AS chain,
 *     token_bought_symbol AS bought, token_sold_symbol AS sold,
 *     CAST(amount_usd AS DOUBLE) AS amount_usd, tx_hash, block_time
 *   FROM dex.trades
 *   WHERE block_time >= NOW() - INTERVAL '24' hour AND amount_usd >= 100000
 *   ORDER BY amount_usd DESC LIMIT 50
 */

import { readOrCache } from './_dune.js';
import { logDuneRouteDiagnostic } from './_dune-diagnostics.js';
import { stripJsonCodeFence } from './_json-cleanup.js';
import { getClientIp, takeRequestAllowance, getRedisConfig } from './_ratelimit.js';
import { callAiProviders } from './_ai-providers.js';

const INSIGHTS_CACHE_KEY = 'insights:v1:latest';
const INSIGHTS_CACHE_TTL = 3600; // 1 hour — one AI + Dune hit per hour max
const INSIGHTS_SINGLE_FLIGHT_KEY = INSIGHTS_CACHE_KEY;
const pendingInsightGenerations = new Map();

function coalesceInsightGeneration(key, load) {
  if (pendingInsightGenerations.has(key)) return pendingInsightGenerations.get(key);

  const pending = Promise.resolve()
    .then(load)
    .finally(() => {
      if (pendingInsightGenerations.get(key) === pending) pendingInsightGenerations.delete(key);
    });
  pendingInsightGenerations.set(key, pending);
  return pending;
}

// ── Redis helpers (thin wrappers; no dep on _ratelimit internals) ─────────

async function redisCacheGet(key) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.result ?? null;
  } catch { return null; }
}

async function redisCacheSetEx(key, ttl, value) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) return;
  try {
    await fetch(
      `${url}/setex/${encodeURIComponent(key)}/${ttl}/${encodeURIComponent(value)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }
    );
  } catch { /* non-critical */ }
}

// ── Signal computation ────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * Compare protocol DEX volume in last 7 days vs the 7 days before that.
 * Returns protocols with ≥10% change, sorted by absolute change descending.
 */
function computeProtocolSignals(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const now = Date.now();
  const recent = {}, prior = {};

  for (const row of rows) {
    const ageMs = now - new Date(row.day).getTime();
    const proto = row.protocol;
    const vol   = Number(row.volume_usd) || 0;
    if (!proto || vol <= 0) continue;
    if (ageMs <= 7 * DAY_MS)       recent[proto] = (recent[proto] || 0) + vol;
    else if (ageMs <= 14 * DAY_MS) prior[proto]  = (prior[proto]  || 0) + vol;
  }

  return Object.keys(recent)
    .map(proto => {
      const r = recent[proto] || 0;
      const p = prior[proto]  || 0;
      const changePct = p > 0 ? Math.round(((r - p) / p) * 100) : null;
      return { protocol: proto, volume7d: Math.round(r), volume7dPrev: Math.round(p), changePct };
    })
    .filter(s => s.changePct !== null && Math.abs(s.changePct) >= 10)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    .slice(0, 8);
}

/**
 * Compute chain market-share shift over last 7 vs previous 7 days.
 */
function computeChainSignals(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const now = Date.now();
  const recent = {}, prior = {};

  for (const row of rows) {
    const ageMs = now - new Date(row.day).getTime();
    const chain = row.chain;
    const vol   = Number(row.volume_usd) || 0;
    if (!chain || vol <= 0) continue;
    if (ageMs <= 7 * DAY_MS)       recent[chain] = (recent[chain] || 0) + vol;
    else if (ageMs <= 14 * DAY_MS) prior[chain]  = (prior[chain]  || 0) + vol;
  }

  const totalRecent = Object.values(recent).reduce((s, v) => s + v, 0) || 1;
  const totalPrior  = Object.values(prior).reduce((s, v) => s + v, 0)  || 1;

  return Object.keys(recent)
    .map(chain => {
      const r = recent[chain] || 0;
      const p = prior[chain]  || 0;
      const sharePct      = Math.round((r / totalRecent) * 100);
      const sharePrevPct  = Math.round((p / totalPrior)  * 100);
      const changePct     = p > 0 ? Math.round(((r - p) / p) * 100) : null;
      return { chain, volume7d: Math.round(r), sharePct, sharePrevPct, changePct };
    })
    .sort((a, b) => b.volume7d - a.volume7d)
    .slice(0, 8);
}

/**
 * Normalize top-token flow data; filter obvious noise (stablecoin pairs, WETH).
 */
function normalizeTokenFlows(rows) {
  if (!Array.isArray(rows)) return [];
  const STABLES = new Set(['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'LUSD', 'CRVUSD']);
  return rows
    .filter(r => r.symbol && !STABLES.has(r.symbol.toUpperCase()) && r.symbol.toUpperCase() !== 'WETH')
    .map(r => ({
      symbol:        r.symbol,
      volume24h:     Math.round(Number(r.volume_usd)     || 0),
      tradeCount:    Number(r.trade_count)    || 0,
      uniqueTraders: Number(r.unique_traders) || 0,
    }))
    .slice(0, 10);
}

/**
 * Aggregate whale trades into a summary by protocol.
 */
function summarizeWhaleActivity(rows) {
  if (!Array.isArray(rows)) return { totalTrades: 0, totalVolumeUSD: 0, byProtocol: [] };
  const byProto = {};
  let totalVol = 0;

  for (const row of rows) {
    const proto = row.protocol || 'Unknown';
    const vol   = Number(row.amount_usd) || 0;
    totalVol += vol;
    if (!byProto[proto]) byProto[proto] = { protocol: proto, trades: 0, volumeUSD: 0 };
    byProto[proto].trades++;
    byProto[proto].volumeUSD += vol;
  }

  return {
    totalTrades:    rows.length,
    totalVolumeUSD: Math.round(totalVol),
    byProtocol:     Object.values(byProto)
      .map(p => ({ ...p, volumeUSD: Math.round(p.volumeUSD) }))
      .sort((a, b) => b.volumeUSD - a.volumeUSD)
      .slice(0, 6),
  };
}

// ── AI narrative generation ───────────────────────────────────────────────

async function generateNarrative({ protocolSignals, chainSignals, topTokens, whaleActivity }) {
  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) return null;

  const systemPrompt = `You are a DeFi on-chain analyst writing a daily market briefing.
Based on the on-chain data provided, identify the 2-3 most notable trends and write a concise brief.
Be specific and data-driven — reference actual numbers. Write like Bloomberg Crypto: confident, factual, no hype.
Respond ONLY with valid JSON, no markdown:
{
  "headline": "bold 10-word summary of the dominant trend",
  "summary": "2 sentences — the key story in the data right now",
  "signals": [
    { "label": "short label (4 words max)", "insight": "one specific data-backed observation" },
    { "label": "...", "insight": "..." },
    { "label": "...", "insight": "..." }
  ],
  "watchlist": ["token or protocol to watch in the next 24h", "..."]
}`;

  const userContent = JSON.stringify({
    protocolVolumeChanges: protocolSignals.slice(0, 5),
    chainActivity:         chainSignals.slice(0, 5),
    topTokensByVolume24h:  topTokens.slice(0, 8),
    whaleActivity,
  });

  const responseText = await callAiProviders(
    systemPrompt,
    [{ role: 'user', content: userContent }],
    { maxTokens: 600, timeout: 15000, tag: 'insights' },
  );

  if (!responseText) return null;
  const cleaned = stripJsonCodeFence(responseText);
  try { return { ...JSON.parse(cleaned), _fromAI: true }; }
  catch { console.warn('[insights] AI JSON parse failed'); return null; }
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Rate limit — insights are expensive to generate; 20 req/hour per IP is plenty
  const ip = getClientIp(req);
  const allowance = await takeRequestAllowance('insights', ip, { limit: 20, windowSeconds: 3600 });
  if (!allowance.allowed) {
    res.setHeader('Retry-After', String(allowance.resetInSeconds));
    return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: allowance.resetInSeconds });
  }

  // CDN caches shared across all users — fine since data is non-personalized
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');

  const DUNE_KEY = process.env.DUNE_API_KEY;
  const Q_PROTO  = process.env.DUNE_QUERY_PROTOCOL_VOLUME;
  const Q_TOKENS = process.env.DUNE_QUERY_TOKEN_FLOWS;
  const Q_CHAINS = process.env.DUNE_QUERY_CHAIN_ACTIVITY;
  const Q_WHALES = process.env.DUNE_QUERY_WHALE_TRADES;

  // ── 1. Check full-response Redis cache ──────────────────────────────────
  const cached = await redisCacheGet(INSIGHTS_CACHE_KEY);
  if (cached) {
    try {
      const cachedPayload = JSON.parse(cached);
      const cacheWarnings = [
        'Insights full-response Redis cache hit; raw Dune row counts unavailable',
        ...(cachedPayload?.dataQuality?.warnings || []),
      ];
      logDuneRouteDiagnostic({
        routeName: '/api/insights',
        envVarName: 'DUNE_QUERY_PROTOCOL_VOLUME',
        queryId: Q_PROTO,
        result: { rows: null, queryRunAt: null, fromCache: true },
        rowsAfterLocalFiltering: cachedPayload?.protocolSignals?.length ?? null,
        warnings: cacheWarnings,
      });
      logDuneRouteDiagnostic({
        routeName: '/api/insights',
        envVarName: 'DUNE_QUERY_TOKEN_FLOWS',
        queryId: Q_TOKENS,
        result: { rows: null, queryRunAt: null, fromCache: true },
        rowsAfterLocalFiltering: cachedPayload?.topTokens?.length ?? null,
        warnings: cacheWarnings,
      });
      logDuneRouteDiagnostic({
        routeName: '/api/insights',
        envVarName: 'DUNE_QUERY_CHAIN_ACTIVITY',
        queryId: Q_CHAINS,
        result: { rows: null, queryRunAt: null, fromCache: true },
        rowsAfterLocalFiltering: cachedPayload?.chainSignals?.length ?? null,
        warnings: cacheWarnings,
      });
      logDuneRouteDiagnostic({
        routeName: '/api/insights',
        envVarName: 'DUNE_QUERY_WHALE_TRADES',
        queryId: Q_WHALES,
        result: { rows: null, queryRunAt: null, fromCache: true },
        rowsAfterLocalFiltering: cachedPayload?.whaleActivity?.totalTrades ?? null,
        warnings: cacheWarnings,
      });
      return res.status(200).json({ ...cachedPayload, _fromCache: true });
    } catch { /* corrupted — regenerate */ }
  }

  if (!DUNE_KEY) {
    logDuneRouteDiagnostic({
      routeName: '/api/insights',
      envVarName: 'DUNE_API_KEY',
      queryId: null,
      rowsAfterLocalFiltering: 0,
      warnings: ['DUNE_API_KEY not configured'],
    });
    return res.status(503).json({
      error: 'Insights require DUNE_API_KEY. See .env.example for setup instructions.',
    });
  }

  const payload = await coalesceInsightGeneration(INSIGHTS_SINGLE_FLIGHT_KEY, async () => {
  // ── 2. Fetch Dune data in parallel (all read-only, no execution credits) ─
  const EMPTY = { rows: [], queryRunAt: null, fromCache: false, limit: null };
  const readSource = async (queryId, options) => {
    if (!queryId) return EMPTY;
    try { return await readOrCache(queryId, options); }
    catch (error) { return { ...EMPTY, error }; }
  };
  const [protoResult, tokenResult, chainResult, whaleResult] = await Promise.all([
    readSource(Q_PROTO,  { ttlSeconds: INSIGHTS_CACHE_TTL, limit: 600 }),
    readSource(Q_TOKENS, { ttlSeconds: INSIGHTS_CACHE_TTL, limit: 25  }),
    readSource(Q_CHAINS, { ttlSeconds: INSIGHTS_CACHE_TTL, limit: 300 }),
    readSource(Q_WHALES, { ttlSeconds: INSIGHTS_CACHE_TTL, limit: 50  }),
  ]);
  const protoRows = protoResult.rows;
  const tokenRows = tokenResult.rows;
  const chainRows = chainResult.rows;
  const whaleRows = whaleResult.rows;

  // ── 3. Compute signals from raw data ────────────────────────────────────
  const protocolSignals = computeProtocolSignals(protoRows);
  const chainSignals    = computeChainSignals(chainRows);
  const topTokens       = normalizeTokenFlows(tokenRows);
  const whaleActivity   = summarizeWhaleActivity(whaleRows);

  const missingQueries = [
    !Q_PROTO  && 'DUNE_QUERY_PROTOCOL_VOLUME',
    !Q_TOKENS && 'DUNE_QUERY_TOKEN_FLOWS',
    !Q_CHAINS && 'DUNE_QUERY_CHAIN_ACTIVITY',
    !Q_WHALES && 'DUNE_QUERY_WHALE_TRADES',
  ].filter(Boolean);
  const sourceWarnings = missingQueries.map(q => `${q} not configured - partial data`);

  logDuneRouteDiagnostic({
    routeName: '/api/insights',
    envVarName: 'DUNE_QUERY_PROTOCOL_VOLUME',
    queryId: Q_PROTO,
    result: protoResult,
    rowsAfterLocalFiltering: protocolSignals.length,
    warnings: sourceWarnings,
    errors: protoResult.error ? [protoResult.error] : [],
  });
  logDuneRouteDiagnostic({
    routeName: '/api/insights',
    envVarName: 'DUNE_QUERY_TOKEN_FLOWS',
    queryId: Q_TOKENS,
    result: tokenResult,
    rowsAfterLocalFiltering: topTokens.length,
    warnings: sourceWarnings,
    errors: tokenResult.error ? [tokenResult.error] : [],
  });
  logDuneRouteDiagnostic({
    routeName: '/api/insights',
    envVarName: 'DUNE_QUERY_CHAIN_ACTIVITY',
    queryId: Q_CHAINS,
    result: chainResult,
    rowsAfterLocalFiltering: chainSignals.length,
    warnings: sourceWarnings,
    errors: chainResult.error ? [chainResult.error] : [],
  });
  logDuneRouteDiagnostic({
    routeName: '/api/insights',
    envVarName: 'DUNE_QUERY_WHALE_TRADES',
    queryId: Q_WHALES,
    result: whaleResult,
    rowsAfterLocalFiltering: whaleActivity.totalTrades,
    warnings: sourceWarnings,
    errors: whaleResult.error ? [whaleResult.error] : [],
  });

  // ── 4. AI narrative (optional — degrades gracefully if no AI key) ────────
  const narrative = await generateNarrative({ protocolSignals, chainSignals, topTokens, whaleActivity });

  // ── 5. Build and cache response ──────────────────────────────────────────
  const payload = {
    generatedAt:      new Date().toISOString(),
    ttlSeconds:       INSIGHTS_CACHE_TTL,
    protocolSignals,
    chainSignals,
    topTokens,
    whaleActivity,
    narrative,
    sources:          ['dune:protocol-volume', 'dune:token-flows', 'dune:chain-activity', 'dune:whale-trades']
      .slice(0, 4 - missingQueries.length),
    dataQuality: {
      isPartial:  missingQueries.length > 0,
      warnings:   missingQueries.map(q => `${q} not configured — partial data`),
    },
  };

  await redisCacheSetEx(INSIGHTS_CACHE_KEY, INSIGHTS_CACHE_TTL, JSON.stringify(payload));
  return payload;
  });
  return res.status(200).json(payload);
}
