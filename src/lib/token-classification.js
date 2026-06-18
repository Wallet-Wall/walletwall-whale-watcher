/**
 * Token classification helpers for primary wallet intelligence surfaces.
 *
 * Design:
 *   - Explicit allow-lists for stablecoins and core assets (always visible).
 *   - Explicit deny-list for well-known meme/noise tokens (hidden from primary surfaces).
 *   - Unknown tokens pass through conservatively (not hidden).
 *   - No effect on raw data, analytics, or Stable Seer search.
 *
 * Usage:
 *   - Display-layer only — call before rendering ranked token lists.
 *   - Never call before storing or transmitting data.
 */

// Stablecoins — always pass isPrimaryDisplayToken, never appear in meme denylist.
export const STABLECOIN_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'FRAX', 'TUSD', 'USDP', 'PYUSD', 'LUSD', 'GUSD',
  'USDE', 'SUSDE', 'USDC.E', 'DOLA', 'SUSD', 'CRVUSD', 'GHO', 'EURC',
  'USDD', 'FDUSD', 'BUSD', 'CUSD', 'EURS', 'EURT', 'EURE', 'USDJ', 'HUSD',
  'MUSD', 'OUSD', 'USDX', 'USDN', 'USTC', 'CEUR', 'SEUR', 'USDBC',
]);

// Core assets — always pass isPrimaryDisplayToken, never appear in meme denylist.
export const CORE_ASSET_SYMBOLS = new Set([
  'ETH', 'WETH', 'BTC', 'WBTC', 'STETH', 'WSTETH', 'CBETH', 'RETH',
  'ETH2', 'SWETH', 'BETH', 'ANKRETH', 'SFRXETH', 'METH', 'EZETH',
  'RSETH', 'PUFETH', 'WEETH', 'OSETH', 'FRXETH',
]);

// Meme / noise tokens — hidden from primary wallet intelligence surfaces.
// Conservative list: only tokens that are universally recognized as meme/noise
// with no material DeFi protocol utility. Unknown tokens are NOT added here.
export const MEME_DENYLIST = new Set([
  'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'FARTCOIN', 'BRETT',
  'DEGEN', 'POPCAT', 'MOG', 'GOAT', 'BOME', 'TURBO', 'WEN', 'WOJAK',
  'BASED', 'CHAD', 'HOPPY', 'TOSHI', 'ANDY', 'NEIRO', 'MOCHI', 'MYRO',
  'SLERF', 'GIGA', 'PONKE', 'MEME', 'TRUMP', 'BODEN', 'TREMP',
  'RETARDIO', 'LADYS', 'MILADY', 'PORK', 'BOBO', 'COQ', 'SMOG', 'MANEKI',
  'FOXY', 'SILLY', 'MOTHER', 'HARAMBE', 'KEKIUS', 'HIGHER', 'ENJOY',
  'IMAGINE', 'GROK', 'SIGMA', 'COPIUM', 'LMAO', 'HAHA',
]);

/**
 * Returns true if the symbol is a recognized stablecoin.
 * Case-insensitive.
 */
export function isStablecoinSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  return STABLECOIN_SYMBOLS.has(symbol.toUpperCase().trim());
}

/**
 * Returns true if the symbol is a recognized core asset (ETH, BTC, liquid staking).
 * Case-insensitive.
 */
export function isCoreAssetSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  return CORE_ASSET_SYMBOLS.has(symbol.toUpperCase().trim());
}

/**
 * Returns true if the symbol is a well-known meme or noise token.
 * Stablecoins and core assets are never classified as meme/noise even if
 * somehow present in the denylist.
 * Case-insensitive.
 */
export function isLikelyMemeOrNoiseToken(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  const upper = symbol.toUpperCase().trim();
  if (STABLECOIN_SYMBOLS.has(upper)) return false;
  if (CORE_ASSET_SYMBOLS.has(upper)) return false;
  return MEME_DENYLIST.has(upper);
}

/**
 * Returns true if the token should be shown on primary wallet intelligence surfaces
 * (portfolio charts, top-token breakdowns).
 *
 * Conservative: only tokens explicitly in the meme denylist are hidden.
 * Unknown tokens without a classification pass through (return true).
 *
 * This intentionally does NOT affect Stable Seer search, raw data, or analytics.
 */
export function isPrimaryDisplayToken(symbol) {
  if (!symbol || typeof symbol !== 'string') return true;
  return !isLikelyMemeOrNoiseToken(symbol);
}
