import { PRODUCTS, COMPONENT_ROUTE_TO_PRODUCT_ID } from './products.js';

export function getSeoMetadata(routePath) {
  const baseSeo = {
    title: 'WalletWall — Explore On-Chain Activity',
    description: 'Explore any Ethereum wallet — visualize on-chain activity as an interactive graph.',
    canonical: 'https://walletwall.org/',
    ogImage: 'https://walletwall.org/brand/wallet-wall-full-lockup.png'
  };

  const productId = COMPONENT_ROUTE_TO_PRODUCT_ID[routePath];
  if (!productId) return baseSeo;

  const product = PRODUCTS[productId];
  if (!product) return baseSeo;

  const title = productId === 'home' ? baseSeo.title : `${product.label} — WalletWall`;

  // Format path to not include trailing slash if it's not root
  const path = product.componentRoute === '/' ? '/' : product.componentRoute;
  const canonicalUrl = `https://walletwall.org${path}`;

  return {
    ...baseSeo,
    title,
    description: product.description || baseSeo.description,
    canonical: canonicalUrl,
  };
}

export function setSeo(routePath) {
  if (typeof document === 'undefined') return;

  const seo = getSeoMetadata(routePath);

  document.title = seo.title;

  const updateMetaTag = (selector, attribute, value) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      if (selector.startsWith('meta[name=')) {
        el.setAttribute('name', selector.match(/name="([^"]+)"/)[1]);
      } else if (selector.startsWith('meta[property=')) {
        el.setAttribute('property', selector.match(/property="([^"]+)"/)[1]);
      }
      document.head.appendChild(el);
    }
    el.setAttribute(attribute, value);
  };

  const updateLinkTag = (rel, href) => {
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  };

  updateMetaTag('meta[name="description"]', 'content', seo.description);

  updateLinkTag('canonical', seo.canonical);

  updateMetaTag('meta[property="og:title"]', 'content', seo.title);
  updateMetaTag('meta[property="og:description"]', 'content', seo.description);
  updateMetaTag('meta[property="og:url"]', 'content', seo.canonical);
  updateMetaTag('meta[property="og:image"]', 'content', seo.ogImage);

  updateMetaTag('meta[name="twitter:title"]', 'content', seo.title);
  updateMetaTag('meta[name="twitter:description"]', 'content', seo.description);
  updateMetaTag('meta[name="twitter:image"]', 'content', seo.ogImage);
  updateMetaTag('meta[name="twitter:card"]', 'content', 'summary_large_image');
}
