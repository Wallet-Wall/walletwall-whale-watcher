import React from 'react';
import PropTypes from 'prop-types';

/**
 * Base properties for WalletWall Icons.
 * Icons are 24x24 viewBox, stroke-based, with no fill.
 * They are designed to feel etched, architectural, and ancient-tech.
 */
const IconBase = ({ children, className = '', style = {}, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`ww-icon ${className}`}
    style={{ ...style }}
    {...props}
  >
    {children}
  </svg>
);

/**
 * 1. Quantum Intelligence
 * A diamond/hexagon with a center node and radiating lines. Resembles an ancient rune or network node.
 */
export const QuantumIcon = (props) => (
  <IconBase {...props}>
    <polygon points="12 2 22 12 12 22 2 12 12 2" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="9" />
    <line x1="12" y1="15" x2="12" y2="22" />
    <line x1="2" y1="12" x2="9" y2="12" />
    <line x1="15" y1="12" x2="22" y2="12" />
    <line x1="5" y1="5" x2="10" y2="10" />
    <line x1="19" y1="19" x2="14" y2="14" />
  </IconBase>
);

/**
 * 2. Whale
 * Geometric, origami-style whale tail diving into stepped waves.
 */
export const WhaleIcon = (props) => (
  <IconBase {...props}>
    {/* Waves / Water surface */}
    <path d="M2 18h4l2-2h8l2 2h4" />
    {/* Tail structure */}
    <path d="M12 16v-6c0-2-2-4-5-5 3 0 5 1 5 3 0-2 2-3 5-3-3 1-5 3-5 5v6" />
    <path d="M7 5l5 5 5-5" />
  </IconBase>
);

/**
 * 3. Brick
 * A single 3D rectangular block with chiseled edges.
 */
export const BrickIcon = (props) => (
  <IconBase {...props}>
    <path d="M3 10l9-4 9 4v8l-9 4-9-4v-8z" />
    <path d="M3 10l9 4 9-4" />
    <path d="M12 14v8" />
  </IconBase>
);

/**
 * 4. Masonry
 * A staggered pattern of brick lines, like a wall section.
 */
export const MasonryIcon = (props) => (
  <IconBase {...props}>
    <rect x="2" y="4" width="20" height="16" rx="1" />
    <line x1="2" y1="9" x2="22" y2="9" />
    <line x1="2" y1="14" x2="22" y2="14" />
    <line x1="10" y1="4" x2="10" y2="9" />
    <line x1="16" y1="9" x2="16" y2="14" />
    <line x1="6" y1="9" x2="6" y2="14" />
    <line x1="12" y1="14" x2="12" y2="20" />
  </IconBase>
);

/**
 * 5. Wallet
 * Structured, ledger-like book or physical stone wallet.
 */
export const WalletIcon = (props) => (
  <IconBase {...props}>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
    <path d="M20 10H8a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h12" />
    <circle cx="15" cy="12" r="1" />
  </IconBase>
);

/**
 * 6. Coin
 * Circle with a geometric square or diamond in the center (ancient coin style).
 */
export const CoinIcon = (props) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" transform="rotate(45 12 12)" />
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M3 12h3" />
    <path d="M18 12h3" />
  </IconBase>
);

/**
 * 7. Holder Wall
 * Grid/wall structure with a central highlighted block/cluster.
 */
export const HolderWallIcon = (props) => (
  <IconBase {...props}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <rect x="9" y="9" width="6" height="6" fill="currentColor" fillOpacity="0.2" />
  </IconBase>
);

/**
 * 8. Stable Seer
 * Arcs of a radar over a stepped pyramid or market grid.
 */
export const StableSeerIcon = (props) => (
  <IconBase {...props}>
    <path d="M12 20v-8" />
    <path d="M4 20l8-8 8 8" />
    <path d="M7 11a7 7 0 0 1 10 0" />
    <path d="M4 7a11 11 0 0 1 16 0" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </IconBase>
);

/**
 * 9. Signal / Insights
 * Stylized beacon or stacked bars radiating waves.
 */
export const SignalIcon = (props) => (
  <IconBase {...props}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
    <path d="M15 7l-3-3-3 3" />
  </IconBase>
);

/**
 * 10. Security / Trust
 * Geometric shield with a central keyhole or masonry lock.
 */
export const SecurityIcon = (props) => (
  <IconBase {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <circle cx="12" cy="11" r="2" />
    <path d="M12 13v3" />
  </IconBase>
);

/**
 * 11. Graph / Network
 * Nodes connected by angular lines, like a constellation on stone.
 */
export const GraphIcon = (props) => (
  <IconBase {...props}>
    <circle cx="18" cy="5" r="2" />
    <circle cx="6" cy="10" r="2" />
    <circle cx="12" cy="19" r="2" />
    <line x1="16.5" y1="6.5" x2="7.5" y2="8.5" />
    <line x1="7.5" y1="11.5" x2="10.5" y2="17.5" />
    <line x1="13.5" y1="17.5" x2="16.5" y2="6.5" />
  </IconBase>
);

/**
 * 12. Search / Explore
 * Classic magnifying glass but with an angular, geometric handle and eye/focus ring.
 */
export const SearchIcon = (props) => (
  <IconBase {...props}>
    <circle cx="10" cy="10" r="6" />
    <line x1="21" y1="21" x2="15" y2="15" />
    <path d="M10 7v3h3" />
  </IconBase>
);

/**
 * 13. Concentration
 * Inverted pyramid — widest bar at top narrows downward, showing value concentrated at the top.
 */
export const ConcentrationIcon = (props) => (
  <IconBase {...props}>
    <rect x="3"  y="5"  width="18" height="3" rx="1" />
    <rect x="6"  y="11" width="12" height="3" rx="1" />
    <rect x="9"  y="17" width="6"  height="3" rx="1" />
  </IconBase>
);

/**
 * 14. Entity Mix
 * Asymmetric treemap-style grid — four unequal cells showing compositional breakdown.
 */
export const EntityMixIcon = (props) => (
  <IconBase {...props}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <line x1="14" y1="3"  x2="14" y2="21" />
    <line x1="3"  y1="11" x2="14" y2="11" />
    <line x1="14" y1="15" x2="21" y2="15" />
  </IconBase>
);

/**
 * 15. Freshness / Data currency
 * Hourglass — two funnel halves joined at a narrow waist, classic time/expiry symbol.
 */
export const FreshnessIcon = (props) => (
  <IconBase {...props}>
    <line x1="5" y1="3"  x2="19" y2="3"  />
    <line x1="5" y1="21" x2="19" y2="21" />
    <path d="M5 3l7 8 7-8"   />
    <path d="M5 21l7-8 7 8"  />
    <line x1="10" y1="11" x2="14" y2="11" />
  </IconBase>
);

/**
 * 16. Divergence / Activity–value split
 * Fork from a single stem into two branches — signals entities whose activity and value diverge.
 */
export const DivergenceIcon = (props) => (
  <IconBase {...props}>
    <line x1="12" y1="3"  x2="12" y2="10" />
    <line x1="12" y1="10" x2="5"  y2="19" />
    <line x1="12" y1="10" x2="19" y2="19" />
    <polyline points="3 16 5 19 8 16"   />
    <polyline points="16 16 19 19 22 16" />
  </IconBase>
);

// PropTypes for the private base and all exported icon wrappers (S6774).
// Icons accept arbitrary SVG/HTML attributes via props spread; className and
// style are the only explicitly named props — the rest flow through as-is.
IconBase.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object,
};

const iconPropTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
};

QuantumIcon.propTypes   = iconPropTypes;
WhaleIcon.propTypes     = iconPropTypes;
BrickIcon.propTypes     = iconPropTypes;
MasonryIcon.propTypes   = iconPropTypes;
WalletIcon.propTypes    = iconPropTypes;
CoinIcon.propTypes      = iconPropTypes;
HolderWallIcon.propTypes  = iconPropTypes;
StableSeerIcon.propTypes = iconPropTypes;
SignalIcon.propTypes    = iconPropTypes;
SecurityIcon.propTypes  = iconPropTypes;
GraphIcon.propTypes     = iconPropTypes;
SearchIcon.propTypes         = iconPropTypes;
ConcentrationIcon.propTypes  = iconPropTypes;
EntityMixIcon.propTypes      = iconPropTypes;
FreshnessIcon.propTypes      = iconPropTypes;
DivergenceIcon.propTypes     = iconPropTypes;
