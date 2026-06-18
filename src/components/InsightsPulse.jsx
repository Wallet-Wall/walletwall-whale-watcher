import PropTypes from 'prop-types';
import { useInsights } from '../hooks/useInsights.js';

const INK = (a) => `rgba(30,26,20,${a})`;
const P = '#BF4E32';
const GREEN = '#1E653C';

function fmtVol(n) {
  if (!n) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function pctColor(pct) {
  if (pct == null) return INK(0.55);
  if (pct >= 10) return GREEN;
  if (pct <= -10) return P;
  return INK(0.55);
}

function pctBg(pct) {
  if (pct >= 10) return 'rgba(30,101,60,0.07)';
  if (pct <= -10) return 'rgba(191,78,50,0.07)';
  return 'rgba(30,26,20,0.04)';
}

function pctBorder(pct) {
  if (pct >= 10) return 'rgba(30,101,60,0.14)';
  if (pct <= -10) return 'rgba(191,78,50,0.16)';
  return 'rgba(30,26,20,0.09)';
}

function SignalChip({ label, pct }) {
  const sign = pct >= 0 ? '+' : '';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: 3,
      background: pctBg(pct),
      border: `1px solid ${pctBorder(pct)}`,
      fontSize: 11, lineHeight: 1,
    }}>
      <span style={{ fontWeight: 600, color: INK(0.72) }}>{label}</span>
      {pct != null && (
        <span style={{ fontWeight: 700, color: pctColor(pct) }}>{sign}{pct}%</span>
      )}
    </span>
  );
}

SignalChip.propTypes = {
  label: PropTypes.string.isRequired,
  pct: PropTypes.number,
};

function TokenChip({ symbol, volume24h }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: 3,
      background: 'rgba(30,26,20,0.04)',
      border: '1px solid rgba(30,26,20,0.09)',
      fontSize: 11, lineHeight: 1,
    }}>
      <span style={{ fontWeight: 700, color: INK(0.78) }}>{symbol}</span>
      <span style={{ color: INK(0.44) }}>{fmtVol(volume24h)}</span>
    </span>
  );
}

TokenChip.propTypes = {
  symbol: PropTypes.string.isRequired,
  volume24h: PropTypes.number.isRequired,
};

function formatAge(generatedAt) {
  if (!generatedAt) return null;
  const minutes = Math.round((Date.now() - new Date(generatedAt).getTime()) / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default function InsightsPulse() {
  const { data } = useInsights();

  if (!data) return null;

  const { narrative, protocolSignals = [], topTokens = [], whaleActivity, generatedAt } = data;

  if (!protocolSignals.length && !topTokens.length && !narrative) return null;

  const ageLabel = formatAge(generatedAt);

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div className="ww-section-label">DeFi Pulse</div>
        {ageLabel && (
          <span style={{ fontSize: 10, color: INK(0.3), letterSpacing: 0.5 }}>updated {ageLabel}</span>
        )}
      </div>

      <div className="ww-card ww-card-sharp" style={{ padding: 18 }}>

        {narrative?.headline && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(139,49,32,0.08)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK(0.86), lineHeight: 1.35, marginBottom: narrative.summary ? 6 : 0 }}>
              {narrative.headline}
            </div>
            {narrative.summary && (
              <div style={{ fontSize: 12, color: INK(0.56), lineHeight: 1.65 }}>
                {narrative.summary}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>

          {protocolSignals.length > 0 && (
            <div>
              <div className="ww-label" style={{ marginBottom: 8 }}>Protocols 7d</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {protocolSignals.slice(0, 6).map(s => (
                  <SignalChip key={s.protocol} label={s.protocol} pct={s.changePct} />
                ))}
              </div>
            </div>
          )}

          {topTokens.length > 0 && (
            <div>
              <div className="ww-label" style={{ marginBottom: 8 }}>Top tokens 24h</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topTokens.slice(0, 6).map(t => (
                  <TokenChip key={t.symbol} symbol={t.symbol} volume24h={t.volume24h} />
                ))}
              </div>
            </div>
          )}

          {whaleActivity?.totalTrades > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(139,49,32,0.07)' }}>
              <div className="ww-label">Whale trades 24h</div>
              <span style={{ fontSize: 12, color: INK(0.62) }}>
                <strong style={{ color: INK(0.82) }}>{whaleActivity.totalTrades}</strong> trades
                {' · '}
                <strong style={{ color: INK(0.82) }}>{fmtVol(whaleActivity.totalVolumeUSD)}</strong>
                {whaleActivity.byProtocol?.[0] && (
                  <> · top: <strong style={{ color: INK(0.82) }}>{whaleActivity.byProtocol[0].protocol}</strong></>
                )}
              </span>
            </div>
          )}

          {narrative?.signals?.length > 0 && (
            <div style={{ paddingTop: 6, borderTop: '1px solid rgba(139,49,32,0.07)' }}>
              <div className="ww-label" style={{ marginBottom: 8 }}>Signals</div>
              <div style={{ display: 'grid', gap: 7 }}>
                {narrative.signals.slice(0, 3).map(s => (
                  <div key={s.label} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ color: P, fontWeight: 700, flexShrink: 0, minWidth: 90 }}>{s.label}</span>
                    <span style={{ color: INK(0.58), lineHeight: 1.55 }}>{s.insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
