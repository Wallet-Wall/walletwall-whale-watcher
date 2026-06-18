/**
 * Tests for the Whale Watcher → Stable Seer handoff.
 *
 * Covers:
 *  - WhaleWatcher.jsx has deriveStableSeerQuery logic (token/dex only)
 *  - WhaleWatcher has StableSeerContextBand sub-component
 *  - StableSeerContextBand CTA label is "Stable Seer →" (correct product name)
 *  - StableSeerContextBand is guarded by stableSeerQuery && onOpenStableSeer
 *  - StableSeerContextBand attribution says "market data only, no holder analytics"
 *  - WhaleWatcher accepts onOpenStableSeer prop
 *  - WhaleWatcher does not claim Solana holder analytics
 *  - WhaleWatcher does not give investment advice
 *  - WhaleWatcherPage imports and renders StableSeerDrawer
 *  - WhaleWatcherPage passes onOpenStableSeer to WhaleWatcher
 *  - WhaleWatcherPage handleOpenStableSeer fetches /api/stable-seer
 *  - WhaleWatcherPage result state drives StableSeerDrawer visibility
 *  - Product boundary: Stable Seer CTA restricted to token/dex node types
 *  - Product boundary: wallet nodes do not expose Stable Seer CTA
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WW_PATH   = 'src/components/WhaleWatcher.jsx';
const PAGE_PATH = 'src/components/WhaleWatcherPage.jsx';

const wwSrc   = readFileSync(WW_PATH, 'utf8');
const pageSrc = readFileSync(PAGE_PATH, 'utf8');

// ── WhaleWatcher: deriveStableSeerQuery logic ──────────────────────────────────

test('WhaleWatcher defines deriveStableSeerQuery helper', () => {
  assert.match(wwSrc, /function deriveStableSeerQuery/);
});

test('deriveStableSeerQuery returns null for nodes without token/dex type', () => {
  assert.match(wwSrc, /type !== 'token' && type !== 'dex' && !id\.startsWith\('token_'\)/);
});

test('deriveStableSeerQuery returns null when node is falsy', () => {
  assert.match(wwSrc, /if \(!node\) return null/);
});

test('deriveStableSeerQuery uses node.label as the query string', () => {
  assert.match(wwSrc, /return label \|\| null/);
});

// ── WhaleWatcher: StableSeerContextBand sub-component ─────────────────────────

test('WhaleWatcher defines StableSeerContextBand sub-component', () => {
  assert.match(wwSrc, /function StableSeerContextBand/);
});

test('StableSeerContextBand CTA button label is "Stable Seer →"', () => {
  assert.match(wwSrc, /Stable Seer →/);
});

test('StableSeerContextBand loading label names the market work', () => {
  assert.match(wwSrc, /Resolving markets…/);
});

test('StableSeerContextBand attribution states "market data only, no holder analytics"', () => {
  assert.match(wwSrc, /market data only, no holder analytics/);
});

test('StableSeerContextBand no-result message does not mention holder analytics', () => {
  const noResultBlock = wwSrc.slice(wwSrc.indexOf('noResult &&'), wwSrc.indexOf('noResult &&') + 200);
  assert.doesNotMatch(noResultBlock, /holder analytics/i);
});

test('StableSeerContextBand is guarded by stableSeerQuery && onOpenStableSeer in render', () => {
  assert.match(wwSrc, /stableSeerQuery && onOpenStableSeer/);
});

// ── WhaleWatcher: props and product boundaries ────────────────────────────────

test('WhaleWatcher accepts onOpenStableSeer prop', () => {
  assert.match(wwSrc, /onOpenStableSeer/);
});

test('WhaleWatcher lists onOpenStableSeer in PropTypes', () => {
  const propTypesIdx = wwSrc.indexOf('WhaleWatcher.propTypes');
  const onOpenIdx    = wwSrc.indexOf('onOpenStableSeer: PropTypes.func', propTypesIdx);
  assert.ok(propTypesIdx !== -1, 'PropTypes block must exist');
  assert.ok(onOpenIdx !== -1, 'onOpenStableSeer must be in PropTypes');
});

test('WhaleWatcher does not claim Solana holder analytics', () => {
  assert.doesNotMatch(wwSrc, /Solana holder|solana holder/i);
});

test('WhaleWatcher does not give investment advice', () => {
  assert.doesNotMatch(wwSrc, /investment advice|recommended allocation/i);
});

test('WhaleWatcher does not present Stable Seer as holder analytics', () => {
  assert.doesNotMatch(wwSrc, /Stable Seer.*holder analytics|holder analytics.*Stable Seer/i);
});

// ── WhaleWatcherPage: handoff wiring ─────────────────────────────────────────

test('WhaleWatcherPage imports StableSeerDrawer', () => {
  assert.match(pageSrc, /import StableSeerDrawer from '\.\/StableSeerDrawer\.jsx'/);
});

test('WhaleWatcherPage defines handleOpenStableSeer that fetches /api/stable-seer', () => {
  assert.match(pageSrc, /handleOpenStableSeer/);
  assert.match(pageSrc, /\/api\/stable-seer/);
});

test('WhaleWatcherPage encodes the query before fetching', () => {
  assert.match(pageSrc, /encodeURIComponent\(query\)/);
});

test('WhaleWatcherPage passes onOpenStableSeer to WhaleWatcher', () => {
  assert.match(pageSrc, /onOpenStableSeer=\{handleOpenStableSeer\}/);
});

test('WhaleWatcherPage renders StableSeerDrawer guarded by stableSeerResult', () => {
  assert.match(pageSrc, /stableSeerResult &&/);
  assert.match(pageSrc, /<StableSeerDrawer\s+result=\{stableSeerResult\}/);
});

test('WhaleWatcherPage StableSeerDrawer onClose resets stableSeerResult to null', () => {
  assert.match(pageSrc, /setStableSeerResult\(null\)/);
});

test('WhaleWatcherPage Escape guard defers when drawer is open', () => {
  assert.match(pageSrc, /if \(stableSeerResult\) \{/);
});

test('WhaleWatcherPage handleOpenStableSeer returns first result from data.results', () => {
  assert.match(pageSrc, /data\.results\?\.\[0\] \?\? null/);
});

// ── Product boundary enforcement ──────────────────────────────────────────────

test('WhaleWatcherPage does not mention holder analytics in Stable Seer context', () => {
  assert.doesNotMatch(pageSrc, /Stable Seer.*holder analytics|holder analytics.*Stable Seer/i);
});

test('WhaleWatcherPage does not mention investment advice', () => {
  assert.doesNotMatch(pageSrc, /investment advice/i);
});

test('WhaleWatcherPage does not mention Solana holder analytics', () => {
  assert.doesNotMatch(pageSrc, /Solana holder analytics/i);
});
