/**
 * Minimal HS256 JWT - no external dependencies.
 *
 * SESSION_SECRET must be set in Vercel environment variables for production.
 * Production secrets must be at least 32 bytes / 256 bits.
 * Falls back to a per-process ephemeral secret for local dev so tokens work
 * within a single server session but are safely invalidated on restart.
 */
import crypto from 'node:crypto';

const MIN_SECRET_BYTES = 32;

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function secretBytes(secret) {
  return Buffer.byteLength(secret || '', 'utf8');
}

function warnJwtOnce(key, message) {
  const globalKey = `_jwtWarning_${key}`;
  if (globalThis[globalKey]) return;
  globalThis[globalKey] = true;
  console.warn(`[jwt] ${message}`);
}

function getSecret() {
  const configured = process.env.SESSION_SECRET;
  const production = isProductionRuntime();

  if (configured) {
    if (secretBytes(configured) < MIN_SECRET_BYTES) {
      if (production) {
        throw new Error('SESSION_SECRET must be at least 32 bytes in production');
      }
      warnJwtOnce('shortSecret', 'SESSION_SECRET is shorter than 32 bytes; use a stronger value outside local dev');
    }
    return configured;
  }

  if (production) {
    throw new Error('SESSION_SECRET is required in production');
  }

  if (!globalThis._ephemeralSecret) {
    globalThis._ephemeralSecret = crypto.randomBytes(32).toString('hex');
    warnJwtOnce('missingSecret', 'SESSION_SECRET not set - using ephemeral secret for local dev only');
  }
  return globalThis._ephemeralSecret;
}

const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const HEADER = b64({ alg: 'HS256', typ: 'JWT' });

export function signToken(payload) {
  const secret = getSecret();
  const body = `${HEADER}.${b64(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') throw new Error('Missing token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [h, p, s] = parts;
  const secret = getSecret();
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  // Timing-safe comparison prevents length-based side-channel attacks
  const sBuf = Buffer.from(s, 'base64url');
  const eBuf = Buffer.from(expected, 'base64url');
  if (sBuf.length !== eBuf.length || !crypto.timingSafeEqual(sBuf, eBuf)) {
    throw new Error('Invalid signature');
  }
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token expired');
  }
  return payload;
}

/** Short hash of the raw JWT used as a map key - never store the raw token in memory. */
export function tokenId(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}
