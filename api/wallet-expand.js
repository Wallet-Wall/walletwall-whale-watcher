import { getClientIp, takeRequestAllowance } from './_ratelimit.js';
import { cachedLiveWalletProvider } from './_wallet-live-provider.js';
import { normalizeWalletGraphResponse } from './wallet-contract.js';

const MAX_EXPAND_NODES = 8;
const MAX_EXPAND_EDGES = 10;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const PIVOT_RE = /^[\w-]{1,60}$/;

// Transform the full wallet graph into an expansion payload anchored at pivotNodeId.
// The focal_wallet node is excluded (the pivot IS that node in the parent graph).
// All child node IDs and edge endpoints are namespaced by pivotNodeId to avoid collisions.
function buildExpansion(walletPayload, pivotNodeId) {
  const nodes = Array.isArray(walletPayload?.nodes) ? walletPayload.nodes : [];
  const edges = Array.isArray(walletPayload?.edges) ? walletPayload.edges : [];

  const childNodes = nodes
    .filter(n => n.type !== 'wallet')
    .sort((a, b) => (b.volumeUSD || 0) - (a.volumeUSD || 0))
    .slice(0, MAX_EXPAND_NODES)
    .map(n => ({ ...n, id: `exp_${pivotNodeId}_${n.id}`, _expandedFrom: pivotNodeId }));

  const originalToNew = new Map();
  childNodes.forEach(n => {
    originalToNew.set(n.id.slice(`exp_${pivotNodeId}_`.length), n.id);
  });

  const newIds = new Set(childNodes.map(n => n.id));

  const remapped = edges
    .map(e => {
      const src = e.source === 'focal_wallet' ? pivotNodeId : originalToNew.get(e.source);
      const tgt = e.target === 'focal_wallet' ? pivotNodeId : originalToNew.get(e.target);
      if (!src || !tgt) return null;
      // Skip edges where both ends are child nodes (pivot→child only for now)
      if (src !== pivotNodeId && tgt !== pivotNodeId) {
        // Still include inter-child edges, but verify both exist
        if (!newIds.has(src) || !newIds.has(tgt)) return null;
      }
      return { ...e, source: src, target: tgt };
    })
    .filter(Boolean)
    .slice(0, MAX_EXPAND_EDGES);

  return { nodes: childNodes, edges: remapped };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const rawAddr = (req.query.address || '').trim();
  const pivotNodeId = (req.query.pivot || '').trim();

  if (!rawAddr || !ADDR_RE.test(rawAddr)) {
    return res.status(400).json({ error: 'Invalid or missing address parameter' });
  }
  if (!pivotNodeId || !PIVOT_RE.test(pivotNodeId)) {
    return res.status(400).json({ error: 'Invalid pivot parameter' });
  }

  const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
  const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
  if (!ETHERSCAN_KEY && !ALCHEMY_KEY) {
    return res.status(503).json({ error: 'Wallet provider not configured for expansion' });
  }

  const ip = getClientIp(req);
  const allowance = await takeRequestAllowance('expand', ip, { limit: 20, windowSeconds: 300 });
  if (allowance.configError) {
    return res.status(allowance.status || 503).json({
      error: allowance.error,
      detail: allowance.detail,
      retryAfterSeconds: allowance.retryAfterSeconds,
    });
  }
  if (!allowance.allowed) {
    return res.status(429).json({
      error: 'Too many expansion requests. Please wait a moment.',
      retryAfterSeconds: allowance.resetInSeconds,
    });
  }

  const startedAt = Date.now();
  try {
    const keys = { etherscanKey: ETHERSCAN_KEY, alchemyKey: ALCHEMY_KEY };
    const liveResult = await cachedLiveWalletProvider({ address: rawAddr.toLowerCase(), keys, timing: { startedAt } });
    const normalized = normalizeWalletGraphResponse({
      ...liveResult.payload,
      _observabilityMeta: { durationMs: Date.now() - startedAt, freshness: liveResult.freshness },
    });
    const expansion = buildExpansion(normalized, pivotNodeId);
    res.setHeader('Cache-Control', 's-maxage=180');
    return res.status(200).json(expansion);
  } catch (err) {
    console.error('[wallet-expand] error:', err.message);
    return res.status(502).json({ error: 'Failed to fetch wallet connections' });
  }
}
