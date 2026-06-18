import test from 'node:test';
import assert from 'node:assert/strict';

const {
  fmtUSD,
  fmtDate,
  shortAddr,
  wordCount,
  readingTime,
  generateInShort,
  getDataConfidence
} = await import('../src/utils.js');

test('shortAddr: shortens typical Ethereum address', () => {
  const addr = '0x1234567890123456789012345678901234567890';
  assert.equal(shortAddr(addr), '0x1234…7890');
});

test('shortAddr: handles empty or missing input', () => {
  assert.equal(shortAddr(''), '');
  assert.equal(shortAddr(null), '');
  assert.equal(shortAddr(undefined), '');
});

test('shortAddr: leaves short strings (<= 10 chars) unchanged', () => {
  assert.equal(shortAddr('abc'), 'abc');
  assert.equal(shortAddr('123456789'), '123456789');
  assert.equal(shortAddr('1234567890'), '1234567890');
});

test('fmtUSD: formats millions, thousands, and small numbers', () => {
  assert.equal(fmtUSD(1500000), '$1.5M');
  assert.equal(fmtUSD(2500), '$2.5K');
  assert.equal(fmtUSD(123.45), '$123');
  assert.equal(fmtUSD(0), '$0');
});

test('fmtUSD: handles est flag', () => {
  assert.equal(fmtUSD(1500000, true), '~$1.5M');
  assert.equal(fmtUSD(123, true), '~$123');
});

test('fmtUSD: handles missing values', () => {
  assert.equal(fmtUSD(null), 'Price unavailable');
  assert.equal(fmtUSD(undefined), 'Price unavailable');
});

test('fmtDate: formats valid dates', () => {
  const d = '2025-01-01T12:00:00Z';
  assert.equal(fmtDate(d), 'Jan 1, 2025');
});

test('fmtDate: handles missing or invalid dates', () => {
  assert.equal(fmtDate(''), '—');
  assert.equal(fmtDate(null), '—');
  assert.equal(fmtDate('not-a-date'), '—');
});

test('wordCount: counts words and handles whitespace', () => {
  assert.equal(wordCount('hello world'), 2);
  assert.equal(wordCount('  leading and trailing  '), 3);
  assert.equal(wordCount('   '), 0);
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount(null), 0);
});

test('readingTime: estimates time correctly', () => {
  const data = {
    headline: 'word '.repeat(100),
    narrative: 'word '.repeat(100)
  };
  assert.equal(readingTime(data), '1 min read');
  assert.equal(readingTime(null), '—');
});

test('generateInShort: produces expected summary object', () => {
  const node = {
    label: 'Uniswap',
    volumeUSD: 1000000,
    interactions: 10,
    firstSeen: '2025-01-01',
    opportunities: [{ type: 'gas', description: 'Save on gas' }],
    anomalies: [1]
  };
  const summary = generateInShort(node);
  assert.ok(summary.s1.includes('$1.0M'));
  assert.ok(summary.s1.includes('10 transactions'));
  assert.ok(summary.s2.includes('Save on gas'));
  assert.ok(summary.s3.includes('1 transaction pattern'));
});

test('generateInShort: handles missing data gracefully', () => {
  assert.equal(generateInShort(null), null);
  const summary = generateInShort({});
  assert.ok(summary.s1.includes('Price unavailable'));
});

test('getDataConfidence: returns correct levels based on interactions', () => {
  assert.equal(getDataConfidence({ interactions: 100 }), 'HIGH');
  assert.equal(getDataConfidence({ interactions: 51 }), 'HIGH');
  assert.equal(getDataConfidence({ interactions: 50 }), 'MED');
  assert.equal(getDataConfidence({ interactions: 11 }), 'MED');
  assert.equal(getDataConfidence({ interactions: 10 }), 'LOW');
  assert.equal(getDataConfidence({ interactions: 0 }), 'LOW');
  assert.equal(getDataConfidence({}), 'LOW');
});
