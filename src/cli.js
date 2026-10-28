#!/usr/bin/env node
'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { REPORTS } = require('./reports');
const D = require('./dates');
const client = require('./client');
const { leadActivityCsv } = require('./lead-activity');

const USAGE = `clubready-export — download ClubReady reports as CSV

Usage:
  clubready-export list
  clubready-export <report>... [--from D] [--to D] [--date D] [--out DIR] [--chunk-days N]
  clubready-export all-nightly           # every report with a sensible nightly default

Dates: YYYY-MM-DD or M/D/YYYY.
  --from/--to   range reports (default: last 7 days; some reports default to 1 day)
  --date        single-day reports (lead-activity; default yesterday)
  --chunk-days  split a long range into one CSV per N days (avoids SSRS timeouts)
Output: one CSV per run in --out (default $OUT_DIR or ./downloads); paths go to stdout,
progress to stderr.`;

function parseArgs(argv) {
  const o = { reports: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k === 'help') o.flags.help = true;
      else { if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`--${k} needs a value`); o.flags[k] = argv[++i]; }
    } else o.reports.push(a);
  }
  return o;
}

// Resolve [from,to] for a report from its dates mode + flags.
function resolveRange(name, def, flags) {
  const t = D.today();
  switch (def.dates) {
    case 'none':
      if (flags.from || flags.to) throw new Error(`${name} takes no date range`);
      return null;
    case 'rest-of-month':
      return [flags.from ? D.parseDate(flags.from) : t, flags.to ? D.parseDate(flags.to) : D.endOfMonth(t)];
    case 'day': {
      const d = flags.date ? D.parseDate(flags.date) : D.addDays(t, -1);
      return [d, d];
    }
    default: {
      const to = flags.to ? D.parseDate(flags.to) : t;
      const from = flags.from ? D.parseDate(flags.from) : D.addDays(to, -(def.defaultDays ?? 7));
      if (from > to) throw new Error('--from is after --to');
      return [from, to];
    }
  }
}

function outName(name, range) {
  if (!range) return `${name}-${D.toISO(D.today())}.csv`;
  const [f, t] = range;
  return f.getTime() === t.getTime() ? `${name}-${D.toISO(f)}.csv` : `${name}-${D.toISO(f)}_to_${D.toISO(t)}.csv`;
}

async function main() {
  const { reports, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || !reports.length || reports[0] === 'help') { console.log(USAGE); return; }
  if (reports[0] === 'list') {
    for (const [n, d] of Object.entries(REPORTS)) console.log(`${n.padEnd(24)} ${d.id ? 'id ' + String(d.id).padEnd(4) : '          '} ${d.title}`);
    return;
  }
  let names = reports;
  if (names.length === 1 && names[0] === 'all-nightly') {
    names = Object.keys(REPORTS).filter(n => !['membership-agreements', 'notes-export', 'booking-log'].includes(n));
  }
  for (const n of names) if (!REPORTS[n]) throw new Error(`Unknown report "${n}". Run: clubready-export list`);

  const outDir = path.resolve(flags.out || process.env.OUT_DIR || './downloads');
  fs.mkdirSync(outDir, { recursive: true });
  const cfg = client.config();
  const session = await client.launch(cfg);
  const written = [], failed = [];
  try {
    await client.login(session.page, cfg);
    for (const name of names) {
      const def = REPORTS[name];
      try {
        const range = resolveRange(name, def, flags);
        if (def.type === 'lead-activity') {
          const daysBack = Math.round((D.today() - range[0]) / 86400000);
          const { csv, rows } = await leadActivityCsv(session.page, daysBack);
          const p = path.join(outDir, outName(name, range));
          fs.writeFileSync(p, csv); client.log(`Saved ${p} (${rows} rows)`); written.push(p);
          continue;
        }
        const chunkDays = flags['chunk-days'] ? parseInt(flags['chunk-days'], 10) : def.chunkDays;
        const windows = range ? D.chunkRange(range[0], range[1], chunkDays) : [null];
        for (const w of windows) {
          const body = await client.runSsrsReport(session, def, w && D.toCR(w[0]), w && D.toCR(w[1]));
          const p = path.join(outDir, outName(name, w));
          fs.writeFileSync(p, body); client.log(`Saved ${p} (${body.length} bytes)`); written.push(p);
        }
      } catch (e) {
        client.log(`ERROR [${name}]: ${e.message}`); failed.push(name);
      }
    }
  } finally {
    await session.browser.close();
  }
  written.forEach(p => process.stdout.write(p + '\n'));
  if (failed.length) { client.log(`Failed: ${failed.join(', ')}`); process.exit(1); }
}

main().catch(e => { process.stderr.write('ERROR: ' + e.message + '\n'); process.exit(1); });
