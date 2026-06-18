import PropTypes from 'prop-types';
import Badge from './Badge.jsx';
import { buildSourceView, confidenceTone } from './dataSourceFormatting.js';

function TooltipRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="ww-source-tooltip-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

TooltipRow.propTypes = {
  label: PropTypes.string,
  value: PropTypes.string,
};

export default function DataSourceBadge({ compact = false, className = '', style, ...props }) {
  const view = buildSourceView(props);
  if (!view.label) return null;

  const warning = view.warnings[0];
  const title = [
    view.label,
    view.typeLabel,
    view.freshness,
    view.queryRunAt ? `Query run: ${view.queryRunAt}` : null,
    view.confidence ? `${view.confidence} confidence` : null,
    view.method,
    view.queryName ? `Query: ${view.queryName}` : null,
    view.queryId ? `Query ID: ${view.queryId}` : null,
    warning,
  ].filter(Boolean).join('\n');

  return (
    <span
      className={['ww-source-badge-wrap', className].filter(Boolean).join(' ')}
      style={style}
    >
      <Badge
        variant="data"
        tone={view.confidence ? confidenceTone(view.confidence) : undefined}
        title={title}
      >
        {compact || !view.freshness ? view.label : `${view.label} - ${view.freshness}`}
      </Badge>
      <span className="ww-source-tooltip" role="tooltip">
        <TooltipRow label="Source" value={view.label} />
        <TooltipRow label="Type" value={view.typeLabel} />
        <TooltipRow label="Freshness" value={view.freshness} />
        <TooltipRow label="Query run" value={view.queryRunAt} />
        <TooltipRow label="Confidence" value={view.confidence ? `${view.confidence} confidence` : null} />
        <TooltipRow label="Method" value={view.method} />
        <TooltipRow label="Query" value={view.queryName} />
        <TooltipRow label="Query ID" value={view.queryId} />
        {warning && <div className="ww-source-tooltip-warning">{warning}</div>}
      </span>
    </span>
  );
}

DataSourceBadge.propTypes = {
  compact: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
};
