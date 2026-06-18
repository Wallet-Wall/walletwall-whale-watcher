import PropTypes from 'prop-types';
import { useState } from 'react';

export default function FingerprintBadge({ score, onCopy }) {
  const [open, setOpen] = useState(false);
  if (!score) return null;
  const { total, breakdown } = score;
  const dims = [
    ['DeFi Sophistication', breakdown.defiSophistication],
    ['Protocol Diversity', breakdown.protocolDiversity],
    ['Gas Efficiency', breakdown.gasEfficiency],
    ['Risk Management', breakdown.riskManagement],
    ['Activity Consistency', breakdown.activityConsistency],
  ];
  const dots = (val) => Array.from({length:5},(_,i) => (
    <span key={i} style={{
      width:10,
      height:6,
      borderRadius:2,
      display:'inline-block',
      background: i < Math.round(val/4) ? '#BF4E32' : 'rgba(139,49,32,0.12)',
      boxShadow: i < Math.round(val/4) ? 'inset 1px 1px 0 rgba(255,255,255,0.22)' : 'none',
    }} />
  ));
  return (
    <div style={{ position:'relative' }}>
      <button className="ww-button" onClick={() => setOpen(!open)} style={{ padding:'6px 12px', color:'#BF4E32', cursor:'pointer', fontSize:13, fontWeight:700 }}>
        ◎ {total}/100
      </button>
      {open && (
        <div className="glass" style={{ position:'absolute', right:0, top:'110%', width:260, padding:16, borderRadius:6, zIndex:100 }}>
          <div className="ww-label" style={{ marginBottom:8 }}>FINGERPRINT SCORE</div>
          <div style={{ fontSize:28, fontWeight:800, marginBottom:4, color:'rgba(30,26,20,0.88)' }}>{total} <span style={{ fontSize:14, fontWeight:500, color:'rgba(30,26,20,0.45)' }}>/ 100</span></div>
          <div style={{ width:'100%', height:4, background:'rgba(139,49,32,0.10)', borderRadius:3, marginBottom:14, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'linear-gradient(90deg,#BF4E32,#D4705A)', width:`${total}%`, borderRadius:4 }} />
          </div>
          {dims.map(([label, val]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, fontSize:12 }}>
              <span style={{ color:'rgba(30,26,20,0.68)' }}>{label}</span>
              <span style={{ display:'inline-flex', gap:3 }}>{dots(val)}</span>
            </div>
          ))}
          <button className="ww-button-primary" onClick={() => { onCopy(); setOpen(false); }} style={{ marginTop:12, width:'100%', padding:'8px', fontSize:12 }}>
            [Copy Card]
          </button>
        </div>
      )}
    </div>
  );
}

FingerprintBadge.propTypes = {
  score: PropTypes.shape({
    total: PropTypes.number,
    breakdown: PropTypes.shape({
      defiSophistication: PropTypes.number,
      protocolDiversity: PropTypes.number,
      gasEfficiency: PropTypes.number,
      riskManagement: PropTypes.number,
      activityConsistency: PropTypes.number,
    }),
  }),
  onCopy: PropTypes.func,
};
