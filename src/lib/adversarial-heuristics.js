/**
 * Adversarial behavior heuristics for Quantum Intelligence scoring.
 *
 * All signals are deterministic heuristic estimates derived exclusively from
 * existing WalletWall data (wallet graph, Whale Watcher transactions, 12-week
 * Dune activity).  They represent behavioral observations, not accusations or
 * findings of wrongdoing.
 *
 * Language guardrails:
 *   Preferred: resembles, suggests, may indicate, increases exposure,
 *              low/medium/high confidence, behavioral exposure,
 *              routing exposure, risk signal, risk posture.
 *   Prohibited: scam, fraud, criminal, malicious, mule, lure,
 *               drop trading, trust scam, bait-and-switch.
 */

/** @typedef {'low'|'medium'|'high'} Confidence */

/**
 * @typedef {Object} AdversarialSignal
 * @property {number}     score      - 0.0–1.0 risk signal strength
 * @property {Confidence} confidence - reflects data completeness, not accusatory certainty
 * @property {string}     reason     - non-accusatory plain-language explanation
 * @property {Object}     evidence   - small safe numeric facts only
 */

/**
 * @typedef {Object} AdversarialSignals
 * @property {AdversarialSignal} extractionStyleActivityRisk
 * @property {AdversarialSignal} counterpartyConcentrationRisk
 * @property {AdversarialSignal} relayRoutingExposure
 * @property {AdversarialSignal} activityRampRisk
 * @property {AdversarialSignal} assetValueAmbiguityRisk
 */

const RELAY_WINDOW_MS = 3_600_000; // 1 hour

// ── Signal factories ──────────────────────────────────────────────────────────

/**
 * Build a fully-formed AdversarialSignal.
 * @param {number}     score
 * @param {Confidence} confidence
 * @param {string}     reason
 * @param {Object}     [evidence={}]
 * @returns {AdversarialSignal}
 */
function makeSignal(score, confidence, reason, evidence = {}) {
  return { score, confidence, reason, evidence };
}

/** Default safe signal for missing or insufficient data. */
function safeSignal(reason) {
  return makeSignal(0.05, 'low', reason);
}

// ── Timestamp normalisation ───────────────────────────────────────────────────

/**
 * Normalise a raw timestamp value (unix int, unix string, or ISO string) to ms.
 * @param {number|string|null|undefined} ts
 * @returns {number}
 */
function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      const n = Number.parseInt(ts, 10);
      return n < 1e12 ? n * 1000 : n;
    }
    return new Date(ts).getTime() || 0;
  }
  return 0;
}

// ── Scoring sub-functions (pure, no side-effects) ─────────────────────────────

/**
 * Return score/confidence/reason for extraction-style activity.
 * @param {number} ratio         - largest outgoing / total outgoing
 * @param {number} outgoingCount
 * @returns {{ score: number, confidence: Confidence, reason: string }}
 */
function scoreExtractionStyleActivity(ratio, outgoingCount) {
  if (ratio >= 0.75 && outgoingCount >= 5) {
    return { score: 0.82, confidence: 'medium', reason: 'Recent movement resembles extraction-style activity' };
  }
  if (ratio >= 0.6 && outgoingCount >= 3) {
    return { score: 0.55, confidence: 'low', reason: 'Single dominant outgoing movement may indicate extraction-style activity' };
  }
  if (ratio >= 0.45) {
    return { score: 0.28, confidence: 'low', reason: 'Moderate outgoing concentration observed; increases behavioral exposure' };
  }
  return { score: 0.08, confidence: 'low', reason: 'No extraction-style pattern observed in available data' };
}

/**
 * Return score/confidence/reason for counterparty concentration.
 * @param {number} topShare  - top counterparty's fraction of total volume
 * @param {number} uniqueCps - number of unique counterparties
 * @returns {{ score: number, confidence: Confidence, reason: string }}
 */
function scoreCounterpartyConcentration(topShare, uniqueCps) {
  if (topShare >= 0.8 && uniqueCps <= 3) {
    return { score: 0.85, confidence: 'high', reason: 'Counterparty concentration increases behavioral exposure' };
  }
  if (topShare >= 0.65 && uniqueCps <= 5) {
    return { score: 0.6, confidence: 'medium', reason: 'High counterparty concentration may indicate a coordination-like pattern' };
  }
  if (topShare >= 0.5) {
    return { score: 0.35, confidence: 'low', reason: 'Moderate counterparty concentration observed' };
  }
  return { score: 0.08, confidence: 'low', reason: 'Counterparty diversity appears normal in available data' };
}

/**
 * Return an AdversarialSignal for the activity ramp using 12-week Dune data.
 * @param {number} avgRecent    - mean intensity over last 14 days
 * @param {number} avgBaseline  - mean intensity over prior days
 * @param {number} baselineDays - number of baseline days used
 * @returns {AdversarialSignal}
 */
function scoreActivityRampFromDune(avgRecent, avgBaseline, baselineDays) {
  if (avgBaseline === 0) {
    if (avgRecent > 0.1) {
      return makeSignal(0.7, 'medium',
        'Quiet baseline followed by sharp recent activity increases ramp risk',
        { avgRecentIntensity: +avgRecent.toFixed(3), avgBaselineIntensity: 0, baselineDays },
      );
    }
    return safeSignal('Minimal activity across 12-week window');
  }

  const rampRatio = avgRecent / avgBaseline;
  const evidence  = {
    avgRecentIntensity:   +avgRecent.toFixed(3),
    avgBaselineIntensity: +avgBaseline.toFixed(3),
    rampRatio:            +rampRatio.toFixed(2),
    baselineDays,
  };

  if (rampRatio >= 4 && avgRecent > 0.2) {
    return makeSignal(0.8, 'high', 'Quiet baseline followed by sharp recent activity increases ramp risk', evidence);
  }
  if (rampRatio >= 2.5 && avgRecent > 0.15) {
    return makeSignal(0.55, 'medium', 'Activity ramp observed relative to prior baseline', evidence);
  }
  if (rampRatio >= 1.5) {
    return makeSignal(0.25, 'low', 'Moderate increase in recent activity relative to baseline', evidence);
  }
  return makeSignal(0.08, 'low', 'No significant activity ramp observed in 12-week data', evidence);
}

/**
 * Return an AdversarialSignal for the activity ramp using raw transaction counts.
 * @param {number} recent7dCount  - transactions in the last 7 days
 * @param {number} prior21dCount  - transactions in the 7–28 day window
 * @returns {AdversarialSignal}
 */
function scoreActivityRampFromTxs(recent7dCount, prior21dCount) {
  if (prior21dCount === 0 && recent7dCount > 5) {
    return makeSignal(0.6, 'low',
      'Recent activity spike with no prior baseline may indicate activity ramp',
      { recent7dTxCount: recent7dCount, prior21dTxCount: 0 },
    );
  }
  if (prior21dCount === 0) return safeSignal('Insufficient baseline data to assess ramp risk');

  const recentRate   = recent7dCount / 7;
  const baselineRate = prior21dCount / 21;
  if (baselineRate === 0) return safeSignal('No baseline activity to compare against');

  const rampRatio = recentRate / baselineRate;
  const evidence  = { recent7dTxCount: recent7dCount, prior21dTxCount: prior21dCount, rampRatio: +rampRatio.toFixed(2) };

  if (rampRatio >= 4) {
    return makeSignal(0.65, 'low', 'Activity ramp suggests sharp recent increase relative to prior period', evidence);
  }
  if (rampRatio >= 2) {
    return makeSignal(0.35, 'low', 'Moderate activity increase relative to prior period', evidence);
  }
  return safeSignal('No significant activity ramp observed in available data');
}

// ── 1. Extraction-style activity risk ─────────────────────────────────────────

/**
 * Assess whether outgoing transaction patterns resemble extraction-style activity.
 * Triggered when a single large outgoing movement dominates observed outgoing volume.
 *
 * @param {Array} txs
 * @param {string|null|undefined} address
 * @returns {AdversarialSignal}
 */
function deriveExtractionStyleActivityRisk(txs, address) {
  const addrLc = address?.toLowerCase();
  if (!addrLc || !Array.isArray(txs) || txs.length < 2) {
    return safeSignal('Insufficient transaction data to assess extraction-style activity');
  }

  const outgoing = txs.filter(
    t => typeof t.from === 'string' && t.from.toLowerCase() === addrLc && (t.valueUSD || 0) > 0,
  );
  if (outgoing.length < 2) {
    return safeSignal('Too few outgoing transactions to assess extraction-style activity');
  }

  const values   = outgoing.map(t => t.valueUSD || 0);
  const totalOut = values.reduce((s, v) => s + v, 0);
  const maxOut   = Math.max(...values);

  if (totalOut === 0) return safeSignal('No outgoing USD value observed');

  const ratio                    = maxOut / totalOut;
  const { score, confidence, reason } = scoreExtractionStyleActivity(ratio, outgoing.length);

  return makeSignal(score, confidence, reason, {
    largestOutgoingUsd: +maxOut.toFixed(2),
    totalOutgoingUsd:   +totalOut.toFixed(2),
    concentrationRatio: +ratio.toFixed(3),
    outgoingTxCount:    outgoing.length,
  });
}

// ── 2. Counterparty concentration risk ────────────────────────────────────────

/**
 * Assess whether activity is concentrated among one or very few counterparties.
 * High concentration suggests reduced counterparty diversity and may indicate
 * a coordination-like pattern.
 *
 * @param {Array} txs
 * @param {string|null|undefined} address
 * @returns {AdversarialSignal}
 */
function deriveCounterpartyConcentrationRisk(txs, address) {
  const addrLc = address?.toLowerCase();
  if (!addrLc || !Array.isArray(txs) || txs.length < 2) {
    return safeSignal('Insufficient transaction data to assess counterparty concentration');
  }

  const cpVolume = {};
  let totalVolume = 0;

  for (const tx of txs) {
    const from = tx.from?.toLowerCase();
    const to   = tx.to?.toLowerCase();
    if (!from || !to) continue;

    let other = null;
    if (from === addrLc) {
      other = to;
    } else if (to === addrLc) {
      other = from;
    }
    if (!other || other === addrLc) continue;

    const v = tx.valueUSD || 0;
    cpVolume[other] = (cpVolume[other] || 0) + v;
    totalVolume += v;
  }

  const uniqueCps = Object.keys(cpVolume).length;
  if (uniqueCps === 0) return safeSignal('No counterparty activity observed');

  const topVolume                    = Math.max(...Object.values(cpVolume));
  const topShare                     = totalVolume > 0 ? topVolume / totalVolume : 0;
  const { score, confidence, reason } = scoreCounterpartyConcentration(topShare, uniqueCps);

  return makeSignal(score, confidence, reason, {
    uniqueCounterparties: uniqueCps,
    topCounterpartyShare: +topShare.toFixed(3),
    totalVolumeUsd:       +totalVolume.toFixed(2),
  });
}

// ── 3. Relay/routing exposure ─────────────────────────────────────────────────

/**
 * Assess whether the wallet exhibits relay or routing-like transaction patterns.
 * Detected when incoming value is closely followed by outgoing value to different
 * addresses within a short time window.
 *
 * @param {Array} txs
 * @param {string|null|undefined} address
 * @returns {AdversarialSignal}
 */
function deriveRelayRoutingExposure(txs, address) {
  const addrLc = address?.toLowerCase();
  if (!addrLc || !Array.isArray(txs) || txs.length < 3) {
    return safeSignal('Insufficient transaction data to assess routing-like patterns');
  }

  const incoming = txs
    .filter(t => t.to?.toLowerCase() === addrLc && (t.valueUSD || 0) > 0)
    .map(t => ({ ms: tsToMs(t.timeStamp), value: t.valueUSD || 0 }))
    .filter(t => t.ms > 0)
    .sort((a, b) => a.ms - b.ms);

  const outgoing = txs
    .filter(t => t.from?.toLowerCase() === addrLc && (t.valueUSD || 0) > 0)
    .map(t => ({ ms: tsToMs(t.timeStamp), value: t.valueUSD || 0 }))
    .filter(t => t.ms > 0)
    .sort((a, b) => a.ms - b.ms);

  if (incoming.length < 2 || outgoing.length < 2) {
    return safeSignal('Insufficient bidirectional activity to assess routing exposure');
  }

  // Count incoming txs where an outgoing tx follows within the relay window
  let relayPairs = 0;
  for (const inc of incoming) {
    const hasFollowup = outgoing.some(
      out => out.ms > inc.ms && out.ms - inc.ms <= RELAY_WINDOW_MS,
    );
    if (hasFollowup) relayPairs++;
  }

  const relayRatio = relayPairs / incoming.length;
  const evidence   = {
    incomingTxCount: incoming.length,
    outgoingTxCount: outgoing.length,
    relayPairCount:  relayPairs,
    relayRatio:      +relayRatio.toFixed(3),
  };

  if (relayRatio >= 0.6 && relayPairs >= 4) {
    return makeSignal(0.78, 'medium', 'Routing-like graph pattern increases relay exposure', evidence);
  }
  if (relayRatio >= 0.4 && relayPairs >= 2) {
    return makeSignal(0.45, 'low', 'Transaction timing suggests relay routing-like activity', evidence);
  }
  if (relayRatio >= 0.2) {
    return makeSignal(0.2, 'low', 'Mild in-out timing overlap observed; routing signal is low confidence', evidence);
  }
  return makeSignal(0.06, 'low', 'No routing-like pattern observed in available data', evidence);
}

// ── 4. Activity ramp risk ─────────────────────────────────────────────────────

/**
 * Assess whether recent on-chain activity represents a sharp ramp-up relative
 * to a prior baseline.  Prefers 12-week Dune data; falls back to raw tx timestamps.
 *
 * @param {Object|null|undefined} dune12wData - Dune 12-week activity object
 * @param {string|null|undefined} address
 * @param {Array} txs - fallback when no 12-week data
 * @returns {AdversarialSignal}
 */
function deriveActivityRampRisk(dune12wData, address, txs) {
  const addrLc = address?.toLowerCase();

  // Primary path: 12-week Dune data (richer baseline)
  if (addrLc && dune12wData?.wallets?.[addrLc]?.activity12w?.length >= 14) {
    const days = dune12wData.wallets[addrLc].activity12w
      .filter(d => typeof d.intensity_score === 'number')
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const recent   = days.slice(-14);
    const baseline = days.slice(0, -14);

    if (baseline.length < 7) {
      return safeSignal('Insufficient 12-week baseline to assess activity ramp');
    }

    const avgRecent   = recent.reduce((s, d) => s + d.intensity_score, 0) / recent.length;
    const avgBaseline = baseline.reduce((s, d) => s + d.intensity_score, 0) / baseline.length;
    return scoreActivityRampFromDune(avgRecent, avgBaseline, baseline.length);
  }

  // Fallback: raw tx timestamp rate comparison
  if (!Array.isArray(txs) || txs.length < 3) {
    return safeSignal('Insufficient data to assess activity ramp risk');
  }

  const nowMs    = Date.now();
  const recent7d = txs.filter(t => (nowMs - tsToMs(t.timeStamp)) < 7 * 86_400_000);
  const prior21d = txs.filter(t => {
    const age = nowMs - tsToMs(t.timeStamp);
    return age >= 7 * 86_400_000 && age < 28 * 86_400_000;
  });

  return scoreActivityRampFromTxs(recent7d.length, prior21d.length);
}

// ── 5. Asset/value ambiguity risk ─────────────────────────────────────────────

/**
 * Assess whether token or value fields are ambiguous, missing, or unverifiable.
 * High ambiguity lowers overall confidence in the behavioral assessment.
 *
 * @param {Array} txs
 * @returns {AdversarialSignal}
 */
function deriveAssetValueAmbiguityRisk(txs) {
  if (!Array.isArray(txs) || txs.length === 0) {
    return safeSignal('No transaction data to assess asset/value ambiguity');
  }

  const total   = txs.length;
  const missing = txs.filter(t => t.valueUSD == null || t.valueUSD === 0).length;
  const ambiguousTokens = txs.filter(t =>
    t.tokenName?.toLowerCase()   === 'unknown' ||
    t.tokenSymbol?.toLowerCase() === 'unknown' ||
    // non-zero raw value but no USD price attached
    (!t.valueUSD && t.value && t.value !== '0'),
  ).length;

  const missingRatio  = missing / total;
  const ambigRatio    = ambiguousTokens / total;
  const combinedRatio = Math.max(missingRatio, ambigRatio);
  const evidence      = {
    totalTxCount:        total,
    missingValueCount:   missing,
    ambiguousTokenCount: ambiguousTokens,
    missingValueRatio:   +missingRatio.toFixed(3),
  };

  if (combinedRatio >= 0.7) {
    return makeSignal(0.75, 'medium', 'Token/value ambiguity lowers confidence in behavioral assessment', evidence);
  }
  if (combinedRatio >= 0.4) {
    return makeSignal(0.45, 'low', 'Significant missing or unpriced token activity increases asset/value ambiguity', evidence);
  }
  if (combinedRatio >= 0.2) {
    return makeSignal(0.22, 'low', 'Moderate asset/value ambiguity observed in available transaction data', evidence);
  }
  return makeSignal(0.06, 'low', 'Asset/value data appears reasonably complete in available data', evidence);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Derive v1 adversarial behavior signals from existing WalletWall data.
 *
 * Returns an `adversarialSignals` object that is backward-compatible:
 * existing consumers that ignore this namespace continue to work unchanged.
 * All signals are heuristic estimates; none constitute proof of wrongdoing.
 *
 * @param {Object|null|undefined} node        - Graph node (from NodeDetailPanel)
 * @param {Object|null|undefined} walletData  - Wallet API response
 * @param {Object|null|undefined} dune12wData - 12-week Dune activity data
 * @returns {AdversarialSignals}
 */
export function deriveAdversarialSignals(node, walletData, dune12wData) {
  const address = node?.fullAddress ?? null;
  const txs     = Array.isArray(walletData?.transactions) ? walletData.transactions : [];

  return {
    extractionStyleActivityRisk:   deriveExtractionStyleActivityRisk(txs, address),
    counterpartyConcentrationRisk: deriveCounterpartyConcentrationRisk(txs, address),
    relayRoutingExposure:          deriveRelayRoutingExposure(txs, address),
    activityRampRisk:              deriveActivityRampRisk(dune12wData, address, txs),
    assetValueAmbiguityRisk:       deriveAssetValueAmbiguityRisk(txs),
  };
}
