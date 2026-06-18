const LOG_PREFIX = '[dune-route-diagnostics]';

function countRows(rows) {
  return Array.isArray(rows) ? rows.length : null;
}

export function sanitizeDiagnosticMessage(value, queryId = null) {
  const rawQueryId = String(queryId ?? '').trim();
  const maskedQueryId = maskQueryId(rawQueryId);
  let message = String(value?.message || value);
  if (rawQueryId && maskedQueryId) {
    message = message.split(rawQueryId).join(maskedQueryId);
  }
  message = message.replace(/DUNE_API_KEY\s*=\s*[^,\s]+/gi, 'DUNE_API_KEY=[redacted]');
  return message.slice(0, 240);
}

function normalizeMessages(values = [], queryId = null) {
  return values
    .filter(Boolean)
    .map(value => sanitizeDiagnosticMessage(value, queryId));
}

export function maskQueryId(queryId) {
  const raw = String(queryId ?? '').trim();
  if (!raw) return null;
  if (raw.length <= 4) return `${raw.slice(0, 1)}***`;
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

export function buildDuneRouteDiagnostic({
  routeName,
  envVarName,
  queryId,
  result = null,
  rowsAfterLocalFiltering = null,
  warnings = [],
  errors = [],
} = {}) {
  const rowsReturnedByDune = countRows(result?.rows);
  const normalizedWarnings = normalizeMessages(warnings, queryId);
  const normalizedErrors = normalizeMessages(errors, queryId);
  const limit = Number.isFinite(Number(result?.limit)) ? Number(result?.limit) : null;

  if (limit != null && rowsReturnedByDune === limit) {
    normalizedWarnings.push(`Dune read returned exactly the configured limit (${limit}); increase read limit if rows appear truncated`);
  }
  if (result?.fromCache === true && rowsReturnedByDune === 0) {
    normalizedWarnings.push('Cached Dune result has zero rows; check Redis for a stale empty result');
  }
  if (queryId && rowsReturnedByDune === 0 && !result?.fromCache) {
    normalizedWarnings.push('Latest Dune result returned zero rows; confirm the query has completed at least one successful run');
  }

  return {
    routeName,
    envVarName,
    envConfigured: Boolean(queryId),
    queryIdConfigured: Boolean(queryId),
    queryIdMasked: maskQueryId(queryId),
    rowsReturnedByDune,
    rowsAfterLocalFiltering,
    queryRunAt: result?.queryRunAt ?? null,
    fromCache: Boolean(result?.fromCache),
    vercelEnv: process.env.VERCEL_ENV || null,
    warnings: normalizedWarnings,
    errors: normalizedErrors,
  };
}

export function logDuneRouteDiagnostic(details) {
  const diagnostic = buildDuneRouteDiagnostic(details);
  console.info(LOG_PREFIX, JSON.stringify(diagnostic));
  return diagnostic;
}

export function logDuneQueryNotConfigured({ routeName, envVarName, queryId, warning }) {
  return logDuneRouteDiagnostic({
    routeName,
    envVarName,
    queryId,
    rowsAfterLocalFiltering: 0,
    warnings: [warning],
  });
}

export function logDuneReadFailure({ routeName, envVarName, queryId, err, warnings = [], fallbackWarning }) {
  console.error(`[${routeName.replace('/api/', '')}] Dune fetch failed:`, sanitizeDiagnosticMessage(err, queryId));
  return logDuneRouteDiagnostic({
    routeName,
    envVarName,
    queryId,
    rowsAfterLocalFiltering: 0,
    warnings: fallbackWarning ? [...warnings, fallbackWarning] : warnings,
    errors: [err],
  });
}

export function logDuneReadSuccess({
  routeName,
  envVarName,
  queryId,
  result,
  rowsAfterLocalFiltering,
  warnings = [],
}) {
  if (!result) return null;
  return logDuneRouteDiagnostic({
    routeName,
    envVarName,
    queryId,
    result,
    rowsAfterLocalFiltering,
    warnings,
  });
}

export function createDuneRouteDiagnostics({ routeName, envVarName }) {
  return {
    queryNotConfigured({ queryId, warning }) {
      return logDuneQueryNotConfigured({ routeName, envVarName, queryId, warning });
    },
    readFailure({ queryId, err, warnings = [], fallbackWarning }) {
      return logDuneReadFailure({ routeName, envVarName, queryId, err, warnings, fallbackWarning });
    },
    readSuccess({ queryId, result, rowsAfterLocalFiltering, warnings = [] }) {
      return logDuneReadSuccess({ routeName, envVarName, queryId, result, rowsAfterLocalFiltering, warnings });
    },
  };
}
