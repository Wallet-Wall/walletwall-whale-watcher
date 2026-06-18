const SOURCE_LABELS = {
  alchemy: 'Alchemy',
  ai_narrative: 'AI Narrative',
  bigquery: 'BigQuery',
  coingecko: 'CoinGecko',
  computed: 'Computed',
  dexscreener: 'DEX Screener',
  dune_cached: 'Dune',
  dune_scheduled: 'Dune',
  etherscan: 'Etherscan',
  fallback: 'Fallback',
  mock: 'Demo',
  the_graph: 'The Graph',
};

const SOURCE_TYPES = {
  alchemy: 'RPC provider',
  ai_narrative: 'AI-generated summary',
  bigquery: 'warehouse query',
  coingecko: 'market data',
  computed: 'derived metric',
  dexscreener: 'market data',
  dune_cached: 'scheduled query cache',
  dune_scheduled: 'scheduled query',
  etherscan: 'explorer API',
  fallback: 'fallback dataset',
  mock: 'demo fixture',
  the_graph: 'subgraph',
};

function titleCase(value) {
  return String(value || '')
    .replace(/[-_:]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export function sourceLabel(value) {
  if (!value) return null;
  const key = String(value).toLowerCase();
  return SOURCE_LABELS[key] || titleCase(value);
}

export function sourceTypeLabel(value) {
  if (!value) return null;
  const key = String(value).toLowerCase();
  return SOURCE_TYPES[key] || titleCase(value);
}

export function confidenceLabel(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'high' || key === 'medium' || key === 'low') return key;
  if (key === 'med') return 'medium';
  if (key === 'unavailable') return 'unavailable';
  return null;
}

export function confidenceTone(value) {
  const key = confidenceLabel(value);
  if (key === 'high') return 'safe';
  if (key === 'medium') return 'warn';
  if (key === 'low') return 'risk';
  if (key === 'unavailable') return 'muted';
  return 'muted';
}

export function formatTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatCacheAge(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 60) return `${Math.round(n)}s old`;
  if (n < 3600) return `${Math.round(n / 60)}m old`;
  if (n < 86400) return `${Math.round(n / 3600)}h old`;
  return `${Math.round(n / 86400)}d old`;
}

function removeCaseInsensitive(text, needle) {
  let next = String(text);
  let index = next.toLowerCase().indexOf(needle.toLowerCase());
  while (index !== -1) {
    next = `${next.slice(0, index)}${next.slice(index + needle.length)}`;
    index = next.toLowerCase().indexOf(needle.toLowerCase());
  }
  return next;
}

function removeTrailingNotLive(text) {
  const dashSuffixes = ['-', String.fromCodePoint(8211), String.fromCodePoint(8212)]
    .map(dash => ` ${dash} not live`);
  const suffixes = [', not live', ...dashSuffixes];
  let next = String(text).trim();
  let lower = next.toLowerCase();
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix.toLowerCase())) {
      next = next.slice(0, -suffix.length).trim();
      lower = next.toLowerCase();
    }
  }
  return next;
}

function collapseSpaces(text) {
  let next = String(text);
  while (next.includes('  ')) next = next.replaceAll('  ', ' ');
  return next.trim();
}

export function normalizeFreshnessCopy(value) {
  if (!value) return null;
  let text = removeTrailingNotLive(String(value));
  text = removeCaseInsensitive(text, '(not live)');
  text = text.replaceAll('Scheduled/cached', 'Scheduled/cache');
  text = text.replaceAll('Scheduled Cached', 'Scheduled/cache');
  text = collapseSpaces(text);
  const lower = text.toLowerCase();
  if (lower === 'scheduled/cache' || lower === 'scheduled / cache') return 'Scheduled/cache';
  if (lower === 'scheduled') return 'Scheduled';
  return text || null;
}

export function freshnessLabel({ sourceType, isCached, cacheAgeSeconds, freshness, updatedAt, fetchedAt, generatedAt, queryRunAt } = {}) {
  if (freshness) return normalizeFreshnessCopy(freshness);
  const key = String(sourceType || '').toLowerCase();
  const cacheAge = formatCacheAge(cacheAgeSeconds);

  if (key === 'dune_cached') return cacheAge ? `Scheduled/cache, ${cacheAge}` : 'Scheduled/cache';
  if (key === 'dune_scheduled') return 'Scheduled';

  if (isCached) return cacheAge ? `Cached, ${cacheAge}` : 'Cached';
  const stamp = formatTimestamp(updatedAt || fetchedAt || generatedAt);
  return stamp ? `Fetched ${stamp}` : null;
}

export function buildSourceView(input = {}) {
  const source = input.source || input.sourceMetadata || {};
  const quality = input.quality || input.dataQuality || {};
  const sourceType = input.sourceType || source.sourceType || input.provider || source.sourceId;
  const provider = input.provider || input.label || source.sourceId || sourceType;
  const rawQueryRunAt = input.queryRunAt ?? source.queryRunAt ?? null;
  const warnings = [
    input.warning,
    ...(Array.isArray(input.warnings) ? input.warnings : []),
    ...(Array.isArray(quality.warnings) ? quality.warnings : []),
  ].filter(Boolean);

  return {
    label: input.label || sourceLabel(provider) || sourceLabel(sourceType),
    typeLabel: input.typeLabel || sourceTypeLabel(sourceType),
    confidence: confidenceLabel(input.confidence || quality.confidence),
    freshness: freshnessLabel({
      sourceType,
      isCached: input.isCached ?? source.isCached,
      cacheAgeSeconds: input.cacheAgeSeconds ?? source.cacheAgeSeconds,
      freshness: input.freshness,
      updatedAt: input.updatedAt,
      fetchedAt: input.fetchedAt || source.fetchedAt,
      generatedAt: input.generatedAt,
      queryRunAt: rawQueryRunAt,
    }),
    method: input.method || source.method || source.queryName || source.queryId || null,
    queryLabel: input.queryLabel || source.queryName || source.queryId || null,
    queryRunAt: rawQueryRunAt ? formatTimestamp(rawQueryRunAt) : null,
    warnings,
  };
}
