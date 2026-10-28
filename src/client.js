'use strict';
const { chromium } = require('playwright');

const log = m => process.stderr.write(m + '\n');

function config(env = process.env) {
  const sub = env.CLUBREADY_SUBDOMAIN, user = env.CLUBREADY_USER, pass = env.CLUBREADY_PASS;
  const missing = [['CLUBREADY_SUBDOMAIN', sub], ['CLUBREADY_USER', user], ['CLUBREADY_PASS', pass]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')} (see .env.example)`);
  if (!/^[a-z0-9-]+$/i.test(sub)) throw new Error('CLUBREADY_SUBDOMAIN should be just the subdomain, e.g. "yourstudio"');
  return { sub, user, pass, headless: env.HEADLESS !== 'false' };
}

async function launch(cfg) {
  const browser = await chromium.launch({ headless: cfg.headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(40000);
  return { browser, context, page };
}

// Log in at <sub>.clubready.com; success = redirect to app.clubready.com.
// Failure stays on invalidlogin.asp.
async function login(page, cfg) {
  log('Logging in...');
  await page.goto(`https://${cfg.sub}.clubready.com/`);
  await page.fill('#uid', cfg.user);
  await page.fill('#pw', cfg.pass);
  await page.click('input[type="submit"]');
  try {
    await page.waitForURL(/app\.clubready\.com|PasswordExpired|invalidlogin/i, { timeout: 20000 });
  } catch { /* fall through to the checks below */ }
  const url = page.url();
  if (/PasswordExpired/i.test(url)) {
    throw new Error('ClubReady says this password has EXPIRED. Log in at the ClubReady site, set a new one, and update CLUBREADY_PASS.');
  }
  if (!/app\.clubready\.com/i.test(url)) {
    throw new Error('Login failed — check CLUBREADY_SUBDOMAIN / USER / PASS');
  }
}

// Open Reports and select a report from the sidebar. The sidebar scrolls, so
// items are often off-screen: a JS click works where Playwright's click() doesn't.
async function openReport(page, id, waitFor) {
  await page.goto('https://app.clubready.com/Reporting/ReportViewer');
  await page.waitForLoadState('domcontentloaded');
  const sel = `.menuItem${id} a`;
  try {
    await page.waitForSelector(sel, { state: 'attached', timeout: 30000 });
  } catch {
    throw new Error(`Report ${id} not found in the sidebar — your account may not have access, or the ID differs for your studio`);
  }
  await page.evaluate(s => document.querySelector(s).click(), sel);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 });
  await page.waitForTimeout(2500); // params form renders async
}

// Set the (hidden) date inputs if the report has them. Values are M/D/YYYY.
async function setDates(page, from, to) {
  const found = await page.evaluate(({ f, t }) => {
    const fd = document.querySelector('#fromdate'), td = document.querySelector('#todate');
    if (fd) fd.value = f;
    if (td) td.value = t;
    return !!(fd && td);
  }, { f: from, t: to });
  if (!found) throw new Error('This report has no #fromdate/#todate inputs — run it without --from/--to');
}

// The Run button's id differs per report (#showReport-0, -31, -81, ...), so click
// whichever visible one matches.
async function clickRun(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(
      'input[value="Run Report"], [onclick*="runReport"], [id^="showReport-"]'));
    const b = btns.find(x => x.offsetParent !== null) || btns[0];
    if (!b) throw new Error('Run button not found');
    b.click();
  });
}

// The report renders in a cross-origin SSRS iframe (reports.clubready.com) whose
// inline script carries `ExportUrlBase`. Poll for it instead of sleeping a fixed
// time — SSRS render time varies a lot with report size.
async function getExportUrlBase(page, timeoutMs = 120000) {
  await page.waitForSelector('#reportViewer iframe', { timeout: 30000 });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = page.frames().find(f => f.url().includes('reportviewer.aspx'));
    if (frame) {
      try {
        const base = await frame.evaluate(() => {
          for (const s of Array.from(document.querySelectorAll('script'))) {
            const m = s.textContent.match(/"ExportUrlBase":"(.*?)"/);
            if (m) return m[1].replace(/\\u0026/g, '&');
          }
          return null;
        });
        if (base) return base;
      } catch { /* frame navigating — retry */ }
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('Report did not render in time (no ExportUrlBase). Try a shorter date range.');
}

// Swap the export disposition to an attachment and request CSV, then fetch with the
// browser context (shares the session cookies, no UI export dropdown needed).
async function downloadCsv(context, exportUrlBase) {
  const url = 'https://reports.clubready.com' +
    exportUrlBase.replace('ContentDisposition=OnlyHtmlInline', 'ContentDisposition=AlwaysAttachment') + 'CSV';
  const resp = await context.request.get(url);
  if (!resp.ok()) throw new Error(`CSV download failed: HTTP ${resp.status()}`);
  const body = await resp.body();
  if (!body.length) throw new Error('CSV download was empty');
  return body;
}

// One full report run on an already-logged-in page.
async function runSsrsReport({ page, context }, def, from, to) {
  await openReport(page, def.id, def.waitFor);
  if (from && to) await setDates(page, from, to);
  if (def.setup) await def.setup(page);
  log(`Running ${def.title}...`);
  await clickRun(page);
  const base = await getExportUrlBase(page);
  return downloadCsv(context, base);
}

module.exports = { log, config, launch, login, openReport, setDates, clickRun, getExportUrlBase, downloadCsv, runSsrsReport };
