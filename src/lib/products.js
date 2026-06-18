export const CANONICAL_ROOT_DOMAIN = 'walletwall.org';
export const CANONICAL_ORIGIN = 'https://walletwall.org';

export const PRODUCTS = {
  home: {
    id: 'home',
    label: 'WalletWall',
    subdomain: null,
    canonicalHost: 'walletwall.org',
    legacyPath: '/',
    componentRoute: '/',
    canonicalPath: '/',
    description: 'Global homepage and product launcher',
    iconKey: 'home',
  },
  whales: {
    id: 'whales',
    label: 'Whale Watcher',
    subdomain: 'whales',
    canonicalHost: 'whales.walletwall.org',
    legacyPath: '/whale-watcher',
    componentRoute: '/whale-watcher',
    canonicalPath: '/',
    description: 'Wallet activity and on-chain signals',
    iconKey: 'whales',
  },
};

export const PRODUCT_LIST = Object.values(PRODUCTS);

export const SUBDOMAIN_TO_PRODUCT_ID = Object.fromEntries(
  PRODUCT_LIST
    .filter(p => p.subdomain)
    .map(p => [p.subdomain, p.id]),
);

export const LEGACY_PATH_TO_PRODUCT_ID = Object.fromEntries(
  PRODUCT_LIST
    .filter(p => p.legacyPath !== '/')
    .map(p => [p.legacyPath, p.id]),
);

export const COMPONENT_ROUTE_TO_PRODUCT_ID = Object.fromEntries(
  PRODUCT_LIST
    .filter(p => p.componentRoute !== '/')
    .map(p => [p.componentRoute, p.id]),
);
