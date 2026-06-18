export function fmtUSD(v, est = false) {
  if (v === null || v === undefined) return 'Price unavailable';
  let s;
  if (v >= 1e6) s = `$${(v/1e6).toFixed(1)}M`;
  else if (v >= 1e3) s = `$${(v/1e3).toFixed(1)}K`;
  else s = `$${Math.round(v).toLocaleString()}`;
  return est ? `~${s}` : s;
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  try { return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

export function shortAddr(a) {
  if (!a) return '';
  if (a.length <= 10) return a;
  return `${a.slice(0,6)}…${a.slice(-4)}`;
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}

export function wordCount(s) {
  const trimmed = s ? s.trim() : '';
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function readingTime(claudeData) {
  if (!claudeData) return '—';
  const words = ['headline','narrative','pull_quote','research_col1','research_col2'].reduce((s,k) => s + wordCount(claudeData[k] || ''), 0);
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

export function generateInShort(node) {
  if (!node) return null;
  const vol = fmtUSD(node.volumeUSD, node.volumeEstimated);
  const s1 = `This wallet moved ${vol} through ${node.label} across ${node.interactions || 0} transactions since ${fmtDate(node.firstSeen)}.`;
  let s2 = '';
  const gasOpp = (node.opportunities || []).find(o => o.type === 'gas');
  const yieldOpp = (node.opportunities || []).find(o => o.type === 'yield');
  if (gasOpp) s2 = gasOpp.description + (gasOpp.estimated ? ' (estimated)' : '') + '.';
  else if (yieldOpp) s2 = yieldOpp.description + '.';
  else {
    const avg = node.interactions > 0 ? (node.volumeUSD || 0) / node.interactions : 0;
    s2 = `Average transaction size: ${fmtUSD(avg, node.volumeEstimated)}.`;
  }
  if (node.volumeEstimated && !s2.includes('estimated')) s2 += ' Some dollar values are estimated using current token prices.';
  const n = (node.anomalies || []).length;
  const plural3 = n === 1 ? '' : 's';
  const s3 = n > 0 ? `${n} transaction pattern${plural3} look worth a closer look.` : 'No unusual patterns detected.';
  return { s1, s2, s3 };
}

export function getDataConfidence(node) {
  const n = node.interactions || 0;
  if (n > 50) return 'HIGH';
  if (n > 10) return 'MED';
  return 'LOW';
}
