import { getRedisConfig } from './_ratelimit.js';

const RADAR_CACHE_TTL_SECONDS = 900; // 15 min — DEX Screener market data; don't re-hit on every search
const MAX_RADAR_CACHE_KEY_LENGTH = 240;
const MAX_RADAR_CACHE_BYTES = 64 * 1024;
const MAX_RADAR_CACHE_RESULTS = 50;
const MAX_RADAR_CACHE_STRING_LENGTH = 300;

function normalizeRadarCacheKey(cacheKey) {
  if (typeof cacheKey !== 'string') return null;
  const key = cacheKey.trim().toLowerCase();
  if (!key || key.length > MAX_RADAR_CACHE_KEY_LENGTH) return null;
  return key;
}

function isSafeCachedRadarValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.cachedAt != null && !Number.isFinite(Number(value.cachedAt))) return false;
  if (!Array.isArray(value.results) || value.results.length === 0 || value.results.length > MAX_RADAR_CACHE_RESULTS) return false;
  return value.results.every(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return Object.values(row).every(v => {
      if (v == null || typeof v === 'number' || typeof v === 'boolean') return true;
      return typeof v === 'string' && v.length <= MAX_RADAR_CACHE_STRING_LENGTH;
    });
  });
}

function warnCacheOnce(msg) {
  if (globalThis._radarCacheWarningShown) return;
  globalThis._radarCacheWarningShown = true;
  console.warn(`[radar-cache] ${msg}. Falling back to in-memory cache.`);
}

function getMemStore() {
  if (!globalThis._radarCacheMem) globalThis._radarCacheMem = new Map();
  return globalThis._radarCacheMem;
}

async function redisCacheGet(key) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) throw new Error('Redis not configured');
  const path = ['get', key].map(v => encodeURIComponent(String(v))).join('/');
  const res = await fetch(`${url}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  return data?.result ?? null;
}

async function redisCacheSet(key, value, ttlSeconds) {
  const { url, token, enabled } = getRedisConfig();
  if (!enabled) throw new Error('Redis not configured');
  const path = ['set', key, value, 'ex', String(ttlSeconds)]
    .map(v => encodeURIComponent(String(v))).join('/');
  const res = await fetch(`${url}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
}

export async function getCachedRadarResponse(cacheKey) {
  const safeKey = normalizeRadarCacheKey(cacheKey);
  if (!safeKey) return null;
  try {
    const raw = await redisCacheGet(`rc:${safeKey}`);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return isSafeCachedRadarValue(parsed) ? parsed : null;
  } catch (err) {
    warnCacheOnce(err.message || 'Redis unavailable');
    const store = getMemStore();
    const entry = store.get(safeKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(safeKey); return null; }
    if (!isSafeCachedRadarValue(entry.value)) {
      store.delete(safeKey);
      return null;
    }
    return entry.value;
  }
}

export async function setCachedRadarResponse(cacheKey, value, ttlSeconds = RADAR_CACHE_TTL_SECONDS) {
  const safeKey = normalizeRadarCacheKey(cacheKey);
  if (!safeKey || !isSafeCachedRadarValue(value)) return;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_RADAR_CACHE_BYTES) return;
  try {
    await redisCacheSet(`rc:${safeKey}`, serialized, ttlSeconds);
  } catch (err) {
    warnCacheOnce(err.message || 'Redis unavailable');
    const store = getMemStore();
    store.set(safeKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export { RADAR_CACHE_TTL_SECONDS };
