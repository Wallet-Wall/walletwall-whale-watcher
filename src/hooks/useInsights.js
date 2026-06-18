import { useEffect, useRef, useState } from 'react';

let _cache = null;
let _inflight = null;

function ensureInflight() {
  if (!_inflight) {
    _inflight = fetch('/api/insights')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { _cache = d; } return d; })
      .catch(() => null)
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

export function useInsights() {
  const [data, setData] = useState(_cache);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (_cache) return;
    ensureInflight().then(d => {
      if (!mounted.current) return;
      if (d) setData(d);
    });
  }, []);

  return { data };
}
