const test = require('node:test');
const assert = require('node:assert');
const D = require('../src/dates');
const { csvCell } = require('../src/lead-activity');

test('parseDate accepts both formats and rejects junk', () => {
  assert.strictEqual(D.toCR(D.parseDate('2026-03-05')), '3/5/2026');
  assert.strictEqual(D.toISO(D.parseDate('3/5/2026')), '2026-03-05');
  assert.throws(() => D.parseDate('2026-02-31'));
  assert.throws(() => D.parseDate('tomorrow'));
});
test('chunkRange covers the range exactly, no gaps or overlap', () => {
  const c = D.chunkRange(D.parseDate('2026-01-01'), D.parseDate('2026-03-10'), 31);
  assert.deepStrictEqual(c.map(([a, b]) => D.toISO(a) + '/' + D.toISO(b)),
    ['2026-01-01/2026-01-31', '2026-02-01/2026-03-03', '2026-03-04/2026-03-10']);
  assert.strictEqual(D.chunkRange(D.parseDate('2026-01-01'), D.parseDate('2026-01-02'), 0).length, 1);
});
test('csvCell quotes commas/quotes/newlines', () => {
  assert.strictEqual(csvCell('a,b'), '"a,b"');
  assert.strictEqual(csvCell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csvCell('plain'), 'plain');
});
