/**
 * Known CEX and bridge label patterns for counterparty classification.
 *
 * Detection is label-based (substring match on counterpartyLabel), not
 * address-based.  Address lookup belongs in api/wallet.js where the
 * full PROTOCOL_MAP lives.  Using labels here keeps the signal engine
 * decoupled from the API layer and avoids hardcoding addresses that
 * can rotate or be upgraded.
 *
 * Matching is case-insensitive substring — "Coinbase Prime" matches
 * the 'coinbase' pattern, "Hop Protocol" matches 'hop '.
 */

export const CEX_LABEL_PATTERNS = [
  'coinbase', 'binance', 'kraken', 'okx', 'bybit', 'kucoin',
  'gemini', 'huobi', 'gate.io', 'crypto.com', 'mexc', 'bitfinex',
  'bitstamp', 'bittrex', 'poloniex', 'upbit', 'bithumb',
];

export const BRIDGE_LABEL_PATTERNS = [
  'bridge', 'hop', 'across', 'stargate', 'wormhole', 'layerzero',
  'arbitrum bridge', 'optimism bridge', 'polygon bridge', 'base bridge',
  'synapse', 'celer', 'multichain', 'connext', 'socket', 'lifi',
];

/**
 * Returns true if a counterparty label matches any known CEX pattern.
 *
 * @param {string|null} label
 * @returns {boolean}
 */
export function isCexLabel(label) {
  if (!label || typeof label !== 'string') return false;
  const lower = label.toLowerCase();
  return CEX_LABEL_PATTERNS.some(p => lower.includes(p));
}

/**
 * Returns true if a counterparty label matches any known bridge pattern.
 *
 * @param {string|null} label
 * @returns {boolean}
 */
export function isBridgeLabel(label) {
  if (!label || typeof label !== 'string') return false;
  const lower = label.toLowerCase();
  return BRIDGE_LABEL_PATTERNS.some(p => lower.includes(p));
}

/**
 * Returns true for CounterpartyType values that indicate CEX involvement.
 *
 * @param {string|null|undefined} counterpartyType
 * @returns {boolean}
 */
export function isCexCounterpartyType(counterpartyType) {
  return counterpartyType === 'cex';
}

/**
 * Returns true for CounterpartyType values that indicate bridge involvement.
 *
 * @param {string|null|undefined} counterpartyType
 * @returns {boolean}
 */
export function isBridgeCounterpartyType(counterpartyType) {
  return counterpartyType === 'bridge';
}

/**
 * Returns a normalised name for a CEX from its label, or null if no match.
 * Returns the original label when it matches but can't be normalised further.
 *
 * @param {string|null} label
 * @returns {string|null}
 */
export function normaliseCexName(label) {
  if (!isCexLabel(label)) return null;
  const lower = label.toLowerCase();
  // Return a canonical name for major exchanges, otherwise the raw label
  if (lower.includes('coinbase'))  return 'Coinbase';
  if (lower.includes('binance'))   return 'Binance';
  if (lower.includes('kraken'))    return 'Kraken';
  if (lower.includes('okx'))       return 'OKX';
  if (lower.includes('bybit'))     return 'Bybit';
  if (lower.includes('kucoin'))    return 'KuCoin';
  if (lower.includes('gemini'))    return 'Gemini';
  if (lower.includes('huobi'))     return 'Huobi';
  if (lower.includes('gate.io'))   return 'Gate.io';
  return label;
}
