/**
 * quantum-exposure-adapter.js
 *
 * Helpers for building WalletFacts used by deriveWalletSignatureExposure:
 *
 *   walletNodeToQuantumFacts(node, walletData)
 *     Derives facts directly observable from live Etherscan/wallet data
 *     (≤200 tx sample window). Fields not derivable from live data are null.
 *
 *   fetchDuneQuantumFacts(wallet, chain?)
 *     Fetches source-backed facts from /api/quantum-exposure (async).
 *     Returns the raw API response or null on failure.
 *     Non-critical — callers should fall back to live-derived facts on error.
 *
 *   fetchQuantumReadiness(wallet)
 *     Fetches source-backed facts from /api/quantum-readiness (async).
 *     Returns the raw API response or null on invalid input or failure.
 *     Non-critical - callers should fall back to heuristic readiness.
 *
 *   mergeDuneIntoWalletFacts(liveFacts, duneResponse)
 *     Merges Dune-sourced facts into live-derived WalletFacts.
 *     Live RPC facts take priority; Dune fills the fields live data cannot
 *     observe: daysDormant, isContract, totalBalanceUsd, isSafeWallet,
 *     isMultisig, isAccountAbstractionWallet.
 */

export function isValidEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? ''));
}

export function isWalletLikeQuantumNode(node) {
  if (!isValidEvmAddress(node?.fullAddress)) return false;
  const nodeId = String(node?.id ?? '');
  return !nodeId.startsWith('token_') && !nodeId.startsWith('protocol_');
}

const DUNE_WARNING_SOURCES = Object.freeze({
  DORMANCY: 'dune:dormant-quantum-exposure',
  SIGNATURE: 'dune:wallet-signature-exposure',
  VALUE_AT_RISK: 'dune:quantum-value-at-risk',
  MIGRATION: 'dune:wallet-migration-readiness',
});

const DUNE_SAFE_UNAVAILABLE = 'Dune auto-run data unavailable';

function sourceFromWarning(warning) {
  const text = String(warning ?? '').toLowerCase();
  if (text.includes(DUNE_WARNING_SOURCES.DORMANCY)) return DUNE_WARNING_SOURCES.DORMANCY;
  if (text.includes(DUNE_WARNING_SOURCES.SIGNATURE) || text.includes('signature exposure')) {
    return DUNE_WARNING_SOURCES.SIGNATURE;
  }
  if (text.includes(DUNE_WARNING_SOURCES.VALUE_AT_RISK) || text.includes('value at risk')) {
    return DUNE_WARNING_SOURCES.VALUE_AT_RISK;
  }
  if (text.includes(DUNE_WARNING_SOURCES.MIGRATION) || text.includes('migration readiness')) {
    return DUNE_WARNING_SOURCES.MIGRATION;
  }
  return 'dune:quantum-exposure';
}

function sanitizeDuneWarning(warning) {
  const text = String(warning ?? '');
  if (/days?\s+old/i.test(text) && !/(query|DUNE_|API_KEY|HTTP\s+\d{3})/i.test(text)) return text;
  return `${sourceFromWarning(text)}: ${DUNE_SAFE_UNAVAILABLE}`;
}

export function sanitizeDuneQuantumResponse(response) {
  if (!response || typeof response !== 'object') return response;
  const warnings = response.metadata?.warnings;
  if (!Array.isArray(warnings)) return response;
  return {
    ...response,
    metadata: {
      ...response.metadata,
      warnings: [...new Set(warnings.map(sanitizeDuneWarning))],
    },
  };
}

/**
 * Normalise a raw timestamp value (unix int, unix string, or ISO string)
 * to a millisecond epoch integer.  Returns 0 for invalid inputs.
 *
 * @param {number|string|null|undefined} ts
 * @returns {number}
 */
function timestampToMs(ts) {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === 'number') {
    return ts < 1e12 ? ts * 1000 : ts;
  }
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      const n = Number.parseInt(ts, 10);
      return n < 1e12 ? n * 1000 : n;
    }
    return new Date(ts).getTime() || 0;
  }
  return 0;
}

/**
 * Extract WalletFacts for quantum exposure classification from the node +
 * walletData pair that WhaleWatcher receives.
 *
 * Returns null for synthetic nodes (token_*, protocol_*) and for any node
 * without a real on-chain address.
 *
 * @param {Object|null|undefined} node       - Graph node (from NodeDetailPanel)
 * @param {Object|null|undefined} walletData - Raw wallet API response
 * @returns {import('./quantum-exposure.js').WalletFacts | null}
 */
export function walletNodeToQuantumFacts(node, walletData) {
  if (!isWalletLikeQuantumNode(node)) return null;
  const address = node.fullAddress;

  const txs    = walletData?.transactions ?? [];
  const addrLc = address.toLowerCase();

  // Outgoing txs only (signed by this address) — limited to the Etherscan sample window
  const outgoing = txs.filter(
    tx => typeof tx.from === 'string' && tx.from.toLowerCase() === addrLc,
  );

  // Sort outgoing by timestamp ascending to find the earliest
  const sorted = outgoing
    .map(tx => ({ ms: timestampToMs(tx.timeStamp) }))
    .filter(({ ms }) => ms > 0)
    .sort((a, b) => a.ms - b.ms);

  const firstOutgoingTxAt = sorted.length > 0
    ? new Date(sorted[0].ms).toISOString()
    : null;

  const signedTxCount = outgoing.length > 0 ? outgoing.length : null;

  return {
    chain:   'ethereum', // consistent with walletDataAdapter.js; multi-chain not yet supported
    address,
    firstOutgoingTxAt,
    signedTxCount,
    txCountLifetime: txs.length > 0 ? txs.length : null,
    // Fields not derivable from live Etherscan data — filled by mergeDuneIntoWalletFacts:
    totalBalanceUsd:            null,
    daysDormant:                null,
    isContract:                 walletData?.isContract ?? null,
    isSafeWallet:               null,
    isMultisig:                 null,
    isAccountAbstractionWallet: null,
  };
}

/**
 * Fetch source-backed quantum exposure facts from /api/quantum-exposure.
 * Returns the raw API response object, or null on any error.
 * Non-critical: the scoring layer falls back to live-derived facts when null.
 *
 * @param {string} wallet - 0x EVM address
 * @param {string} [chain] - chain identifier, default 'ethereum'
 * @returns {Promise<object|null>}
 */
// Client-side fetch timeout — must be shorter than vercel.json maxDuration (30s)
// so a hanging server-side function doesn't block the UI indefinitely.
const CLIENT_FETCH_TIMEOUT_MS = 25_000;

export async function fetchDuneQuantumFacts(wallet, chain = 'ethereum') {
  if (!isValidEvmAddress(wallet)) return null;

  try {
    const params = new URLSearchParams({ wallet, chain });
    const res = await fetch(
      `/api/quantum-exposure?${params}`,
      { signal: AbortSignal.timeout(CLIENT_FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    return sanitizeDuneQuantumResponse(await res.json());
  } catch {
    return null;
  }
}

/**
 * Fetch source-backed Quantum Vault Readiness from /api/quantum-readiness.
 * Returns the raw API response object, or null on invalid input or failure.
 * Non-critical: Whale Watcher falls back to local wallet heuristics when null.
 *
 * @param {string} wallet - 0x EVM address
 * @returns {Promise<object|null>}
 */
export async function fetchQuantumReadiness(wallet) {
  if (!isValidEvmAddress(wallet)) return null;

  try {
    const params = new URLSearchParams({ address: wallet });
    const res = await fetch(
      `/api/quantum-readiness?${params}`,
      { signal: AbortSignal.timeout(CLIENT_FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Promote Dune API response metadata into source-backed caveats on the score result.
 *
 * Three conditions trigger an extra caveat:
 *   1. No Dune response at all (live data only).
 *   2. One or more Dune queries have stale data ("N days old" in warnings).
 *   3. One or more Dune scheduled/cached source reads are unavailable.
 *
 * Safe to call with null scoreResult or null duneResponse.
 *
 * @param {import('./quantum-exposure.js').QuantumExposureScoreResult | null} scoreResult
 * @param {object | null} duneResponse - raw /api/quantum-exposure response
 * @param {{ hasLiveFacts?: boolean }} [options]
 *   hasLiveFacts — whether the score used live wallet-graph transaction facts.
 *   Defaults to true (the Whale Watcher / Node Detail path, which always has a
 *   loaded graph). The /quantum entry path passes false because makeLiveFacts
 *   produces address-only/null facts, so the "live transaction data" wording
 *   would be inaccurate there.
 * @returns {import('./quantum-exposure.js').QuantumExposureScoreResult | null}
 */
export function appendDuneSourceCaveats(scoreResult, duneResponse, { hasLiveFacts = true } = {}) {
  if (!scoreResult) return scoreResult;

  let baseCaveats;
  if (Array.isArray(scoreResult.caveats)) {
    baseCaveats = [...scoreResult.caveats];
  } else if (scoreResult.caveat) {
    baseCaveats = [scoreResult.caveat];
  } else {
    baseCaveats = [];
  }

  const extra = [];

  if (duneResponse) {
    const warnings = duneResponse.metadata?.warnings ?? [];

    // Two-pass detection so stale always precedes missing-ID in the output,
    // regardless of the order warnings arrive from the API.
    const hasStale       = warnings.some(w => w.toLowerCase().includes('days old'));
    const hasUnavailable = warnings.some(w => w.toLowerCase().includes(DUNE_SAFE_UNAVAILABLE.toLowerCase()));

    if (hasStale) {
      extra.push(
        'One or more Dune source queries have not run recently — ' +
        'dormancy and value facts may not reflect the latest on-chain state.',
      );
    }
    if (hasUnavailable) {
      extra.push(
        'One or more Dune source queries are not configured for this deployment — ' +
        'the score may be based on partial source data.',
      );
    }
  } else if (hasLiveFacts) {
    extra.push(
      'Score derived from live transaction data only — ' +
      'Dune auto-run facts were not available for this request.',
    );
  } else {
    extra.push(
      'No source-backed quantum facts were available for this request. ' +
      'This address-only estimate may understate exposure.',
    );
  }

  if (extra.length === 0) return scoreResult;

  // Deduplicate: preserve first occurrence of each unique string.
  const merged = [...baseCaveats, ...extra];
  const caveats = merged.filter((c, i) => merged.indexOf(c) === i);

  return { ...scoreResult, caveats };
}

/**
 * Merge Dune-sourced quantum facts into live-derived WalletFacts.
 *
 * Live RPC facts (from walletNodeToQuantumFacts) take priority for timing
 * fields that are more real-time. Dune fills the fields live data cannot
 * observe: daysDormant, isContract, totalBalanceUsd, isSafeWallet,
 * isMultisig, isAccountAbstractionWallet.
 *
 * Safe to call with null liveFacts or null duneResponse — returns liveFacts
 * unchanged in both cases.
 *
 * @param {import('./quantum-exposure.js').WalletFacts | null} liveFacts
 * @param {object | null} duneResponse - raw /api/quantum-exposure response
 * @returns {import('./quantum-exposure.js').WalletFacts | null}
 */
export function mergeDuneIntoWalletFacts(liveFacts, duneResponse) {
  if (!liveFacts) return liveFacts;
  const d = duneResponse?.walletFacts;
  if (!d) return liveFacts;

  return {
    ...liveFacts,
    firstSeenAt:                liveFacts.firstSeenAt                ?? d.firstSeenAt,
    firstOutgoingTxAt:          liveFacts.firstOutgoingTxAt          ?? d.firstOutgoingTxAt,
    lastOutgoingTxAt:           liveFacts.lastOutgoingTxAt           ?? d.lastOutgoingTxAt,
    signedTxCount:              liveFacts.signedTxCount              ?? d.signedTxCount,
    txCountLifetime:            liveFacts.txCountLifetime            ?? d.txCountLifetime,
    daysDormant:                liveFacts.daysDormant                ?? d.daysDormant,
    isContract:                 liveFacts.isContract                 ?? d.isContract,
    totalBalanceUsd:            liveFacts.totalBalanceUsd            ?? d.totalBalanceUsd,
    isSafeWallet:               liveFacts.isSafeWallet               ?? d.isSafeWallet,
    isMultisig:                 liveFacts.isMultisig                 ?? d.isMultisig,
    isAccountAbstractionWallet: liveFacts.isAccountAbstractionWallet ?? d.isAccountAbstractionWallet,
  };
}
