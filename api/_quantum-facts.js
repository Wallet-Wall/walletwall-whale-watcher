import { getOrCache, readOrCache } from './_dune.js';

export const DUNE_QUANTUM_SOURCES = Object.freeze({
  DORMANCY: 'dune:dormant-quantum-exposure',
  SIGNATURE: 'dune:wallet-signature-exposure',
  VALUE_AT_RISK: 'dune:quantum-value-at-risk',
  MIGRATION: 'dune:wallet-migration-readiness',
  COUNTERPARTY_CONTEXT: 'dune:quantum-counterparty-context',
  ADVERSARIAL_HEURISTICS: 'dune:quantum-adversarial-heuristics',
});

const QUERY_CONFIGS = Object.freeze([
  {
    key: 'dormancy',
    envName: 'DUNE_QUERY_DORMANT_QUANTUM_EXPOSURE',
    source: DUNE_QUANTUM_SOURCES.DORMANCY,
    mode: 'scheduled',
  },
  {
    key: 'signatureExposure',
    envName: 'DUNE_QUERY_WALLET_SIGNATURE_EXPOSURE',
    source: DUNE_QUANTUM_SOURCES.SIGNATURE,
    mode: 'wallet',
  },
  {
    key: 'valueAtRisk',
    envName: 'DUNE_QUERY_QUANTUM_VALUE_AT_RISK',
    source: DUNE_QUANTUM_SOURCES.VALUE_AT_RISK,
    mode: 'wallet',
  },
  {
    key: 'migrationReadiness',
    envName: 'DUNE_QUERY_WALLET_MIGRATION_READINESS',
    source: DUNE_QUANTUM_SOURCES.MIGRATION,
    mode: 'wallet',
  },
  {
    key: 'counterpartyContext',
    envName: 'DUNE_QUERY_QUANTUM_COUNTERPARTY_CONTEXT',
    source: DUNE_QUANTUM_SOURCES.COUNTERPARTY_CONTEXT,
    mode: 'wallet',
  },
  {
    key: 'adversarialHeuristics',
    envName: 'DUNE_QUERY_QUANTUM_ADVERSARIAL_HEURISTICS',
    source: DUNE_QUANTUM_SOURCES.ADVERSARIAL_HEURISTICS,
    mode: 'wallet',
  },
]);

const MAX_STRING_LENGTH = 120;
const MAX_HINT_LENGTH = 180;
const EMPTY_ROWS = Object.freeze({ rows: [], queryRunAt: null });
const ADDRESS_FIELDS = Object.freeze([
  'wallet_address',
  'walletAddress',
  'address',
  'wallet',
  'holder_address',
  'holderAddress',
]);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_WINDOW_DAYS = 3650;

function emptyQuantumFacts(warnings = []) {
  return {
    sourceMode: 'source-backed',
    sources: [],
    queryRunAt: null,
    signatureExposure: {
      status: 'unknown',
      signedTxCount: null,
      firstOutgoingTxAt: null,
      lastOutgoingTxAt: null,
      signatureScheme: 'unknown',
    },
    valueAtRisk: {
      totalBalanceUsd: null,
      nativeBalanceUsd: null,
      tokenBalanceUsd: null,
      topTokenSymbol: null,
      topTokenBalanceUsd: null,
      holderRank: null,
      supplyShare: null,
    },
    migrationReadiness: {
      isContract: null,
      multisigStatus: 'unknown',
      timelockStatus: 'unknown',
      guardianStatus: 'unknown',
      migrationReadinessHint: null,
    },
    dormancy: {
      daysDormant: null,
      dormancyBucket: null,
      lastActiveAt: null,
    },
    counterpartyContext: {
      chain: null,
      topCounterparty: null,
      topCounterpartyLabel: null,
      topCounterpartyCategory: null,
      counterpartyCount30d: null,
      largestCounterpartyFlowUsd: null,
      largestCounterpartyFlowEth: null,
      exchangeCounterpartyCount: null,
      contractCounterpartyCount: null,
      freshWalletCounterpartyCount: null,
      repeatedCounterpartyCount: null,
      queryWindowStart: null,
      queryWindowEnd: null,
    },
    adversarialHeuristics: {
      chain: null,
      dropTradeLikeSignal: null,
      muleFanoutSignal: null,
      freshWalletPickupSignal: null,
      asymmetricFlowSignal: null,
      suspiciousCounterpartyShiftSignal: null,
      venueHopSignal: null,
      largeInflowThenFanoutSignal: null,
      heuristicCount: null,
      heuristicConfidence: 'unknown',
      queryWindowStart: null,
      queryWindowEnd: null,
    },
    warnings,
  };
}

function firstObject(rows) {
  return Array.isArray(rows)
    ? rows.find(row => typeof row === 'object' && row !== null && !Array.isArray(row)) ?? null
    : null;
}

function normalizedAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function rowMatchesAddress(row, address) {
  if (!address || typeof row !== 'object' || row === null || Array.isArray(row)) return true;
  return ADDRESS_FIELDS.some(field => normalizedAddress(row[field]) === address);
}

function rowsForAddress(rows, address) {
  if (!address || !Array.isArray(rows)) return rows;
  return rows.filter(row => rowMatchesAddress(row, address));
}

function firstDefined(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function boundedString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function nonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = nonNegativeNumber(value);
  return number === null ? null : Math.floor(number);
}

function booleanOrNull(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

function isoTimestamp(value) {
  const raw = typeof value === 'string' || typeof value === 'number' ? value : null;
  if (raw === null || raw === '') return null;
  const date = new Date(raw);
  const ms = date.getTime();
  return Number.isFinite(ms) ? date.toISOString() : null;
}

function isoDateOnly(value) {
  const ts = isoTimestamp(value);
  return ts ? ts.slice(0, 10) : null;
}

function defaultWindowEnd() {
  return new Date().toISOString().slice(0, 10);
}

function defaultWindowStart(windowEnd, days = DEFAULT_WINDOW_DAYS) {
  const endMs = Date.parse(`${windowEnd}T00:00:00Z`);
  const ms = Number.isFinite(endMs) ? endMs : Date.now();
  return new Date(ms - days * 86_400_000).toISOString().slice(0, 10);
}

function walletQueryParams({ address, config, chain, tokenAddress, windowStart, windowEnd, limit }) {
  if (!address || config.mode !== 'wallet') return null;
  const end = isoDateOnly(windowEnd) ?? defaultWindowEnd();
  const params = {
    chain,
    wallet_address: address,
    window_start: isoDateOnly(windowStart) ?? defaultWindowStart(end),
    window_end: end,
  };

  if (config.key === 'signatureExposure') {
    params.limit = String(Math.max(1, limit ?? 1));
  }

  if (config.key === 'valueAtRisk') {
    params.token_address = normalizedAddress(tokenAddress) ?? ZERO_ADDRESS;
    params.min_total_balance_usd = '0';
    params.limit = String(Math.max(1, limit ?? 1));
  }

  return params;
}

function normalizeControlStatus(value) {
  const text = boundedString(value, 40)?.toLowerCase();
  if (text === 'detected' || text === 'true' || text === 'yes') return 'detected';
  if (text === 'not_detected' || text === 'not detected' || text === 'false' || text === 'no') {
    return 'not_detected';
  }
  const bool = booleanOrNull(value);
  if (bool === true) return 'detected';
  if (bool === false) return 'not_detected';
  return 'unknown';
}

function normalizeSignatureStatus(value) {
  const text = boundedString(value, 80)?.toLowerCase();
  if (
    text === 'signature_exposure_observed'
    || text === 'no_outgoing_signature_observed'
    || text === 'contract_wallet'
    || text === 'unknown'
  ) {
    return text;
  }
  return null;
}

function normalizeSignatureExposure(row) {
  const signedTxCount = nonNegativeInteger(firstDefined(row, ['signedTxCount', 'signed_tx_count', 'tx_count_signed']));
  const firstOutgoingTxAt = isoTimestamp(firstDefined(row, ['firstOutgoingTxAt', 'first_outgoing_tx_at']));
  const lastOutgoingTxAt = isoTimestamp(firstDefined(row, ['lastOutgoingTxAt', 'last_outgoing_tx_at']));
  const isContract = booleanOrNull(firstDefined(row, ['isContract', 'is_contract', 'is_contract_wallet']));
  const explicitStatus = normalizeSignatureStatus(firstDefined(row, [
    'status',
    'signature_exposure_status',
    'exposure_status',
  ]));
  let inferredStatus = 'unknown';
  if (isContract === true) {
    inferredStatus = 'contract_wallet';
  } else if (signedTxCount > 0 || firstOutgoingTxAt || lastOutgoingTxAt) {
    inferredStatus = 'signature_exposure_observed';
  } else if (signedTxCount === 0) {
    inferredStatus = 'no_outgoing_signature_observed';
  }
  const status = explicitStatus ?? inferredStatus;
  const scheme = boundedString(firstDefined(row, ['signatureScheme', 'signature_scheme']), 80)?.toLowerCase();

  return {
    status,
    signedTxCount,
    firstOutgoingTxAt,
    lastOutgoingTxAt,
    signatureScheme: scheme === 'ecdsa_secp256k1' ? 'ecdsa_secp256k1' : 'unknown',
  };
}

function normalizeValueAtRisk(row) {
  return {
    totalBalanceUsd: nonNegativeNumber(firstDefined(row, ['totalBalanceUsd', 'total_balance_usd'])),
    nativeBalanceUsd: nonNegativeNumber(firstDefined(row, ['nativeBalanceUsd', 'native_balance_usd'])),
    tokenBalanceUsd: nonNegativeNumber(firstDefined(row, ['tokenBalanceUsd', 'token_balance_usd'])),
    topTokenSymbol: boundedString(firstDefined(row, ['topTokenSymbol', 'top_token_symbol']), 32),
    topTokenBalanceUsd: nonNegativeNumber(firstDefined(row, ['topTokenBalanceUsd', 'top_token_balance_usd'])),
    holderRank: nonNegativeInteger(firstDefined(row, ['holderRank', 'holder_rank'])),
    supplyShare: nonNegativeNumber(firstDefined(row, ['supplyShare', 'supply_share'])),
  };
}

function normalizeMigrationReadiness(row) {
  return {
    isContract: booleanOrNull(firstDefined(row, ['isContract', 'is_contract', 'is_contract_wallet'])),
    multisigStatus: normalizeControlStatus(firstDefined(row, ['multisigStatus', 'multisig_status', 'is_multisig'])),
    timelockStatus: normalizeControlStatus(firstDefined(row, ['timelockStatus', 'timelock_status', 'has_timelock'])),
    guardianStatus: normalizeControlStatus(firstDefined(row, ['guardianStatus', 'guardian_status', 'has_guardian'])),
    migrationReadinessHint: boundedString(
      firstDefined(row, ['migrationReadinessHint', 'migration_readiness_hint']),
      MAX_HINT_LENGTH,
    ),
  };
}

function normalizeConfidenceLabel(value) {
  const text = boundedString(value, 40)?.toLowerCase();
  if (text === 'low' || text === 'medium' || text === 'high' || text === 'none') {
    return text;
  }
  return 'unknown';
}

function normalizeCounterpartyContext(row) {
  return {
    chain: boundedString(firstDefined(row, ['chain']), 32),
    topCounterparty: boundedString(firstDefined(row, ['topCounterparty', 'top_counterparty']), 80),
    topCounterpartyLabel: boundedString(firstDefined(row, ['topCounterpartyLabel', 'top_counterparty_label']), 120),
    topCounterpartyCategory: boundedString(firstDefined(row, ['topCounterpartyCategory', 'top_counterparty_category']), 60),
    counterpartyCount30d: nonNegativeInteger(firstDefined(row, ['counterpartyCount30d', 'counterparty_count_30d'])),
    largestCounterpartyFlowUsd: nonNegativeNumber(firstDefined(row, ['largestCounterpartyFlowUsd', 'largest_counterparty_flow_usd'])),
    largestCounterpartyFlowEth: nonNegativeNumber(firstDefined(row, ['largestCounterpartyFlowEth', 'largest_counterparty_flow_eth'])),
    exchangeCounterpartyCount: nonNegativeInteger(firstDefined(row, ['exchangeCounterpartyCount', 'exchange_counterparty_count'])),
    contractCounterpartyCount: nonNegativeInteger(firstDefined(row, ['contractCounterpartyCount', 'contract_counterparty_count'])),
    freshWalletCounterpartyCount: nonNegativeInteger(firstDefined(row, ['freshWalletCounterpartyCount', 'fresh_wallet_counterparty_count'])),
    repeatedCounterpartyCount: nonNegativeInteger(firstDefined(row, ['repeatedCounterpartyCount', 'repeated_counterparty_count'])),
    queryWindowStart: isoTimestamp(firstDefined(row, ['queryWindowStart', 'query_window_start'])),
    queryWindowEnd: isoTimestamp(firstDefined(row, ['queryWindowEnd', 'query_window_end'])),
  };
}

function normalizeAdversarialHeuristics(row) {
  return {
    chain: boundedString(firstDefined(row, ['chain']), 32),
    dropTradeLikeSignal: booleanOrNull(firstDefined(row, ['dropTradeLikeSignal', 'drop_trade_like_signal'])),
    muleFanoutSignal: booleanOrNull(firstDefined(row, ['muleFanoutSignal', 'mule_fanout_signal'])),
    freshWalletPickupSignal: booleanOrNull(firstDefined(row, ['freshWalletPickupSignal', 'fresh_wallet_pickup_signal'])),
    asymmetricFlowSignal: booleanOrNull(firstDefined(row, ['asymmetricFlowSignal', 'asymmetric_flow_signal'])),
    suspiciousCounterpartyShiftSignal: booleanOrNull(firstDefined(row, ['suspiciousCounterpartyShiftSignal', 'suspicious_counterparty_shift_signal'])),
    venueHopSignal: booleanOrNull(firstDefined(row, ['venueHopSignal', 'venue_hop_signal'])),
    largeInflowThenFanoutSignal: booleanOrNull(firstDefined(row, ['largeInflowThenFanoutSignal', 'large_inflow_then_fanout_signal'])),
    heuristicCount: nonNegativeInteger(firstDefined(row, ['heuristicCount', 'heuristic_count'])),
    heuristicConfidence: normalizeConfidenceLabel(firstDefined(row, ['heuristicConfidence', 'heuristic_confidence'])),
    queryWindowStart: isoTimestamp(firstDefined(row, ['queryWindowStart', 'query_window_start'])),
    queryWindowEnd: isoTimestamp(firstDefined(row, ['queryWindowEnd', 'query_window_end'])),
  };
}

function normalizeDormancy(row) {
  return {
    daysDormant: nonNegativeInteger(firstDefined(row, ['daysDormant', 'days_dormant'])),
    dormancyBucket: boundedString(firstDefined(row, ['dormancyBucket', 'dormancy_bucket']), 80),
    lastActiveAt: isoTimestamp(firstDefined(row, ['lastActiveAt', 'last_active_at'])),
  };
}

function latestQueryRunAt(values) {
  const sorted = values
    .map(isoTimestamp)
    .filter(Boolean)
    .sort();
  return sorted.at(-1) ?? null;
}

export function normalizeDuneQuantumFacts(input = {}) {
  const facts = emptyQuantumFacts(Array.isArray(input.warnings) ? [...input.warnings] : []);
  const sources = [];
  const address = normalizedAddress(input.address);

  const signatureRow = firstObject(rowsForAddress(input.signatureExposureRows ?? input.signatureRows, address));
  if (signatureRow) {
    facts.signatureExposure = normalizeSignatureExposure(signatureRow);
    sources.push(DUNE_QUANTUM_SOURCES.SIGNATURE);
  }

  const valueRow = firstObject(rowsForAddress(input.valueAtRiskRows ?? input.valueRows, address));
  if (valueRow) {
    facts.valueAtRisk = normalizeValueAtRisk(valueRow);
    sources.push(DUNE_QUANTUM_SOURCES.VALUE_AT_RISK);
  }

  const migrationRow = firstObject(rowsForAddress(input.migrationReadinessRows ?? input.migrationRows, address));
  if (migrationRow) {
    facts.migrationReadiness = normalizeMigrationReadiness(migrationRow);
    sources.push(DUNE_QUANTUM_SOURCES.MIGRATION);
  }

  const dormancyRow = firstObject(rowsForAddress(input.dormancyRows ?? input.dormantRows, address));
  if (dormancyRow) {
    facts.dormancy = normalizeDormancy(dormancyRow);
    sources.push(DUNE_QUANTUM_SOURCES.DORMANCY);
  }

  const counterpartyRow = firstObject(rowsForAddress(input.counterpartyContextRows ?? input.counterpartyRows, address));
  if (counterpartyRow) {
    facts.counterpartyContext = normalizeCounterpartyContext(counterpartyRow);
    sources.push(DUNE_QUANTUM_SOURCES.COUNTERPARTY_CONTEXT);
  }

  const adversarialRow = firstObject(rowsForAddress(input.adversarialHeuristicsRows ?? input.adversarialRows, address));
  if (adversarialRow) {
    facts.adversarialHeuristics = normalizeAdversarialHeuristics(adversarialRow);
    sources.push(DUNE_QUANTUM_SOURCES.ADVERSARIAL_HEURISTICS);
  }

  facts.sources = [...new Set([...(Array.isArray(input.sources) ? input.sources : []), ...sources])]
    .filter(source => Object.values(DUNE_QUANTUM_SOURCES).includes(source));
  facts.queryRunAt = latestQueryRunAt([
    input.queryRunAt,
    input.signatureQueryRunAt,
    input.valueAtRiskQueryRunAt,
    input.migrationQueryRunAt,
    input.dormancyQueryRunAt,
    input.counterpartyContextQueryRunAt,
    input.adversarialHeuristicsQueryRunAt,
  ]);

  return facts;
}

function settleQuery(result, config, warnings) {
  if (result.status === 'rejected') {
    warnings.push(`${config.source}: Dune auto-run data unavailable`);
    return EMPTY_ROWS;
  }
  return result.value ?? EMPTY_ROWS;
}

function hasAddressMatchedRow(rows, address) {
  return Array.isArray(rows) && rows.some(row => rowMatchesAddress(row, address));
}

export async function readDuneQuantumFacts({
  address,
  env = process.env,
  readResults = readOrCache,
  readParameterized = getOrCache,
  limit = 25,
  ttlSeconds = 21_600, // 6h — quantum facts; per Dune quota constraints
  chain = 'ethereum',
  tokenAddress = ZERO_ADDRESS,
  windowStart,
  windowEnd,
} = {}) {
  const warnings = [];
  const activeConfigs = QUERY_CONFIGS.filter(config => {
    if (env[config.envName]) return true;
    warnings.push(`${config.source}: Dune auto-run data unavailable`);
    return false;
  });

  const normalizedWallet = normalizedAddress(address);
  const settled = await Promise.allSettled(
    activeConfigs.map(config => {
      const params = walletQueryParams({
        address: normalizedWallet,
        config,
        chain,
        tokenAddress,
        windowStart,
        windowEnd,
        limit: config.key === 'signatureExposure' || config.key === 'valueAtRisk' ? 1 : limit,
      });
      if (params) {
        return readParameterized(env[config.envName], params, { ttlSeconds, timeoutMs: 25000 });
      }
      return readResults(env[config.envName], { limit, ttlSeconds });
    }),
  );

  const data = {};
  for (const [index, config] of activeConfigs.entries()) {
    data[config.key] = settleQuery(settled[index], config, warnings);
    if (
      config.mode === 'wallet'
      && normalizedWallet
      && !hasAddressMatchedRow(data[config.key]?.rows, normalizedWallet)
    ) {
      warnings.push(`${config.source}: Dune auto-run data unavailable`);
    }
  }

  return normalizeDuneQuantumFacts({
    address: normalizedWallet,
    dormancyRows: data.dormancy?.rows,
    signatureExposureRows: data.signatureExposure?.rows,
    valueAtRiskRows: data.valueAtRisk?.rows,
    migrationReadinessRows: data.migrationReadiness?.rows,
    counterpartyContextRows: data.counterpartyContext?.rows,
    adversarialHeuristicsRows: data.adversarialHeuristics?.rows,
    dormancyQueryRunAt: data.dormancy?.queryRunAt,
    signatureQueryRunAt: data.signatureExposure?.queryRunAt,
    valueAtRiskQueryRunAt: data.valueAtRisk?.queryRunAt,
    migrationQueryRunAt: data.migrationReadiness?.queryRunAt,
    counterpartyContextQueryRunAt: data.counterpartyContext?.queryRunAt,
    adversarialHeuristicsQueryRunAt: data.adversarialHeuristics?.queryRunAt,
    warnings,
  });
}
