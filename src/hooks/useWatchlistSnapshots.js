import { useCallback, useEffect, useState } from 'react';

export const WATCHLIST_SNAPSHOT_REFRESH_MS = 5 * 60 * 1000;

function bestPool(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return [...results].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];
}

function parseSnapshot(data, fetchedAt = Date.now()) {
  const pool = bestPool(data?.results);
  return {
    loading: false,
    price: pool?.priceUsd ? Number(pool.priceUsd) : null,
    priceChange24h: pool?.priceChange24h ?? null,
    symbol: pool?.symbol ?? null,
    fetchedAt,
  };
}

function fetchTokenSnapshot(address, signal, onSuccess, onError) {
  fetch(`/api/stable-seer?q=${encodeURIComponent(address)}`, { signal })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
    .then(data => onSuccess(parseSnapshot(data)))
    .catch(error => {
      if (error.name !== 'AbortError') onError();
    });
}

function scheduleTokenFetch(key, idx, controller, setSnapshots) {
  return setTimeout(() => {
    fetchTokenSnapshot(
      key,
      controller.signal,
      snap => setSnapshots(prev => ({ ...prev, [key]: snap })),
      () => setSnapshots(prev => ({ ...prev, [key]: { ...prev[key], loading: false, error: true } })),
    );
  }, idx * 150);
}

export function useWatchlistSnapshots(items) {
  const [snapshots, setSnapshots] = useState({});
  const [refreshVersion, setRefreshVersion] = useState(0);
  const tokens = items.filter(item => item.type === 'token');
  const tokenIds = tokens.map(item => item.id).join(',');
  const refreshSnapshots = useCallback(() => {
    setRefreshVersion(version => version + 1);
  }, []);

  useEffect(() => {
    if (tokens.length === 0) return;

    const controller = new AbortController();
    const timers = [];

    tokens.forEach((item, idx) => {
      const key = item.address;
      setSnapshots(prev => ({ ...prev, [key]: { ...prev[key], loading: true, error: false } }));
      timers.push(scheduleTokenFetch(key, idx, controller, setSnapshots));
    });

    return () => {
      controller.abort();
      timers.forEach(t => clearTimeout(t));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenIds, refreshVersion]);

  useEffect(() => {
    if (tokens.length === 0) return;
    const intervalId = setInterval(refreshSnapshots, WATCHLIST_SNAPSHOT_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [refreshSnapshots, tokens.length]);

  return {
    snapshots,
    refreshSnapshots,
    refreshing: tokens.some(item => snapshots[item.address]?.loading),
  };
}
