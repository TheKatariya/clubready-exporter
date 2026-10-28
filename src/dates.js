'use strict';
// ClubReady's date inputs want M/D/YYYY. We accept YYYY-MM-DD or M/D/YYYY on the CLI.

function parseDate(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  let m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return mk(+m[1], +m[2], +m[3], s);
  m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return mk(+m[3], +m[1], +m[2], s);
  throw new Error(`Bad date "${s}" — use YYYY-MM-DD or M/D/YYYY`);
}
function mk(y, mo, d, orig) {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    throw new Error(`Bad date "${orig}"`);
  }
  return dt;
}
const toCR = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => parseDate(new Date());
const endOfMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);

// Split [from,to] into consecutive windows of `days` days (inclusive). Long SSRS
// ranges time out, so big pulls are chunked into one CSV per window.
function chunkRange(from, to, days) {
  if (!days) return [[from, to]];
  const out = [];
  let s = from;
  while (s <= to) {
    const e = addDays(s, days - 1);
    out.push([s, e < to ? e : to]);
    s = addDays(e, 1);
  }
  return out;
}

module.exports = { parseDate, toCR, toISO, addDays, today, endOfMonth, chunkRange };
