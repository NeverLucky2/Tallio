# Tallio

A local-first personal finance tracker for people who reconcile to the dollar. Tallio turns paper bills, receipts, paystubs, and statements into a clean double-entry-style ledger — using your phone's camera and Claude's vision model to do the data entry for you — then reports on cash flow, net worth, spending, and recurring charges. Everything lives in your browser; there is no server and no account to sign up for.

> Tallio is a single-page React app. All of your financial data is stored in your browser's `localStorage` and never leaves your device, except the bill **image** you choose to scan, which is sent directly to the Anthropic API with your own key.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration (Anthropic API key)](#configuration-anthropic-api-key)
- [Scanning bills](#scanning-bills)
- [Pairing your phone](#pairing-your-phone)
- [Reports](#reports)
- [Data, storage & backups](#data-storage--backups)
- [Project structure](#project-structure)
- [Testing & linting](#testing--linting)
- [Privacy & security](#privacy--security)
- [License](#license)

---

## Features

### Accounts & the ledger
- **Flat transaction ledger.** Every account holds a register of signed transactions; balances are computed by summing the opening balance plus all transaction amounts. Income raises an account, expenses and savings lower it.
- **Customizable account types.** Built-in types — Bank/Cash, Investments, Credit card, Loan, Mortgage, Person/External, Unassigned — drive three things: net-worth inclusion (`asset` / `liability` / `off-sheet`), register layout (`bank` vs `compact`), and sidebar grouping. You can add, edit, and delete your own types; deleting a type reassigns its accounts first.
- **Register with running balance.** Transactions are sorted oldest→newest with a running balance, displayed newest-first. Sort by date, amount, balance, category, payee, check number, or description. Search across description, payee, category name, or amount.
- **Household roll-ups.** Net worth, total assets, and total owed are computed across on-balance-sheet accounts (people/external and unassigned accounts are excluded).

### Splits
- Break a single transaction into multiple lines, each carrying **exactly one** of a category or a transfer. Split lines must sum exactly to the parent amount (validated to the cent). Per-line direction (Out/In) and a main-category label are supported, and the register can expand/collapse split rows inline.

### Transfers
- A transfer is a pair of transactions sharing one `transferId` — money leaving one account and arriving in another, with no effect on income/spending totals.
- **Liability pay-off defaults.** Starting a transfer from a credit card, loan, or mortgage pre-fills the form to pay it down: the liability becomes the destination, the amount defaults to the balance owed, and the "from" bank is remembered for next time.
- **Suggested transfer categories** based on the destination account type (e.g. paying a credit card suggests "Credit Card Payment").

### Categories & auto-categorization
- Categories carry a **flow**: `expense`, `income`, `savings`, or `transfer`. The flow determines how a transaction affects balances and how it's counted in reports.
- **Keyword rules with longest-match wins.** Each category has a keyword list; when a transaction is scanned or created, Tallio picks the category whose longest matching keyword appears in the description. Seeded keyword sets cover groceries, dining, fitness, donations, taxes, paychecks, dividends, 401(k)/Roth, and more.
- Manage categories, keywords, colors, and icons from the **Categories** screen.

### AI bill & statement scanning
- Point your camera (or upload an image/PDF) at a **bill, receipt, paystub, brokerage statement, or credit-card statement**. Claude extracts every money-moving line item as structured JSON:
  - Purchases/outflows/deductions become positive magnitudes; refunds/credits become negative.
  - Paystubs yield gross pay plus each deduction (federal/state tax, FICA, 401k, etc.).
  - Brokerage statements capture dividends/interest/distributions and skip trades.
  - Credit-card statements capture each transaction and skip "payment – thank you" lines.
- Extracted items are auto-categorized and added to the selected account (or a new account named after the vendor).
- **Bring-your-own-key:** you choose the model (Haiku / Sonnet / Opus) to trade off cost vs. accuracy. The image is sent straight from your browser to Anthropic.

### Reports
- **Summary scorecard** — income, spending, and savings (savings = income − spending) for the selected period and scope, with a savings rate.
- **Cash-flow chart** — income vs. spending vs. net per month.
- **Net-worth chart** — household assets, amount owed, and net worth at each month-end (on-balance-sheet accounts only).
- **Spending by category** — ranked totals with share-of-spend.
- **Recurring charges** — detects repeating charges (same normalized payee across ≥2 months), flags whether each is active, and lets you mark subscriptions **ongoing** or **cancelled**. "Zombie" charges that bill *after* you marked them cancelled are surfaced as alerts.
- **Duplicate detection** — flags likely double charges (same account, date, amount, and label), which you can dismiss.
- Scope reports to all accounts, a single account, an account type, or a group; filter by preset periods (this month, last 3 / 12 months, this year, all time) or a custom range.

### Quality-of-life
- **Undo** — up to 20 levels, covering ledger edits *and* report acknowledgments.
- **Display size** — adjustable global UI zoom, persisted.
- **Export** — one-click backup to a `.zip` containing `data.json` (full state) and `transactions.csv` (spreadsheet-friendly, Excel-safe BOM).
- **Automatic schema migrations** — older saved data is migrated forward (v1→v4) on load, with one-time backups taken before destructive steps.

---

## Tech stack

| Area | Choice |
|------|--------|
| UI | React 19 |
| Build/dev | Vite 7 |
| Tests | Vitest 4 + Testing Library (jsdom) |
| AI extraction | `@anthropic-ai/sdk` (Claude vision, browser-side) |
| Phone pairing | `peerjs` (WebRTC) + `qrcode.react` |
| Zip/export | `fflate` |
| IDs | `nanoid` |

No backend. No database. No bundled secrets.

---

## Getting started

### Prerequisites
- **Node.js 20.19+ or 22.12+** (required by Vite 7)
- npm (ships with Node)

### Install
```bash
npm install
```

### Run the dev server
```bash
npm run dev
```
Vite serves the app at **http://localhost:5173** (the port is pinned via `strictPort` so your `localStorage` data always stays at the same origin).

### Build for production
```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

The build is fully static — deploy `dist/` to any static host (Netlify, Vercel, GitHub Pages, S3, etc.).

### Available scripts
| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the Vite dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run the Vitest suite |
| `npm run lint` | Run ESLint |

---

## Configuration (Anthropic API key)

Scanning is the only feature that talks to the network, and it needs **your own** Anthropic API key.

1. Get a key at **console.anthropic.com → Settings → API Keys**.
2. In Tallio, open **⚙ Settings** and paste the key (it must start with `sk-ant-`).
3. Choose a model:

   | Model | Approx. cost / receipt |
   |-------|------------------------|
   | Haiku 4.5 | ~$0.005 |
   | Sonnet 4.6 | ~$0.025 |
   | Opus 4.7 | ~$0.10 |

The key is stored **only in your browser's `localStorage`** and is sent directly from your browser to Anthropic — never to any Tallio server (there isn't one).

---

## Scanning bills

Three ways to feed Tallio an image:

- **◉ Scan** — use your computer's webcam.
- **↑ Upload** — pick an image or PDF file.
- **⌘ Pair Phone** — capture with your phone's camera (see below).

After extraction you'll see the line items appear in the selected account, already categorized. If no account is selected, Tallio creates one named after the detected vendor.

---

## Pairing your phone

Phones have the better camera, so Tallio lets you capture on your phone and land the data on your desktop — peer-to-peer, with the image never touching a server.

1. On the desktop, click **⌘ Pair Phone**. A QR code appears (it encodes `<your-origin>/pair#s=<sessionId>`).
2. Scan the QR with your phone's camera and open the link. The phone loads Tallio's lightweight capture page at `/pair`.
3. Take a photo of the bill. The image streams to your desktop over an encrypted **WebRTC** data channel (chunked at 16 KB), where it's reassembled and run through extraction.

Notes:
- A pairing code expires after **5 minutes** of waiting; image transfers time out after 30s of inactivity.
- Connectivity uses public STUN/TURN servers (Google STUN + OpenRelay TURN) to traverse NAT.
- **For development**, your phone needs to reach your dev machine over HTTPS. Use a tunnel such as Cloudflare Tunnel, ngrok, or localtunnel — Vite's dev server is configured with `allowedHosts: true` to accept them. Point your phone at the tunnel's public URL.

---

## Reports

Open **📊 Reports** to switch from the ledger view to analytics. Pick a **period** (this month, last 3/12 months, this year, all time, or custom) and a **scope** (all accounts, one account, an account type, or a group). The scorecard, charts, recurring list, and duplicate list all recompute from the same in-memory ledger — there's no separate reporting store.

> **Savings = income − spending.** Tallio treats net cash flow for the period as your savings figure, matching how money actually moves into investment/brokerage accounts.

---

## Data, storage & backups

- **Where it lives:** browser `localStorage`, namespaced under `tallio-*` keys (accounts, transactions, categories, account types, settings, report acknowledgments). Data is per-browser and per-origin — which is why the dev port is pinned.
- **Schema migrations:** on load, older data is migrated forward through versions 1→4. One-time backups (`tallio-pre-categories-backup`, `tallio-pre-accounts-backup`, etc.) are written before destructive steps so nothing is lost.
- **Namespace migration:** data saved under the previous `billtracker-*` namespace is automatically and idempotently relocated to `tallio-*` on first load after upgrading.
- **Backup / portability:** click **↗ Export** to download a `.zip` with:
  - `data.json` — complete state (accounts, transactions, categories, account types, report acks, schema/app version, export timestamp).
  - `transactions.csv` — flat, spreadsheet-ready, with a UTF-8 BOM so Excel opens it cleanly.

> Because all data is local, clearing your browser storage or switching browsers/devices will start you fresh. Export regularly if your records matter to you.

---

## Project structure

```
src/
  App.jsx                  App shell: header, screens, scan/upload/pairing wiring, undo
  main.jsx                 Entry point; runs storage migrations before mount

  # Data model & pure logic (framework-free, heavily tested)
  accountsModel.js         Account types, balances, registers, transfers, split validation
  reportsModel.js          Period/scope resolution, cash flow, net worth, recurring & duplicate detection
  spendingMath.js          Schema v1→v3 migration helpers and spending math
  accountsMigration.js     v3 bills → v4 accounts/transactions migration
  categoriesDefaults.js    Seed categories (expense/income/savings/transfer) + keywords
  categoryRules.js         Longest-match keyword auto-categorizer
  exportArchive.js         data.json + transactions.csv → zip
  billExtractor.js         Claude vision prompt, response parsing/validation, error mapping
  peerProtocol.js          WebRTC chunking/reassembly + PeerJS config
  migrateStorageNamespace.js  billtracker-* → tallio-* one-time localStorage migration
  initializeFromStorage.js Load + migrate ledger on startup

  # React hooks (state + persistence)
  useLedger.js  useCategories.js  useAccountTypes.js  useReportAcks.js
  useSettings.js  useDesktopPeer.js  usePhonePeer.js

  # Screens & components
  AccountList.jsx  Register.jsx  TransactionRow.jsx  TransactionEditor.jsx
  TransferEditor.jsx  SplitsEditor.jsx  AccountEditor.jsx
  ManageCategoriesScreen.jsx  CategoryEditor.jsx  AccountTypesScreen.jsx  AccountTypeEditor.jsx
  ReportsScreen.jsx  SummaryScorecard.jsx  CashFlowChart.jsx  NetWorthChart.jsx
  CategoryBreakdown.jsx  CategoryBarList.jsx  RecurringList.jsx  PeriodControl.jsx  ScopeControl.jsx
  PairingPanel.jsx  PhoneCapture.jsx  SettingsPanel.jsx
  IconPicker.jsx  ColorPicker.jsx  ChipEditor.jsx
```

Most modules ship with a co-located `*.test.js(x)` file.

---

## Testing & linting

```bash
npm test         # full Vitest suite (jsdom)
npm run lint     # ESLint
```

The project is developed test-first: the pure model/logic modules and React components are covered by a comprehensive Vitest + Testing Library suite (590+ tests across the `src/**/*.test.{js,jsx}` files), including end-to-end smoke tests for migration, splits, and export round-tripping.

---

## Privacy & security

- **Local-first.** Your ledger never leaves your browser. There is no backend, analytics, or telemetry.
- **Your key, your call.** The Anthropic API key is stored only in `localStorage` and used to call Anthropic directly (`dangerouslyAllowBrowser`). Only the image you scan is transmitted, and only to Anthropic.
- **Peer-to-peer capture.** Phone→desktop image transfer is a direct encrypted WebRTC channel; images are not relayed through an application server.

---

## License

Private project — all rights reserved unless a license file is added.

---

<sub>Tallio (formerly “BillTracker”). Built with React + Vite.</sub>
