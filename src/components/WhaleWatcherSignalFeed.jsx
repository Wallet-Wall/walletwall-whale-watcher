import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { useInView } from '../hooks/useInView.js';

/* Illustrative large-movement alerts — sample shapes, not live on-chain data. */
const POOL = [
  { addr: '0x4a1f…c20', verb: 'moved', amount: '1,240 ETH', venue: '→ Binance', kind: 'out', big: true },
  { addr: 'whale.eth', verb: 'accumulated', amount: '2.1M USDC', venue: 'from Coinbase', kind: 'in', big: true },
  { addr: '0x7b9e…a4', verb: 'bridged', amount: '860 ETH', venue: '→ Base', kind: 'bridge' },
  { addr: '0xc3d2…11', verb: 'swapped', amount: '540 WBTC', venue: 'on Uniswap', kind: 'out' },
  { addr: 'fund.eth', verb: 'accumulated', amount: '3.4M DAI', venue: 'from OTC desk', kind: 'in', big: true },
  { addr: '0x91aa…7f', verb: 'moved', amount: '720 ETH', venue: '→ cold wallet', kind: 'out' },
  { addr: '0x2e44…d9', verb: 'bridged', amount: '1.2M USDT', venue: '→ Arbitrum', kind: 'bridge', big: true },
  { addr: 'dao.eth', verb: 'accumulated', amount: '980 ETH', venue: 'from treasury', kind: 'in' },
];

const KIND_COLOR = { out: '#BF4E32', in: '#5a9e6f', bridge: '#BA7517' };
const FILTERS = [['all', 'All'], ['out', 'Out'], ['in', 'In'], ['bridge', 'Bridge']];

const ageLabel = (age) => (age === 0 ? 'now' : `${age * 3}s`);

export default function WhaleWatcherSignalFeed({ onOpen }) {
  const seed = [0, 1, 2].map((i) => ({ ...POOL[i], key: i, age: i }));
  const [feed, setFeed] = useState(seed);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('all');
  const next = useRef(3);
  const [ref, inView] = useInView();

  useEffect(() => {
    if (paused || !inView) return undefined;
    const id = setInterval(() => {
      setFeed((prev) => {
        const aged = prev.map((a) => ({ ...a, age: a.age + 1 }));
        const item = { ...POOL[next.current % POOL.length], key: next.current, age: 0 };
        next.current += 1;
        return [item, ...aged].slice(0, 5);
      });
    }, 1800);
    return () => clearInterval(id);
  }, [paused, inView]);

  const rows = filter === 'all' ? feed : feed.filter((a) => a.kind === filter);

  return (
    <div className="ww-journey-panel ww-feed" ref={ref}>
      <div className="ww-journey-panel-head">
        <span className="ww-journey-panel-dot" />
        <span className="ww-journey-panel-dot" />
        <span className="ww-journey-panel-dot" />
        <span className="ww-journey-panel-label ww-feed-live"><span className="ww-feed-live-dot" data-on={!paused && inView} />Signal feed</span>
      </div>

      <ul className="ww-feed-list">
        {rows.map((a) => (
          <li key={a.key}>
            <button type="button" className="ww-feed-row" onClick={() => onOpen?.(a.addr)}>
              <span className="ww-feed-dot" data-big={!!a.big} style={{ background: KIND_COLOR[a.kind] }} aria-hidden="true" />
              <span className="ww-feed-addr">{a.addr}</span>
              <span className="ww-feed-verb">{a.verb}</span>
              <span className="ww-feed-amt">{a.amount}</span>
              <span className="ww-feed-venue">{a.venue}</span>
              <span className="ww-feed-age">{ageLabel(a.age)}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="ww-feed-empty">No {filter} alerts yet…</li>}
      </ul>

      <div className="ww-feed-actions">
        <div className="ww-feed-filters" role="group" aria-label="Filter alerts by type">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="ww-feed-chip"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="ww-feed-toggle" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? 'Resume ▶' : 'Pause ⏸'}
        </button>
      </div>

      <div className="ww-journey-panel-foot">Illustrative feed — sample on-chain alerts. Click a row to open Whale Watcher.</div>
    </div>
  );
}

WhaleWatcherSignalFeed.propTypes = {
  onOpen: PropTypes.func,
};
