import PropTypes from 'prop-types';
import { NODE_COLORS } from '../constants.js';
import { fmtUSD } from '../utils.js';
import Badge from './Badge.jsx';

// Second-line defense: strip phishing URLs from any label that slips through
const URL_RE = /https?:\/\/|www\.|\.(com|org|io|xyz|net|finance|app)\b/i;
const INSTRUCTION_RE = /visit|claim|reward|airdrop|free bonus|discord\.gg|t\.me\//i;
function safeLabel(raw) {
  if (!raw) return '';
  if (URL_RE.test(raw) || INSTRUCTION_RE.test(raw)) return '[spam token]';
  return raw;
}

export default function HoverTooltip({ node, x, y, compareData }) {
  if (!node) return null;
  const displayLabel = safeLabel(node.label);
  let risk;
  if (node.riskScore < 3) risk = 'LOW';
  else if (node.riskScore < 6) risk = 'MED';
  else risk = 'HIGH';
  const riskTone = { LOW: 'safe', MED: 'warn', HIGH: 'risk' }[risk];
  const TYPE_SUFFIX = { defi: 'Protocol', nft: 'Collection' };
  const typeSuffix = TYPE_SUFFIX[node.type] ?? '';
  const matchB = node._walletB ? null : compareData?.nodes?.find(n => n.label === node.label);
  const isShared = !!matchB;
  return (
    <div className="glass" style={{ position:'fixed', left: Math.min(x+16, globalThis.window.innerWidth-210), top: Math.max(y-40, 8), zIndex:200, padding:'12px 16px', minWidth:190, pointerEvents:'none', fontSize:13 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background: isShared ? '#F5C842' : (NODE_COLORS[node.type] || '#B88A4A'), display:'inline-block' }} />
        <strong style={{ color:'rgba(30,26,20,0.9)' }}>{displayLabel}</strong>
        {isShared && <Badge variant="status" tone="selected">Shared</Badge>}
        {node._walletB && <Badge variant="entity" tone="muted">Wallet B</Badge>}
      </div>
      <div style={{ marginBottom:6 }}>
        <Badge variant="entity">{node.type}{typeSuffix && ` ${typeSuffix}`}</Badge>
      </div>
      {isShared ? (
        <>
          <div style={{ color:'rgba(30,26,20,0.65)', fontSize:12 }}>Wallet A: <strong>{fmtUSD(node.volumeUSD, true)}</strong> · {node.interactions} txs</div>
          <div style={{ color:'rgba(30,26,20,0.65)', fontSize:12 }}>Wallet B: <strong>{fmtUSD(matchB.volumeUSD, true)}</strong> · {matchB.interactions} txs</div>
          <div style={{ color:'#BF4E32', fontSize:12, fontWeight:600, marginTop:4 }}>Combined: {fmtUSD((node.volumeUSD||0)+(matchB.volumeUSD||0), true)}</div>
        </>
      ) : (
        <>
          {node.volumeUSD > 0
            ? <div style={{ color:'rgba(30,26,20,0.8)' }}>Volume: <strong>{fmtUSD(node.volumeUSD, node.volumeEstimated)}</strong></div>
            : <div style={{ color:'rgba(30,26,20,0.45)', fontSize:12 }}>Price unavailable</div>
          }
          {node.interactions > 0 && <div style={{ color:'rgba(30,26,20,0.8)' }}>{node.interactions} interactions</div>}
          <div style={{ color:'rgba(30,26,20,0.8)' }}>Risk: <Badge variant="status" tone={riskTone}>{risk}</Badge></div>
        </>
      )}
      {node.delta7d && <div style={{ color: node.delta7d.direction === 'up' ? '#22C55E' : '#FF4444', marginTop:4 }}>7d: {node.delta7d.direction === 'up' ? '▲' : '▼'} {node.delta7d.percent}%</div>}
      <div style={{ color:'rgba(30,26,20,0.4)', marginTop:6, fontSize:11 }}>Click to explore →</div>
    </div>
  );
}

HoverTooltip.propTypes = {
  node: PropTypes.shape({
    label: PropTypes.string,
    riskScore: PropTypes.number,
    _walletB: PropTypes.bool,
    type: PropTypes.string,
    volumeUSD: PropTypes.number,
    interactions: PropTypes.number,
    volumeEstimated: PropTypes.bool,
    delta7d: PropTypes.shape({
      direction: PropTypes.string,
      percent: PropTypes.number,
    }),
  }),
  x: PropTypes.number,
  y: PropTypes.number,
  compareData: PropTypes.shape({
    nodes: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string,
      volumeUSD: PropTypes.number,
      interactions: PropTypes.number,
    })),
  }),
};
