export const NODE_COLORS = { token: '#B88A4A', defi: '#D4705A', nft: '#2F8F67', wallet: '#BF4E32', counterparty: '#C9A47A', anomaly: '#FF4444' };

export const RADAR_EXAMPLES = [
  { symbol: 'USDT' },  { symbol: 'USDC' },  { symbol: 'DAI' },
  { symbol: 'FRAX' },  { symbol: 'PYUSD' }, { symbol: 'USDE' },
  { symbol: 'sUSDE' }, { symbol: 'GHO' },   { symbol: 'crvUSD' },
  { symbol: 'LUSD' },  { symbol: 'TUSD' },  { symbol: 'USDP' }
];

export const FALLBACK_EXAMPLE_WALLETS = [
  { query: 'vitalik.eth',      label: 'vitalik.eth',      tag: 'Ethereum founder' },
  { query: 'hayden.eth',       label: 'hayden.eth',       tag: 'Uniswap founder' },
  { query: 'stani.eth',        label: 'stani.eth',        tag: 'Aave founder' },
  { query: 'punk6529.eth',     label: 'punk6529.eth',     tag: 'NFT maximalist' },
  { query: 'cozomo.eth',       label: 'cozomo.eth',       tag: 'NFT collector' },
  { query: 'pranksy.eth',      label: 'pranksy.eth',      tag: 'NFT whale' },
  { query: 'lemiscate.eth',    label: 'lemiscate.eth',    tag: 'DeFi power user' },
  { query: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: '0xd8dA…6045', tag: 'Vitalik alt' },
  { query: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', label: '0x47ac…6503', tag: 'Binance whale' },
  { query: '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97', label: '0x4838…5f97', tag: 'ETH mega-holder' },
];

export const EXAMPLE_WALLETS = FALLBACK_EXAMPLE_WALLETS;

export const WHALE_WATCHER_PATH = '/whale-watcher';
export const FULLSCREEN_WALLET_LOADER_DELAY_MS = 700;

export const MINTLIFY_DOCS_URL = 'https://docs.walletwall.org';
