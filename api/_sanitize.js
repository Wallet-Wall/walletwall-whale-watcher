// Phishing tokens embed URLs or instructions in their ERC-20 name/symbol.
// Never render these as-is. Mark them as spam and redact the label.
const URL_RE = /https?:\/\/|www\.|\.com\b|\.org\b|\.io\b|\.xyz\b|\.net\b|\.finance\b|\.app\b/i;
const INSTRUCTION_RE = /visit|claim|reward|airdrop|free|bonus|discord\.gg|t\.me\//i;

/**
 * Redacts labels containing phishing URLs or suspicious call-to-action instructions.
 * Also trims and strips non-printable characters.
 *
 * @param {string} raw
 * @returns {{ label: string, spam: boolean }}
 */
export function sanitizeLabel(raw) {
  if (!raw || typeof raw !== 'string') return { label: 'UNKNOWN', spam: false };
  const trimmed = raw.trim().slice(0, 64); // hard cap
  if (URL_RE.test(trimmed) || INSTRUCTION_RE.test(trimmed)) {
    return { label: '[spam token]', spam: true };
  }
  // Strip non-printable / control characters
  const clean = trimmed.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim();
  return { label: clean || 'UNKNOWN', spam: false };
}
