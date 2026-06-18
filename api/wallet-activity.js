/**
 * GET /api/wallet-activity
 *
 * Primary:  BigQuery public dataset `bigquery-public-data.crypto_ethereum`
 *           — token_transfers aggregated over 48h, enriched with known labels.
 * Fallback: Dune Analytics query 7521767 (pre-labeled exchange wallets).
 *
 * Env vars:
 *   GCP_SERVICE_ACCOUNT_JSON      — enables BigQuery primary source
 *   DUNE_API_KEY                  — fallback if BQ fails or is unconfigured
 *   DUNE_QUERY_48H_ACTIVE_WALLETS — preferred query ID for active wallets
 *   DUNE_QUERY_ID                 — legacy alias for DUNE_QUERY_48H_ACTIVE_WALLETS (defaults to 7521767)
 *
 * Optional query params:
 *   ?minTx=N  — filter out wallets with fewer than N txs
 */

import { bqQuery } from './_bigquery.js';
import { readOrCache } from './_dune.js';
import { getClientIp, takeRequestAllowance, sendRateLimitResponse } from './_ratelimit.js';

const DUNE_QUERY_ID = process.env.DUNE_QUERY_48H_ACTIVE_WALLETS || process.env.DUNE_QUERY_ID || '7521767';

// Well-known labeled addresses to enrich raw BQ results
const KNOWN_LABELS = {
  '0x28c6c06298d514db089934071355e5743bf21d60': { label: 'Binance Hot 1',  category: 'cex' },
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { label: 'Binance Hot 2',  category: 'cex' },
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': { label: 'Binance Hot 3',  category: 'cex' },
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { label: 'Coinbase',       category: 'cex' },
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': { label: 'Coinbase 2',     category: 'cex' },
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': { label: 'Kraken',         category: 'cex' },
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { label: 'OKX',            category: 'cex' },
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': { label: 'Bybit',          category: 'cex' },
  '0x1151314c646ce4e0efd76d1af4760ae66a9fe30f': { label: 'Bitfinex',       category: 'cex' },
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { label: 'Uniswap V3',    category: 'defi' },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { label: '1inch Router',   category: 'defi' },
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': { label: 'Aave V3',        category: 'defi' },
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { label: 'Uniswap V2',    category: 'defi' },
};

const BQ_SQL = `
SELECT
  from_address AS address,
  COUNT(*)     AS tx_count_48h,
  COUNT(DISTINCT to_address) AS unique_receivers
FROM \`bigquery-public-data.crypto_ethereum.token_transfers\`
WHERE block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 48 HOUR)
  AND from_address IS NOT NULL
  AND from_address != '0x0000000000000000000000000000000000000000'
GROUP BY from_address
ORDER BY tx_count_48h DESC
LIMIT 30
`;

// BigQuery: aggregate top wallets from raw token_transfers over 48h
async function fetchFromBigQuery(minTx = 0) {
  const rows = await bqQuery(BQ_SQL);
  return rows
    .map(row => {
      const addr = (row.address || '').toLowerCase();
      const known = KNOWN_LABELS[addr] || {};
      return {
        label:           known.label || addr.slice(0, 10) + '\u2026',
        tag:             known.label || '',
        query:           row.address,
        txCount:         Number(row.tx_count_48h ?? 0),
        category:        known.category || null,
        uniqueReceivers: row.unique_receivers == null ? null : Number(row.unique_receivers),
        usdVolume:       null, // BQ token_transfers don't have USD value natively
        lastSeen:        null,
        activityTier:    inferTier(Number(row.tx_count_48h ?? 0)),
      };
    })
    .filter(r => r.txCount >= minTx)
    .sort((a, b) => b.txCount - a.txCount)
    .slice(0, 20);
}

function inferTier(txCount) {
  if (txCount >= 20000) return 'volcanic';
  if (txCount >= 8000)  return 'ultra';
  if (txCount >= 3000)  return 'high';
  if (txCount >= 1000)  return 'mid';
  return 'low';
}

const DUNE_ACTIVITY_TTL = 21_600; // 6h \u2014 global activity snapshot; per Dune quota constraints

// Reads Dune's latest cached results through Redis, normalizes rows.
// Never triggers a Dune query execution \u2014 only reads scheduled snapshots.
async function fetchFromDune(queryId, minTx = 0) {
  const { rows } = await readOrCache(queryId, { ttlSeconds: DUNE_ACTIVITY_TTL, limit: 20 });
  if (!Array.isArray(rows) || rows.length < 1) throw new Error('Dune: no rows');

  return rows
    .map(row => ({
      label:           row.label    || (row.address || '').slice(0, 10) + '\u2026',
      tag:             row.label    || '',
      query:           row.address  || '',
      txCount:         Number(row.tx_count_48h ?? 0),
      category:        row.category        || null,
      uniqueReceivers: row.unique_receivers == null ? null : Number(row.unique_receivers),
      usdVolume:       row.usd_volume_48h   == null ? null : Number(row.usd_volume_48h),
      lastSeen:        row.last_seen        || null,
      activityTier:    row.activity_tier    || null,
    }))
    .filter(row => row.txCount >= minTx)
    .sort((a, b) => b.txCount - a.txCount);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ip = getClientIp(req);
  const allowance = await takeRequestAllowance('wallet-activity', ip, { limit: 30, windowSeconds: 3600 });
  const rateLimitResponse = sendRateLimitResponse(res, allowance);
  if (rateLimitResponse) return rateLimitResponse;

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  const DUNE_KEY = process.env.DUNE_API_KEY;
  const GCP_KEY  = process.env.GCP_SERVICE_ACCOUNT_JSON;
  const minTx    = Math.max(0, Number.parseInt(req.query.minTx) || 0);

  // Try BigQuery first (richer raw data), fall back to Dune, then error
  if (GCP_KEY) {
    try {
      const rows = await fetchFromBigQuery(minTx);
      if (rows.length > 0) return res.json(rows);
      console.warn('[wallet-activity] BQ returned 0 rows, falling back to Dune');
    } catch (e) {
      console.error('[wallet-activity] BigQuery failed:', e.message);
    }
  }

  if (DUNE_KEY) {
    try {
      return res.json(await fetchFromDune(DUNE_QUERY_ID, minTx));
    } catch (e) {
      console.error('[wallet-activity] Dune failed:', e.message);
    }
  }

  return res.status(503).json({ error: 'Activity data temporarily unavailable' });
}
