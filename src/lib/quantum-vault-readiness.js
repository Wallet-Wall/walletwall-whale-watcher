/**
 * Quantum Vault Readiness
 *
 * Pure, non-custodial scoring helpers for vault readiness and quantum exposure.
 * Higher scores mean stronger readiness.
 */

export const CONTROL_STATUS = {
  DETECTED:     'detected',
  NOT_DETECTED: 'not_detected',
  UNKNOWN:      'unknown',
};

export const FINDING_SEVERITY = {
  INFO:   'info',
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
};

export const VAULT_POLICY_DELTAS = {
  withdrawal_delay_24h:          8,
  withdrawal_delay_72h:         12,
  multisig_2_of_3:              18,
  guardian_cancel_key:          12,
  fresh_destination_enforcement: 10,
  emergency_freeze:             10,
  hardware_cold_wallet:         12,
};

const LEGACY_POLICY_IDS = {
  withdrawalDelay24h:        'withdrawal_delay_24h',
  withdrawalDelay72h:        'withdrawal_delay_72h',
  multisig2of3:             'multisig_2_of_3',
  guardianCancelKey:        'guardian_cancel_key',
  freshDestinationEnforced: 'fresh_destination_enforcement',
  emergencyFreeze:          'emergency_freeze',
  coldWalletCustody:        'hardware_cold_wallet',
};

const BASE_READINESS_SCORE = 62;
const MEANINGFUL_BALANCE_USD = 10_000;
const HIGH_VALUE_USD = 100_000;
const VERY_HIGH_VALUE_USD = 1_000_000;
const DORMANT_DAYS = 180;

function clampScore(score) {
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function readinessBand(score) {
  const normalized = clampScore(score);
  if (normalized >= 90) return 'resilient';
  if (normalized >= 70) return 'strong';
  if (normalized >= 40) return 'moderate';
  return 'weak';
}

function exposureLevel(score) {
  const normalized = clampScore(score);
  if (normalized >= 80) return 'low';
  if (normalized >= 55) return 'moderate';
  if (normalized >= 30) return 'elevated';
  return 'high';
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function normalizedAddress(address) {
  return typeof address === 'string' && address.length > 0 ? address.toLowerCase() : null;
}

function txTimestampMs(tx) {
  const raw = tx?.timeStamp ?? tx?.timestamp ?? tx?.date ?? tx?.blockTime;
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw;
  if (/^\d+$/.test(String(raw))) {
    const n = Number.parseInt(String(raw), 10);
    return n < 1e12 ? n * 1000 : n;
  }
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function daysSince(value, nowMs) {
  const ms = txTimestampMs({ timeStamp: value });
  if (!ms) return null;
  const diff = nowMs - ms;
  return diff >= 0 ? Math.floor(diff / 86_400_000) : null;
}

function hasTruthyValue(value) {
  return value === true || value === 'true' || value === 'detected';
}

function controlStatus(detected, canDetect) {
  if (detected) return CONTROL_STATUS.DETECTED;
  if (canDetect) return CONTROL_STATUS.NOT_DETECTED;
  return CONTROL_STATUS.UNKNOWN;
}

function finding(id, severity, label, detail) {
  return { id, severity, label, detail };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))];
}

function parsePolicySelection(selectedPolicies) {
  if (Array.isArray(selectedPolicies)) {
    return selectedPolicies.map(policy => LEGACY_POLICY_IDS[policy] ?? policy);
  }

  if (selectedPolicies && typeof selectedPolicies === 'object') {
    return Object.entries(selectedPolicies)
      .filter(([, enabled]) => enabled)
      .map(([policy]) => LEGACY_POLICY_IDS[policy] ?? policy);
  }

  return [];
}

function inferOutgoingTransactions(walletData, address, options) {
  const hasTransactions = Array.isArray(walletData?.transactions);
  const hasTransfers = Array.isArray(walletData?.transfers);
  const hasActivity = Array.isArray(walletData?.activity);
  const hasActivityData = hasTransactions || hasTransfers || hasActivity;
  const txs = hasTransactions ? walletData.transactions : [];
  const transfers = hasTransfers ? walletData.transfers : [];
  const activity = hasActivity ? walletData.activity : [];
  const allActivity = [...txs, ...transfers, ...activity];
  const outgoing = address
    ? allActivity.filter(item => normalizedAddress(item?.from) === address || item?.direction === 'out')
    : allActivity.filter(item => item?.direction === 'out');

  const explicitOutgoing = firstNumber(
    options.outgoingTxCount,
    options.walletFacts?.signedTxCount,
    walletData?.outgoingTxCount,
  );
  const txCount = firstNumber(
    options.txCount,
    walletData?.txCount,
    walletData?.transactionCount,
    options.walletFacts?.txCountLifetime,
  ) ?? (hasActivityData ? allActivity.length : null);

  return {
    allActivity,
    outgoing,
    outgoingTxCount: explicitOutgoing ?? (hasActivityData ? outgoing.length : null),
    txCount,
  };
}

function inferAddressReuse(activity, outgoing, address) {
  const counterparties = new Set();
  for (const item of activity) {
    const to = normalizedAddress(item?.to);
    const from = normalizedAddress(item?.from);
    if (to && to !== address) counterparties.add(to);
    if (from && from !== address) counterparties.add(from);
  }

  const outgoingDays = new Set(
    outgoing
      .map(txTimestampMs)
      .filter(ms => ms > 0)
      .map(ms => new Date(ms).toISOString().slice(0, 10)),
  );

  return outgoing.length >= 5 || outgoingDays.size >= 3 || counterparties.size >= 5;
}

function inferSampledData(walletData) {
  return walletData?.dataQuality?.isPartial === true
    || walletData?.transactionSample?.isSampled === true
    || walletData?.sampledData === true;
}

function inferControls(walletData, options, activity, outgoing) {
  const facts = options.walletFacts ?? {};
  const migration = (options.quantumFacts ?? options.sourceFacts)?.migrationReadiness;
  const detectedMultisig = hasTruthyValue(options.isMultisig)
    || hasTruthyValue(options.isSafeWallet)
    || hasTruthyValue(facts.isMultisig)
    || hasTruthyValue(facts.isSafeWallet)
    || hasTruthyValue(walletData?.controls?.multisig)
    || migration?.multisigStatus === CONTROL_STATUS.DETECTED;
  const detectedTimelock = hasTruthyValue(options.hasTimelock)
    || hasTruthyValue(facts.hasTimelock)
    || hasTruthyValue(walletData?.controls?.timelock)
    || migration?.timelockStatus === CONTROL_STATUS.DETECTED;
  const detectedGuardian = hasTruthyValue(options.hasGuardian)
    || hasTruthyValue(facts.hasGuardian)
    || hasTruthyValue(walletData?.controls?.guardian)
    || migration?.guardianStatus === CONTROL_STATUS.DETECTED;

  const canDetectActivityPattern = activity.length > 0 || outgoing.length > 0;
  const canDetectMultisig = options.canDetectMultisig === true
    || migration?.multisigStatus === CONTROL_STATUS.NOT_DETECTED;
  const canDetectTimelock = options.canDetectTimelock === true
    || migration?.timelockStatus === CONTROL_STATUS.NOT_DETECTED;
  const canDetectGuardian = options.canDetectGuardian === true
    || migration?.guardianStatus === CONTROL_STATUS.NOT_DETECTED;

  return {
    multisig: controlStatus(detectedMultisig, canDetectMultisig),
    timelock: controlStatus(detectedTimelock, canDetectTimelock),
    guardian: controlStatus(detectedGuardian, canDetectGuardian),
    freshWalletPattern: controlStatus(outgoing.length === 0 && canDetectActivityPattern, canDetectActivityPattern),
  };
}

function quantumFactsAsOptions(options = {}) {
  const facts = options.quantumFacts ?? options.sourceFacts;
  if (!facts || typeof facts !== 'object') return options;

  return {
    ...options,
    walletFacts: {
      ...options.walletFacts,
      signedTxCount: facts.signatureExposure?.signedTxCount ?? options.walletFacts?.signedTxCount,
      totalBalanceUsd: facts.valueAtRisk?.totalBalanceUsd ?? options.walletFacts?.totalBalanceUsd,
      daysDormant: facts.dormancy?.daysDormant ?? options.walletFacts?.daysDormant,
      isContract: facts.migrationReadiness?.isContract ?? options.walletFacts?.isContract,
    },
    totalBalanceUsd: options.totalBalanceUsd ?? facts.valueAtRisk?.totalBalanceUsd ?? null,
    daysDormant: options.daysDormant ?? facts.dormancy?.daysDormant ?? null,
    outgoingTxCount: options.outgoingTxCount ?? facts.signatureExposure?.signedTxCount ?? null,
  };
}

function inferWalletSignals(walletData = {}, options = {}) {
  options = quantumFactsAsOptions(options);
  const address = normalizedAddress(
    options.address ?? options.node?.fullAddress ?? walletData?.address ?? walletData?.searchTarget,
  );
  const { allActivity, outgoing, outgoingTxCount, txCount } = inferOutgoingTransactions(walletData, address, options);
  const totalValueUSD = firstNumber(
    options.totalBalanceUsd,
    options.exposure?.totalBalanceUsd,
    options.walletFacts?.totalBalanceUsd,
    walletData?.totalValueUSD,
    walletData?.balanceUSD,
    walletData?.totalBalanceUsd,
  );
  const daysDormant = firstNumber(
    options.daysDormant,
    options.exposure?.daysDormant,
    options.walletFacts?.daysDormant,
  ) ?? daysSince(walletData?.lastActive ?? walletData?.lastActiveAt, options.nowMs ?? Date.now());

  const outgoingTransactions = outgoingTxCount > 0 || txCount > 0;
  const highValueConcentration = (totalValueUSD ?? 0) >= HIGH_VALUE_USD;
  const dormantWithValue = daysDormant != null
    && daysDormant >= DORMANT_DAYS
    && (totalValueUSD ?? 0) >= MEANINGFUL_BALANCE_USD;

  return {
    controls: inferControls(walletData, options, allActivity, outgoing),
    signals: {
      outgoingTransactions,
      addressReuse: inferAddressReuse(allActivity, outgoing, address),
      highValueConcentration,
      dormantWithValue,
      sampledData: inferSampledData(walletData),
    },
    metrics: {
      outgoingTxCount,
      txCount,
      totalValueUSD,
      daysDormant,
    },
  };
}

function confidenceFor(signals, metrics) {
  if (signals.sampledData) return 'low';
  const knownMetrics = [
    metrics.outgoingTxCount != null || metrics.txCount != null,
    metrics.totalValueUSD != null,
    metrics.daysDormant != null,
  ].filter(Boolean).length;

  if (knownMetrics >= 3) return 'high';
  if (knownMetrics >= 1) return 'medium';
  return 'low';
}

function applyControlScore(controls, findings, recommendations) {
  let scoreDelta = 0;

  if (controls.multisig === CONTROL_STATUS.DETECTED) {
    scoreDelta += 18;
    findings.push(finding(
      'multisig_detected',
      FINDING_SEVERITY.INFO,
      'Multisig pattern detected',
      'Available wallet signals show a multisig pattern.',
    ));
  } else if (controls.multisig === CONTROL_STATUS.NOT_DETECTED) {
    scoreDelta -= 8;
    findings.push(finding(
      'multisig_not_detected',
      FINDING_SEVERITY.LOW,
      'No multisig pattern detected',
      'Available wallet signals were sufficient to say no multisig pattern detected.',
    ));
    recommendations.push('Consider multisig vault readiness for larger balances.');
  }

  if (controls.timelock === CONTROL_STATUS.DETECTED) {
    scoreDelta += 12;
  } else if (controls.timelock === CONTROL_STATUS.NOT_DETECTED) {
    scoreDelta -= 5;
    findings.push(finding(
      'timelock_not_detected',
      FINDING_SEVERITY.LOW,
      'No timelock detected',
      'Available wallet signals were sufficient to say no timelock detected.',
    ));
  }

  if (controls.guardian === CONTROL_STATUS.DETECTED) {
    scoreDelta += 10;
  } else if (controls.guardian === CONTROL_STATUS.NOT_DETECTED) {
    scoreDelta -= 4;
    findings.push(finding(
      'guardian_not_detected',
      FINDING_SEVERITY.LOW,
      'No guardian pattern detected',
      'Available wallet signals were sufficient to say no guardian pattern detected.',
    ));
  }

  if (controls.freshWalletPattern === CONTROL_STATUS.DETECTED) {
    scoreDelta += 6;
  } else if (controls.freshWalletPattern === CONTROL_STATUS.NOT_DETECTED) {
    scoreDelta -= 4;
  }

  return scoreDelta;
}

export function scoreQuantumVaultReadiness(input = {}) {
  const controls = {
    multisig:           input.controls?.multisig ?? CONTROL_STATUS.UNKNOWN,
    timelock:           input.controls?.timelock ?? CONTROL_STATUS.UNKNOWN,
    guardian:           input.controls?.guardian ?? CONTROL_STATUS.UNKNOWN,
    freshWalletPattern: input.controls?.freshWalletPattern ?? input.controls?.freshWallet ?? CONTROL_STATUS.UNKNOWN,
  };
  const signals = {
    outgoingTransactions:   Boolean(input.signals?.outgoingTransactions ?? (input.outgoingTxCount ?? 0) > 0),
    addressReuse:           Boolean(input.signals?.addressReuse ?? input.repeatedActivity),
    highValueConcentration: Boolean(input.signals?.highValueConcentration ?? (input.totalBalanceUsd ?? 0) >= HIGH_VALUE_USD),
    dormantWithValue:       Boolean(input.signals?.dormantWithValue
      ?? ((input.daysDormant ?? 0) >= DORMANT_DAYS && (input.totalBalanceUsd ?? 0) >= MEANINGFUL_BALANCE_USD)),
    sampledData:            Boolean(input.signals?.sampledData),
  };
  const metrics = {
    outgoingTxCount: input.metrics?.outgoingTxCount ?? input.outgoingTxCount ?? null,
    txCount:         input.metrics?.txCount ?? input.txCount ?? null,
    totalValueUSD:   input.metrics?.totalValueUSD ?? input.totalBalanceUsd ?? null,
    daysDormant:     input.metrics?.daysDormant ?? input.daysDormant ?? null,
  };

  // Require at least one known metric, active signal, or resolved control to
  // produce a meaningful score.  All-null / all-unknown → null ("insufficient_data")
  // so the UI does not display a generic baseline as wallet-specific intelligence.
  const hasKnownMetric =
    metrics.outgoingTxCount != null || metrics.txCount != null ||
    metrics.totalValueUSD  != null || metrics.daysDormant   != null;
  const hasKnownControl =
    controls.multisig           !== CONTROL_STATUS.UNKNOWN ||
    controls.timelock           !== CONTROL_STATUS.UNKNOWN ||
    controls.guardian           !== CONTROL_STATUS.UNKNOWN ||
    controls.freshWalletPattern !== CONTROL_STATUS.UNKNOWN;
  const hasActiveSignal =
    signals.outgoingTransactions || signals.highValueConcentration ||
    signals.dormantWithValue     || signals.sampledData;

  if (!hasKnownMetric && !hasKnownControl && !hasActiveSignal) {
    return {
      score:           null,
      band:            'unknown',
      exposureLevel:   'unknown',
      confidence:      'low',
      findings:        [],
      recommendations: ['Fetch wallet activity or Dune auto-run facts to compute vault readiness.'],
      controls,
      signals,
      disclaimers: [
        'Vault readiness is based on available wallet signals and estimates migration readiness only.',
        'This helper is non-custodial: it does not move funds and does not request signatures.',
      ],
      status: 'insufficient_data',
    };
  }

  let score = BASE_READINESS_SCORE;
  const findings = [];
  const recommendations = [];
  const disclaimers = [
    'Vault readiness is based on available wallet signals and estimates migration readiness only.',
    'This helper is non-custodial: it does not move funds and does not request signatures.',
    'Unknown controls mean Wallet Wall cannot verify the control from current wallet data.',
  ];

  if (signals.outgoingTransactions) {
    score -= 18;
    findings.push(finding(
      'public_key_may_be_exposed',
      FINDING_SEVERITY.MEDIUM,
      'Public key may be exposed',
      'Outgoing activity means the public key may be exposed, depending on the chain and signature model.',
    ));
    recommendations.push('Consider a fresh wallet pattern or multisig vault readiness plan for long-term holdings.');
  }

  if (signals.addressReuse) {
    score -= 8;
    findings.push(finding(
      'address_reuse_pattern',
      FINDING_SEVERITY.LOW,
      'Address reuse pattern',
      'Repeated activity suggests address reuse based on available wallet signals.',
    ));
    recommendations.push('Reduce address reuse for future-resilience and migration readiness.');
  }

  if ((metrics.totalValueUSD ?? 0) >= VERY_HIGH_VALUE_USD) {
    score -= 18;
    findings.push(finding(
      'very_high_value_concentration',
      FINDING_SEVERITY.HIGH,
      'Very high value concentration',
      'A very high value appears concentrated in this wallet based on available wallet signals.',
    ));
  } else if (signals.highValueConcentration) {
    score -= 12;
    findings.push(finding(
      'high_value_concentration',
      FINDING_SEVERITY.MEDIUM,
      'High value concentration',
      'Meaningful value appears concentrated in this wallet based on available wallet signals.',
    ));
  }

  if (signals.dormantWithValue) {
    score -= 10;
    findings.push(finding(
      'dormant_meaningful_balance',
      FINDING_SEVERITY.MEDIUM,
      'Dormant wallet with meaningful value',
      'Dormancy plus meaningful value can raise future-resilience and migration readiness priority.',
    ));
    recommendations.push('Review vault readiness controls for dormant balances with meaningful value.');
  }

  if (signals.sampledData) {
    score -= 5;
    findings.push(finding(
      'sampled_data_warning',
      FINDING_SEVERITY.INFO,
      'Sampled data warning',
      'Partial or sampled data lowers confidence in this quantum exposure estimate.',
    ));
    disclaimers.push('Sampled data can hide activity patterns, so confidence is conservative.');
  }

  score += applyControlScore(controls, findings, recommendations);

  if (recommendations.length === 0) {
    recommendations.push('Keep vault readiness controls documented and review them after major wallet activity.');
  }

  const finalScore = clampScore(score);
  const confidence = input.confidence ?? confidenceFor(signals, metrics);

  return {
    score:           finalScore,
    band:            readinessBand(finalScore),
    exposureLevel:   exposureLevel(finalScore),
    confidence,
    findings,
    recommendations: uniqueStrings(recommendations),
    controls,
    signals,
    disclaimers:     uniqueStrings(disclaimers),
    status:          'heuristic_estimate',
  };
}

export function simulateVaultPolicy(baseReadiness, selectedPolicies = []) {
  const baseScore = typeof baseReadiness?.score === 'number' ? clampScore(baseReadiness.score) : 0;
  const appliedPolicies = uniqueStrings(parsePolicySelection(selectedPolicies))
    .filter(policy => Object.hasOwn(VAULT_POLICY_DELTAS, policy));
  const delta = appliedPolicies.reduce((sum, policy) => sum + VAULT_POLICY_DELTAS[policy], 0);
  const score = clampScore(baseScore + delta);
  const output = {
    score,
    band: readinessBand(score),
    exposureLevel: exposureLevel(score),
    confidence: baseReadiness?.confidence ?? 'low',
    findings: Array.isArray(baseReadiness?.findings) ? [...baseReadiness.findings] : [],
    recommendations: uniqueStrings([
      ...(Array.isArray(baseReadiness?.recommendations) ? baseReadiness.recommendations : []),
      appliedPolicies.length > 0 ? 'Simulated improvement for vault readiness policy planning.' : '',
    ]),
    controls: baseReadiness?.controls ? { ...baseReadiness.controls } : {},
    signals: baseReadiness?.signals ? { ...baseReadiness.signals } : {},
    disclaimers: uniqueStrings([
      ...(Array.isArray(baseReadiness?.disclaimers) ? baseReadiness.disclaimers : []),
      'Simulated improvement is hypothetical and does not move funds.',
      'Simulated policy planning does not request signatures.',
    ]),
    simulated: true,
    delta: score - baseScore,
    appliedPolicies,
  };

  return output;
}

export function buildQuantumVaultReadiness(walletData, options = {}) {
  return scoreQuantumVaultReadiness(inferWalletSignals(walletData ?? {}, options));
}
