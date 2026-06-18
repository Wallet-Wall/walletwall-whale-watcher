import { ethers } from 'ethers';
import { getClientIp, takeRequestAllowance } from './_ratelimit.js';
import { normalizeWalletGraphResponse } from './wallet-contract.js';
import { mockWalletProvider } from './_wallet-providers.js';
import { cachedLiveWalletProvider } from './_wallet-live-provider.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const WALLET_RATE_LIMIT = 30;
const WALLET_RATE_WINDOW_SECONDS = 300;

function isProductionEnv() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function isMockModeEnabled() {
  return process.env.ENABLE_MOCK_MODE === 'true';
}

function handleMockMode(rawAddress, startedAt, allowMockMode, res) {
  const addr = rawAddress.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr) && !addr.endsWith('.eth')) {
    return res.status(400).json({ error: 'Invalid address format. Use a 0x address or ENS name.' });
  }
  if (!allowMockMode) {
    const body = {
      error: 'Wallet provider is not configured for production.',
      providerConfigMissing: true,
    };
    if (!isProductionEnv()) {
      body.detail = 'Configure a live wallet provider, or explicitly enable mock mode for demo wallet data.';
    }
    return res.status(503).json(body);
  }
  const mockResult = mockWalletProvider(addr);
  const mockDurationMs = Date.now() - startedAt;
  res.setHeader('Cache-Control', 's-maxage=60');
  return res.status(200).json(normalizeWalletGraphResponse({
    ...mockResult.payload,
    _observabilityMeta: {
      durationMs: mockDurationMs,
      freshness: mockResult.freshness,
      timing: { totalMs: mockDurationMs },
    },
  }));
}

async function resolveEns(address, rawAddress, alchemyKey) {
  if (!alchemyKey) {
    return { error: `"${address}" couldn't be resolved. Try the full 0x address.` };
  }
  try {
    const provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`);
    const resolved = await provider.resolveName(address);
    if (resolved) return { address: resolved };
    return { error: `"${rawAddress}" couldn't be resolved. Try the full 0x address.` };
  } catch {
    return { error: `"${rawAddress}" couldn't be resolved. Try the full 0x address.` };
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const startedAt = Date.now();
  console.info('[wallet-api] request:start', { address: String(req.query.address || '').slice(0, 42) });

  const { address: rawAddress } = req.query;
  if (!rawAddress) return res.status(400).json({ error: 'Missing address parameter' });
  if (rawAddress.length > 200) return res.status(400).json({ error: 'Invalid address' });

  const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
  const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
  const hasMockMode = !ETHERSCAN_KEY && !ALCHEMY_KEY;
  const allowMockMode = !isProductionEnv() || isMockModeEnabled();

  if (hasMockMode) return handleMockMode(rawAddress, startedAt, allowMockMode, res);

  const ip = getClientIp(req);
  const allowance = await takeRequestAllowance('wallet', ip, {
    limit: WALLET_RATE_LIMIT,
    windowSeconds: WALLET_RATE_WINDOW_SECONDS,
  });
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
      error: 'Too many wallet lookups. Please retry shortly.',
      retryAfterSeconds: allowance.resetInSeconds,
    });
  }

  let address = rawAddress.trim();
  if (address.endsWith('.eth')) {
    const resolved = await resolveEns(address, rawAddress, ALCHEMY_KEY);
    if (resolved.error) return res.status(400).json({ error: resolved.error, ensFailure: true });
    address = resolved.address;
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address format', ensFailure: true });
  }

  const keys = {
    etherscanKey: process.env.ETHERSCAN_API_KEY,
    alchemyKey:   process.env.ALCHEMY_API_KEY,
    coingeckoKey: process.env.COINGECKO_API_KEY,
    graphApiKey:  process.env.GRAPH_API_KEY,
    duneApiKey:   process.env.DUNE_API_KEY,
    duneQueryDexId:   process.env.DUNE_QUERY_DEX_ID,
    duneDeXCacheTtl:  Number(process.env.DUNE_DEX_CACHE_TTL_SECONDS) || 900,
  };

  const liveResult = await cachedLiveWalletProvider({ address, keys, timing: { startedAt } });
  const routeDurationMs = Date.now() - startedAt;
  res.setHeader('Cache-Control', 's-maxage=300');
  return res.status(200).json(normalizeWalletGraphResponse({
    ...liveResult.payload,
    _observabilityMeta: {
      durationMs: routeDurationMs,
      freshness: liveResult.freshness,
      timing: liveResult.timing
        ? { ...liveResult.timing, totalMs: routeDurationMs }
        : { totalMs: routeDurationMs },
    },
  }));
}
