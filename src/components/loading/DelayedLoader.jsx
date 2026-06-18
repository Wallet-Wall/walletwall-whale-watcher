import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './loading.css';

/**
 * Prevents loading UI from flashing on fast requests.
 *
 * Phase timeline (measured from when active becomes true):
 *   0 – delayMs     → renders nothing
 *   delayMs         → renders children (skeleton visual)
 *   textDelayMs     → adds label below children
 *   longDelayMs     → adds longHint below label
 *
 * When active becomes false, resets immediately to hidden.
 */
export default function DelayedLoader({
  active = true,
  delayMs = 250,
  textDelayMs = 900,
  longDelayMs = 3000,
  label,
  longHint,
  children,
}) {
  const [phase, setPhase] = useState('hidden'); // 'hidden' | 'skeleton' | 'text' | 'long'
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!active) {
      setPhase('hidden');
      return;
    }
    const safe = (fn) => () => { if (mountedRef.current) fn(); };
    const timers = [
      setTimeout(safe(() => setPhase('skeleton')), delayMs),
      setTimeout(safe(() => setPhase('text')),     textDelayMs),
      setTimeout(safe(() => setPhase('long')),     longDelayMs),
    ];
    return () => timers.forEach(clearTimeout);
  }, [active, delayMs, textDelayMs, longDelayMs]);

  if (!active || phase === 'hidden') return null;

  const showText     = phase === 'text' || phase === 'long';
  const showLongHint = phase === 'long';

  return (
    <div>
      {typeof children === 'function' ? children({ phase, showText, showLongHint }) : children}
      {showText && label && (
        <div
          className="ww-delayed-label"
          style={{ textAlign: 'center', paddingTop: 16, paddingBottom: 4 }}
          aria-live="polite"
        >
          {label}
        </div>
      )}
      {showLongHint && longHint && (
        <div
          className="ww-delayed-hint"
          style={{ textAlign: 'center', paddingBottom: 8 }}
          aria-live="polite"
        >
          {longHint}
        </div>
      )}
    </div>
  );
}

DelayedLoader.propTypes = {
  active:       PropTypes.bool,
  delayMs:      PropTypes.number,
  textDelayMs:  PropTypes.number,
  longDelayMs:  PropTypes.number,
  label:        PropTypes.string,
  longHint:     PropTypes.string,
  children:     PropTypes.oneOfType([PropTypes.node, PropTypes.func]),
};
