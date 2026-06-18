/**
 * GET /api/quantum-exposure
 *
 * Returns source-backed quantum-signature exposure facts for a single wallet,
 * fetched from three Dune scheduled queries and merged into a WalletFacts shape
 * for use by the quantum-exposure scoring layer.
 *
 * Data source: Dune Analytics (scheduled / cached queries — not live streaming).
 *
 * Env vars consumed:
 *   DUNE_API_KEY                          — required
 *   DUNE_QUERY_WALLET_SIGNATURE_EXPOSURE  — walletwall_wallet_signature_exposure_v1
 *   DUNE_QUERY_QUANTUM_VALUE_AT_RISK      — walletwall_quantum_value_at_risk_v1
 *   DUNE_QUERY_VALUE_AT_RISK              — legacy alias for the same query
 *   DUNE_QUERY_WALLET_MIGRATION_READINESS — walletwall_wallet_migration_readiness_v1
 *
 * Query params:
 *   wallet  — required; checksummed or lowercase 0x EVM address
 *   chain   — optional; default 'ethereum'
 *
 * Response shape:
 *   {
 *     walletFacts:        WalletFacts (chain, address, isContract, firstSeenAt, …)
 *     migrationReadiness: { isContractWallet, contractWalletType, recentMigrationSignal,
 *                           recentSplitFundsSignal, lastSecurityHygieneAt,
 *                           riskyApprovalCount, migrationReadinessFactsJson }
 *     valueAtRisk:        { nativeBalanceUsd, tokenBalanceUsd, totalBalanceUsd,
 *                           topTokenSymbol, topTokenAddress, topTokenBalanceUsd,
 *                           holderRank, supplyShare }
 *     metadata:           { warnings, signatureQueryRunAt, valueAtRiskQueryRunAt,
 *                           migrationQueryRunAt, dataNote, generatedAt }
 *   }
 */

import { getOrCache } from './_dune.js';
import { logDuneRouteDiagnostic } from './_dune-diagnostics.js';
import { getClientIp, sendRateLimitResponse, takeRequestAllowance } from './_ratelimit.js';

const SIG_TTL  = 21_600;  // 6h — quantum facts; per Dune quota constraints
const VAR_TTL  = 21_600;  // 6h — quantum facts; per Dune quota constraints
const MIG_TTL  = 86_400;  // 24h — weekly Dune cadence

// Queries run in parallel. Timeouts must be shorter than vercel.json maxDuration
// (30s) to allow the function to finish and respond before Vercel terminates it.
// Cached/scheduled queries return in milliseconds; only cold cache-misses hit
// Dune's execution layer. On a cache miss we'd rather return a graceful
// "unavailable" warning than hang the user for 75s.
const SIG_TIMEOUT_MS = 20_000;
const VAR_TIMEOUT_MS = 20_000;
const MIG_TIMEOUT_MS = 20_000;

const STALE_THRESHOLD_MS = 30 * 3600 * 1000; // 30 hours

const EMPTY = { rows: [], queryRunAt: null };
const DATA_NOTE = 'Dune auto-run data';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_WINDOW_DAYS = 3650;
const SAFE_WARNING_BY_LABEL = Object.freeze({
  'Signature exposure': 'dune:wallet-signature-exposure',
  'Value at risk': 'dune:quantum-value-at-risk',
  'Migration readiness': 'dune:wallet-migration-readiness',
});

function isEthAddress(v) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(v ?? ''));
}

function normaliseBool(v) {
  if (v === true  || v === 'true')  return true;
  if (v === false || v === 'false') return false;
  return null;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function addStalenessWarning(label, queryRunAt, warnings) {
  if (!queryRunAt) return;
  const ageMs = Date.now() - new Date(queryRunAt).getTime();
  if (ageMs > STALE_THRESHOLD_MS) {
    const days = Math.round(ageMs / (24 * 3600 * 1000));
    warnings.push(`${label}: data is ${days} day${days === 1 ? '' : 's'} old — Dune auto-run may be delayed`);
  }
}

function dateOnly(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function defaultWindowEnd() {
  return new Date().toISOString().slice(0, 10);
}

function defaultWindowStart(windowEnd) {
  const endMs = Date.parse(`${windowEnd}T00:00:00Z`);
  const ms = Number.isFinite(endMs) ? endMs : Date.now();
  return new Date(ms - DEFAULT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
}

// Find the row matching wallet+chain; fall back to first row when chain is absent.
function firstRow(rows, wallet, chain) {
  const addrLc  = wallet.toLowerCase();
  const chainLc = chain.toLowerCase();
  return (
    rows.find(
      r =>
        String(r.wallet_address ?? '').toLowerCase() === addrLc &&
        String(r.chain          ?? '').toLowerCase() === chainLc,
    ) ??
    rows.find(r => String(r.wallet_address ?? '').toLowerCase() === addrLc) ??
    null
  );
}

function safeUnavailableWarning(label) {
  return `${SAFE_WARNING_BY_LABEL[label] ?? 'dune:quantum-exposure'}: ${DATA_NOTE} unavailable`;
}

function addUnavailableWarning(label, warnings) {
  const warning = safeUnavailableWarning(label);
  if (!warnings.includes(warning)) warnings.push(warning);
}

function settle(result, label, queryId, warnings) {
  if (!queryId) { addUnavailableWarning(label, warnings); return EMPTY; }
  if (result.status === 'rejected') {
    addUnavailableWarning(label, warnings);
    return EMPTY;
  }
  return result.value ?? EMPTY;
}

function buildWalletFacts(sig, vr, mig, wallet, chain) {
  const isContract =
    (sig ? normaliseBool(sig.is_contract) : null) ??
    (mig ? normaliseBool(mig.is_contract_wallet) : null);

  return {
    chain,
    address:                    wallet,
    isContract,
    firstSeenAt:                sig?.first_seen_at        ?? null,
    firstOutgoingTxAt:          sig?.first_outgoing_tx_at ?? null,
    lastOutgoingTxAt:           sig?.last_outgoing_tx_at  ?? null,
    signedTxCount:              numOrNull(sig?.signed_tx_count),
    txCountLifetime:            numOrNull(sig?.tx_count_lifetime),
    daysDormant:                numOrNull(sig?.days_dormant),
    totalBalanceUsd:            numOrNull(vr?.total_balance_usd),
    isSafeWallet:               mig ? normaliseBool(mig.is_safe_wallet)                : null,
    isMultisig:                 mig ? normaliseBool(mig.is_multisig)                   : null,
    isAccountAbstractionWallet: mig ? normaliseBool(mig.is_account_abstraction_wallet) : null,
  };
}

function buildMigrationReadiness(mig) {
  if (!mig) return null;
  return {
    isContractWallet:            normaliseBool(mig.is_contract_wallet),
    contractWalletType:          mig.contract_wallet_type     ?? null,
    recentMigrationSignal:       normaliseBool(mig.recent_migration_signal),
    recentSplitFundsSignal:      normaliseBool(mig.recent_split_funds_signal),
    lastSecurityHygieneAt:       mig.last_security_hygiene_at ?? null,
    riskyApprovalCount:          numOrNull(mig.risky_approval_count),
    migrationReadinessFactsJson: mig.migration_readiness_facts_json ?? null,
  };
}

function buildValueAtRisk(vr) {
  if (!vr) return null;
  return {
    nativeBalanceUsd:   numOrNull(vr.native_balance_usd),
    tokenBalanceUsd:    numOrNull(vr.token_balance_usd),
    totalBalanceUsd:    numOrNull(vr.total_balance_usd),
    topTokenSymbol:     vr.top_token_symbol      ?? null,
    topTokenAddress:    vr.top_token_address     ?? null,
    topTokenBalanceUsd: numOrNull(vr.top_token_balance_usd),
    holderRank:         numOrNull(vr.holder_rank),
    supplyShare:        numOrNull(vr.supply_share),
  };
}

function sendMissingDuneApiKey(res, now) {
  logDuneRouteDiagnostic({
    routeName: '/api/quantum-exposure',
    envVarName: 'DUNE_API_KEY',
    queryId: null,
    rowsAfterLocalFiltering: 0,
    warnings: ['DUNE_API_KEY not configured'],
  });
  return res.status(503).json({
    error: 'Quantum exposure source data is unavailable.',
    metadata: {
      warnings: Object.values(SAFE_WARNING_BY_LABEL).map(source => `${source}: ${DATA_NOTE} unavailable`),
      generatedAt: now().toISOString(),
    },
  });
}

function buildQueryConfig() {
  return {
    Q_SIG: process.env.DUNE_QUERY_WALLET_SIGNATURE_EXPOSURE,
    Q_VAR_ENV: process.env.DUNE_QUERY_QUANTUM_VALUE_AT_RISK ? 'DUNE_QUERY_QUANTUM_VALUE_AT_RISK' : 'DUNE_QUERY_VALUE_AT_RISK',
    Q_VAR: process.env.DUNE_QUERY_QUANTUM_VALUE_AT_RISK || process.env.DUNE_QUERY_VALUE_AT_RISK,
    Q_MIG: process.env.DUNE_QUERY_WALLET_MIGRATION_READINESS,
  };
}

function buildQueryParams(req, normalizedWallet, chain) {
  const windowEnd = dateOnly(req.query.window_end) ?? defaultWindowEnd();
  const windowStart = dateOnly(req.query.window_start) ?? defaultWindowStart(windowEnd);
  const tokenAddress = isEthAddress(req.query.token_address) ? String(req.query.token_address).toLowerCase() : ZERO_ADDRESS;
  const baseParams = {
    wallet_address: normalizedWallet,
    chain,
    window_start: windowStart,
    window_end: windowEnd,
  };
  return {
    baseParams,
    signatureParams: { ...baseParams, limit: '1' },
    valueParams: {
      ...baseParams,
      token_address: tokenAddress,
      min_total_balance_usd: '0',
      limit: '1',
    },
  };
}

async function readQuantumQueries(getCachedQuery, queryConfig, queryParams) {
  const { Q_SIG, Q_VAR, Q_MIG } = queryConfig;
  const { baseParams, signatureParams, valueParams } = queryParams;
  return Promise.allSettled([
    Q_SIG ? getCachedQuery(Q_SIG, signatureParams, { ttlSeconds: SIG_TTL, timeoutMs: SIG_TIMEOUT_MS }) : Promise.resolve(EMPTY),
    Q_VAR ? getCachedQuery(Q_VAR, valueParams, { ttlSeconds: VAR_TTL, timeoutMs: VAR_TIMEOUT_MS }) : Promise.resolve(EMPTY),
    Q_MIG ? getCachedQuery(Q_MIG, baseParams, { ttlSeconds: MIG_TTL, timeoutMs: MIG_TIMEOUT_MS }) : Promise.resolve(EMPTY),
  ]);
}

function buildQuantumRows({ rSig, rVar, rMig, Q_SIG, Q_VAR, Q_MIG, normalizedWallet, chain }) {
  const warnings = [];
  const { rows: sigRows, queryRunAt: signatureQueryRunAt   } = settle(rSig, 'Signature exposure',  Q_SIG, warnings);
  const { rows: varRows, queryRunAt: valueAtRiskQueryRunAt } = settle(rVar, 'Value at risk',       Q_VAR, warnings);
  const { rows: migRows, queryRunAt: migrationQueryRunAt   } = settle(rMig, 'Migration readiness', Q_MIG, warnings);

  addStalenessWarning('Signature exposure',  signatureQueryRunAt,   warnings);
  addStalenessWarning('Value at risk',       valueAtRiskQueryRunAt, warnings);
  addStalenessWarning('Migration readiness', migrationQueryRunAt,   warnings);

  const sig = firstRow(sigRows, normalizedWallet, chain);
  const vr  = firstRow(varRows, normalizedWallet, chain);
  const mig = firstRow(migRows, normalizedWallet, chain);

  return { warnings, signatureQueryRunAt, valueAtRiskQueryRunAt, migrationQueryRunAt, sig, vr, mig };
}

function logQuantumDuneDiagnostics({ Q_SIG, Q_VAR_ENV, Q_VAR, Q_MIG, rSig, rVar, rMig, sig, vr, mig, warnings }) {
  logDuneRouteDiagnostic({
    routeName: '/api/quantum-exposure',
    envVarName: 'DUNE_QUERY_WALLET_SIGNATURE_EXPOSURE',
    queryId: Q_SIG,
    result: rSig.status === 'fulfilled' ? rSig.value : null,
    rowsAfterLocalFiltering: sig ? 1 : 0,
    warnings,
    errors: rSig.status === 'rejected' ? [rSig.reason] : [],
  });
  logDuneRouteDiagnostic({
    routeName: '/api/quantum-exposure',
    envVarName: Q_VAR_ENV,
    queryId: Q_VAR,
    result: rVar.status === 'fulfilled' ? rVar.value : null,
    rowsAfterLocalFiltering: vr ? 1 : 0,
    warnings,
    errors: rVar.status === 'rejected' ? [rVar.reason] : [],
  });
  logDuneRouteDiagnostic({
    routeName: '/api/quantum-exposure',
    envVarName: 'DUNE_QUERY_WALLET_MIGRATION_READINESS',
    queryId: Q_MIG,
    result: rMig.status === 'fulfilled' ? rMig.value : null,
    rowsAfterLocalFiltering: mig ? 1 : 0,
    warnings,
    errors: rMig.status === 'rejected' ? [rMig.reason] : [],
  });
}

export function createQuantumExposureHandler({
  getCachedQuery = getOrCache,
  rateLimit = takeRequestAllowance,
  now = () => new Date(),
} = {}) {
  return async function quantumExposureHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ip        = getClientIp(req);
  const allowance = await rateLimit('quantum-exposure', ip, { limit: 30, windowSeconds: 3600 });
  const rateLimitResponse = sendRateLimitResponse(res, allowance);
  if (rateLimitResponse) return rateLimitResponse;

  const wallet = String(req.query.wallet ?? '').trim();
  const chain  = String(req.query.chain  ?? 'ethereum').trim().toLowerCase();

  if (!isEthAddress(wallet)) {
    return res.status(400).json({ error: 'wallet must be a valid 0x EVM address' });
  }

  if (!process.env.DUNE_API_KEY) {
    return sendMissingDuneApiKey(res, now);
  }

  const normalizedWallet = wallet.toLowerCase();
  const queryConfig = buildQueryConfig();
  const queryParams = buildQueryParams(req, normalizedWallet, chain);
  const [rSig, rVar, rMig] = await readQuantumQueries(getCachedQuery, queryConfig, queryParams);
  const quantumRows = buildQuantumRows({ ...queryConfig, rSig, rVar, rMig, normalizedWallet, chain });
  const {
    warnings,
    signatureQueryRunAt,
    valueAtRiskQueryRunAt,
    migrationQueryRunAt,
    sig,
    vr,
    mig,
  } = quantumRows;

  logQuantumDuneDiagnostics({ ...queryConfig, rSig, rVar, rMig, sig, vr, mig, warnings });

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  return res.status(200).json({
    walletFacts:        buildWalletFacts(sig, vr, mig, normalizedWallet, chain),
    migrationReadiness: buildMigrationReadiness(mig),
    valueAtRisk:        buildValueAtRisk(vr),
    metadata: {
      warnings,
      signatureQueryRunAt,
      valueAtRiskQueryRunAt,
      migrationQueryRunAt,
      dataNote:    'Dune auto-run quantum-signature exposure facts',
      generatedAt: now().toISOString(),
    },
  });
  };
}

export default createQuantumExposureHandler();
