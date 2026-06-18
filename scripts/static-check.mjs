import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const ignoredDirs = new Set(['.git', '.codex-validate', 'node_modules', 'dist']);
const textExts = new Set(['.js', '.jsx', '.json', '.md', '.yml', '.yaml', '.example', '']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function readText(file) {
  const name = path.basename(file);
  if (name !== '.env.example' && name.startsWith('.env')) return null;
  if (name === 'package-lock.json') return null;
  const ext = path.extname(file);
  if (!textExts.has(ext) && name !== '.gitignore') return null;
  return readFileSync(file, 'utf8');
}

const files = walk(root);
const forbidden = [
  { re: /dangerouslySetInnerHTML/, msg: 'avoid raw HTML rendering in React surfaces' },
  { re: /document\.write|\.innerHTML\s*=/, msg: 'avoid direct DOM HTML injection sinks' },
  { re: /\beval\s*\(/, msg: 'avoid eval() code-injection sink' },
  { re: /\bnew\s+Function\s*\(/, msg: 'avoid new Function() code-injection sink' },
  { re: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, msg: 'avoid string-based timer sinks' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, msg: 'private key material must not be committed' },
  { re: /"private_key"\s*:\s*"/, msg: 'service account JSON must stay out of git' },
  { re: /\b(?:OPENAI|OPENROUTER|ANTHROPIC|ETHERSCAN|ALCHEMY|COINGECKO|DUNE|UPSTASH)_[A-Z0-9_]*(?:KEY|TOKEN)[ \t]*=[ \t]*[A-Za-z0-9_-]{20,}/, msg: 'looks like a real API key assignment' },
];

for (const file of files) {
  const text = readText(file);
  if (text == null) continue;
  if (path.extname(file) === '.json') {
    try {
      JSON.parse(text);
    } catch (err) {
      failures.push(`${rel(file)}: invalid JSON (${err.message})`);
    }
  }
  for (const rule of forbidden) {
    if (rule.re.test(text)) failures.push(`${rel(file)}: ${rule.msg}`);
  }
}

for (const required of ['README.md', 'SECURITY.md', 'AGENTS.md', 'SECURITY_AUDIT_REPORT.md', '.env.example']) {
  if (!existsSync(path.join(root, required))) failures.push(`${required}: required repo-health file is missing`);
}

for (const pattern of ['.env', '.env.local', '.env.txt', 'dist/', 'walletwall-*.json', '*service-account*.json', '*.pem', '*.key']) {
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  if (!ignore.includes(pattern)) failures.push(`.gitignore: missing ${pattern}`);
}

for (const file of ['server.js', 'vite.config.js', ...files.filter(f => rel(f).startsWith('api/') && f.endsWith('.js')).map(rel)]) {
  const target = path.join(root, file);
  if (!existsSync(target)) continue;
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: syntax check failed\n${result.stderr.trim()}`);
}

if (failures.length) {
  console.error(failures.map(f => `- ${f}`).join('\n'));
  process.exit(1);
}

console.log(`static-check: ${files.length} files scanned, API syntax checks passed`);
