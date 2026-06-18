/**
 * Local dev server — mimics Vercel serverless runtime.
 * Usage: node server.js
 * Does NOT require Vercel account login.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const LOCAL_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function parseAllowedOrigins(value) {
  return new Set(String(value || '')
    .split(/[\s,]+/)
    .map(origin => origin.trim())
    .filter(Boolean)
    .map(origin => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean));
}

function getAllowedOrigins() {
  const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  if (process.env.VERCEL_URL) {
    const vercelUrl = process.env.VERCEL_URL;
    const vercelOrigin = /^https?:\/\//.test(vercelUrl) ? vercelUrl : `https://${vercelUrl}`;
    for (const origin of parseAllowedOrigins(vercelOrigin)) {
      allowed.add(origin);
    }
  }
  return allowed;
}

function getAllowedCorsOrigin(origin) {
  if (!origin) return null;

  let normalizedOrigin;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    normalizedOrigin = parsed.origin;
  } catch {
    return null;
  }

  if (LOCAL_ORIGIN_RE.test(normalizedOrigin)) return normalizedOrigin;
  return getAllowedOrigins().has(normalizedOrigin) ? normalizedOrigin : null;
}

// ── Load .env ──────────────────────────────────────────────────────────────
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  });
  console.log('[env] Loaded .env');
} catch {
  console.log('[env] No .env file — running in mock mode');
}

// ── Import API handlers ────────────────────────────────────────────────────
const handlers = {};
for (const file of fs.readdirSync(path.join(__dirname, 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_'))) {
  const mod = await import(pathToFileURL(path.join(__dirname, 'api', file)).href);
  handlers['/' + file.replace('.js', '')] = mod.default;
}
console.log('[api] Handlers:', Object.keys(handlers).join(', '));

// ── Body parser ────────────────────────────────────────────────────────────
const BODY_LIMIT = 1_048_576; // 1 MB
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''; let size = 0;
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > BODY_LIMIT) {
        const err = new Error('Request body too large'); err.code = 'BODY_TOO_LARGE'; return reject(err);
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { const err = new Error('Invalid JSON'); err.code = 'BODY_INVALID_JSON'; reject(err); }
    });
    req.on('error', reject);
  });
}

async function handleApiRoute(pathname, nodeReq, nodeRes, url) {
  const key     = pathname.slice(4);
  const handler = handlers[key] || handlers[key.split('/')[0]];
  if (!handler) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ error: `No handler for ${key}` }));
    return;
  }

  const query = {};
  url.searchParams.forEach((v, k) => (query[k] = v));
  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(nodeReq.method)) {
    try { body = await readBody(nodeReq); }
    catch (e) {
      const status = e.code === 'BODY_TOO_LARGE' ? 413 : 400;
      nodeRes.writeHead(status, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: e.message })); return;
    }
  }

  const socketShim = { remoteAddress: nodeReq.socket?.remoteAddress || '127.0.0.1' };
  const mockReq = {
    method:  nodeReq.method,
    headers: { ...nodeReq.headers, 'x-forwarded-for': nodeReq.socket?.remoteAddress || '127.0.0.1' },
    query, body, socket: socketShim,
  };

  let statusCode = 200;
  const mockRes = {
    status(code) { statusCode = code; return this; },
    json(data) {
      if (!nodeRes.headersSent) nodeRes.writeHead(statusCode, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify(data));
    },
    setHeader(k, v) { if (!nodeRes.headersSent) nodeRes.setHeader(k, v); },
    end(d) { if (!nodeRes.headersSent) { nodeRes.writeHead(statusCode); } nodeRes.end(d); },
  };

  try {
    await handler(mockReq, mockRes);
  } catch (e) {
    console.error('[api error]', pathname, e.stack || e.message);
    if (!nodeRes.headersSent) {
      nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}

// ── MIME types for static assets ───────────────────────────────────────────
const MIME = {
  '.js':    'application/javascript',
  '.mjs':   'application/javascript',
  '.css':   'text/css',
  '.html':  'text/html; charset=utf-8',
  '.json':  'application/json',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.eot':   'application/vnd.ms-fontobject',
  '.webp':  'image/webp',
  '.txt':   'text/plain',
  '.map':   'application/json',
};

// Static roots searched in order — first hit wins.
// public/ is served as-is (brand assets, favicon). dist/ holds the Vite build.
const STATIC_ROOTS = [
  path.join(__dirname, 'public'),
  path.join(__dirname, 'dist'),
];

function tryServeStatic(pathname, nodeRes) {
  const ext  = path.extname(pathname).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return false;  // unknown extension — not a static asset

  for (const root of STATIC_ROOTS) {
    // Prevent path traversal: resolve and verify it stays under root.
    const candidate = path.resolve(root, '.' + pathname);
    if (!candidate.startsWith(root + path.sep) && candidate !== root) continue;
    try {
      const data = fs.readFileSync(candidate);
      const maxAge = ext === '.html' ? 0 : 31536000;
      nodeRes.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': ext === '.html'
          ? 'no-cache'
          : `public, max-age=${maxAge}, immutable`,
      });
      nodeRes.end(data);
      return true;
    } catch { /* not found in this root — try next */ }
  }
  return false;
}

function serveAppShell(nodeRes) {
  // Prefer the production build shell; fall back to dev-mode index for `npm run api`.
  const candidates = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, 'index.html'),
  ];
  for (const p of candidates) {
    try {
      const html = fs.readFileSync(p, 'utf8');
      nodeRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      nodeRes.end(html);
      return;
    } catch { /* try next */ }
  }
  nodeRes.writeHead(500);
  nodeRes.end('Could not read index.html');
}

// ── Request handler ────────────────────────────────────────────────────────
const server = http.createServer(async (nodeReq, nodeRes) => {
  const url      = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  nodeRes.setHeader('X-Content-Type-Options', 'nosniff');
  nodeRes.setHeader('Referrer-Policy', 'no-referrer');
  nodeRes.setHeader('X-Frame-Options', 'DENY');
  nodeRes.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  nodeRes.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);

  const origin = nodeReq.headers['origin'] || '';
  const allowedOrigin = getAllowedCorsOrigin(origin);
  if (allowedOrigin) {
    nodeRes.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    nodeRes.setHeader('Vary', 'Origin');
  }
  nodeRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  nodeRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (nodeReq.method === 'OPTIONS') { nodeRes.writeHead(204); nodeRes.end(); return; }

  if (pathname.startsWith('/api/')) {
    await handleApiRoute(pathname, nodeReq, nodeRes, url);
    return;
  }

  // Serve static assets (JS, CSS, fonts, images…) from public/ and dist/.
  if (tryServeStatic(pathname, nodeRes)) return;

  // SPA fallback — all unmatched routes render the app shell.
  serveAppShell(nodeRes);
});

server.listen(PORT, () => {
  console.log(`\n🌌 CryptoConstellation  →  http://localhost:${PORT}`);
  console.log(`   /api/token           →  GET`);
  console.log(`   /api/wallet          →  GET ?address=vitalik.eth`);
  console.log(`   /api/analyze         →  POST (requires x-session-token)`);
  console.log(`   /api/chat            →  POST (requires x-session-token)\n`);
});
