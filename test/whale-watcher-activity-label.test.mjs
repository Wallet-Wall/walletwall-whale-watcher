/**
 * Tests for Whale Watcher activity-window label accuracy.
 *
 * Covers:
 *  - WhaleWatcher source does not claim 48h for the sampled fallback panel
 *  - WhaleWatcher source uses "Recent activity" (sentence-case) for the sampled fallback panel
 *  - WhaleWatcher source does not claim Dune for the sampled fallback panel
 *  - WhaleWatcher source uses "Activity · 12 weeks" for the Dune primary panel
 *  - WhaleWatcher source's Activity12wPanel footer mentions Dune Analytics
 *  - WhaleWatcher source's Activity12wPanel footer mentions scheduled
 *  - ActivitySampledFallbackPanel data note branches on isSynthetic
 *  - ActivitySampledFallbackPanel data note for live wallet path contains "Sampled transaction history"
 *  - ActivitySampledFallbackPanel data note for synthetic path contains "Aggregated node activity"
 *  - Activity48hFallbackPanel function name is not present (replaced by ActivitySampledFallbackPanel)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WW_PATH = 'src/components/WhaleWatcher.jsx';
const src = readFileSync(WW_PATH, 'utf8');

// ── Fallback panel label accuracy ─────────────────────────────────────────────

test('WhaleWatcher: fallback panel does not claim ACTIVITY 48H', () => {
  assert.doesNotMatch(
    src,
    /ACTIVITY 48H/,
    'ACTIVITY 48H label must be removed — the data is not filtered to 48 hours',
  );
});

test('WhaleWatcher: fallback panel label is "Recent activity" (sentence case)', () => {
  assert.match(
    src,
    /Recent activity/,
    'fallback panel must use sentence-case "Recent activity" to accurately describe sampled transaction data',
  );
});

test('WhaleWatcher: fallback panel does not claim Dune as its data source', () => {
  // Dune label must only appear in Activity12wPanel / its footer, not in the sampled fallback block.
  // We verify by checking that any "Dune" reference is after the Activity12wPanel definition.
  const sampledPanelStart = src.indexOf('function ActivitySampledFallbackPanel');
  const sampledPanelEnd   = src.indexOf('ActivitySampledFallbackPanel.propTypes');
  assert.ok(sampledPanelStart !== -1, 'ActivitySampledFallbackPanel must be defined');
  assert.ok(sampledPanelEnd   !== -1, 'ActivitySampledFallbackPanel.propTypes must be defined');

  const panelBody = src.slice(sampledPanelStart, sampledPanelEnd);
  assert.doesNotMatch(panelBody, /[Dd]une/, 'sampled fallback panel body must not reference Dune');
});

test('WhaleWatcher: Activity48hFallbackPanel function name is gone', () => {
  assert.doesNotMatch(
    src,
    /function Activity48hFallbackPanel/,
    'Activity48hFallbackPanel must be renamed — the 48h label was inaccurate',
  );
});

// ── Sampled fallback data-source note ─────────────────────────────────────────

test('WhaleWatcher: sampled fallback data note for live wallet path contains "Sampled transaction history"', () => {
  assert.match(src, /Sampled transaction history/);
});

test('WhaleWatcher: sampled fallback data note for synthetic path contains "Aggregated node activity"', () => {
  assert.match(src, /Aggregated node activity/);
});

test('WhaleWatcher: sampled fallback data note branches on isSynthetic', () => {
  assert.match(src, /metrics\.isSynthetic/);
});

// ── Primary 12-week panel labels unchanged ────────────────────────────────────

test('WhaleWatcher: Activity12wPanel label is "Activity · 12 weeks" (sentence case)', () => {
  assert.match(src, /Activity · 12 weeks/);
});

test('WhaleWatcher: Activity12wPanel footer mentions Dune Analytics', () => {
  assert.match(src, /Dune Analytics/);
});

test('WhaleWatcher: Activity12wPanel footer mentions scheduled wallet data', () => {
  assert.match(src, /scheduled wallet data/);
});
