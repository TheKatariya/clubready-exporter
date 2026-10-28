'use strict';
// Lead Management > Activity has no CSV export (it's an HTML table on a dashboard
// page), so we scrape the rows and write the CSV ourselves.
const { log } = require('./client');

const csvCell = v => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function leadActivityCsv(page, daysBack) {
  await page.goto('https://app.clubready.com/Dashboard/SalesProcess/LeadManagement', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tabactivity', { state: 'attached', timeout: 15000 });
  await page.evaluate(() => (document.querySelector('#tabactivity a') || document.querySelector('#tabactivity')).click());
  await page.waitForTimeout(2000);

  for (let i = 0; i < daysBack; i++) {
    await page.waitForSelector('input[onclick="loadpreviousdate()"]', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => document.querySelector('input[onclick="loadpreviousdate()"]').click());
    await page.waitForTimeout(3000);
  }

  // Select "All Staff" in whichever dropdown offers it.
  const picked = await page.evaluate(() => {
    for (const sel of document.querySelectorAll('select')) {
      const opt = Array.from(sel.options).find(o => o.text.trim() === 'All Staff');
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    }
    return false;
  });
  if (picked) await page.waitForTimeout(3000);
  else log('WARNING: "All Staff" dropdown not found — exporting whatever is shown');
  await page.waitForTimeout(2000);

  // Columns: Status | Time | Lead Name | Activity | Staff Name. Anchor on the time
  // cell so nav/sidebar tables earlier in the DOM are skipped.
  const rows = await page.evaluate(() => {
    const time = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
    return Array.from(document.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))
      .filter(c => c.length >= 5 && time.test(c[1]))
      .map(c => ({ status: c[0], time: c[1], lead_name: c[2], activity: c[3], staff_name: c[4] }));
  });
  const head = ['status', 'time', 'lead_name', 'activity', 'staff_name'];
  const csv = [head.join(',')].concat(rows.map(r => head.map(h => csvCell(r[h])).join(','))).join('\n') + '\n';
  return { csv: Buffer.from(csv), rows: rows.length };
}

module.exports = { leadActivityCsv, csvCell };
