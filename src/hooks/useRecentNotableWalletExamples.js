import { useEffect, useState } from 'react';
import { FALLBACK_EXAMPLE_WALLETS } from '../constants.js';

function shortAddr(addr) {
  const s = String(addr || '');
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function walletToExample(wallet) {
  return {
    query: wallet.address,
    label: shortAddr(wallet.address),
    tag: 'Recent notable wallet',
  };
}

export default function useRecentNotableWalletExamples() {
  const [examples, setExamples] = useState(FALLBACK_EXAMPLE_WALLETS);

  useEffect(() => {
    let mounted = true;
    fetch('/api/recent-notable-wallets')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!mounted) return;
        const wallets = Array.isArray(data?.wallets) ? data.wallets : [];
        if (wallets.length >= 3) setExamples(wallets.map(walletToExample));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  return examples;
}
