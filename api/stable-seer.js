import { getClientIp, takeRequestAllowance } from './_ratelimit.js';
import { getCachedRadarResponse, setCachedRadarResponse, RADAR_CACHE_TTL_SECONDS } from './_cache.js';
import { recordProviderCall } from './_provider-telemetry.js';

const FX_CACHE_TTL_MS = 3_600_000; // 1 hour

// FX rate cache stored on globalThis so tests can reset it between runs.
function fetchFiatRates() {
  const now = Date.now();
  const cached = globalThis._ssrFxRates;
  const cachedAt = globalThis._ssrFxRatesAt ?? 0;
  if (cached && now - cachedAt < FX_CACHE_TTL_MS) return Promise.resolve(cached);
  return fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,SGD,JPY,CAD,NZD,IDR', {
    signal: AbortSignal.timeout(5000),
  }).then(res => {
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    return res.json();
  }).then(data => {
    if (data?.rates && typeof data.rates === 'object' && Object.keys(data.rates).length > 0) {
      globalThis._ssrFxRates = data.rates;
      globalThis._ssrFxRatesAt = now;
      return data.rates;
    }
    return null;
  }).catch(err => {
    console.warn('[stable-seer] FX rate fetch failed:', err.message);
    return null;
  });
}

/**
 * GET /api/stable-seer?q=<query>
 * Fetches market and pool data from DEX Screener and normalizes it.
 */

const MAX_RADAR_RESULTS = 50;
const MAX_RADAR_STRING_LENGTH = 200;

const STABLE_USD_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'FRAX', 'LUSD', 'GUSD', 'USDP', 'TUSD', 'USDD',
  'USDE', 'PYUSD', 'FDUSD', 'CRVUSD', 'GHO', 'MKUSD', 'EUSD', 'DOLA', 'USDB',
  'SUSD', 'CUSD', 'USDX', 'HUSD', 'PAX', 'EUSDC', 'FLEXUSD', 'USDC.E', 'USDT.E',
  'USDBC', 'USDS', 'LISUSD', 'GRAI', 'ALUSD', 'FRAXBP', 'USDR', 'BEUR',
  // yield-bearing stablecoins — recognized as stables for pair classification but NOT $1-pegged
  'SUSDE', 'SDAI', 'SUSDS', 'WUSDM',
  // fiat non-USD stablecoins — peg tracks a foreign exchange rate, not $1
  'EURS', 'EURT', 'AGEUR', 'EURE', 'VEUR', 'CEUR', 'EURe',
  'GBPT', 'TGBP',
  'XSGD', 'XIDR', 'JPYC', 'NZDS', 'CADC',
  'RAI',
]);

// Maps symbol → ISO 4217-style currency code for non-USD fiat-pegged stables.
// Peg deviation against $1.00 is meaningless for these — suppress gauge/deviation.
const FIAT_PEG_SYMBOLS = new Map([
  ['EURS', 'eur'], ['EURT', 'eur'], ['AGEUR', 'eur'], ['EURE', 'eur'], ['VEUR', 'eur'], ['CEUR', 'eur'], ['EURE', 'eur'],
  ['GBPT', 'gbp'], ['TGBP', 'gbp'],
  ['XSGD', 'sgd'], ['XIDR', 'idr'], ['JPYC', 'jpy'], ['NZDS', 'nzd'], ['CADC', 'cad'],
  ['RAI', 'other'],
]);

// These stablecoins accrue yield; their price is expected to exceed $1 and rise over time.
// Peg deviation against $1 is meaningless for them — suppress the gauge and deviation fields.
const YIELD_BEARING_STABLE_SYMBOLS = new Set(['SUSDE', 'SDAI', 'SUSDS', 'WUSDM']);

// Soft-peg stablecoins target $1 but use algorithmic/collateral mechanisms with wider normal ranges.
// ok threshold is ±0.5% (vs ±0.1% for hard-pegged stables like USDC/USDT).
const SOFT_PEG_SYMBOLS = new Set(['CRVUSD', 'FRAX', 'MKUSD', 'GHO', 'DOLA', 'GRAI', 'ALUSD', 'LISUSD']);

function isKnownStable(symbol) {
  return symbol ? STABLE_USD_SYMBOLS.has(symbol.toUpperCase()) : false;
}

function classifyPairType(isBaseStable, isQuoteStable) {
  if (isBaseStable && isQuoteStable) return 'stable-stable';
  if (isBaseStable || isQuoteStable) return 'stable-volatile';
  return 'volatile-volatile';
}

function classifyPegRisk(devPct, isSoftPeg) {
  const okThreshold = isSoftPeg ? 0.5 : 0.1;
  if (devPct < okThreshold) return 'ok';
  if (devPct < 1) return 'watch';
  return 'alert';
}

function safeString(value, max = MAX_RADAR_STRING_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function safeNumber(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeDexScreenerUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return null;
    if (host !== 'dexscreener.com' && host !== 'www.dexscreener.com') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function computeUsdPeg(priceUsd, isSoftPeg) {
  if (!priceUsd) return { pegDeviationPct: null, pegRisk: null };
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0) return { pegDeviationPct: null, pegRisk: null };
  const pegDeviationPct = Math.round(Math.abs(price - 1) * 10000) / 100;
  return { pegDeviationPct, pegRisk: classifyPegRisk(pegDeviationPct, isSoftPeg) };
}

function computeFiatPeg(priceUsd, fiatPegCurrency, fiatRates) {
  const none = { fiatPegTargetUsd: null, fiatPegDeviationPct: null, fiatPegRisk: null };
  if (!fiatPegCurrency || fiatPegCurrency === 'other' || !fiatRates || !priceUsd) return none;
  const usdToFiat = fiatRates[fiatPegCurrency.toUpperCase()];
  if (!usdToFiat || !Number.isFinite(usdToFiat) || usdToFiat <= 0) return none;
  const targetUsd = 1 / usdToFiat;
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(targetUsd)) return none;
  const fiatPegDeviationPct = Math.round((Math.abs(price - targetUsd) / targetUsd) * 10000) / 100;
  return {
    fiatPegTargetUsd: Math.round(targetUsd * 10000) / 10000,
    fiatPegDeviationPct,
    fiatPegRisk: classifyPegRisk(fiatPegDeviationPct, false),
  };
}

function computeYieldPremium(priceUsd) {
  if (!priceUsd) return null;
  const price = Number(priceUsd);
  return (Number.isFinite(price) && price > 0) ? Math.round((price - 1) * 10000) / 100 : null;
}

function normalizeRadarPair(p, fiatRates = null) {
  const pairAddress = safeString(p?.pairAddress);
  const baseSymbol = safeString(p?.baseToken?.symbol, 40);
  if (!pairAddress || !baseSymbol) return null;
  const quoteSymbol = safeString(p.quoteToken?.symbol, 40) || '?';

  const isBaseStable = isKnownStable(baseSymbol);
  const isQuoteStable = quoteSymbol !== '?' && isKnownStable(quoteSymbol);
  const pairType = classifyPairType(isBaseStable, isQuoteStable);
  const isYieldBearing = isBaseStable && YIELD_BEARING_STABLE_SYMBOLS.has(baseSymbol.toUpperCase());
  const isSoftPeg = isBaseStable && !isYieldBearing && SOFT_PEG_SYMBOLS.has(baseSymbol.toUpperCase());
  const fiatPegCurrency = FIAT_PEG_SYMBOLS.get(baseSymbol.toUpperCase()) ?? null;
  const pegCurrency = fiatPegCurrency ?? 'usd';
  const priceUsd = safeString(p.priceUsd, 80);

  const { pegDeviationPct, pegRisk } = (isBaseStable && !isYieldBearing && !fiatPegCurrency)
    ? computeUsdPeg(priceUsd, isSoftPeg)
    : { pegDeviationPct: null, pegRisk: null };

  const { fiatPegTargetUsd, fiatPegDeviationPct, fiatPegRisk } =
    computeFiatPeg(priceUsd, fiatPegCurrency, fiatRates);

  const yieldPremiumPct = isYieldBearing ? computeYieldPremium(priceUsd) : null;

  return {
    pairName: `${baseSymbol}/${quoteSymbol}`,
    tokenName: safeString(p.baseToken?.name),
    symbol: baseSymbol,
    baseTokenAddress: safeString(p.baseToken?.address),
    quoteTokenSymbol: quoteSymbol === '?' ? null : quoteSymbol,
    quoteTokenName: safeString(p.quoteToken?.name),
    quoteTokenAddress: safeString(p.quoteToken?.address),
    chain: safeString(p.chainId, 60),
    dex: safeString(p.dexId, 80),
    priceUsd,
    priceChange1h: safeNumber(p.priceChange?.h1),
    priceChange6h: safeNumber(p.priceChange?.h6),
    priceChange24h: safeNumber(p.priceChange?.h24),
    volume24h: safeNumber(p.volume?.h24),
    liquidityUsd: safeNumber(p.liquidity?.usd),
    fdv: safeNumber(p.fdv),
    marketCap: safeNumber(p.marketCap),
    buys24h: safeNumber(p.txns?.h24?.buys),
    sells24h: safeNumber(p.txns?.h24?.sells),
    pairCreatedAt: safeNumber(p.pairCreatedAt),
    pairAddress,
    url: safeDexScreenerUrl(p.url),
    isBaseStable,
    isQuoteStable,
    isYieldBearing,
    isSoftPeg,
    pegCurrency,
    pairType,
    pegDeviationPct,
    pegRisk,
    fiatPegTargetUsd,
    fiatPegDeviationPct,
    fiatPegRisk,
    yieldPremiumPct,
  };
}

function radarErrorMetadata() {
  return {
    mode: 'stable-seer',
    sources: {
      holderData: null,
      marketData: 'dexscreener',
      prices: null,
    },
    capabilities: {
      holderAnalyticsSupported: false,
      marketDataSupported: false,
      chainSupport: [],
      reasonIfUnsupported: 'Stable Seer is stablecoin pool and market lookup. It does not provide holder analytics.',
    },
    dataQuality: {
      isFallback: false,
      isPartial: false,
      confidence: 'unavailable',
      cacheHit: false,
      warnings: ['Stable Seer results are provider market data and must not be treated as holder analytics.'],
    },
  };
}

function radarMetadata(results = [], { cacheHit = false, cacheAgeSeconds = null } = {}) {
  const chains = [...new Set(results.map(r => r.chain).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const dataQuality = {
    isFallback: false,
    isPartial: true,
    confidence: 'low',
    cacheHit,
    warnings: ['Stable Seer results are provider market data and must not be treated as holder analytics.'],
  };
  if (cacheAgeSeconds != null) dataQuality.cacheAgeSeconds = cacheAgeSeconds;
  return {
    mode: 'stable-seer',
    sources: {
      holderData: null,
      marketData: 'dexscreener',
      prices: null,
    },
    capabilities: {
      holderAnalyticsSupported: false,
      marketDataSupported: true,
      chainSupport: chains,
      reasonIfUnsupported: 'Stable Seer is stablecoin pool and market lookup. It does not provide holder analytics.',
    },
    dataQuality,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing ?q= parameter' });
  if (q.length > 200) return res.status(400).json({ error: 'Search query too long' });

  // 1. Check cache first — cache hits bypass rate-limit quota entirely.
  const cacheKey = q.toLowerCase();
  try {
    const cached = await getCachedRadarResponse(cacheKey);
    if (cached) {
      const cacheAgeSeconds = cached.cachedAt == null
        ? null
        : Math.round((Date.now() - cached.cachedAt) / 1000);
      return res.status(200).json({
        results: cached.results,
        ...radarMetadata(cached.results, { cacheHit: true, cacheAgeSeconds }),
      });
    }
  } catch {
    // Cache lookup failure is non-fatal — fall through to rate-limited live fetch.
  }

  // 2. Apply IP-based rate limiting (only for cache misses that require a DEX Screener call).
  const ip = getClientIp(req);
  const allowance = await takeRequestAllowance('radar', ip, { limit: 10, windowSeconds: 60 });
  if (allowance.configError) {
    return res.status(allowance.status || 503).json({
      error: allowance.error,
      detail: allowance.detail,
      retryAfterSeconds: allowance.retryAfterSeconds,
    });
  }
  if (!allowance.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute.',
      retryAfterSeconds: allowance.resetInSeconds,
    });
  }

  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
    const dexStartedAt = Date.now();
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    recordProviderCall('dexscreener', { ms: Date.now() - dexStartedAt, ok: resp.ok, status: resp.status });

    if (!resp.ok) {
      throw new Error(`DEX Screener responded with ${resp.status}`);
    }

    const data = await resp.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];

    // Only fetch FX rates if the query might match a fiat-pegged stable symbol.
    // This avoids an extra network round-trip for the common case (USD-pegged queries).
    const qUpper = q.toUpperCase();
    const mightHaveFiatPeg = [...FIAT_PEG_SYMBOLS.keys()].some(sym => qUpper.includes(sym));
    const fiatRates = mightHaveFiatPeg ? await fetchFiatRates() : null;

    // Normalize pairs to Wallet Wall's standard shape.
    // Skip malformed rows that are missing a pair address or base token symbol.
    const results = pairs
      .slice(0, MAX_RADAR_RESULTS)
      .map(p => normalizeRadarPair(p, fiatRates))
      .filter(Boolean);

    // 3. Cache non-empty results only — empty may indicate transient upstream rate-limiting.
    if (results.length > 0) {
      setCachedRadarResponse(cacheKey, { results, cachedAt: Date.now() }, RADAR_CACHE_TTL_SECONDS).catch(() => {});
    }

    return res.status(200).json({ results, ...radarMetadata(results) });
  } catch (err) {
    console.error('[Stable Seer Error]', err.message);
    return res.status(502).json({
      error: 'Market data provider unreachable or returned an error.',
      ...radarErrorMetadata(),
    });
  }
}
