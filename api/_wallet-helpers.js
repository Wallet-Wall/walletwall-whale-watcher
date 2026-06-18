// Shared pure computation helpers used by both the live wallet route and the
// mock provider adapter. No external dependencies.

export function buildTransactionSample(transactions, sampleLimit = 200) {
  const loadedCount = transactions.length;
  const times = transactions.map(tx => Number(tx.timeStamp)).filter(Number.isFinite);
  const firstLoaded = times.length ? Math.min(...times) : null;
  const lastLoaded = times.length ? Math.max(...times) : null;
  return {
    loadedCount,
    sampleLimit,
    isSampled: Number.isFinite(sampleLimit) && loadedCount >= sampleLimit,
    firstLoadedTxAt: firstLoaded ? new Date(firstLoaded * 1000).toISOString() : null,
    lastLoadedTxAt: lastLoaded ? new Date(lastLoaded * 1000).toISOString() : null,
    totalKnown: null,
  };
}

export function computeDelta7d(timeline) {
  if (!timeline || timeline.length < 14) return null;
  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7).reduce((s, d) => s + (d.volumeUSD || 0), 0);
  const prev7 = sorted.slice(-14, -7).reduce((s, d) => s + (d.volumeUSD || 0), 0);
  if (prev7 === 0) return null;
  const pct = Math.round(((last7 - prev7) / prev7) * 100);
  if (Math.abs(pct) < 5) return null;
  return { percent: Math.abs(pct), direction: pct > 0 ? 'up' : 'down' };
}

export function computeFingerprintScore(nodes, transactions, overallRiskScore) {
  const defiNodes = nodes.filter(n => n.type === 'defi');
  const defiScore = Math.min(20, defiNodes.length * 4);
  const nonTokenRatio = nodes.length ? nodes.filter(n => n.type !== 'token').length / nodes.length : 0;
  const diversityScore = Math.round(nonTokenRatio * 20);
  const avgGwei = transactions.length
    ? transactions.reduce((s, t) => s + Number(t.gasPrice || 15e9) / 1e9, 0) / transactions.length
    : 15;
  const gasScore = Math.max(0, 20 - Math.round(Math.max(0, avgGwei - 15) / 15 * 20));
  const riskScore = Math.max(0, Math.round((10 - (overallRiskScore || 0)) * 2));
  const monthly = {};
  nodes.forEach(n => (n.timeline || []).forEach(d => {
    const m = d.date.slice(0, 7);
    monthly[m] = (monthly[m] || 0) + (d.txCount || 0);
  }));
  const counts = Object.values(monthly);
  const mean = counts.length ? counts.reduce((s, v) => s + v, 0) / counts.length : 0;
  const stddev = counts.length ? Math.sqrt(counts.reduce((s, v) => s + (v - mean) ** 2, 0) / counts.length) : 0;
  const consistencyScore = Math.max(0, 20 - Math.round(stddev));
  return {
    total: defiScore + diversityScore + gasScore + riskScore + consistencyScore,
    breakdown: {
      defiSophistication: defiScore,
      protocolDiversity: diversityScore,
      gasEfficiency: gasScore,
      riskManagement: riskScore,
      activityConsistency: consistencyScore,
    },
  };
}
