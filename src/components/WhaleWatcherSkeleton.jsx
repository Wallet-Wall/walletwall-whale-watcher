const SKELETON_CELL_IDS = Array.from({ length: 84 }, (_, i) => `heatmap-${i}`);

export default function WhaleWatcherSkeleton() {
  return (
    <div className="whale-watcher-page" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#FAF8F3', color: 'rgba(30,26,20,0.88)', overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, background: '#FAF8F3', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 24px', display: 'flex', gap: 12, alignItems: 'center', zIndex: 90 }}>
        <div className="ww-skeleton-block" style={{ width: 28, height: 24 }} />
        <div className="ww-skeleton-block" style={{ width: 12, height: 12, borderRadius: 999 }} />
        <div className="ww-skeleton-block" style={{ width: 210, height: 20 }} />
        <div className="ww-skeleton-block" style={{ width: 86, height: 18 }} />
      </div>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="ww-card ww-card-sharp ww-skeleton-card" style={{ padding: 20 }}>
          <div className="ww-skeleton-block" style={{ width: 170, height: 12, marginBottom: 18 }} />
          <div className="ww-skeleton-grid">
            {[0, 1, 2, 3].map(item => (
              <div key={item}>
                <div className="ww-skeleton-block" style={{ width: 92, height: 10, marginBottom: 8 }} />
                <div className="ww-skeleton-block" style={{ width: 118, height: 20 }} />
              </div>
            ))}
          </div>
          <div className="ww-skeleton-block" style={{ width: '78%', height: 14, marginTop: 22 }} />
          <div className="ww-skeleton-block" style={{ width: '63%', height: 14, marginTop: 8 }} />
        </div>
        <div className="ww-card ww-card-sharp ww-skeleton-card" style={{ padding: 20 }}>
          <div className="ww-skeleton-block" style={{ width: 140, height: 12, marginBottom: 14 }} />
          <div className="ww-skeleton-heatmap">
            {SKELETON_CELL_IDS.map(id => (
              <span key={id} className="ww-skeleton-cell" />
            ))}
          </div>
        </div>
        <div className="ww-skeleton-grid">
          <div className="ww-card ww-card-sharp ww-skeleton-card" style={{ padding: 20, minHeight: 150 }} />
          <div className="ww-card ww-card-sharp ww-skeleton-card" style={{ padding: 20, minHeight: 150 }} />
        </div>
      </div>
    </div>
  );
}
