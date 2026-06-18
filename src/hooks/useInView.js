import { useState, useEffect, useRef } from 'react';

/* Observe when an element enters the viewport. `once` stops observing after the
   first entry (for one-shot auto-play); otherwise it tracks visibility for
   pausing off-screen work. */
export function useInView({ threshold = 0.35, once = false } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) obs.disconnect();
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}
