# Smarter Bill Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project runs tasks **inline** with checkpoints, NOT subagent-driven). Steps use checkbox (`- [ ]`) syntax.

**Goal:** After any bill scan, let the user review and choose the target account (with a smart vendor→account guess), and make the slow scan cancellable with clearer loading text.

**Architecture:** Split `handleCapture` from "extract → commit" into "extract → stash `pendingScan` → review dialog → `applyScan(accountId)` commits." A new `ScanReview` dialog reuses the existing grouped-account `<select>` + inline `AccountEditor` pattern from `TransferEditor`. A pure `matchAccountByVendor` preselects the account. Cancel threads an `AbortController` signal into the Anthropic SDK request.

**Tech Stack:** React 19, Vitest 4, `@anthropic-ai/sdk` (browser), existing `accountsModel.groupAccounts`, `AccountEditor`.

## Global Constraints

- React 19 / Vitest 4; match existing patterns (function modules, `class="select"`/`"field"`/`"pair-*"`/`"dialog-*"` CSS already exist).
- Keep the full suite green. New browser APIs (`AbortController`) are standard in jsdom.
- No change to the extraction prompt or model; all extracted items go to one chosen account.
- Commit after every task; run `npm test` before each commit.

---

### Task 1: `scanMatch.js` — vendor → account matcher

**Files:**
- Create: `src/scanMatch.js`
- Test: `src/scanMatch.test.js`

**Interfaces:**
- Produces: `matchAccountByVendor(vendor: string, accounts: Array<{id,name}>): account | null`

- [ ] **Step 1: Write the failing test**

```js
// src/scanMatch.test.js
import { describe, it, expect } from 'vitest';
import { matchAccountByVendor } from './scanMatch.js';

const accounts = [
  { id: 'a1', name: 'Chase Sapphire' },
  { id: 'a2', name: 'Amex Gold' },
  { id: 'a3', name: 'Checking' },
];

describe('matchAccountByVendor', () => {
  it('returns null for empty/nullish vendor', () => {
    expect(matchAccountByVendor('', accounts)).toBeNull();
    expect(matchAccountByVendor(null, accounts)).toBeNull();
    expect(matchAccountByVendor('Chase', [])).toBeNull();
  });
  it('matches case- and punctuation-insensitively when equal', () => {
    expect(matchAccountByVendor('chase sapphire', accounts).id).toBe('a1');
    expect(matchAccountByVendor('AMEX  GOLD!', accounts).id).toBe('a2');
  });
  it('matches when the vendor contains the account name or vice versa', () => {
    expect(matchAccountByVendor('Chase Sapphire Preferred', accounts).id).toBe('a1');
    expect(matchAccountByVendor('Amex', accounts).id).toBe('a2');
  });
  it('matches on a shared significant token (len >= 3)', () => {
    expect(matchAccountByVendor('SAPPHIRE card statement', accounts).id).toBe('a1');
  });
  it('returns null when nothing meaningful matches', () => {
    expect(matchAccountByVendor('Costco Wholesale', accounts)).toBeNull();
  });
  it('does not match on short/common tokens', () => {
    // "of" / two-letter tokens must not connect unrelated names
    expect(matchAccountByVendor('Bank of Nowhere', [{ id: 'x', name: 'Bank of America' }])).not.toBeNull();
    expect(matchAccountByVendor('XY', [{ id: 'x', name: 'AB' }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/scanMatch.test.js`
Expected: FAIL — cannot resolve `./scanMatch.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/scanMatch.js
// Guess which existing account a scanned bill belongs to by matching the vendor /
// card name (printed at the top of the bill) against account names. Conservative:
// the user confirms every scan, so a wrong guess costs one click. Pure + testable.

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s) {
  return normalize(s).split(' ').filter(t => t.length >= 3);
}

export function matchAccountByVendor(vendor, accounts) {
  const v = normalize(vendor);
  if (!v || !accounts || accounts.length === 0) return null;
  const vTokens = new Set(tokens(vendor));

  for (const a of accounts) {
    const n = normalize(a.name);
    if (!n) continue;
    if (n === v || v.includes(n) || n.includes(v)) return a;
  }
  // Fall back to a shared significant token.
  for (const a of accounts) {
    if (tokens(a.name).some(t => vTokens.has(t))) return a;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/scanMatch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanMatch.js src/scanMatch.test.js
git commit -m "feat(scan): vendor->account matcher for scan auto-assign"
```

---

### Task 2: `AccountEditor` — `initialName` prop for prefilled new accounts

Lets `ScanReview` prefill a NEW account's name with the vendor without flipping `AccountEditor` into edit mode (`isEdit = !!account`).

**Files:**
- Modify: `src/AccountEditor.jsx:8,10`
- Test: extend `src/AccountEditor.test.jsx`

**Interfaces:**
- Produces: `<AccountEditor initialName="..." />` — used only when `account` is null.

- [ ] **Step 1: Write the failing test** (add to `src/AccountEditor.test.jsx`)

```jsx
it('prefills the name for a new account from initialName', () => {
  render(<AccountEditor account={null} initialName="Chase Sapphire" onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('heading', { name: /new account/i })).toBeTruthy(); // still "new", not "edit"
  expect(screen.getByLabelText('Name').value).toBe('Chase Sapphire');
});
```

(Match this file's existing imports/render helper; it already imports `render`/`screen` and `AccountEditor`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/AccountEditor.test.jsx`
Expected: FAIL — Name value is `''`.

- [ ] **Step 3: Implement**

`src/AccountEditor.jsx` line 8 — add the prop:

```jsx
export default function AccountEditor({ account, types = DEFAULT_ACCOUNT_TYPES, onSave, onDelete, onClose, onUndo, undoCount = 0, onAddType = null, initialName = '' }) {
```

Line 10 — use it when creating:

```jsx
  const [name, setName] = useState(account?.name || initialName || '');
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/AccountEditor.test.jsx`
Expected: PASS (new + existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/AccountEditor.jsx src/AccountEditor.test.jsx
git commit -m "feat(accounts): AccountEditor initialName prop for prefilled new accounts"
```

---

### Task 3: `billExtractor` — accept an abort `signal`

**Files:**
- Modify: `src/billExtractor.js:106,124`
- Test: extend `src/billExtractor.test.js`

**Interfaces:**
- Consumes/Produces: `extractBillFromImage(imageDataUrl, { apiKey, model, signal })` — `signal` forwarded to `client.messages.create(params, { signal })`.

- [ ] **Step 1: Write the failing test** (add to `src/billExtractor.test.js`)

```js
import { vi } from 'vitest';
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: createMock }; } }));
import { extractBillFromImage } from './billExtractor.js';

describe('extractBillFromImage signal', () => {
  it('forwards the abort signal to messages.create', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: '{"vendor":null,"month":null,"items":[]}' }] });
    const controller = new AbortController();
    await extractBillFromImage('data:image/png;base64,QUJD', { apiKey: 'sk-ant-x', model: 'm', signal: controller.signal });
    expect(createMock).toHaveBeenCalledWith(expect.any(Object), { signal: controller.signal });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/billExtractor.test.js`
Expected: FAIL — `create` called with one arg (no options object).

- [ ] **Step 3: Implement**

`src/billExtractor.js` line 106 — add `signal`:

```js
export async function extractBillFromImage(imageDataUrl, { apiKey, model, signal } = {}) {
```

Line 124 — pass it as request options:

```js
    message = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [sourceBlock, { type: 'text', text: PROMPT }],
        },
      ],
    }, { signal });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/billExtractor.test.js`
Expected: PASS (new + existing pure-function tests).

- [ ] **Step 5: Commit**

```bash
git add src/billExtractor.js src/billExtractor.test.js
git commit -m "feat(scan): thread an abort signal through extractBillFromImage"
```

---

### Task 4: `ScanReview.jsx` — the review-and-assign dialog

**Files:**
- Create: `src/ScanReview.jsx`
- Test: `src/ScanReview.test.jsx`

**Interfaces:**
- Consumes: `matchAccountByVendor` (Task 1), `groupAccounts` (accountsModel), `AccountEditor` + `initialName` (Task 2).
- Produces: `<ScanReview scan={{vendor,month,items}} accounts types typesById onConfirm(accountId) onCancel onCreateAccount(data)->id onAddType />`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/ScanReview.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScanReview from './ScanReview.jsx';

const accounts = [{ id: 'a1', name: 'Chase Sapphire', type: 'untyped' }, { id: 'a3', name: 'Checking', type: 'untyped' }];
const items = [{ description: 'Costco', amount: 100 }, { description: 'Gas', amount: 40 }];

function setup(scan, extra = {}) {
  const onConfirm = vi.fn(), onCancel = vi.fn(), onCreateAccount = vi.fn(() => 'newid');
  render(<ScanReview scan={scan} accounts={accounts} onConfirm={onConfirm} onCancel={onCancel} onCreateAccount={onCreateAccount} {...extra} />);
  return { onConfirm, onCancel, onCreateAccount };
}

describe('ScanReview', () => {
  it('shows the vendor and transaction count', () => {
    setup({ vendor: 'Chase Sapphire', items });
    expect(screen.getByText(/Found 2 transactions/i)).toBeTruthy();
    expect(screen.getByText(/Chase Sapphire/)).toBeTruthy();
  });

  it('preselects a matching account and confirms with its id', () => {
    const { onConfirm } = setup({ vendor: 'Chase Sapphire', items });
    expect(screen.getByLabelText('Account').value).toBe('a1');
    fireEvent.click(screen.getByRole('button', { name: /Add 2 transactions/i }));
    expect(onConfirm).toHaveBeenCalledWith('a1');
  });

  it('defaults to create-new (prefilled) when no account matches', () => {
    setup({ vendor: 'Costco Wholesale', items });
    // AccountEditor is shown in "new account" mode, name prefilled with the vendor
    expect(screen.getByRole('heading', { name: /new account/i })).toBeTruthy();
    expect(screen.getByLabelText('Name').value).toBe('Costco Wholesale');
  });

  it('Cancel calls onCancel', () => {
    const { onCancel } = setup({ vendor: 'Chase Sapphire', items });
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ScanReview.test.jsx`
Expected: FAIL — cannot resolve `./ScanReview.jsx`.

- [ ] **Step 3: Write the implementation**

```jsx
// src/ScanReview.jsx
// Review a freshly-scanned bill and choose which account its transactions go to.
// Smart-preselects by matching the vendor (card name) to an existing account;
// otherwise opens inline account creation prefilled with the vendor name.
import { useState } from 'react';
import { groupAccounts } from './accountsModel.js';
import { matchAccountByVendor } from './scanMatch.js';
import AccountEditor from './AccountEditor.jsx';

export default function ScanReview({ scan, accounts = [], types, typesById, onConfirm, onCancel, onCreateAccount, onAddType = null }) {
  const groups = groupAccounts(accounts, types, typesById);
  const match = matchAccountByVendor(scan.vendor, accounts);
  const [selectedId, setSelectedId] = useState(match ? match.id : '');
  const [creating, setCreating] = useState(!match);
  const count = scan.items.length;
  const plural = count === 1 ? '' : 's';

  const onSelectChange = (e) => {
    if (e.target.value === '__new_account__') { setCreating(true); return; }
    setSelectedId(e.target.value);
  };

  return (
    <div className="pair-overlay" onClick={onCancel}>
      <div className="pair-modal" role="dialog" aria-modal="true" aria-label="Assign scanned bill" onClick={(e) => e.stopPropagation()}>
        <div className="pair-header">
          <h2 className="pair-title">Found {count} transaction{plural} from “{scan.vendor || 'this bill'}”</h2>
          <button className="pair-close" aria-label="Cancel" onClick={onCancel}>×</button>
        </div>

        <div className="pair-body">
          {creating ? (
            <AccountEditor
              account={null}
              initialName={scan.vendor || ''}
              types={types}
              onAddType={onAddType}
              onSave={(data) => { const id = onCreateAccount(data); setSelectedId(id); setCreating(false); }}
              onDelete={() => {}}
              onClose={() => setCreating(false)}
              onUndo={() => {}}
              undoCount={0}
            />
          ) : (
            <label className="field"><span>Add to account</span>
              <select aria-label="Account" value={selectedId} onChange={onSelectChange} className="select">
                <option value="">Select account…</option>
                {groups.map(({ group, accounts: list }) => (
                  <optgroup key={group} label={group}>
                    {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                ))}
                <option value="__new_account__">＋ New account…</option>
              </select>
            </label>
          )}
        </div>

        {!creating && (
          <div className="pair-footer">
            <button className="btn btn-primary" disabled={!selectedId} onClick={() => onConfirm(selectedId)}>Add {count} transaction{plural}</button>
            <button className="btn" onClick={onCancel}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ScanReview.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ScanReview.jsx src/ScanReview.test.jsx
git commit -m "feat(scan): ScanReview dialog — assign scanned bill to an account"
```

---

### Task 5: Wire the review flow into `App.jsx` + Upload button color

**Files:**
- Modify: `src/App.jsx` (imports; `handleCapture` 490-526; new `applyScan`; render `ScanReview`; upload button `872` class)
- Test: `src/__smoke__/scanReview.test.jsx`

**Interfaces:**
- Consumes: `ScanReview` (Task 4), `extractBillFromImage` (existing).

- [ ] **Step 1: Add import + state**

Import near the other component imports (~`App.jsx:38`):

```js
import ScanReview from './ScanReview.jsx';
```

Add state beside `isProcessing` (~`App.jsx:289`):

```js
  const [pendingScan, setPendingScan] = useState(null); // { vendor, month, items, source } | null
```

- [ ] **Step 2: Refactor `handleCapture` to stash instead of commit**

Replace the `try` body of `handleCapture` (currently `App.jsx:500-519`, from `const { vendor, items } = await …` through `setSelectedAccountId(targetId);`) with:

```js
    try {
      const { vendor, month, items } = await extractBillFromImage(imageData, { apiKey: settings.apiKey, model: settings.model });
      setPendingScan({ vendor, month, items, source });
    } catch (err) {
```

Leave the existing `catch`/`finally` for now (Task 6 refines the catch for cancel).

- [ ] **Step 3: Add `applyScan`** (right after `handleCapture`)

```js
  const applyScan = (accountId) => {
    if (!pendingScan) return;
    pushHistory();
    for (const it of pendingScan.items) {
      const ac = cats.autoCategorize(it.description);
      const flow = (categoriesById.get(ac.categoryId)?.flow) || 'expense';
      const sign = flow === 'income' ? 1 : -1;
      ledger.addTransaction({
        accountId,
        date: it.date || new Date().toISOString().slice(0, 10),
        amount: sign * (Number.isFinite(it.amount) ? it.amount : 0),
        categoryId: ac.categoryId,
        ...(ac.subId ? { subId: ac.subId } : {}),
        description: it.description,
      });
    }
    setSelectedAccountId(accountId);
    setPendingScan(null);
  };
```

- [ ] **Step 4: Render `ScanReview`** (beside the other overlays, near `App.jsx:645`)

```jsx
      {pendingScan && (
        <ScanReview
          scan={pendingScan}
          accounts={ledger.accounts}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          onConfirm={applyScan}
          onCancel={() => setPendingScan(null)}
          onCreateAccount={(p) => ledger.addAccount(p)}
          onAddType={accountTypes.addType}
        />
      )}
```

- [ ] **Step 5: Upload button color** — change `App.jsx` Upload button from `className="btn"` to:

```jsx
          <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary">↑ Upload</button>
```

- [ ] **Step 6: Write the smoke test**

```jsx
// src/__smoke__/scanReview.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

vi.mock('../billExtractor.js', async (orig) => ({
  ...(await orig()),
  extractBillFromImage: vi.fn().mockResolvedValue({ vendor: 'Costco', month: null, items: [{ description: 'Groceries', amount: 50 }] }),
}));

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('scan review flow', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('tallio-anthropic-key', 'sk-ant-test'); // handleCapture requires a key
    localStorage.setItem('tallio-accounts', JSON.stringify([{ id: 'a1', name: 'Costco Card', type: 'untyped', icon: '🏦', openingBalance: 0 }]));
  });

  it('opens ScanReview after a scan and commits to the chosen account', async () => {
    const { container } = renderApp();
    const file = new File([new Uint8Array([1, 2, 3])], 'bill.png', { type: 'image/png' });
    const input = container.querySelector('input[accept="image/*,application/pdf"]');
    fireEvent.change(input, { target: { files: [file] } });

    // Dialog appears; nothing committed yet
    await waitFor(() => expect(screen.getByText(/Found 1 transaction from/i)).toBeTruthy());
    expect(JSON.parse(localStorage.getItem('tallio-transactions') || '[]')).toHaveLength(0);

    // Vendor "Costco" fuzzy-matches "Costco Card" → preselected; confirm
    fireEvent.click(screen.getByRole('button', { name: /Add 1 transaction/i }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('tallio-transactions')).length).toBe(1));
  });
});
```

- [ ] **Step 7: Run the smoke test + full suite**

Run: `npx vitest run src/__smoke__/scanReview.test.jsx` → PASS. Then `npm test` → all green.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/__smoke__/scanReview.test.jsx
git commit -m "feat(scan): review-and-assign flow after scanning; Upload uses accent color"
```

---

### Task 6: Cancel + real abort + loading text

**Files:**
- Modify: `src/App.jsx` (refs; `handleCapture` signal + cancel-aware catch; loading text; overlay Cancel button)
- Modify: `src/App.css` (overlay Cancel spacing)
- Test: `src/__smoke__/scanCancel.test.jsx`

- [ ] **Step 1: Add refs + cancel handler** (near `App.jsx:289`)

```js
  const scanAbortRef = useRef(null);
  const scanCancelledRef = useRef(false);
  const cancelScan = () => { scanCancelledRef.current = true; scanAbortRef.current?.abort(); };
```

- [ ] **Step 2: Thread the signal + cancel-aware catch in `handleCapture`**

Set up the controller right before `setIsProcessing(true)` (~`App.jsx:498`):

```js
    scanCancelledRef.current = false;
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setIsProcessing(true);
    setProcessingStatus('Reading bill… multi-page PDFs can take up to a minute');
```

Pass the signal in the extract call (Step 2 of Task 5 line):

```js
      const { vendor, month, items } = await extractBillFromImage(imageData, { apiKey: settings.apiKey, model: settings.model, signal: controller.signal });
```

Make the `catch` silent on user cancel:

```js
    } catch (err) {
      if (!scanCancelledRef.current && err?.name !== 'APIUserAbortError') {
        setMigrationBanner({ message: `Scan failed: ${err.message || 'extraction error'}.`, recovered: false });
      }
    } finally {
      scanAbortRef.current = null;
      setIsProcessing(false); setProcessingStatus('');
    }
```

- [ ] **Step 3: Add the Cancel button to the overlay** (`App.jsx:646-648`)

```jsx
      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-spinner" />
          <p className="processing-label">{processingStatus || 'Processing...'}</p>
          <button type="button" className="btn processing-cancel" onClick={cancelScan}>Cancel</button>
        </div>
      )}
```

- [ ] **Step 4: Style** — append to `src/App.css`:

```css
.processing-cancel { margin-top: 14px; }
```

- [ ] **Step 5: Write the cancel smoke test**

```jsx
// src/__smoke__/scanCancel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

// Resolve nothing until aborted, then reject like the SDK does.
vi.mock('../billExtractor.js', async (orig) => ({
  ...(await orig()),
  extractBillFromImage: vi.fn((data, { signal }) => new Promise((_, reject) => {
    signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'APIUserAbortError'; reject(e); });
  })),
}));

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('scan cancel', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('tallio-anthropic-key', 'sk-ant-test'); });

  it('Cancel aborts the scan, hides the overlay, and shows no error banner', async () => {
    const { container } = renderApp();
    const file = new File([new Uint8Array([1, 2, 3])], 'bill.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[accept="image/*,application/pdf"]'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Reading bill/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    await waitFor(() => expect(screen.queryByText(/Reading bill/i)).toBeNull());
    expect(screen.queryByText(/Scan failed/i)).toBeNull();
  });
});
```

- [ ] **Step 6: Run the cancel test + full suite**

Run: `npx vitest run src/__smoke__/scanCancel.test.jsx` → PASS. Then `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css src/__smoke__/scanCancel.test.jsx
git commit -m "feat(scan): cancellable scan with abort + clearer loading text"
```

---

## Self-Review

**Spec coverage:**
- §1 Upload button color → Task 5 Step 5. ✓
- §2 loading text + Cancel/abort → Task 3 (signal), Task 6. ✓
- §3 matcher → Task 1. ✓
- §4 ScanReview dialog + preselect + inline create → Tasks 2 (initialName), 4. ✓
- App wiring (pendingScan/applyScan, all sources) → Task 5. `handleCapture` is shared by camera/upload/phone, so all sources get the flow. ✓
- Testing (matcher, dialog, App smoke for both commit + cancel) → each task + Tasks 5/6 smokes. ✓

**Placeholder scan:** no TBD/TODO; every code step is concrete. Test additions to existing files (`AccountEditor.test.jsx`, `billExtractor.test.js`) say to match the file's existing imports/render helper — those helpers already exist in-repo.

**Type consistency:** `matchAccountByVendor(vendor, accounts)`, `ScanReview` props (`scan/accounts/types/typesById/onConfirm/onCancel/onCreateAccount/onAddType`), `applyScan(accountId)`, `extractBillFromImage(url, {apiKey,model,signal})`, and `pendingScan` shape `{vendor,month,items,source}` are used identically across tasks. `onCreateAccount(data) → id` matches the `TransferEditor`/`AccountEditor` contract. ✓

**Note for executor:** confirm the exact line of the Upload button and the `processing-overlay` block before editing (line numbers drift); anchor on the string `className="btn">↑ Upload` and the `processing-overlay` JSX.
