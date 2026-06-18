import {
  CANONICAL_ROOT_DOMAIN,
  CANONICAL_ORIGIN,
  PRODUCTS,
  SUBDOMAIN_TO_PRODUCT_ID,
  LEGACY_PATH_TO_PRODUCT_ID,
  COMPONENT_ROUTE_TO_PRODUCT_ID,
} from './products.js';

export function getProductFromHostname(hostname) {
  const sub = String(hostname || '').toLowerCase().split('.')[0];
  const productId = SUBDOMAIN_TO_PRODUCT_ID[sub];
  return productId ? PRODUCTS[productId] : PRODUCTS.home;
}

export function getProductFromPath(pathname) {
  const productId = LEGACY_PATH_TO_PRODUCT_ID[pathname] ?? COMPONENT_ROUTE_TO_PRODUCT_ID[pathname];
  return productId ? PRODUCTS[productId] : PRODUCTS.home;
}

export function getProductById(productId) {
  return PRODUCTS[productId] ?? null;
}

export function isKnownProductSubdomain(hostname) {
  const sub = String(hostname || '').toLowerCase().split('.')[0];
  return sub in SUBDOMAIN_TO_PRODUCT_ID;
}

export function isCanonicalRootHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === CANONICAL_ROOT_DOMAIN || h === `www.${CANONICAL_ROOT_DOMAIN}`;
}

/**
 * Resolve product and componentRoute from a location-like object.
 *
 * Priority:
 * 1. Explicit pathname (not '/')
 * 2. Legacy ?view= param when pathname is '/'
 * 3. Known feature subdomain when pathname is '/'
 * 4. Home ('/')
 */
export function resolveProductRoute(location) {
  const pathname = location?.pathname ?? '/';
  const search = location?.search ?? '';
  const hostname = location?.hostname ?? '';

  if (pathname && pathname !== '/' && pathname !== '') {
    const productId = LEGACY_PATH_TO_PRODUCT_ID[pathname] ?? COMPONENT_ROUTE_TO_PRODUCT_ID[pathname];
    return {
      product: productId ? PRODUCTS[productId] : PRODUCTS.home,
      componentRoute: pathname,
    };
  }

  const view = new URLSearchParams(search).get('view');
  if (view) {
    const legacyPath = `/${view}`;
    const productId = LEGACY_PATH_TO_PRODUCT_ID[legacyPath];
    if (productId) {
      return {
        product: PRODUCTS[productId],
        componentRoute: PRODUCTS[productId].componentRoute,
      };
    }
  }

  if (isKnownProductSubdomain(hostname)) {
    const product = getProductFromHostname(hostname);
    return { product, componentRoute: product.componentRoute };
  }

  return { product: PRODUCTS.home, componentRoute: '/' };
}

function applyParamsToUrl(url, params) {
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
}

function isSubdomainChildRoute(route, product) {
  return Boolean(route && route !== '/' && route !== product.legacyPath && route !== product.componentRoute);
}

function isProductionDomain(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h === CANONICAL_ROOT_DOMAIN ||
    h === `www.${CANONICAL_ROOT_DOMAIN}` ||
    h.endsWith(`.${CANONICAL_ROOT_DOMAIN}`)
  );
}

/**
 * Build a URL for a product.
 *
 * On canonical domain (walletwall.org or *.walletwall.org): returns the
 * product's subdomain URL so navigation moves to the right origin.
 *
 * On localhost / Vercel preview / unknown host: returns a path-based URL
 * on the current origin so local dev works without DNS.
 *
 * Never rewrites /api/* paths.
 */
export function buildProductUrl(
  productId,
  route = '/',
  params = {},
  currentLocation = globalThis.window?.location,
) {
  const product = PRODUCTS[productId];
  if (!product) return route;

  if (route.startsWith('/api/')) return route;

  const hostname = String(currentLocation?.hostname || '');

  if (isProductionDomain(hostname) && product.subdomain) {
    const url = new URL(`https://${product.canonicalHost}/`);
    if (isSubdomainChildRoute(route, product)) url.pathname = route;
    applyParamsToUrl(url, params);
    return url.toString();
  }

  // Path-based fallback — preserve current origin, use route or componentRoute as path
  const base = currentLocation?.href || 'http://localhost/';
  const url = new URL(base);
  url.pathname = (route && route !== '/') ? route : product.componentRoute;
  url.search = '';
  applyParamsToUrl(url, params);
  return url.toString();
}

export function buildHomeUrl(currentLocation = globalThis.window?.location) {
  const hostname = String(currentLocation?.hostname || '');
  if (isProductionDomain(hostname)) return `${CANONICAL_ORIGIN}/`;
  const base = currentLocation?.href || 'http://localhost/';
  const url = new URL(base);
  url.pathname = '/';
  url.search = '';
  return url.toString();
}

export function buildWalletUrl(
  productId,
  chain,
  address,
  params = {},
  currentLocation = globalThis.window?.location,
) {
  return buildProductUrl(
    productId,
    `/wallet/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`,
    params,
    currentLocation,
  );
}

export function buildTokenUrl(
  productId,
  chain,
  address,
  params = {},
  currentLocation = globalThis.window?.location,
) {
  return buildProductUrl(
    productId,
    `/token/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`,
    params,
    currentLocation,
  );
}

export function isCrossSubdomainNavigation(
  targetUrl,
  currentLocation = globalThis.window?.location,
) {
  try {
    const currentBase = currentLocation?.href || 'http://localhost/';
    const target = new URL(targetUrl, currentBase);
    const current = new URL(currentBase);
    return target.hostname !== current.hostname;
  } catch {
    return false;
  }
}
