import { getOrCache, readOrCache } from './_dune.js';
import { getClientIp, takeRequestAllowance } from './_ratelimit.js';

const ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

export function safeStr(value) {
  const text = String(value ?? '').trim();
  if (!text || text === 'null' || text === 'undefined') return null;
  return text;
}

export function safeNum(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

export function isEvmAddress(value) {
  return ADDRESS_RE.test(String(value ?? '').trim());
}

export function emptyPayload(data) {
  return {
    ...data,
    queryRunAt: null,
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
}

export async function requireGetAllowance(req, res, name, limit) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return false;
  }
  const allowance = await takeRequestAllowance(name, getClientIp(req), { limit, windowSeconds: 3_600 });
  if (allowance.configError) {
    res.status(allowance.status || 503).json({ error: allowance.error, detail: allowance.detail });
    return false;
  }
  if (!allowance.allowed) {
    res.status(429).json({ error: 'Too many requests.', retryAfterSeconds: allowance.resetInSeconds });
    return false;
  }
  return true;
}

export function getAddressParam(req, res) {
  const address = String(req.query.address ?? '').trim();
  if (isEvmAddress(address)) return address;
  res.status(400).json({ error: 'address must be a valid 0x EVM address' });
  return null;
}

export async function readScheduledRows(queryId, options, warnings, logName, warning) {
  try {
    return await readOrCache(queryId, options);
  } catch (err) {
    console.error(`[${logName}] Dune fetch failed:`, err?.message);
    warnings.push(warning);
    return { rows: [], queryRunAt: null };
  }
}

const PARAMETERIZED_TTL = 43_200; // 12h — movement/breakdown/affinity; per Dune quota constraints

export async function readParameterizedRows(queryId, address, warnings, logName, warning) {
  try {
    return await getOrCache(queryId, { wallet_address: address.toLowerCase() }, { ttlSeconds: PARAMETERIZED_TTL });
  } catch (err) {
    console.error(`[${logName}] Dune fetch failed:`, err?.message);
    warnings.push(warning);
    return { rows: [], queryRunAt: null };
  }
}
