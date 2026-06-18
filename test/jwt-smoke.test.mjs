import test from 'node:test';
import assert from 'node:assert/strict';

const { signToken, verifyToken, tokenId } = await import('../api/_jwt.js');

const VALID_SECRET = 'test-session-secret-for-wallet-wall-hardening';

function resetJwtGlobals() {
  delete globalThis._ephemeralSecret;
  delete globalThis._jwtWarning_missingSecret;
  delete globalThis._jwtWarning_shortSecret;
}

function withEnv(env, fn) {
  const prev = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  for (const key of Object.keys(prev)) delete process.env[key];
  Object.assign(process.env, env);
  resetJwtGlobals();
  try {
    return fn();
  } finally {
    for (const key of Object.keys(prev)) delete process.env[key];
    for (const [key, value] of Object.entries(prev)) {
      if (value !== undefined) process.env[key] = value;
    }
    resetJwtGlobals();
  }
}

function captureWarns(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = msg => warnings.push(String(msg));
  try {
    const result = fn();
    return { warnings, result };
  } finally {
    console.warn = original;
  }
}

test('JWT session tokens round-trip and hide raw token in credit ids', () => withEnv({ SESSION_SECRET: VALID_SECRET }, () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({ iat: now, exp: now + 60, credits: 3, ip: '127.0.0.1' });
  const payload = verifyToken(token);

  assert.equal(payload.credits, 3);
  assert.equal(payload.ip, '127.0.0.1');
  assert.match(tokenId(token), /^[a-f0-9]{16}$/);
  assert.notEqual(tokenId(token), token);
}));

test('JWT verification rejects expired tokens', () => withEnv({ SESSION_SECRET: VALID_SECRET }, () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({ iat: now - 120, exp: now - 60, credits: 1, ip: '127.0.0.1' });

  assert.throws(() => verifyToken(token), /expired/i);
}));

test('JWT local dev falls back to ephemeral secret when SESSION_SECRET is missing', () => withEnv({ NODE_ENV: 'development' }, () => {
  const now = Math.floor(Date.now() / 1000);
  const { warnings, result: token } = captureWarns(() => signToken({ iat: now, exp: now + 60 }));

  assert.match(token, /^[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(verifyToken(token).exp, now + 60);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ephemeral secret/i);
  assert.doesNotMatch(warnings[0], /[A-Fa-f0-9]{32,}/);
}));

test('JWT production requires SESSION_SECRET', () => withEnv({ NODE_ENV: 'production' }, () => {
  assert.throws(() => signToken({ exp: 1 }), /SESSION_SECRET is required/i);
}));

test('JWT production rejects short SESSION_SECRET', () => withEnv({ NODE_ENV: 'production', SESSION_SECRET: 'short-secret' }, () => {
  assert.throws(() => signToken({ exp: 1 }), /at least 32 bytes/i);
}));

test('JWT accepts a valid production SESSION_SECRET', () => withEnv({ NODE_ENV: 'production', SESSION_SECRET: VALID_SECRET }, () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({ iat: now, exp: now + 60, credits: 5 });

  assert.equal(verifyToken(token).credits, 5);
}));

test('JWT local dev warns but allows a short configured SESSION_SECRET', () => withEnv({ NODE_ENV: 'development', SESSION_SECRET: 'short-secret' }, () => {
  const now = Math.floor(Date.now() / 1000);
  const { warnings, result: token } = captureWarns(() => signToken({ iat: now, exp: now + 60 }));

  assert.equal(verifyToken(token).exp, now + 60);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /shorter than 32 bytes/i);
  assert.doesNotMatch(warnings[0], /short-secret/);
}));
