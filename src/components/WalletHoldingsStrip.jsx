/**
 * WalletHoldingsStrip
 *
 * Self-fetching component that shows approximate ERC-20 holdings (or DEX
 * trading exposure) for a wallet from /api/wallet-portfolio.
 *
 * Renders nothing when the wallet is not in the Dune dataset — silently absent
 * rather than showing a confusing empty state.
 */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const P   = '#BF4E32';
const INK = (a) => `rgba(30,26,20,${a})`;

const MODE_LABEL = {
  balance: 'Holdings',
  trading: 'Trading Exposure · 90d',
  unknown: 'Portfolio',
};

const MODE_NOTE = {
  balance: 'Approx. 2yr transfer window',
  trading: 'DEX activity only — not current balance',
  unknown: '',
};

function fmtUSD(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function TokenChip({ holding }) {
  const { tokenSymbol, balanceUsd, balance, tradeCount } = holding;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '9px 12px',
      background: 'rgba(255,252,246,0.82)',
      border: '1px solid rgba(191,78,50,0.13)',
      borderRadius: 4,
      minWidth: 90,
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: INK(0.84) }}>
        {tokenSymbol || '—'}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: P }}>
        {fmtUSD(balanceUsd)}
      </div>
      {balance != null && (
        <div style={{ fontSize: 10, color: INK(0.38) }}>
          {balance >= 1000
            ? `${(balance / 1000).toFixed(1)}k`
            : balance.toFixed(2)}{' '}
          {tokenSymbol}
        </div>
      )}
      {tradeCount != null && (
        <div style={{ fontSize: 10, color: INK(0.38) }}>
          {tradeCount} trades
        </div>
      )}
    </div>
  );
}

TokenChip.propTypes = {
  holding: PropTypes.shape({
    tokenSymbol:  PropTypes.string,
    balanceUsd:   PropTypes.number,
    balance:      PropTypes.number,
    tradeCount:   PropTypes.number,
    lastTradeAt:  PropTypes.string,
  }).isRequired,
};

function SkeletonChip() {
  return (
    <div style={{
      minWidth: 90, height: 72, borderRadius: 4,
      background: 'rgba(191,78,50,0.05)',
      border: '1px solid rgba(191,78,50,0.08)',
      flexShrink: 0,
      animation: 'pulse 1.4s ease-in-out infinite',
    }} />
  );
}

function renderChips(state, holdings) {
  if (state === 'loading') {
    return Array.from({ length: 5 }, (_, i) => <SkeletonChip key={i} />);
  }
  if (holdings.length > 0) {
    return holdings.map((h, i) => (
      <TokenChip key={h.tokenAddress ?? h.tokenSymbol ?? i} holding={h} />
    ));
  }
  return (
    <div style={{ fontSize: 12, color: INK(0.42), padding: '8px 0', lineHeight: 1.5 }}>
      No holdings above $100 found in the Dune dataset for this wallet.
    </div>
  );
}

export default function WalletHoldingsStrip({ address }) {
  const [state, setState] = useState('idle');   // idle | loading | done | error
  const [holdings, setHoldings] = useState([]);
  const [meta, setMeta]         = useState(null);

  useEffect(() => {
    if (!address || !/^0x[0-9a-f]{40}$/i.test(address)) return;
    let mounted = true;
    setState('loading');
    setHoldings([]);
    setMeta(null);

    fetch(`/api/wallet-portfolio?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!mounted || !data) return;
        // Silently skip wallets not in the Dune dataset
        if (!data.metadata?.inDataset) { setState('idle'); return; }
        setHoldings(data.holdings ?? []);
        setMeta(data.metadata);
        setState('done');
      })
      .catch(() => { if (mounted) setState('idle'); });

    return () => { mounted = false; };
  }, [address]);

  // Don't render anything until we have confirmed data (no flash of empty)
  if (state === 'idle' || state === 'error') return null;

  const mode      = meta?.dataMode ?? 'unknown';
  const modeLabel = MODE_LABEL[mode] ?? 'Portfolio';
  const modeNote  = MODE_NOTE[mode] ?? '';

  // Value anchor: sum of the priced holdings the portfolio dataset returned.
  // Only meaningful in balance mode — trading mode reports traded notional
  // (throughput), not value. Upstream normalization already drops null and
  // zero-value rows, so this is strictly the priced subset, not a portfolio
  // total; the copy stays "priced holdings" to avoid implying full coverage.
  const pricedHoldingsUsd = mode === 'balance'
    ? holdings.reduce((sum, h) => sum + (Number.isFinite(h.balanceUsd) ? h.balanceUsd : 0), 0)
    : null;

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, letterSpacing: 2.2, color: P, fontWeight: 700, textTransform: 'uppercase' }}>
            {modeLabel}
          </span>
          {pricedHoldingsUsd > 0 && (
            <span style={{ fontSize: 14, fontWeight: 700, color: INK(0.82), fontFamily: 'var(--font-display)' }}>
              {fmtUSD(pricedHoldingsUsd)}
              <span style={{ fontSize: 10, fontWeight: 600, color: INK(0.4), marginLeft: 5, fontFamily: 'inherit' }}>
                priced holdings · {holdings.length} token{holdings.length === 1 ? '' : 's'}
              </span>
            </span>
          )}
        </div>
        {modeNote && (
          <div style={{ fontSize: 10, color: INK(0.36), fontStyle: 'italic' }}>
            {modeNote}
          </div>
        )}
      </div>

      {/* Token chips row */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto',
        paddingBottom: 4,
        scrollbarWidth: 'thin',
      }}>
        {renderChips(state, holdings)}
      </div>

      {/* Stale warning */}
      {meta?.warnings?.some(w => w.includes('days old')) && (
        <div style={{ marginTop: 10, fontSize: 10, color: '#8B6D3E', lineHeight: 1.5 }}>
          {meta.warnings.find(w => w.includes('days old'))}
        </div>
      )}
    </div>
  );
}

WalletHoldingsStrip.propTypes = {
  address: PropTypes.string,
};
