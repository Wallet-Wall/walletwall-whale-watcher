import PropTypes from 'prop-types';
import './loading.css';

/**
 * Base skeleton primitive. Renders warm-stone blocks on dark surfaces
 * with a restrained terracotta shimmer.
 *
 * variant:
 *   'block'  – rectangular block (default)
 *   'text'   – shorter, line-height-matched block
 *   'pill'   – fully rounded
 *   'circle' – circular node
 *   'card'   – card-shaped container (renders children inside)
 */
export default function WalletWallSkeleton({
  variant = 'block',
  width,
  height,
  radius,
  className = '',
  style = {},
  children,
  'aria-hidden': ariaHidden = true,
}) {
  const base = {
    block:  { className: 'ww-skeleton-block',  defaults: { height: 14 } },
    text:   { className: 'ww-skeleton-line',   defaults: { height: 11 } },
    pill:   { className: 'ww-skeleton-pill',   defaults: { height: 20, width: 60 } },
    circle: { className: 'ww-skeleton-circle', defaults: { width: 32, height: 32 } },
    card:   { className: 'ww-skeleton-card ww-card',   defaults: {} },
  }[variant] ?? { className: 'ww-skeleton-block', defaults: { height: 14 } };

  const merged = {
    ...base.defaults,
    ...(width  != null && { width }),
    ...(height != null && { height }),
    ...(radius != null && { borderRadius: radius }),
    ...style,
  };

  return (
    <span
      className={[base.className, className].filter(Boolean).join(' ')}
      style={merged}
      aria-hidden={ariaHidden}
    >
      {children}
    </span>
  );
}

WalletWallSkeleton.propTypes = {
  variant:      PropTypes.oneOf(['block', 'text', 'pill', 'circle', 'card']),
  width:        PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height:       PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  radius:       PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className:    PropTypes.string,
  style:        PropTypes.object,
  children:     PropTypes.node,
  'aria-hidden': PropTypes.bool,
};
