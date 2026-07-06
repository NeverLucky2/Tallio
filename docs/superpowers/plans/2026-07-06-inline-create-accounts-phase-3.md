# Inline Create — Phase 3: New Account Inline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the user create a whole new account directly from a transfer's **From**/**To** selectors, auto-selected into that field, without leaving the transfer.

**Architecture:** Reuse the existing `AccountEditor` (already compact) as a nested dialog inside `TransferEditor`. Both From and To selects get a "＋ New account…" sentinel option; choosing it opens `AccountEditor` in create mode. On save, an App handler wraps `ledger.addAccount` in `pushHistory()`, returns the new id, and `TransferEditor` selects it in the originating field.

**Tech Stack:** React function components, Vitest + @testing-library/react + userEvent, localStorage-backed `useLedger`.

## Global Constraints

- `useLedger.addAccount({ name, type, icon, openingBalance }) → id` returns the id synchronously.
- Undo: App wraps as `(data) => { pushHistory(); return ledger.addAccount(data); }`.
- Tests use plain property assertions (`.value`); this project does NOT load `jest-dom`.
- Full suite (currently **1028**) stays green at every commit.
- Reuse `AccountEditor` — do NOT build a new account form.
- Branch `feat/fable-redesign`. Match existing style.

## File Structure

- **Modify** `src/TransferEditor.jsx` — import `AccountEditor`; add `onCreateAccount`/`onAddType` props; "＋ New account…" on From/To; nested `AccountEditor`.
- **Modify** `src/TransferEditor.test.jsx` — test creating from From and from To.
- **Modify** `src/App.jsx:664` (TransferEditor element) — pass `onCreateAccount` + `onAddType`.

---

## Task 1: Inline new account from From/To in TransferEditor

**Interfaces:**
- Consumes: `AccountEditor({ account, types, onAddType, onSave, onDelete, onClose, onUndo, undoCount })` — `onSave(accountData)` is called with the assembled account (no id) in create mode.
- Produces: `TransferEditor` accepts `onCreateAccount = null` (`(accountData) => id`) and `onAddType = null` (threaded to the nested editor). Both From and To selects show a final `<option value="__new_account__">＋ New account…</option>` when `onCreateAccount` is set.

- [ ] **Step 1: Failing tests** (append to `TransferEditor.test.jsx`; add `within` to the `@testing-library/react` import at the top of the file)

```jsx
describe('TransferEditor — inline create account', () => {
  afterEach(() => cleanup());

  const accts = [
    { id: 'a_chk', name: 'Checking', type: 'bank' },
    { id: 'newacct', name: 'Brokerage', type: 'bank' }, // simulates the post-add accounts list
  ];

  it('creates a new account from the From selector and selects it', async () => {
    const onCreateAccount = vi.fn(() => 'newacct');
    render(<TransferEditor accounts={accts} categories={[]} fromAccountId="a_chk"
      onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} onCreateAccount={onCreateAccount} />);
    await userEvent.selectOptions(screen.getByLabelText(/from account/i), '__new_account__');
    const dialog = screen.getByText('New account').closest('.dialog-card');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Brokerage');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(onCreateAccount.mock.calls[0][0].name).toBe('Brokerage');
    expect(screen.getByLabelText(/from account/i).value).toBe('newacct');
  });

  it('creates a new account from the To selector and selects it', async () => {
    const onCreateAccount = vi.fn(() => 'newacct');
    render(<TransferEditor accounts={accts} categories={[]} fromAccountId="a_chk"
      onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} onCreateAccount={onCreateAccount} />);
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), '__new_account__');
    const dialog = screen.getByText('New account').closest('.dialog-card');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Brokerage');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(screen.getByLabelText(/to account/i).value).toBe('newacct');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/TransferEditor.test.jsx`; no "＋ New account…").

- [ ] **Step 3: Implement**

3a. `src/TransferEditor.jsx` — add import (after the `CategoryPicker` import):
```jsx
import AccountEditor from './AccountEditor.jsx';
```

3b. Signature — add the two props before the closing `}` (alongside `onAddCategory`):
```jsx
onUndo, undoCount = 0, onSaveAsTemplate = null, onAddCategory = null, onCreateAccount = null, onAddType = null }) {
```

3c. State — near the other `useState`s (e.g. after `const [splitsOpen, setSplitsOpen] = useState(false);`):
```jsx
  const [creatingAccountFor, setCreatingAccountFor] = useState(null); // 'from' | 'to' | null
```

3d. Replace the **From** field (`TransferEditor.jsx:82-90`):
```jsx
        <label className="field"><span>From</span>
          <select aria-label="From account" value={fromId}
            onChange={(e) => {
              if (e.target.value === '__new_account__') setCreatingAccountFor('from');
              else setFromId(e.target.value);
            }} className="select">
            {groups.map(({ group, accounts: list }) => (
              <optgroup key={group} label={group}>
                {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            ))}
            {onCreateAccount && <option value="__new_account__">＋ New account…</option>}
          </select>
        </label>
```

3e. Update `onToChange` to intercept the sentinel (replace the existing `onToChange` definition):
```jsx
  const onToChange = (e) => {
    const next = e.target.value;
    if (next === '__new_account__') { setCreatingAccountFor('to'); return; }
    setToId(next);
    if (!isEdit && !typeTouched) {
      setCategoryId(suggestTransferCategoryId(accounts.find(a => a.id === next), transferCats) || '');
    }
  };
```

3f. Add the sentinel option to the **To** select (after its account `optgroup`s, before `</select>` at `TransferEditor.jsx:99-100`):
```jsx
            {onCreateAccount && <option value="__new_account__">＋ New account…</option>}
          </select>
```

3g. Render the nested editor — just before the `{splitsOpen && (` block:
```jsx
        {creatingAccountFor && (
          <AccountEditor
            account={null}
            types={types}
            onAddType={onAddType}
            onSave={(data) => {
              const id = onCreateAccount(data);
              if (creatingAccountFor === 'from') setFromId(id);
              else setToId(id);
              setCreatingAccountFor(null);
            }}
            onDelete={() => {}}
            onClose={() => setCreatingAccountFor(null)}
            onUndo={onUndo} undoCount={undoCount}
          />
        )}
```

3h. `src/App.jsx` — the `TransferEditor` element (after `onAddCategory=…`):
```jsx
          onAddCategory={(p) => { pushHistory(); return cats.addCategory(p); }}
          onCreateAccount={(data) => { pushHistory(); return ledger.addAccount(data); }}
          onAddType={(p) => { pushHistory(); return accountTypes.addType(p); }}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/TransferEditor.test.jsx`).
- [ ] **Step 5: Commit** `feat(accounts): inline create account from transfer From/To`.

---

## Task 2: Full-suite checkpoint

- [ ] **Step 1:** `npx vitest run` — expect all green (1028 + 2 new).
- [ ] **Step 2:** Reuses existing `.dialog-*` styling — no new CSS. Optional visual spot-check.
- [ ] **Step 3:** Checkpoint — Phase 3 done; the whole 3-phase initiative is complete. Pause for review / finish-branch decision.

## Self-Review

- Spec §7 (reuse AccountEditor nested; From/To "＋ New account"; App `addAccount` returns id; persist + Undo) → Task 1. ✓
- No placeholders; full code each step. ✓
- Types consistent: `onCreateAccount(data)→id`, `onAddType(p)→id`, sentinel `__new_account__`, `creatingAccountFor ∈ {from,to}`. ✓
- Note: an inline-created **To** account does not run the type auto-suggest (that only fires for existing accounts); acceptable — the user is mid-creation and sets Type explicitly. Documented, not a defect.
