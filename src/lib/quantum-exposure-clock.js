const VALUE_SCORES = Object.freeze({ low: 4, medium: 10, high: 18, whale: 24 });
const SIGNATURE_SCORES = Object.freeze({ none: 0, low: 5, medium: 11, high: 17 });
const CHAIN_READINESS_SCORES = Object.freeze({ unknown: 12, low: 18, medium: 9, high: 2 });
const BRIDGE_SCORES = Object.freeze({ none: 0, low: 4, medium: 8, high: 13 });
const SCENARIO_WINDOW_MULTIPLIERS = Object.freeze({ aggressive: 0.65, moderate: 1, conservative: 1.35 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function severityFor(score, maxScore) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.75) return 'critical';
  if (ratio >= 0.5) return 'high';
  if (ratio >= 0.25) return 'medium';
  return 'low';
}

function exposureLevelFor(score) {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

function actionFor(level) {
  if (level === 'Critical') return 'Review exposure and avoid unnecessary reuse';
  if (level === 'High') return 'Prioritize migration when safe options are available';
  if (level === 'Medium') return 'Prepare migration plan';
  return 'Monitor';
}

function humanize(value) {
  return String(value).replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function valueTierFromUsd(usd) {
  if (usd == null)      return 'medium';
  if (usd >= 1_000_000) return 'whale';
  if (usd >= 100_000)   return 'high';
  if (usd >= 10_000)    return 'medium';
  return 'low';
}

function signatureReuseFromTxCount(txCount) {
  if (txCount == null) return 'none';
  if (txCount > 20)    return 'high';
  if (txCount > 5)     return 'medium';
  if (txCount > 0)     return 'low';
  return 'none';
}

function chainPqcReadinessFromProfile(chainProfile) {
  const s = chainProfile?.pqSupportStatus;
  if (s === 'available') return 'high';
  if (s === 'not_standard_wallet_default' || s === 'research_only') return 'low';
  return 'unknown';
}

/**
 * Map real wallet facts + exposure classification to the clock's input shape.
 * Falls back to neutral defaults for any field that has no data yet.
 *
 * @param {import('./quantum-exposure.js').WalletFacts|null} facts
 * @param {import('./quantum-exposure.js').WalletSignatureExposure|null} exposure
 * @param {import('../data/quantum/chain-signature-profiles.js').ChainSignatureProfile|null} chainProfile
 */
export function deriveClockInputFromWalletFacts(facts, exposure, chainProfile) {
  const f = facts ?? {};
  const e = exposure ?? {};

  const usd = typeof f.totalBalanceUsd === 'number' && f.totalBalanceUsd >= 0
    ? f.totalBalanceUsd : null;
  const txCount = typeof f.signedTxCount === 'number' ? f.signedTxCount : null;
  const dormancyYears = f.daysDormant == null
    ? 0
    : Math.round(clamp(f.daysDormant / 365, 0, 99) * 10) / 10;

  return {
    publicKeyExposed:  e.exposureStatus === 'signature_exposure_observed',
    walletValueTier:   valueTierFromUsd(usd),
    signatureReuse:    signatureReuseFromTxCount(txCount),
    dormancyYears,
    chainPqcReadiness: chainPqcReadinessFromProfile(chainProfile),
    bridgeExposure:    'none',
  };
}

export function calculateQuantumExposureClock(input = {}) {
  const {
    publicKeyExposed = false,
    walletValueTier = 'medium',
    signatureReuse = 'low',
    dormancyYears = 0,
    chainPqcReadiness = 'unknown',
    bridgeExposure = 'none',
    scenario = 'moderate',
  } = input;

  const valueScore = VALUE_SCORES[walletValueTier] ?? VALUE_SCORES.medium;
  const signatureScore = SIGNATURE_SCORES[signatureReuse] ?? SIGNATURE_SCORES.low;
  const dormancyScore = clamp(Number(dormancyYears) || 0, 0, 6) * 2.5;
  const highValueDormancyScore = dormancyYears >= 5 && ['high', 'whale'].includes(walletValueTier) ? 8 : 0;
  const chainScore = CHAIN_READINESS_SCORES[chainPqcReadiness] ?? CHAIN_READINESS_SCORES.unknown;
  const bridgeScore = BRIDGE_SCORES[bridgeExposure] ?? BRIDGE_SCORES.none;

  const drivers = [
    {
      label: 'Public key exposed on-chain',
      value: publicKeyExposed ? 'Observed' : 'Not observed',
      score: publicKeyExposed ? 28 : 4,
      maxScore: 28,
      explanation: publicKeyExposed
        ? 'Observed signing activity increases the priority of future signature migration planning.'
        : 'No exposed public key was observed in the modeled wallet facts.',
    },
    {
      label: 'Wallet value / concentration',
      value: humanize(walletValueTier),
      score: valueScore,
      maxScore: 24,
      explanation: 'Higher value concentration increases the consequence of delayed preparation.',
    },
    {
      label: 'Signature reuse / activity history',
      value: humanize(signatureReuse),
      score: signatureScore,
      maxScore: 17,
      explanation: 'More signing history increases observable signature exposure and operational reuse.',
    },
    {
      label: 'Dormancy age',
      value: `${clamp(Number(dormancyYears) || 0, 0, 99).toFixed(1)} years`,
      score: dormancyScore + highValueDormancyScore,
      maxScore: 23,
      explanation: highValueDormancyScore
        ? 'Long dormancy combined with high value raises migration urgency.'
        : 'Dormancy can delay owner attention and migration planning.',
    },
    {
      label: 'Chain post-quantum readiness',
      value: humanize(chainPqcReadiness),
      score: chainScore,
      maxScore: 18,
      explanation: 'Lower ecosystem readiness reduces the number of mature migration paths available today.',
    },
    {
      label: 'Bridge or multichain exposure',
      value: humanize(bridgeExposure),
      score: bridgeScore,
      maxScore: 13,
      explanation: 'More chains and bridges increase coordination needs and attack surface.',
    },
  ].map(driver => ({
    label: driver.label,
    value: driver.value,
    severity: severityFor(driver.score, driver.maxScore),
    explanation: driver.explanation,
    score: driver.score,
  }));

  const rawExposureScore = Math.round(clamp(
    drivers.reduce((total, driver) => total + driver.score, 0),
    0,
    100,
  ));
  const exposureLevel = exposureLevelFor(rawExposureScore);
  const readinessPercent = Math.round(clamp(100 - rawExposureScore * 0.64, 0, 100));
  const baseWindowYears = clamp(8 - rawExposureScore * 0.058, 0.8, 9);
  const multiplier = SCENARIO_WINDOW_MULTIPLIERS[scenario] ?? SCENARIO_WINDOW_MULTIPLIERS.moderate;
  const effectiveWindowYears = Math.round(baseWindowYears * multiplier * 10) / 10;
  const primaryRiskDriver = [...drivers].sort((a, b) => b.score - a.score)[0]?.label ?? 'Insufficient data';

  return {
    exposureLevel,
    readinessPercent,
    cryptoSafetyWindowLabel: `~${effectiveWindowYears.toFixed(1)} years`,
    primaryRiskDriver,
    riskDrivers: drivers.map(({ score: _score, ...driver }) => driver),
    recommendedAction: actionFor(exposureLevel),
    rawExposureScore,
    effectiveWindowYears,
  };
}
