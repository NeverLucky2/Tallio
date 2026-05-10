# Delete Confirmation + First-Time Undo Tip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation modal before any bill delete, and a one-shot "tip" modal pointing at the Undo button the first time the user deletes anything.

**Architecture:** One shared `ConfirmDialog` component in `App.jsx` (overlay + card with title, body, and 1-or-2 buttons depending on whether `onCancel` is provided). `BillTracker` gets three new pieces of state (`pendingDeleteBillId`, `showUndoTip`, `undoTipSeen`), persists `undoTipSeen` to `localStorage`, and routes both bill-delete and item-delete through new handlers that trigger the tip on first use.

**Tech Stack:** React 19 + Vite, plain CSS, Vitest (node env, pure-helper tests only).

**Spec:** `docs/superpowers/specs/2026-05-10-delete-confirmation-and-undo-tip-design.md`

**Working directory for all paths and commands:** `bill-tracker/bill-tracker/` (where `package.json`, `vite.config.js`, and `.git` live).

**Base SHA:** `43b9859`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/App.css` | Modify | Append `.dialog-overlay`, `.dialog-card`, `.dialog-title`, `.dialog-body`, `.dialog-actions` styles |
| `src/App.jsx` | Modify | Add `ConfirmDialog` component; add state, persistence, and handlers in `BillTracker`; render two conditional modal blocks; refactor `BillCard` to delegate item deletion to a new `onDeleteItem` prop |

No new files. No new dependencies.

---

## Task 1: Dialog overlay CSS

**Files:**
- Modify: `src/App.css` (append at end)

- [ ] **Step 1: Append the dialog styles**

Open `src/App.css` and append at the very end of the file (after the last existing rule):

```css
/* Modal dialogs (ConfirmDialog component). Used for the bill-delete confirmation
   and the one-shot first-delete undo tip. */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.dialog-card {
  background: rgba(20, 22, 28, 0.95);
  border: 1px solid rgba(240, 230, 210, 0.12);
  border-radius: 14px;
  padding: 22px 24px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
}

.dialog-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
}

.dialog-body {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn-cancel,
.dialog-btn-confirm {
  min-width: 96px;
}
```

The card reuses the same dark-glass styling tone as `SettingsPanel` / `PairingPanel`. Buttons reuse the existing `.btn`, `.btn-primary`, `.btn-danger` classes.

- [ ] **Step 2: Verify file is readable**

Run from `C:\Users\mtzuo\OneDrive\Documents\Projects\bill-tracker\bill-tracker`:

```
node -e "require('fs').readFileSync('src/App.css', 'utf8').length"
```

Expected: A number printed (file size). No errors. (Do NOT start `npm run dev`.)

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat(ui): add modal dialog styles for ConfirmDialog component"
```

---

## Task 2: Add `ConfirmDialog` component

**Files:**
- Modify: `src/App.jsx` (insert new component above `BillCard` near line 304)

- [ ] **Step 1: Insert the `ConfirmDialog` component**

Use the Edit tool. Find this exact existing block (immediately before `BillCard`):

```jsx
// ---- Bill Card ----

const BillCard = ({ bill, onUpdate, onDelete, isMobile, highlighted = false, cardRef = null }) => {
```

Replace with:

```jsx
// ---- Confirm Dialog ----

const ConfirmDialog = ({ title, message, confirmLabel = "OK", variant = "default", onConfirm, onCancel }) => (
  <div className="dialog-overlay" onClick={onCancel ?? onConfirm}>
    <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
      <h2 className="dialog-title">{title}</h2>
      <p className="dialog-body">{message}</p>
      <div className="dialog-actions">
        {onCancel && (
          <button className="btn dialog-btn-cancel" onClick={onCancel}>Cancel</button>
        )}
        <button
          className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'} dialog-btn-confirm`}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);


// ---- Bill Card ----

const BillCard = ({ bill, onUpdate, onDelete, isMobile, highlighted = false, cardRef = null }) => {
```

Notes for the implementer:
- `onCancel ?? onConfirm` on the overlay means clicking outside the card cancels if a Cancel button exists, otherwise dismisses (counts as OK on the tip dialog).
- `(e) => e.stopPropagation()` on the card prevents clicks INSIDE the card from bubbling up to the overlay.
- `autoFocus` on the primary button makes Enter confirm.

- [ ] **Step 2: Run unit tests**

Run: `npm test -- --run`
Expected: 101 / 101 tests pass. The component isn't rendered yet so no behavior change is testable here.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): add ConfirmDialog component for modal confirmations and tips"
```

---

## Task 3: Add state and persistence effect in `BillTracker`

**Files:**
- Modify: `src/App.jsx` (state declarations near line 644; persistence effect near line 698)

- [ ] **Step 1: Add the three new state declarations**

Find this existing block in `BillTracker` (around line 643):

```js
const [newlyAddedBillId, setNewlyAddedBillId] = useState(null);
```

Append AFTER this line:

```js
const [pendingDeleteBillId, setPendingDeleteBillId] = useState(null);
const [showUndoTip, setShowUndoTip] = useState(false);
const [undoTipSeen, setUndoTipSeen] = useState(() => {
  try { return localStorage.getItem('billtracker-undo-tip-seen') === 'true'; } catch { return false; }
});
```

- [ ] **Step 2: Add the persistence effect**

Find the existing tracked-keywords persistence effect (around lines 695-700):

```js
useEffect(() => {
  try {
    localStorage.setItem('billtracker-tracked-keywords', JSON.stringify(trackedKeywords));
  } catch (e) {
    console.error('Failed to save tracked keywords:', e);
  }
}, [trackedKeywords]);
```

Insert immediately AFTER this block:

```js
useEffect(() => {
  try {
    localStorage.setItem('billtracker-undo-tip-seen', undoTipSeen ? 'true' : 'false');
  } catch (e) {
    console.error('Failed to save undo tip flag:', e);
  }
}, [undoTipSeen]);
```

This mirrors the existing patterns for `bills` and `trackedKeywords` persistence.

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: 101 / 101 pass. State is unused yet so behavior is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(bills): add pendingDeleteBillId, showUndoTip, and undoTipSeen state"
```

---

## Task 4: Add new handlers in `BillTracker`

**Files:**
- Modify: `src/App.jsx` (around lines 885-897 — `updateBill` and `deleteBill`)

- [ ] **Step 1: Replace the `deleteBill` function and add adjacent handlers**

Find this exact block (around lines 894-897):

```js
const deleteBill = (billId) => {
  pushHistory(bills);
  setBills(prev => prev.filter(bill => bill.id !== billId));
};
```

Replace with:

```js
const maybeShowUndoTip = () => {
  if (!undoTipSeen) setShowUndoTip(true);
};

const dismissUndoTip = () => {
  setShowUndoTip(false);
  setUndoTipSeen(true);
};

const deleteBill = (billId) => {
  setPendingDeleteBillId(billId);
};

const confirmDeleteBill = () => {
  if (!pendingDeleteBillId) return;
  pushHistory(bills);
  setBills(prev => prev.filter(bill => bill.id !== pendingDeleteBillId));
  setPendingDeleteBillId(null);
  maybeShowUndoTip();
};

const cancelDeleteBill = () => setPendingDeleteBillId(null);

const handleDeleteItem = (billId, itemId) => {
  pushHistory(bills);
  setBills(prev =>
    prev.map(b => b.id === billId ? { ...b, items: b.items.filter(i => i.id !== itemId) } : b)
  );
  maybeShowUndoTip();
};
```

What changed:
- `deleteBill` no longer deletes directly — it opens the confirmation modal.
- `confirmDeleteBill` does the actual delete (with history) and may show the tip.
- `cancelDeleteBill` clears the pending state.
- `handleDeleteItem` is new — the parent now owns item-delete state mutation so it can trigger the tip.
- `maybeShowUndoTip` and `dismissUndoTip` are the two tip lifecycle helpers.

Note: At this point in the plan, `BillCard` does not yet call `handleDeleteItem` — item deletes still flow through `onUpdate` / `updateBill` (which doesn't trigger the tip). That's a transient state. It is fixed in Task 6. Bill delete is fully working as of this task because the confirm modal is rendered in Task 5.

**Important transient gap:** Between this task's commit and Task 5's commit, clicking "Delete Bill" sets `pendingDeleteBillId` but the modal isn't rendered, so the bill never gets deleted. That's why Task 5 follows immediately and they should not be released independently.

- [ ] **Step 2: Run tests**

Run: `npm test -- --run`
Expected: 101 / 101 pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(bills): add confirm-delete and undo-tip handlers in BillTracker"
```

---

## Task 5: Render the two modals

**Files:**
- Modify: `src/App.jsx` (insert near line 943, between the `SettingsPanel` block and the `Undo Toast` block)

- [ ] **Step 1: Add the two `ConfirmDialog` render blocks**

Find this exact block (around lines 937-950):

```jsx
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onClose={closeSettings}
          banner={settingsBanner}
        />
      )}

      {/* Undo Toast */}
```

Replace with:

```jsx
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onClose={closeSettings}
          banner={settingsBanner}
        />
      )}

      {pendingDeleteBillId && (
        <ConfirmDialog
          title="Delete this bill?"
          message="All items in this bill will be removed. You can undo this from the top toolbar."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDeleteBill}
          onCancel={cancelDeleteBill}
        />
      )}

      {showUndoTip && (
        <ConfirmDialog
          title="Tip: you can undo deletes"
          message="If you accidentally delete a bill or an item, click the ↩ Undo button in the top toolbar to restore it."
          confirmLabel="OK, got it"
          onConfirm={dismissUndoTip}
        />
      )}

      {/* Undo Toast */}
```

After this commit, bill delete is fully functional: clicking "Delete Bill" opens the confirm modal; Delete actually removes the bill and (if first time) opens the tip.

Item delete is NOT yet routed through `handleDeleteItem` — that happens in Task 6. So item delete still works (via the existing `onUpdate` path) but does not trigger the tip yet.

- [ ] **Step 2: Run tests**

Run: `npm test -- --run`
Expected: 101 / 101 pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): render bill-delete confirm modal and one-shot undo tip"
```

---

## Task 6: Route item deletion through the new handler

**Files:**
- Modify: `src/App.jsx` in two places:
  - `BillCard` component (lines 304 and 320-322)
  - The `visibleBills.map` `<BillCard>` render block (around line 1087)

- [ ] **Step 1: Update `BillCard` signature to accept `onDeleteItem` prop**

Find this exact line (around line 304):

```js
const BillCard = ({ bill, onUpdate, onDelete, isMobile, highlighted = false, cardRef = null }) => {
```

Replace with:

```js
const BillCard = ({ bill, onUpdate, onDelete, onDeleteItem, isMobile, highlighted = false, cardRef = null }) => {
```

- [ ] **Step 2: Update `BillCard`'s local `deleteItem` to delegate**

Find this exact block (around lines 320-322):

```js
const deleteItem = (itemId) => {
  onUpdate({ ...bill, items: bill.items.filter(item => item.id !== itemId) });
};
```

Replace with:

```js
const deleteItem = (itemId) => onDeleteItem(bill.id, itemId);
```

- [ ] **Step 3: Thread the prop from `BillTracker`**

Find the `<BillCard>` render in the `visibleBills.map` block (around line 1087):

```jsx
visibleBills.map(bill => (
  <BillCard
    key={bill.id}
    bill={bill}
    onUpdate={updateBill}
    onDelete={deleteBill}
    isMobile={isMobile}
    highlighted={bill.id === newlyAddedBillId}
    cardRef={bill.id === newlyAddedBillId ? newBillRef : null}
  />
))
```

Replace with:

```jsx
visibleBills.map(bill => (
  <BillCard
    key={bill.id}
    bill={bill}
    onUpdate={updateBill}
    onDelete={deleteBill}
    onDeleteItem={handleDeleteItem}
    isMobile={isMobile}
    highlighted={bill.id === newlyAddedBillId}
    cardRef={bill.id === newlyAddedBillId ? newBillRef : null}
  />
))
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: 101 / 101 pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor(bills): BillCard delegates item delete to parent onDeleteItem"
```

---

## Task 7: Verify and commit spec/plan

**Files:**
- No code changes.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: 101 / 101 pass.

- [ ] **Step 2: Commit the spec and plan**

The spec and plan files were created as untracked. Commit them now.

```bash
git add docs/superpowers/specs/2026-05-10-delete-confirmation-and-undo-tip-design.md docs/superpowers/plans/2026-05-10-delete-confirmation-and-undo-tip.md
git commit -m "docs: delete confirmation and undo tip design and plan"
```

- [ ] **Step 3: Final history review**

Run: `git log --oneline -10`

Expected recent commits (most recent first):
- `docs: delete confirmation and undo tip design and plan`
- `refactor(bills): BillCard delegates item delete to parent onDeleteItem`
- `feat(ui): render bill-delete confirm modal and one-shot undo tip`
- `feat(bills): add confirm-delete and undo-tip handlers in BillTracker`
- `feat(bills): add pendingDeleteBillId, showUndoTip, and undoTipSeen state`
- `feat(ui): add ConfirmDialog component for modal confirmations and tips`
- `feat(ui): add modal dialog styles for ConfirmDialog component`

---

## Acceptance Criteria

After all tasks complete:

1. **Bill delete asks first.** Clicking "Delete Bill" opens a confirmation modal. Cancel keeps the bill. Delete removes it and history is pushed (Undo button restores it).
2. **Backdrop click outside the confirm dialog cancels** the bill delete.
3. **First-time delete shows the tip.** With `localStorage['billtracker-undo-tip-seen']` absent or `"false"`, the first delete (item via `×` button, or confirmed bill delete) opens the tip modal pointing at the Undo button.
4. **Tip dismissal persists.** After clicking OK, `localStorage['billtracker-undo-tip-seen'] === "true"` and the tip never reappears across reloads.
5. **Backdrop click on the tip dismisses it** (same effect as OK).
6. **Enter confirms.** The primary button receives `autoFocus`, so pressing Enter while the modal is open clicks it.
7. **Undo unaffected.** The existing Undo button still restores any deletion (because both `confirmDeleteBill` and `handleDeleteItem` call `pushHistory(bills)`).
8. **No regressions.** All 101 unit tests pass.

## Manual Verification (controller does this after all subagents complete)

To exercise these flows in the running app:

1. Clear the tip flag: open browser devtools → Application → Local Storage → delete `billtracker-undo-tip-seen` (or run `localStorage.removeItem('billtracker-undo-tip-seen')` in the console).
2. Expand a bill, click `×` on an item → item is removed; tip appears; click OK → tip closes; localStorage shows `billtracker-undo-tip-seen = "true"`.
3. Click `×` on another item → no tip this time. Click Undo (top toolbar) → previous deletion restored.
4. Clear the flag again. Click "Delete Bill" on an expanded card → confirm modal appears. Click backdrop → modal closes, bill remains.
5. Click "Delete Bill" again, then "Delete" → bill is removed, tip appears. Click backdrop → tip dismisses (same as OK).
6. Refresh the page → tip should NOT reappear.
