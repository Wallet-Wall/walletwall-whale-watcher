/**
 * Regression tests for the Whale Watcher signal-first workspace slice.
 *
 * WhaleWatcher.jsx is a React component and is not imported directly by
 * node:test. These source-level checks mirror the existing component adoption
 * tests and lock the UI to the deterministic signal/narrative pipeline.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/WhaleWatcher.jsx', 'utf8');

test('WhaleWatcher imports DataSourceBadge for signal and narrative provenance', () => {
  assert.match(src, /import DataSourceBadge from '\.\/DataSourceBadge\.jsx'/);
});

test('WhaleWatcher renders a dedicated signal rail from derived wallet signals', () => {
  assert.match(src, /function WhaleWatcherSignalRail\(\{ signals, subFg, selectedSignalId, onSelectSignal \}\)/);
  assert.match(src, /Deterministic wallet signals from the formal signal engine/);
  assert.match(src, /No deterministic signals detected for this window/);
  assert.match(src, /selectedSignalId=\{selectedSignalId\}/);
  assert.match(src, /onSelectSignal=\{onSelectSignal\}/);
});

test('WhaleWatcher derives wallet signals once and builds narrative cards from that array', () => {
  assert.match(src, /const walletSignals = useMemo\(/);
  assert.match(src, /deriveWhaleWatcherSignals\(node, walletData, dune12wData\)/);
  assert.match(src, /const narrativeCard = useMemo\(/);
  assert.match(src, /buildNarrativeCard\(walletSignals\)/);
});

test('WhaleWatcher renders narrative cards as a dedicated workspace section', () => {
  assert.match(src, /function NarrativeCardSection\(\{ card, subFg \}\)/);
  assert.match(src, /Intelligence briefing/);
  assert.match(src, /<NarrativeCardSection card=\{narrativeCard\} subFg=\{subFg\} \/>/);
});

test('WhaleWatcher signal and narrative sections render source badges', () => {
  assert.match(src, /function SignalSourceBadges\(\{ sources, confidence \}\)/);
  assert.match(src, /<DataSourceBadge/);
  assert.match(src, /<SignalSourceBadges sources=\{signal\.sources\} confidence=\{signal\.confidence\} \/>/);
  assert.match(src, /<SignalSourceBadges sources=\{card\.sources\} confidence=\{card\.confidence\} \/>/);
});

test('WhaleWatcher signal rail exposes selectable signal state', () => {
  assert.match(src, /const selected = signal\.signalId === selectedSignalId/);
  assert.match(src, /onClick=\{\(\) => onSelectSignal\?\.\(signal\.signalId\)\}/);
  assert.match(src, /aria-pressed=\{selected\}/);
});

test('WhaleWatcher clears stale selected signal ids when derived signals change', () => {
  assert.match(src, /if \(!selectedSignalId\) return/);
  assert.match(src, /walletSignals\.some\(signal => signal\.signalId === selectedSignalId\)/);
  assert.match(src, /onSelectSignal\?\.\(null\)/);
});

test('WhaleWatcher renders a source footer through the shared confidence ledger', () => {
  assert.match(src, /import SourceConfidenceLedger from '\.\/SourceConfidenceLedger\.jsx'/);
  assert.match(src, /function WhaleWatcherSourceFooter\(\{ ledgerProps, walletSignals, narrativeCard \}\)/);
  assert.match(src, /mode="whale-watcher"/);
  assert.match(src, /<WhaleWatcherSourceFooter/);
});

test('WhaleWatcher source footer aggregates ledger, signal, and narrative sources', () => {
  assert.match(src, /function collectSourceFooterSources\(\{ ledgerProps, walletSignals, narrativeCard \}\)/);
  assert.match(src, /Object\.entries\(ledgerProps\?\.sources \?\? \{\}\)/);
  assert.match(src, /walletSignals\.forEach\(signal => \(signal\.sources \?\? \[\]\)\.forEach/);
  assert.match(src, /narrativeCard\?\.sources \?\? \[\]/);
});

test('WhaleWatcher source footer forwards timestamps, confidence, warnings, and data note', () => {
  assert.match(src, /confidence=\{ledgerProps\?\.confidence\}/);
  assert.match(src, /generatedAt=\{narrativeCard\?\.generatedAt\}/);
  assert.match(src, /queryRunAt=\{ledgerProps\?\.queryRunAt\}/);
  assert.match(src, /warnings=\{warnings\}/);
  assert.match(src, /dataNote=\{ledgerProps\?\.dataNote\}/);
});
