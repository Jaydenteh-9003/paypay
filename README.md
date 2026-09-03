# Paypay

A spacious, mobile-friendly personal finance tracker for university life, freelancing, internships, and the everyday.

## Stack

Next.js **16.2.12** (App Router, static export), React 19, Tailwind CSS 4, Framer Motion, shadcn/ui with Base UI, Lucide, and Recharts. No database, analytics, external fonts, or finance API.

## Local development

```sh
npm install
npm run dev
```

Open http://localhost:3000. The development server binds to all network interfaces; on the same Wi-Fi, a phone can use the computer’s LAN IP on port 3000 if the firewall permits. The computer must stay on. LAN HTTP previews do not support installing the offline app; use HTTPS hosting for phone installation.

## Build and run

```sh
npm run build
npm start
```

The build exports public assets to `out/`. The postbuild script generates a versioned service worker from the exact exported assets. The included static server serves `out/` (default port 3000, configurable with PORT). You can deploy this directory on a static HTTPS host without a backend or storage subscription.

## Features

- Add, edit, and delete expenses and income with exact integer-cent amounts.
- Categories, date, notes, and Personal / University / Freelance / Internship areas.
- Monthly totals, weekly cashflow, category breakdowns, and monthly spending limits.
- Search and filter entries by type, area, category, and month or all time.
- Explicit sample mode that never persists sample records.
- JSON backup and validated merge restore. CSV export guards spreadsheet formula prefixes.
- Per-browser persistence, storage-error handling, and same-origin tab updates.
- Home-screen installation and offline app shell after a successful production visit.

## Data and backup

The ledger is stored only in `localStorage` under `paypay.ledger.v1`. It is not synchronized or sent to a server. Each browser and each origin (including localhost versus the hosted URL) has a separate ledger. Browser data deletion, private browsing cleanup, or storage eviction can remove records. Use Settings → Download backup regularly and restore the JSON on another device to transfer records. Backups contain unencrypted financial records; store them where you normally keep personal files.

Imports validate the whole backup before making changes. Matching transaction IDs keep the current record; existing month budgets win. Different currencies cannot be merged into a populated ledger. Unreadable storage is preserved until an explicit recovery restore; download the original recovery copy first.

Net this month means recorded income minus recorded expenses, not a bank balance. Future transactions are not supported. Budgets are specific to each selected month. The currency can be chosen before any records or budgets exist; the app does not convert money.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The tests cover cent parsing, real calendar dates, persistence, failed writes, backup validation and merge rules, monthly/weekly totals, and CSV escaping. Browser UI and device installation tests are separate from these checks.

## Optional WebMCP

When the browser exposes `document.modelContext`, Paypay registers `read_month_summary` and `create_transaction`. Both use the actual local ledger and the same validators as the visible UI. Unsupported browsers work normally. Contract execution requires a supported WebMCP browser; availability is feature-detected.
