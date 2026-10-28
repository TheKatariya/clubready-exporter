# clubready-exporter

Headless [Playwright](https://playwright.dev) CLI that logs into ClubReady and downloads
reports as **CSV files**. No database, no n8n, no cloud — you get files on disk, and do
what you like with them.

Built from the scripts that run nightly at Body Fit Training Tysons.

## Setup

```bash
git clone https://github.com/TheKatariya/clubready-exporter.git
cd clubready-exporter
npm install
npx playwright install chromium
cp .env.example .env     # then fill in subdomain, username, password
```

`CLUBREADY_SUBDOMAIN` is the part before `.clubready.com` on your studio's login page.
Use a dedicated ClubReady user with read-only report access if you can. Quote the
password in `.env` if it contains `#`.

## Use

```bash
npx clubready-export list                          # what's available
npx clubready-export member-list                   # one report
npx clubready-export completed-classes frozen-members --out ./data
npx clubready-export check-ins --from 2026-10-01 --to 2026-10-28
npx clubready-export booking-log --from 2025-01-01 --chunk-days 31   # long pull, one CSV per 31 days
npx clubready-export all-nightly                   # everything with a sane daily default
```

One CSV per report (per window) lands in `--out` (default `$OUT_DIR` or `./downloads`),
named like `member-list-2026-10-28.csv` or `check-ins-2026-10-01_to_2026-10-28.csv`.
Written paths go to stdout; progress goes to stderr. Exit code is 1 if any report failed.

| Report | ClubReady ID | Dates |
|---|---|---|
| `completed-classes` | 60 | none (current) |
| `member-list` | 65 | none (current) |
| `frozen-members` | 12 | none (current) |
| `membership-agreements` | 38 | none (report's default ~5y window) |
| `lost-members` | 93 | `--from/--to`, default last 7 days |
| `declined-charges` | 14 | same |
| `payment-transactions` | 55 | same |
| `check-ins` | 53 | same |
| `booking-events` | 114 | default yesterday–today; "Logged as Complete" only |
| `booking-log` | 114 | all event types incl. no-shows and late cancels; chunked by 31 days |
| `notes-export` | 39 | default 1 day, chunked daily; large |
| `invoices-coming-due` | 18 | default today → end of month |
| `lead-activity` | — | `--date`, default yesterday; scraped from the page (no CSV export exists) |

`all-nightly` skips `membership-agreements`, `notes-export` and `booking-log` (heavy; run on demand or weekly).

**Status:** `completed-classes`, `member-list`, `frozen-members`, `booking-events`,
`invoices-coming-due` and `lead-activity` were verified end to end on the day this repo
was written. The rest use the same code path with a different report ID and have run in
production at BFT. ClubReady report IDs and column layouts can differ between studios
or change without notice, so check the first CSV you get. Issues and PRs welcome.

> CSVs from SSRS often carry title rows above the real header (`check-ins` and
> `membership-agreements` especially). This tool saves ClubReady's export as-is.

## Scheduling

```cron
# 02:00 daily, UTC host clock — adjust for your timezone
0 2 * * * cd /opt/clubready-exporter && /usr/bin/node src/cli.js all-nightly --out /data/clubready >> /var/log/clubready-export.log 2>&1
```

## Adding a report

1. Open ClubReady → Reports. Right-click the report in the left nav → Inspect.
2. Find `<li class="menuItem menuItem60">` — **60** is the report ID.
3. Add an entry to `src/reports.js` (`id`, `title`, `dates`; optional `setup(page)` to set
   report-specific dropdowns, e.g. `page.selectOption('#EventType', '3')`).
4. `npx clubready-export my-report` and inspect the CSV.

## How it works (hard-won notes)

- **Login:** `https://<sub>.clubready.com/` (`#uid`, `#pw`) → lands on `app.clubready.com`.
  A wrong password stays on `invalidlogin.asp`; an expired one goes to
  `/Security/PasswordExpired` (the tool reports this explicitly).
- **Sidebar:** each report link is `.menuItem{ID} a`. The sidebar scrolls, so use a JS
  `.click()` — Playwright's `click()` fails on off-screen items.
- **Run button:** its id differs per report (`#showReport-0`, `-31`, `-81`…), so the tool
  clicks whichever visible `input[value="Run Report"]` / `[id^=showReport-]` exists.
- **Dates:** hidden inputs `#fromdate` / `#todate`, format `M/D/YYYY`, set via JS.
- **Two-layer iframe:** the report renders in `reports.clubready.com` (SSRS), a different
  origin from `app.clubready.com`, so you can't reach into it from the main page. Find it
  with `page.frames().find(f => f.url().includes('reportviewer.aspx'))`.
- **CSV trick:** the SSRS frame's inline script contains `"ExportUrlBase":"…"`. Swap
  `ContentDisposition=OnlyHtmlInline` → `AlwaysAttachment`, append `CSV`, and fetch with
  `context.request.get()` (shares the login cookies). Far more reliable than the export menu.
  The tool polls for `ExportUrlBase` rather than sleeping a fixed time.

## Security

- Credentials live only in `.env` (git-ignored). Never commit it.
- Exported CSVs contain member PII (names, emails, phone numbers). Treat them accordingly;
  `*.csv` and `downloads/` are git-ignored.
- This tool is read-only against ClubReady: it logs in, runs reports, downloads.
- You are responsible for complying with ClubReady's terms of service and applicable
  privacy law for your data.

## License

MIT. Not affiliated with ClubReady.
