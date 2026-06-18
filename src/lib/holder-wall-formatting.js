/**
 * Pure formatting helpers for Holder Wall tile display.
 * No React, no DOM — importable in Node test runner without transpilation.
 */

/**
 * Format a USD value compactly: $1.28B, $14.2M, $42K, $9
 * @param {number|null|undefined} v
 * @returns {string}
 */
export function fmtUSD(v) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return '—';
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return '—';

  // Roll over when rounding would otherwise display 1000 of the lower unit.
  if (n >= 999950000000000) return '>$999.9T';
  if (n >= 999500000000) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 999500000)    return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 999500)       return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 999.5)        return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Format a fractional 24 h change (0.15 = +15%).
 *
 * CONTRACT: `frac` must be a decimal fraction, NOT a percentage.
 *   ✓ 0.15  → "+15.0%"   (balance grew 15%)
 *   ✓ -0.08 → "-8.0%"    (balance shrank 8%)
 *   ✗ 15    → "+1500.0%" (wrong — do not pass raw percentage)
 *
 * Callers converting from HolderWallTile.balanceDeltaUSD (absolute USD) must
 * divide by the base balance first. That conversion belongs in the parent
 * integration layer, not here.
 *
 * @param {number|null|undefined} frac
 * @returns {{ text: string, dir: 'pos'|'neg'|'flat' }}
 */
export function fmtChange(frac) {
  if (frac == null || !Number.isFinite(Number(frac))) return { text: '—', dir: 'flat' };
  const pct = Number(frac) * 100;

  if (Math.abs(pct) < 0.05) return { text: '0.0%', dir: 'flat' };
  if (pct > 999) return { text: '>999%', dir: 'pos' };
  if (pct < -999) return { text: '<-999%', dir: 'neg' };

  const sign = pct > 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(1)}%`;
  let dir;
  if (pct > 0.1) dir = 'pos';
  else if (pct < -0.1) dir = 'neg';
  else dir = 'flat';
  return { text, dir };
}

/**
 * Format a transaction count compactly: 1.2k, 42
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function fmtTx(n) {
  if (n == null || (typeof n === 'string' && n.trim() === '')) return '—';
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '—';
  if (num >= 999950000) return '>999.9M';
  if (num >= 999500)    return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 999.5)     return `${(num / 1e3).toFixed(1)}k`;
  return String(Math.round(num));
}

/**
 * Compute an SVG path string for a mini sparkline.
 *
 * Pure function — no React dependency. Extracted here so it can be unit-tested
 * directly (edge cases: empty, one-point, flat, NaN, mixed-finite arrays).
 *
 * Returns null when the input is invalid or produces no renderable path.
 * A valid return value always starts with 'M'.
 *
 * @param {number[]} points - Raw data values; non-finite entries are filtered.
 * @param {number} [width=56]
 * @param {number} [height=20]
 * @returns {string|null}
 */
export function buildSparklinePath(points, width = 56, height = 20) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const nums = points.map(Number).filter(n => Number.isFinite(n));
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1; // guards divide-by-zero when all values are equal
  const pad = 2;
  const iw = width - pad * 2;
  const ih = height - pad * 2;
  const d = nums.map((v, i) => {
    const x = pad + (i / (nums.length - 1)) * iw;
    const y = pad + ih - ((v - min) / range) * ih;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
  if (!d?.startsWith('M')) return null;
  return d;
}

/**
 * Truncate an Ethereum address or ENS name for compact display.
 * ENS names and short strings pass through unchanged.
 * @param {string} addr
 * @returns {string}
 */
export function fmtAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  const s = addr.trim();
  if (s.length <= 13) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
