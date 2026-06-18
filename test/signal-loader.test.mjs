import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformFileSync } from '@babel/core';

const JSX_OPTS = {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
};

// --- Compilation checks ---

test('loading system components compile without errors', () => {
  const files = [
    'src/components/loading/DelayedLoader.jsx',
    'src/components/loading/WalletWallSkeleton.jsx',
    'src/components/loading/SignalLoader.jsx',
  ];
  for (const file of files) {
    const result = transformFileSync(file, JSX_OPTS);
    assert.ok(result?.code?.includes('React.createElement'), `${file} must produce React.createElement calls`);
  }
});

// --- DelayedLoader structural checks ---

test('DelayedLoader initialises in hidden phase (renders null before delay)', () => {
  const src = readFileSync('src/components/loading/DelayedLoader.jsx', 'utf8');
  assert.match(src, /phase.*hidden/,  'initial phase must be "hidden"');
  assert.match(src, /phase === 'hidden'.*return null|return null.*hidden/s, 'must return null when hidden');
});

test('DelayedLoader resets to hidden when active becomes false', () => {
  const src = readFileSync('src/components/loading/DelayedLoader.jsx', 'utf8');
  assert.match(src, /if \(!active\)[\s\S]{1,60}setPhase\('hidden'\)/, 'must reset phase to hidden when inactive');
});

test('DelayedLoader cleans up timers on unmount', () => {
  const src = readFileSync('src/components/loading/DelayedLoader.jsx', 'utf8');
  assert.match(src, /clearTimeout/, 'must call clearTimeout for cleanup');
  assert.match(src, /mountedRef/, 'must use a mountedRef to guard async state updates');
});

test('DelayedLoader uses three timer stages', () => {
  const src = readFileSync('src/components/loading/DelayedLoader.jsx', 'utf8');
  // skeleton, text, long phases each get their own setTimeout
  const timeoutMatches = [...src.matchAll(/setTimeout/g)];
  assert.ok(timeoutMatches.length >= 3, 'must set up at least 3 timers (skeleton, text, long)');
});

test('DelayedLoader renders label only after textDelayMs phase', () => {
  const src = readFileSync('src/components/loading/DelayedLoader.jsx', 'utf8');
  assert.match(src, /showText\s*&&\s*label|label\s*&&\s*showText/, 'label must be gated on showText');
});

// --- WalletWallSkeleton checks ---

test('WalletWallSkeleton supports expected variants', () => {
  const src = readFileSync('src/components/loading/WalletWallSkeleton.jsx', 'utf8');
  for (const v of ['block', 'text', 'pill', 'circle', 'card']) {
    assert.ok(src.includes(v), `must handle variant "${v}"`);
  }
});

test('WalletWallSkeleton sets aria-hidden by default', () => {
  const src = readFileSync('src/components/loading/WalletWallSkeleton.jsx', 'utf8');
  assert.match(src, /aria-hidden/, 'must set aria-hidden on skeleton elements');
});

// --- SignalLoader variant checks ---

test('SignalLoader supports all required variants', () => {
  const src = readFileSync('src/components/loading/SignalLoader.jsx', 'utf8');
  for (const v of ['page', 'graph', 'market', 'quantum', 'whale', 'brief', 'button']) {
    assert.ok(src.includes(`'${v}'`), `must declare variant "${v}"`);
  }
});

test('SignalLoader button variant does not render a spinner element', () => {
  const src = readFileSync('src/components/loading/SignalLoader.jsx', 'utf8');
  // Look at the ButtonVariant function; ensure it has no spinner class or role=status with spin
  const buttonFnMatch = src.match(/function ButtonVariant[\s\S]{1,600}/);
  assert.ok(buttonFnMatch, 'ButtonVariant function must exist');
  const buttonFn = buttonFnMatch[0];
  assert.doesNotMatch(buttonFn, /spinner|spin-|fa-spin|border-radius.*50%.*animation|\.spin/i,
    'button variant must not use a spinner');
});

test('SignalLoader button variant uses sweep class instead of spinner', () => {
  const src = readFileSync('src/components/loading/SignalLoader.jsx', 'utf8');
  assert.match(src, /ww-btn-sweep/, 'button variant must use sweep animation class');
});

test('SignalLoader sets aria-busy on the root element', () => {
  const src = readFileSync('src/components/loading/SignalLoader.jsx', 'utf8');
  assert.match(src, /aria-busy/, 'root element must have aria-busy for screen readers');
});

test('SignalLoader has DEFAULT_LABELS for each variant', () => {
  const src = readFileSync('src/components/loading/SignalLoader.jsx', 'utf8');
  assert.match(src, /DEFAULT_LABELS/, 'must export DEFAULT_LABELS');
  for (const v of ['page', 'graph', 'market', 'quantum', 'whale', 'brief']) {
    assert.ok(src.includes(`${v}:`), `must have a default label for "${v}"`);
  }
});

// --- CSS checks ---

test('loading.css defines reduced-motion override', () => {
  const src = readFileSync('src/components/loading/loading.css', 'utf8');
  assert.match(src, /prefers-reduced-motion.*reduce/s, 'must handle prefers-reduced-motion: reduce');
  assert.match(src, /animation.*none.*!important/s, 'must suppress animations for reduced-motion');
});

test('loading.css uses terracotta accent for signal sweep', () => {
  const src = readFileSync('src/components/loading/loading.css', 'utf8');
  assert.match(src, /191.*78.*50|BF4E32/i, 'signal sweep must use the ww-accent terracotta color');
  assert.match(src, /ww-signal-sweep/, 'must define .ww-signal-sweep class');
});

test('loading.css does not define a spinner keyframe', () => {
  const src = readFileSync('src/components/loading/loading.css', 'utf8');
  assert.doesNotMatch(src, /@keyframes.*spin|rotate.*360/is, 'must not define any spinner rotation keyframes');
});

// --- app.jsx wiring checks ---

test('app.jsx Suspense fallbacks no longer use the old LoadingScreen messages', () => {
  const src = readFileSync('src/app.jsx', 'utf8');
  assert.doesNotMatch(src, /Opening Stable Seer/,          'old StableSeer message must be gone');
  assert.doesNotMatch(src, /Opening Quantum Intelligence/,  'old Quantum message must be gone');
  assert.doesNotMatch(src, /Opening Coinstellation\.\.\./,  'old Coinstellation lazy message must be gone');
  assert.doesNotMatch(src, /Opening Watchlist/,             'old Watchlist message must be gone');
  assert.doesNotMatch(src, /Loading token\.\.\./,           'old token message must be gone');
});

test('app.jsx Suspense fallbacks use DelayedLoader', () => {
  const src = readFileSync('src/app.jsx', 'utf8');
  const delayedCount = [...src.matchAll(/DelayedLoader/g)].length;
  assert.ok(delayedCount >= 1, `must have at least one DelayedLoader fallback, found ${delayedCount}`);
});
