import { isValidEvmAddress, mergeDuneIntoWalletFacts, appendDuneSourceCaveats } from './quantum-exposure-adapter.js';
import { deriveWalletSignatureExposure, deriveQuantumExposureScore } from './quantum-exposure.js';
import { buildQuantumVaultReadiness } from './quantum-vault-readiness.js';
import { buildMigrationReadiness } from './migration-readiness.js';
import { getChainSignatureProfile } from '../data/quantum/chain-signature-profiles.js';

export function isValidTarget(v) {
  const s = String(v ?? '').trim();
  return isValidEvmAddress(s) || /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.eth$/i.test(s);
}

export function shortAddr(addr) {
  const s = String(addr || '');
  if (!s.startsWith('0x') || s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function makeLiveFacts(address) {
  return {
    chain: 'ethereum', address,
    firstOutgoingTxAt: null, signedTxCount: null, txCountLifetime: null,
    totalBalanceUsd: null, daysDormant: null, isContract: null,
    isSafeWallet: null, isMultisig: null, isAccountAbstractionWallet: null,
  };
}

export function hasMatchedReadinessSources(response) {
  return Array.isArray(response?.readiness?.provenance?.sources)
    && response.readiness.provenance.sources.length > 0;
}

export function computeQuantumBaseResult(address, duneQuantumResponse, quantumReadinessResponse) {
  const liveFacts    = makeLiveFacts(address);
  const facts        = mergeDuneIntoWalletFacts(liveFacts, duneQuantumResponse);
  const chainProfile = getChainSignatureProfile(facts?.chain ?? null);
  const exposure     = deriveWalletSignatureExposure(facts, chainProfile);
  const rawScore     = deriveQuantumExposureScore(exposure);
  // The /quantum entry path has no loaded wallet graph — makeLiveFacts is
  // address-only/null, so the score is never derived from live transaction
  // facts. Flag that so the caveat copy stays honest when Dune is unavailable.
  const scoreResult  = appendDuneSourceCaveats(rawScore, duneQuantumResponse, { hasLiveFacts: false });

  const heuristicReadiness = buildQuantumVaultReadiness(null, {
    node:              { fullAddress: address, type: 'wallet' },
    exposure,
    walletFacts:       facts,
    totalBalanceUsd:   facts?.totalBalanceUsd ?? null,
    isContract:        facts?.isContract === true,
    isSafeWallet:      facts?.isSafeWallet === true,
    isMultisig:        facts?.isMultisig === true,
    canDetectContract: facts?.isContract != null,
    canDetectMultisig: (facts?.isSafeWallet != null || facts?.isMultisig != null),
  });

  const readiness = hasMatchedReadinessSources(quantumReadinessResponse)
    ? quantumReadinessResponse.readiness
    : {
      ...heuristicReadiness,
      sourceMode: 'heuristic',
      provenance: { sourceMode: 'heuristic', dataNote: 'address heuristics only — no wallet graph loaded', queryRunAt: null },
    };

  const migration = buildMigrationReadiness(facts, exposure, scoreResult);
  return { facts, exposure, scoreResult, chainProfile, readiness, migration };
}
