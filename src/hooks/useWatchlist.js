import { useState, useCallback, useEffect } from 'react';
import {
  loadWatchlistItems,
  matchesWatchlistItem,
  normalizeWatchlistAddress,
  normalizeWatchlistItem,
  saveWatchlistItems,
} from '../lib/watchlist-storage.js';

/**
 * Watchlist item shape:
 * { id, type: 'wallet'|'token', address, chain, label, addedAt }
 */
export function useWatchlist() {
  const [items, setItems] = useState(loadWatchlistItems);

  useEffect(() => {
    saveWatchlistItems(items);
  }, [items]);

  const isWatched = useCallback((address, options = {}) => {
    return items.some(item => matchesWatchlistItem(item, address, options));
  }, [items]);

  const watch = useCallback(({ type, address, chain = 'ethereum', label = '' }) => {
    const next = normalizeWatchlistItem({ type, address, chain, label });
    if (!next) return;

    setItems(prev => {
      if (prev.some(item => item.id === next.id)) return prev;
      return [...prev, next];
    });
  }, []);

  const unwatch = useCallback((address, options = {}) => {
    const normalizedAddress = normalizeWatchlistAddress(address);
    if (!normalizedAddress) return;

    setItems(prev => prev.filter(item => !matchesWatchlistItem(item, normalizedAddress, options)));
  }, []);

  const toggle = useCallback((item) => {
    const next = normalizeWatchlistItem(item);
    if (!next) return;

    const options = { type: next.type, chain: next.chain };
    if (isWatched(next.address, options)) {
      unwatch(next.address, options);
    } else {
      watch(next);
    }
  }, [isWatched, watch, unwatch]);

  return { items, isWatched, watch, unwatch, toggle };
}
