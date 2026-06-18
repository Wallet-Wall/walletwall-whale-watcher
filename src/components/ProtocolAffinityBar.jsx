import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const ADDRESS_RE = /^0x[0-9a-f]{40}$/i;
const COLORS = ['#2F6F73', '#8B6D3E', '#6D7C3F', '#8B5E57', '#4E6B4F'];
const INK = (a) => `rgba(30,26,20,${a})`;

function isValidAddress(address) {
  return ADDRESS_RE.test(String(address ?? '').trim());
}

function normalizePct(protocol) {
  const pct = Number(protocol?.pctOfTrades);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  if (pct > 1) return pct;
  return pct * 100;
}

function numericValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeFallbackProtocols(fallbackProtocols) {
  if (!Array.isArray(fallbackProtocols)) return [];
  const normalized = fallbackProtocols
    .map(protocol => {
      const name = String(protocol?.protocol ?? protocol?.label ?? '').trim();
      const totalVolumeUsd = numericValue(protocol?.totalVolumeUsd ?? protocol?.volumeUSD);
      const tradeCount = numericValue(protocol?.tradeCount ?? protocol?.interactions);
      return { protocol: name, totalVolumeUsd, tradeCount, source: 'graph' };
    })
    .filter(protocol => protocol.protocol && (protocol.totalVolumeUsd > 0 || protocol.tradeCount > 0))
    .sort((a, b) => (b.totalVolumeUsd - a.totalVolumeUsd) || (b.tradeCount - a.tradeCount))
    .slice(0, 5);

  const totalVolume = normalized.reduce((sum, protocol) => sum + protocol.totalVolumeUsd, 0);
  const totalTrades = normalized.reduce((sum, protocol) => sum + protocol.tradeCount, 0);
  return normalized.map(protocol => {
    let pctOfTrades = 0;
    if (totalVolume > 0) {
      pctOfTrades = protocol.totalVolumeUsd / totalVolume;
    } else if (totalTrades > 0) {
      pctOfTrades = protocol.tradeCount / totalTrades;
    }

    return {
      ...protocol,
      pctOfTrades,
    };
  });
}

export function buildFallbackProtocols(walletData) {
  return normalizeFallbackProtocols(
    (walletData?.nodes ?? []).filter(node => node?.type === 'defi' || node?.type === 'protocol'),
  );
}

export default function ProtocolAffinityBar({ address, fallbackProtocols = [] }) {
  const localProtocols = normalizeFallbackProtocols(fallbackProtocols);
  const [state, setState] = useState({ loading: false, protocols: localProtocols, error: false });

  useEffect(() => {
    const nextLocalProtocols = normalizeFallbackProtocols(fallbackProtocols);
    if (!isValidAddress(address)) {
      setState({ loading: false, protocols: nextLocalProtocols, error: false });
      return;
    }
    let mounted = true;
    setState({ loading: true, protocols: nextLocalProtocols, error: false });
    fetch(`/api/wallet-protocol-affinity?address=${encodeURIComponent(address)}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!mounted) return;
        const protocols = Array.isArray(data?.protocols) ? data.protocols.slice(0, 5) : [];
        setState({
          loading: false,
          protocols: protocols.length > 0 ? protocols : nextLocalProtocols,
          error: false,
        });
      })
      .catch(() => {
        if (mounted) setState({ loading: false, protocols: nextLocalProtocols, error: true });
      });
    return () => { mounted = false; };
  }, [address, fallbackProtocols]);

  const protocols = state.protocols ?? [];
  const isGraphDerived = protocols.some(protocol => protocol?.source === 'graph');

  if (!isValidAddress(address) && protocols.length === 0) return null;

  if (state.loading && protocols.length === 0) {
    return (
      <div className="ww-card ww-card-sharp" style={{ padding: 16 }}>
        <div className="ww-soft-label" style={{ marginBottom: 8 }}>Protocol affinity</div>
        <div style={{ fontSize: 12, color: INK(0.42) }}>Checking affinity signals...</div>
      </div>
    );
  }

  if (protocols.length === 0) {
    return (
      <div className="ww-card ww-card-sharp" style={{ padding: 16 }}>
        <div className="ww-soft-label" style={{ marginBottom: 8 }}>Protocol affinity</div>
        <div style={{ fontSize: 12, color: INK(0.42) }}>
          {state.error
            ? 'Affinity signals unavailable.'
            : 'No protocol activity found for this wallet.'}
        </div>
      </div>
    );
  }

  return (
    <div className="ww-card ww-card-sharp" style={{ padding: 16 }}>
      <div className="ww-soft-label" style={{ marginBottom: 12 }}>
        Protocol affinity{isGraphDerived ? ' - graph-derived' : ''}
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', background: INK(0.06) }}>
        {protocols.map((protocol, index) => (
          <div
            key={protocol.protocol}
            title={`${protocol.protocol} ${normalizePct(protocol).toFixed(0)}%`}
            style={{
              width: `${Math.max(2, normalizePct(protocol))}%`,
              background: COLORS[index % COLORS.length],
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {protocols.map((protocol, index) => (
          <span
            key={protocol.protocol}
            style={{
              border: `1px solid ${COLORS[index % COLORS.length]}55`,
              background: `${COLORS[index % COLORS.length]}14`,
              color: INK(0.7),
              borderRadius: 3,
              padding: '4px 7px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {protocol.protocol} {normalizePct(protocol).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

ProtocolAffinityBar.propTypes = {
  address: PropTypes.string,
  fallbackProtocols: PropTypes.array,
};
