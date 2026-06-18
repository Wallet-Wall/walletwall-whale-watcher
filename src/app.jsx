import '@fontsource/sora/400.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';

import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';

import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import { Suspense, lazy, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import WhaleWatcherEntryPage from './components/WhaleWatcherEntryPage.jsx';
import WhaleWatcherSkeleton from './components/WhaleWatcherSkeleton.jsx';
import { DelayedLoader } from './components/loading/index.js';

const WhaleWatcherPage = lazy(() => import('./components/WhaleWatcherPage.jsx'));

function App() {
  const [activeNode, setActiveNode] = useState(null);
  const [walletData, setWalletData] = useState(null);

  const handleDeepDive = useCallback((node, data) => {
    setActiveNode(node || null);
    setWalletData(data || null);
  }, []);

  const handleClose = useCallback(() => {
    setActiveNode(null);
    setWalletData(null);
  }, []);

  return (
    <div style={{ minHeight: '100vh', height: '100dvh', background: '#FAF8F3', color: 'rgba(30,26,20,0.88)' }}>
      <Analytics />
      <WhaleWatcherEntryPage
        walletData={walletData}
        onDeepDive={handleDeepDive}
        onNavigate={() => {}}
      />
      {activeNode && (
        <Suspense fallback={<DelayedLoader label="Indexing wallet activity"><WhaleWatcherSkeleton /></DelayedLoader>}>
          <WhaleWatcherPage
            node={activeNode}
            walletData={walletData}
            dune12wData={null}
            onClose={handleClose}
            onExplore={null}
            backLabel="Back to Whale Watcher"
          />
        </Suspense>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
