# Delete Confirmation + First-Time Undo Tip — Design

Date: 2026-05-10
Status: Approved

## Problem

1. **Accidental bill deletes are easy and costly.** The "Delete Bill" button in the expanded `BillCard` footer wipes a bill (often with many items) on a single click. The Undo button can restore it, but new users don't know that.
2. **The Undo affordance is unobvious.** A first-time user who deletes something has no signal that recovery is possible.

## Design

Two new affordances, both rendered as styled modal overlays consistent with the existing `SettingsPanel` / `PairingPanel` / `CameraCapture` aesthetic:

1. A **confirmation modal** before any bill delete proceeds.
2. A **one-shot "tip" modal** shown the first time a user deletes anything (item or bill), pointing at the existing Undo button. The tip is dismissed forever after the user clicks OK.

Item deletes (the `×` per item row) remain immediate — no confirmation — because they're low-cost individual actions, while a bill delete cascades into removing all its items.

## Components

### New: `ConfirmDialog`

A single shared modal component handling both modes via props.

**Props:**

| Prop | Type | Purpose |
|---|---|---|
| `title` | string | Heading text |
| `message` | string | Body text |
| `confirmLabel` | string | Label for the primary button (default `"OK"`) |
| `variant` | `"default"` \| `"danger"` | Styling for the primary button (default `"default"`) |
| `onConfirm` | `() => void` | Required. Called when primary button is clicked. |
| `onCancel` | `() => void \| undefined` | Optional. If provided, a Cancel button appears and clicking the backdrop fires `onCancel`. If undefined, only the primary button shows and clicking the backdrop fires `onConfirm` (dismisses the tip). |

**Rendering structure:**

```jsx
<div className="dialog-overlay" onClick={onCancel ?? onConfirm}>
  <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
    <h2 className="dialog-title">{title}</h2>
    <p className="dialog-body">{message}</p>
    <div className="dialog-actions">
      {onCancel && <button className="btn dialog-btn-cancel" onClick={onCancel}>Cancel</button>}
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
```

`autoFocus` on the primary button means Enter confirms. No explicit Esc handling — clicking the backdrop covers cancel. YAGNI.

## State (added to `BillTracker`)

```js
const [pendingDeleteBillId, setPendingDeleteBillId] = useState(null);
const [showUndoTip, setShowUndoTip] = useState(false);
const [undoTipSeen, setUndoTipSeen] = useState(() => {
  try { return localStorage.getItem('billtracker-undo-tip-seen') === 'true'; } catch { return false; }
});
```

Persist `undoTipSeen` with the same pattern as `bills` / `trackedKeywords`:

```js
useEffect(() => {
  try { localStorage.setItem('billtracker-undo-tip-seen', undoTipSeen ? 'true' : 'false'); } catch (e) { console.error('Failed to save undo tip flag:', e); }
}, [undoTipSeen]);
```

LocalStorage key: `billtracker-undo-tip-seen`. Value: string `"true"` or `"false"`.

## Handlers

```js
const maybeShowUndoTip = () => {
  if (!undoTipSeen) setShowUndoTip(true);
};

const dismissUndoTip = () => {
  setShowUndoTip(false);
  setUndoTipSeen(true);
};

// Replaces the existing direct-delete deleteBill:
const deleteBill = (billId) => setPendingDeleteBillId(billId);

const confirmDeleteBill = () => {
  if (!pendingDeleteBillId) return;
  pushHistory(bills);
  setBills(prev => prev.filter(b => b.id !== pendingDeleteBillId));
  setPendingDeleteBillId(null);
  maybeShowUndoTip();
};

const cancelDeleteBill = () => setPendingDeleteBillId(null);

// New: parent owns item-delete state mutation so it can trigger the tip
const handleDeleteItem = (billId, itemId) => {
  pushHistory(bills);
  setBills(prev =>
    prev.map(b => b.id === billId ? { ...b, items: b.items.filter(i => i.id !== itemId) } : b)
  );
  maybeShowUndoTip();
};
```

## `BillCard` refactor

`BillCard` previously owned the items-array filter for item delete. Move that to the parent so the parent can hook in `maybeShowUndoTip()`.

**Add prop:** `onDeleteItem: (billId, itemId) => void`.

Inside `BillCard`, replace the local function:

```js
const deleteItem = (itemId) => {
  onUpdate({ ...bill, items: bill.items.filter(item => item.id !== itemId) });
};
```

with:

```js
const deleteItem = (itemId) => onDeleteItem(bill.id, itemId);
```

The other internal helpers (`addItem`, `updateItem`) stay as-is — they still flow through `onUpdate`. Only item-delete is hoisted, because only item-delete needs to fire the tip.

## Rendering the modals

Add inside `BillTracker`'s return, alongside the existing modal overlays:

```jsx
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
```

Render order doesn't matter — only one shows at a time during normal flow. On a first-time bill delete the confirm modal closes (`onConfirm` does `setPendingDeleteBillId(null)` and `maybeShowUndoTip()`) and the tip modal then renders. Two distinct modals in succession, only ever once in a user's history.

## CSS

Append to `App.css`:

```css
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

The card uses the same dark-glass tone as the existing modal overlays so it visually belongs. The dialog buttons reuse `.btn`, `.btn-primary`, `.btn-danger` (already defined). The min-width keeps single-word labels from looking cramped.

## Data flow

```
User clicks "Delete Bill" in BillCard footer
  └─> BillCard onDelete(bill.id) -> deleteBill(billId)
        └─> setPendingDeleteBillId(billId)
              └─> ConfirmDialog mounts
                    ├─ Cancel: setPendingDeleteBillId(null)
                    └─ Confirm: confirmDeleteBill()
                          ├─> pushHistory(bills)
                          ├─> setBills(filter out)
                          ├─> setPendingDeleteBillId(null)
                          └─> maybeShowUndoTip()
                                └─> if !undoTipSeen → setShowUndoTip(true)
                                      └─> tip ConfirmDialog mounts
                                            └─ OK: dismissUndoTip()
                                                  ├─> setShowUndoTip(false)
                                                  └─> setUndoTipSeen(true) → localStorage write

User clicks × on item row in BillCard
  └─> deleteItem(itemId) -> onDeleteItem(bill.id, itemId)
        └─> handleDeleteItem(billId, itemId)
              ├─> pushHistory(bills)
              ├─> setBills(map -> filter items)
              └─> maybeShowUndoTip()
```

## Affected files

| File | Change |
|---|---|
| `src/App.jsx` | Add `ConfirmDialog` component. In `BillTracker`: add 3 state declarations, persist effect, 5 handlers (`maybeShowUndoTip`, `dismissUndoTip`, `deleteBill` (rewritten), `confirmDeleteBill`, `cancelDeleteBill`, `handleDeleteItem`), pass `onDeleteItem` prop to `BillCard`. In `BillCard`: accept `onDeleteItem` prop, replace local `deleteItem` body. In render: two new conditional modal blocks. |
| `src/App.css` | ~30 lines of dialog styling (`.dialog-overlay`, `.dialog-card`, `.dialog-title`, `.dialog-body`, `.dialog-actions`, min-widths). |

No new files.

## Testing

- Existing 101 Vitest unit tests should still pass.
- No React Testing Library in the project, so component-behavior verification is manual.

**Manual verification checklist:**

1. **First-time item delete:** Fresh `localStorage` (clear `billtracker-undo-tip-seen`). Expand a bill, click × on any item. Item is removed immediately. Tip modal appears. Click OK. Click × on another item — no tip this time. Reload page — still no tip.
2. **First-time bill delete (after step 1 already dismissed the tip):** Click Delete Bill. Confirm modal appears. Click Cancel — bill remains. Click Delete Bill again, click Delete — bill is removed, no tip (already dismissed).
3. **First-time bill delete (clean state):** Clear `billtracker-undo-tip-seen` again. Click Delete Bill, then Delete. Bill removed, tip modal appears. Click OK. Reload — tip flag persists.
4. **Bill delete confirmation copy:** Title reads "Delete this bill?", message mentions undo, primary button reads "Delete" with danger styling, secondary reads "Cancel".
5. **Backdrop dismissal:** Click outside the card on the bill-delete dialog → Cancel fires (bill stays). Click outside on the tip dialog → tip is dismissed (counted as OK).
6. **Undo still works:** After any delete, the ↩ Undo button shows a count and restores the deleted item/bill on click.
7. **Keyboard:** With the confirm modal open, press Enter — Delete fires (since `autoFocus` is on the primary button).
8. **Persistence key:** Inspect localStorage; `billtracker-undo-tip-seen` is `"true"` after dismissal.

## Out of scope

- Esc-to-cancel keybinding (click-outside covers it).
- Focus trapping in the modal (single-button or two-button dialogs are small; `autoFocus` is sufficient).
- Per-action undo tips (e.g., tip when changing a bill's month). The user requested it specifically for deletes.
- A "Don't show again" checkbox on the tip dialog — the message itself is single-use, no checkbox needed.

## Risks

- **Two modals back-to-back on a first-time bill delete.** Only happens once ever per user. Both are short and have distinct purposes (decision vs. education), so the sequence reads naturally.
- **`undoTipSeen` is per-origin.** If the localStorage origin changes (which the prior pinned-port fix prevents), the tip would reappear for the same user. Considered acceptable given the prior fix.
