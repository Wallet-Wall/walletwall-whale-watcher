export const RECENTLY_EXPLORED_KEY = 'ww_recently_explored_v1';
const MAX_ITEMS = 8;

function shortAddr(query) {
  if (/^0x[0-9a-f]{40}$/i.test(query)) {
    return `${query.slice(0, 6)}…${query.slice(-4)}`;
  }
  return query.length > 22 ? `${query.slice(0, 20)}…` : query;
}

export function displayLabel(query) {
  return shortAddr(String(query || ''));
}

export function loadRecentlyExplored(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(RECENTLY_EXPLORED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordExplored(query, type = 'wallet', storage = globalThis.localStorage) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return;
  try {
    const existing = loadRecentlyExplored(storage);
    const deduped = existing.filter(item => item.query?.toLowerCase() !== trimmed.toLowerCase());
    const next = [{ query: trimmed, type, exploredAt: Date.now() }, ...deduped].slice(0, MAX_ITEMS);
    storage?.setItem(RECENTLY_EXPLORED_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded or private browsing — silent fail
  }
}

export function exploredItemType(item) {
  if (item?.type === 'token') return 'token';
  return 'wallet';
}

export function matchingRecent(items, input) {
  if (!input) return items.slice(0, 5);
  const lower = input.toLowerCase();
  return items.filter(item => item.query?.toLowerCase().includes(lower)).slice(0, 5);
}
