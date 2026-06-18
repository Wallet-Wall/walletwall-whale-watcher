import PropTypes from 'prop-types';
import Badge from './Badge.jsx';

const TAN = '201,164,122';
const TAN_DARK = '139,109,62';

export default function ActivityHeatmap({ timeline }) {
  const days = {};
  (timeline || []).forEach(d => { days[d.date] = d.txCount || 0; });

  // Anchor to the wallet's most recent activity so the heatmap is
  // useful even for wallets that haven't been active in months.
  const allMs = Object.keys(days).map(k => new Date(k).getTime()).filter(Number.isFinite);
  const anchor = allMs.length ? Math.max(...allMs) : Date.now();
  const isRecent = (Date.now() - anchor) < 84 * 86400000; // within last 12 weeks
  const anchorLabel = new Date(anchor).toLocaleDateString('en-US', { month:'short', year:'numeric' });

  const maxTx = Math.max(1, ...Object.values(days));
  const activeDateKeys = Object.keys(days).sort((a, b) => String(a).localeCompare(String(b)));
  const showRecentWindow = activeDateKeys.length > 0 && activeDateKeys.length <= 2;

  if (showRecentWindow) {
    const cells = [];
    for (let d = 1; d >= 0; d--) {
      const dt = new Date(anchor - d * 86400000).toISOString().slice(0, 10);
      cells.push({ date: dt, count: days[dt] || 0 });
    }
    const hasAnyActivity = cells.some(c => c.count > 0);
    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="ww-label" style={{ marginBottom: 4 }}>Activity 48h</div>
          {!isRecent && <Badge variant="time" tone="muted">ending {anchorLabel}</Badge>}
        </div>
        {hasAnyActivity ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:6 }}>
            {cells.map(({ date, count }) => {
              const intensity = count / maxTx;
              return (
                <div key={date} title={`${date}: ${count} tx${count === 1 ? '' : 's'}`}
                  style={{
                    minHeight:70,
                    borderRadius:2,
                    background: count ? `rgba(${TAN},${0.12 + intensity * 0.82})` : 'rgba(30,26,20,0.06)',
                    border:`1px solid rgba(${TAN_DARK},0.16)`,
                    boxShadow: count ? `inset 1px 1px 0 rgba(255,255,255,0.24), inset -1px -1px 0 rgba(${TAN_DARK},0.16)` : 'none',
                    display:'flex',
                    alignItems:'end',
                    justifyContent:'space-between',
                    padding:'8px 10px',
                    color: count && intensity > 0.55 ? '#FAF8F3' : 'rgba(30,26,20,0.62)',
                    fontSize:11,
                    fontWeight:600,
                  }}>
                  <span>{new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday:'short' })}</span>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color:'rgba(30,26,20,0.4)', fontSize:13 }}>No activity data</div>
        )}
      </div>
    );
  }

  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const week = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(anchor - (w * 7 + d) * 86400000).toISOString().slice(0, 10);
      week.push({ date: dt, count: days[dt] || 0 });
    }
    weeks.push(week);
  }

  const hasAnyActivity = weeks.some(wk => wk.some(c => c.count > 0));

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div className="ww-label" style={{ marginBottom: 4 }}>Activity 12 weeks</div>
        {!isRecent && <Badge variant="time" tone="muted">ending {anchorLabel}</Badge>}
      </div>
      {hasAnyActivity ? (
        <div style={{ display:'grid', gridTemplateColumns:`repeat(12,1fr)`, gap:3 }}>
          {weeks.map((week) => (
            <div key={week[0]?.date} style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {week.map(({ date, count }) => {
                const intensity = count / maxTx;
                return (
                  <div key={date} title={`${date}: ${count} tx${count === 1 ? '' : 's'}`}
                    style={{ width:'100%', paddingBottom:'100%', borderRadius:2,
                      background: count ? `rgba(${TAN},${0.08 + intensity * 0.85})` : `rgba(${TAN},0.04)`,
                      border:`1px solid rgba(${TAN_DARK},${count ? '0.12' : '0.06'})` }} />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color:'rgba(30,26,20,0.4)', fontSize:13 }}>No activity data</div>
      )}
    </div>
  );
}

ActivityHeatmap.propTypes = {
  timeline: PropTypes.arrayOf(PropTypes.object),
};
