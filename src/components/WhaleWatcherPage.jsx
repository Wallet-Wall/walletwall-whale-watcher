import { useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import WhaleWatcher from './WhaleWatcher.jsx';
import StableSeerDrawer from './StableSeerDrawer.jsx';
import Badge from './Badge.jsx';
import { NODE_COLORS } from '../constants.js';
import { getUrlParam, setUrlParam } from '../lib/urlState.js';

export default function WhaleWatcherPage({ node, walletData, dune12wData, onClose, onExplore, initialStableSeerQuery, backLabel = 'Back' }) {
  const bg = '#FAF8F3';
  const fg = 'rgba(30,26,20,0.88)';
  const subFg = 'rgba(30,26,20,0.45)';
  const nodeColor = NODE_COLORS[node?.type] || '#B88A4A';

  const [stableSeerResult, setStableSeerResult] = useState(null);
  const [fetchedDune12wData, setFetchedDune12wData] = useState(null);
  const [dune12wLoading, setDune12wLoading] = useState(false);
  const [dune12wError, setDune12wError] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState(() => getUrlParam('wws'));
  const initialMrqConsumedRef = useRef(false);

  const handleClose = useCallback(() => {
    setUrlParam('wws', null);
    onClose();
  }, [onClose]);

  // Self-fetch 12-week activity when dune12wData wasn't pre-loaded by the caller
  // (e.g. direct node-click bypassing NodeDetailPanel). Non-critical: silently ignored on error.
  useEffect(() => {
    setFetchedDune12wData(null);
    setDune12wError(false);
    if (dune12wData || !node?.fullAddress) return setDune12wLoading(false);
    let mounted = true;
    setDune12wLoading(true);
    fetch(`/api/whale-watcher?address=${encodeURIComponent(node.fullAddress)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!mounted) return;
        if (data) {
          setFetchedDune12wData(data);
        } else {
          setDune12wError(true);
        }
      })
      .catch(() => {
        if (mounted) setDune12wError(true);
      })
      .finally(() => {
        if (mounted) setDune12wLoading(false);
      });
    return () => { mounted = false; };
  }, [node?.fullAddress, dune12wData]);

  const fetchAndSetStableSeer = useCallback(async (query) => {
    if (!query) {
      setStableSeerResult(null);
      return null;
    }

    try {
      const res = await fetch(`/api/stable-seer?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const result = data.results?.[0] ?? null;
      setStableSeerResult(result);
      return result;
    } catch {
      setStableSeerResult(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const handleKeydown = (e) => {
      if (e.key !== 'Escape') return;

      if (stableSeerResult) {
        setStableSeerResult(null);

        const url = new URL(globalThis.window.location.href);
        url.searchParams.delete('mrq');
        globalThis.window.history.pushState({ ww: true }, '', url.toString());
        return;
      }

      handleClose();
    };

    // We register popstate once without dependencies that change frequently.
    const handlePop = () => {
      const params = new URLSearchParams(globalThis.location.search);
      const wws = params.get('wws');
      setSelectedSignalId(wws);

      const mrq = params.get('mrq');
      if (mrq) {
        fetchAndSetStableSeer(mrq);
      } else {
        setStableSeerResult(null);
      }

      const ww = params.get('ww');
      const isWatchlist = globalThis.location.pathname === '/watchlist';
      if (!ww && !isWatchlist && !globalThis.location.pathname.startsWith('/wallet')) {
         handleClose();
      }
    };

    globalThis.addEventListener('keydown', handleKeydown);
    globalThis.addEventListener('popstate', handlePop);
    return () => {
      globalThis.removeEventListener('keydown', handleKeydown);
      globalThis.removeEventListener('popstate', handlePop);
    };
  }, [handleClose, fetchAndSetStableSeer, stableSeerResult]);

  const handleSelectSignal = useCallback((signalId) => {
    setSelectedSignalId(signalId);
    const url = new URL(globalThis.window.location.href);
    if (signalId == null) {
      url.searchParams.delete('wws');
    } else {
      url.searchParams.set('wws', signalId);
    }
    globalThis.window.history.pushState({ ww: true }, '', url.toString());
  }, []);

  const handleOpenStableSeer = useCallback(async (query) => {
    const url = new URL(globalThis.window.location.href);

    if (!query) {
      url.searchParams.delete('mrq');
      globalThis.window.history.pushState({ ww: true }, '', url.toString());
      setStableSeerResult(null);
      return null;
    }

    url.searchParams.set('mrq', query);
    globalThis.window.history.pushState({ ww: true }, '', url.toString());

    return fetchAndSetStableSeer(query);
  }, [fetchAndSetStableSeer]);

  useEffect(() => {
    if (initialMrqConsumedRef.current) return;
    const params = new URLSearchParams(globalThis.window.location.search);
    const mrq = params.get('mrq');
    const effectiveQuery = initialStableSeerQuery || mrq;
    if (!effectiveQuery) return;
    initialMrqConsumedRef.current = true;
    handleOpenStableSeer(effectiveQuery);
  }, [initialStableSeerQuery, handleOpenStableSeer]);

  return (
    <>
      <div className="whale-watcher-page" style={{ position: 'fixed', inset: 0, zIndex: 80, background: bg, color: fg, overflowY: 'auto' }}>
        <div style={{ position: 'sticky', top: 0, background: bg, borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', zIndex: 90 }}>
          <button
            onClick={handleClose}
            title={backLabel}
            aria-label={backLabel}
            style={{ background: 'none', border: 'none', color: fg, cursor: 'pointer', fontSize: 20, padding: '0 4px' }}
          >
            ←
          </button>
          <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: nodeColor, display: 'inline-block' }} />
            <strong style={{ fontSize: 18 }}>{node?.label || node?.id}</strong>
            {node?.type && <Badge variant="entity">{node.type}</Badge>}
            <span style={{ fontSize: 11, color: subFg, letterSpacing: 1.5, textTransform: 'uppercase' }}>Whale Watcher</span>
          </div>
          {onExplore && (
            <button
              type="button"
              onClick={onExplore}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                background: 'rgba(191,78,50,0.10)',
                border: '1px solid rgba(191,78,50,0.28)',
                borderRadius: 4,
                color: '#BF4E32',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Open in Coinstellation →
            </button>
          )}
          {!onExplore && (
            <div style={{ fontSize: 12, color: subFg, maxWidth: 340, textAlign: 'right', lineHeight: 1.4 }}>
              What does this wallet/node activity mean?
            </div>
          )}
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
          <WhaleWatcher
            node={node}
            walletData={walletData}
            dune12wData={dune12wData ?? fetchedDune12wData}
            dune12wLoading={dune12wLoading}
            dune12wError={dune12wError}
            onOpenStableSeer={handleOpenStableSeer}
            selectedSignalId={selectedSignalId}
            onSelectSignal={handleSelectSignal}
          />
        </div>
      </div>

      {stableSeerResult && (
        <StableSeerDrawer result={stableSeerResult} onClose={() => {
          setStableSeerResult(null);
          const url = new URL(globalThis.window.location.href);
          url.searchParams.delete('mrq');
          globalThis.window.history.pushState({ ww: true }, '', url.toString());
        }} />
      )}
    </>
  );
}

WhaleWatcherPage.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string,
    label: PropTypes.string,
    fullAddress: PropTypes.string,
  }),
  walletData: PropTypes.object,
  dune12wData: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onExplore: PropTypes.func,
  initialStableSeerQuery: PropTypes.string,
  backLabel: PropTypes.string,
};
