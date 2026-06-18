import { getClientIp, takeRequestAllowance } from './_ratelimit.js';
import { DUNE_QUANTUM_SOURCES, readDuneQuantumFacts } from './_quantum-facts.js';
import { buildQuantumVaultReadiness } from '../src/lib/quantum-vault-readiness.js';

const DATA_NOTE = 'Dune auto-run data';
const RATE_LIMIT_NAMESPACE = 'quantum-readiness';
const RATE_LIMIT_OPTIONS = Object.freeze({ limit: 30, windowSeconds: 3600 });
const SAFE_SOURCES = Object.freeze(Object.values(DUNE_QUANTUM_SOURCES));

function isEthAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? ''));
}

function sanitizeWarning(warning) {
  const text = String(warning ?? '');
  const source = SAFE_SOURCES.find(label => text.includes(label));
  if (source) return `${source}: ${DATA_NOTE} unavailable`;
  return `${DATA_NOTE} unavailable`;
}

function sanitizeWarnings(warnings) {
  return [...new Set((Array.isArray(warnings) ? warnings : []).map(sanitizeWarning))];
}

function sanitizeQuantumFacts(facts = {}) {
  return {
    sourceMode: facts.sourceMode ?? 'source-backed',
    sources: Array.isArray(facts.sources)
      ? facts.sources.filter(source => SAFE_SOURCES.includes(source))
      : [],
    queryRunAt: facts.queryRunAt ?? null,
    signatureExposure: facts.signatureExposure ?? {
      status: 'unknown',
      signedTxCount: null,
      firstOutgoingTxAt: null,
      lastOutgoingTxAt: null,
      signatureScheme: 'unknown',
    },
    valueAtRisk: facts.valueAtRisk ?? {
      totalBalanceUsd: null,
      nativeBalanceUsd: null,
      tokenBalanceUsd: null,
      topTokenSymbol: null,
      topTokenBalanceUsd: null,
      holderRank: null,
      supplyShare: null,
    },
    migrationReadiness: facts.migrationReadiness ?? {
      isContract: null,
      multisigStatus: 'unknown',
      timelockStatus: 'unknown',
      guardianStatus: 'unknown',
      migrationReadinessHint: null,
    },
    dormancy: facts.dormancy ?? {
      daysDormant: null,
      dormancyBucket: null,
      lastActiveAt: null,
    },
    counterpartyContext: facts.counterpartyContext ?? {
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
    adversarialHeuristics: facts.adversarialHeuristics ?? {
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
    warnings: sanitizeWarnings(facts.warnings),
  };
}

function readinessProvenance(quantumFacts) {
  return {
    sourceMode: quantumFacts.sourceMode,
    sources: quantumFacts.sources,
    queryRunAt: quantumFacts.queryRunAt,
    dataNote: DATA_NOTE,
  };
}

export async function buildQuantumReadinessResponse({
  address,
  readFacts = readDuneQuantumFacts,
  now = () => new Date(),
} = {}) {
  let facts;
  try {
    facts = await readFacts({ address });
  } catch {
    facts = { warnings: SAFE_SOURCES.map(source => `${source}: ${DATA_NOTE} unavailable`) };
  }

  const quantumFacts = sanitizeQuantumFacts(facts);
  const readinessBase = buildQuantumVaultReadiness(
    { address },
    { address, quantumFacts },
  );
  const warnings = sanitizeWarnings(quantumFacts.warnings);
  const provenance = readinessProvenance(quantumFacts);

  return {
    readiness: {
      score: readinessBase.score,
      band: readinessBase.band,
      exposureLevel: readinessBase.exposureLevel,
      confidence: readinessBase.confidence,
      sourceMode: quantumFacts.sourceMode,
      findings: readinessBase.findings,
      recommendations: readinessBase.recommendations,
      controls: readinessBase.controls,
      signals: readinessBase.signals,
      provenance,
      disclaimers: [
        ...readinessBase.disclaimers,
        'Quantum readiness uses Dune auto-run data and is not real-time.',
      ],
    },
    quantumFacts,
    metadata: {
      mode: RATE_LIMIT_NAMESPACE,
      address,
      dataNote: DATA_NOTE,
      generatedAt: now().toISOString(),
      warnings,
    },
  };
}

export function createQuantumReadinessHandler({
  readFacts = readDuneQuantumFacts,
  rateLimit = takeRequestAllowance,
  now = () => new Date(),
} = {}) {
  return async function quantumReadinessHandler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).end();

    const rawAddress = String(req.query?.address ?? '').trim();
    if (!rawAddress) {
      return res.status(400).json({ error: 'address is required' });
    }
    if (!isEthAddress(rawAddress)) {
      return res.status(400).json({ error: 'address must be a valid 0x EVM address' });
    }

    const allowance = await rateLimit(
      RATE_LIMIT_NAMESPACE,
      getClientIp(req),
      RATE_LIMIT_OPTIONS,
    );
    if (allowance.configError) {
      return res.status(allowance.status || 503).json({
        error: allowance.error,
        detail: allowance.detail,
        retryAfterSeconds: allowance.retryAfterSeconds,
      });
    }
    if (!allowance.allowed) {
      res.setHeader('Retry-After', String(allowance.resetInSeconds));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfterSeconds: allowance.resetInSeconds,
      });
    }

    const address = rawAddress.toLowerCase();
    const payload = await buildQuantumReadinessResponse({ address, readFacts, now });
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(payload);
  };
}

export default createQuantumReadinessHandler();
