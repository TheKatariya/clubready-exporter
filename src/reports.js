'use strict';
// Report registry. `id` is ClubReady's report ID — the N in the Reports sidebar's
// `.menuItem{N}` class. To add a report, find its ID (see README) and add an entry.
//
// dates:  'none'   report takes no date filter we set (uses its own default)
//         'range'  --from/--to; default = last 7 days
//         'day'    default yesterday (--date picks another day)   [still a from/to pair]
//         'rest-of-month'  default today -> end of this month
// setup:  optional async (page) hook for report-specific form fields.
// type:   'ssrs' (default, CSV export) | 'lead-activity' (HTML table -> CSV)

const REPORTS = {
  'completed-classes': { id: 60, title: 'Classes Completed', dates: 'none' },
  'member-list':       { id: 65, title: 'Member List', dates: 'none' },
  'frozen-members':    { id: 12, title: 'Frozen Members', dates: 'none' },
  'membership-agreements': { id: 38, title: 'Membership Agreements (default ~5y window)', dates: 'none' },
  'lost-members':      { id: 93, title: 'Lost Members', dates: 'range' },
  'declined-charges':  { id: 14, title: 'Declined Charges', dates: 'range' },
  'payment-transactions': { id: 55, title: 'Payment Transactions', dates: 'range' },
  'check-ins':         { id: 53, title: 'Check-ins', dates: 'range' },
  'invoices-coming-due': { id: 18, title: 'Invoices Coming Due', dates: 'rest-of-month' },
  'notes-export':      { id: 39, title: 'Notes Export (all member notes; large — keep ranges short)', dates: 'range', defaultDays: 1, chunkDays: 1 },
  'booking-events': {
    id: 114, title: 'Booking Events Log — "Logged as Complete" only', dates: 'range', defaultDays: 1,
    setup: async page => { await page.selectOption('#EventType', '3'); },
    waitFor: '#EventType',
  },
  'booking-log': {
    id: 114, title: 'Booking Events Log — all event types (incl. no-shows, late cancels)', dates: 'range',
    chunkDays: 31,
    setup: async page => { await page.selectOption('#EventType', 'null'); },
    waitFor: '#EventType',
  },
  'lead-activity': { type: 'lead-activity', title: 'Lead Management > Activity for one day (default yesterday; scraped from the page table)', dates: 'day' },
};

module.exports = { REPORTS };
