export const WATCHLIST_STORAGE_KEY = 'ww_watchlist_v1';

const DEFAULT_CHAIN = 'ethereum';
const VALID_TYPES = new Set(['wallet', 'token']);

export function normalizeWatchlistAddress(address) {
  return String(address || '').trim().toLowerCase();
}

export function normalizeWatchlistChain(chain) {
  const normalized = String(chain || DEFAULT_CHAIN).trim().toLowerCase();
  return normalized || DEFAULT_CHAIN;
}

export function normalizeWatchlistType(type) {
  const normalized = String(type || 'wallet').trim().toLowerCase();
  return VALID_TYPES.has(normalized) ? normalized : null;
}

export function makeWatchlistId(item) {
  const type = normalizeWatchlistType(item?.type);
  const chain = normalizeWatchlistChain(item?.chain);
  const address = normalizeWatchlistAddress(item?.address);
  if (!type || !address) return null;
  return `${type}:${chain}:${address}`;
}

export function normalizeWatchlistItem(item, now = Date.now()) {
  const type = normalizeWatchlistType(item?.type);
  const chain = normalizeWatchlistChain(item?.chain);
  const address = normalizeWatchlistAddress(item?.address);
  if (!type || !address) return null;

  const addedAt = Number(item?.addedAt);
  return {
    id: `${type}:${chain}:${address}`,
    type,
    address,
    chain,
    label: String(item?.label || '').trim(),
    addedAt: Number.isFinite(addedAt) ? addedAt : now,
  };
}

export function normalizeWatchlistItems(items, now = Date.now()) {
  if (!Array.isArray(items)) return [];

  const seen = new Set();
  const normalized = [];
  for (const item of items) {
    const next = normalizeWatchlistItem(item, now);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    normalized.push(next);
  }
  return normalized;
}

export function matchesWatchlistItem(item, address, options = {}) {
  const normalizedAddress = normalizeWatchlistAddress(address);
  if (!normalizedAddress || normalizeWatchlistAddress(item?.address) !== normalizedAddress) {
    return false;
  }

  const type = options?.type ? normalizeWatchlistType(options.type) : null;
  if (type && normalizeWatchlistType(item?.type) !== type) return false;

  const chain = options?.chain ? normalizeWatchlistChain(options.chain) : null;
  if (chain && normalizeWatchlistChain(item?.chain) !== chain) return false;

  return true;
}

export function loadWatchlistItems(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    return normalizeWatchlistItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWatchlistItems(items, storage = globalThis.localStorage) {
  try {
    storage?.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalizeWatchlistItems(items)));
  } catch {
    // quota exceeded or private browsing - silent fail
  }
}
