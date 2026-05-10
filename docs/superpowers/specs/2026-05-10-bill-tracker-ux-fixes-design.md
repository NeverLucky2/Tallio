# Bill Tracker UX Fixes — Design

Date: 2026-05-10
Status: Approved

## Problem

Four user-reported issues with the bill tracker:

1. **Bills disappear after stopping `npm run dev`.** Data appears lost between dev server restarts.
2. **Uploaded bills land on the wrong month view.** A bill scanned for a previous month is added correctly but invisible because the selected month doesn't match, so the bills list says "No bills."
3. **Insufficient feedback after upload.** The user can't easily find or edit the freshly-created bill.
4. **Editing a bill's month makes the bill vanish from view.** The user has to manually scrub the month toggle to find the bill they just edited.

## Root Causes

### Issue 1: Origin-scoped localStorage + drifting dev port

Bills are persisted to `localStorage` in `App.jsx:685` under key `billtracker-bills`. `localStorage` is scoped per origin, where origin includes the port. `vite.config.js` does not pin a port. When 5173 is busy on restart (another node process, lingering vite instance, port pinned by an OS-level service), Vite silently picks the next available port (5174, 5175, ...). The new origin has its own empty `localStorage` — the data on the old port is still intact but invisible.

### Issue 2: Upload doesn't update `selectedMonth`

In `App.jsx:handleCapture`, after a new bill is created with `bill.month` from the OCR extraction, `selectedMonth` state is not changed. The monthly filter (`App.jsx:734` — `bills.filter(bill => bill.month === selectedMonth)`) hides the new bill if its month doesn't match.

The same disappear-on-add bug exists for `addManualBill` (`App.jsx:854`), which hardcodes the new bill's `month` to today rather than respecting the user's current view.

### Issue 3: New bills mount collapsed

`BillCard` (`App.jsx:304`) defaults `isExpanded` to `false`. There is no scroll-to or visual cue when a bill is added, so on a long bill list the new bill is invisible until the user scrolls and clicks.

### Issue 4: `updateBill` doesn't track month changes

`App.jsx:865` updates the bill in state but does not synchronize `selectedMonth` when the bill's `month` field changes.

## Design

### 1. Stable persistence via pinned dev port

**File:** `bill-tracker/vite.config.js`

```js
server: {
  port: 5173,
  strictPort: true,
  allowedHosts: true,
},
```

- `port: 5173` documents the canonical port.
- `strictPort: true` makes Vite **fail fast** with a clear error if 5173 is in use, rather than silently drifting and orphaning user data on another origin.

**Why fail-fast over auto-recovery:** A failed startup is a 5-second fix (kill the conflicting process). Silent drift is a data-loss-shaped bug that is hard to diagnose and erodes trust.

**Out of scope:** Migrating from `localStorage` to IndexedDB or file system. Once the port is stable, `localStorage` is adequate for this single-device personal app. Existing JSON Export already provides backup.

### 2. Auto-select uploaded bill's month + fix manual-add default

**File:** `bill-tracker/src/App.jsx`

#### 2a. `handleCapture` — both success and error paths

After `setBills(...)`, call `setSelectedMonth(newBill.month)`. Two locations:
- Success branch (`App.jsx:818`).
- Error branch (`App.jsx:832`) where `newBill.month` falls back to `new Date().toISOString().slice(0, 7)`.

`handleCapture` is the funnel for all three capture entry points (camera scan, file upload, phone-paired capture via `desktopPeer.lastImage` effect at `App.jsx:662`). The single change here fixes all three paths.

Also clear `searchTerm` if active — a search filter would otherwise still hide the new bill. (Trade-off: surprising vs. correct. Going with clear-search because a search active during upload is rare and the user's intent is clearly to see the newly added bill.)

#### 2b. `addManualBill`

Change `month: new Date().toISOString().slice(0, 7)` to `month: selectedMonth`. The user's currently-selected month is the most likely intent. They can still edit it after.

### 3. Post-upload UX: auto-expand + scroll into view + highlight fade

#### 3a. State

Add to `BillTracker`:

```js
const [newlyAddedBillId, setNewlyAddedBillId] = useState(null);
const newBillRef = useRef(null);
```

`newlyAddedBillId` is set whenever a bill is created (upload success, upload error, manual add). It is cleared by a `setTimeout` after the highlight animation completes (~1500 ms).

#### 3b. Scroll-into-view effect

```js
useEffect(() => {
  if (!newlyAddedBillId) return;
  newBillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const t = setTimeout(() => setNewlyAddedBillId(null), 1500);
  return () => clearTimeout(t);
}, [newlyAddedBillId]);
```

#### 3c. `BillCard` changes

Add two props:
- `highlighted: boolean` — when true, mount with `isExpanded = true` and apply CSS class `bill-card-highlighted`.
- `cardRef: React.Ref<HTMLDivElement>` — forwarded to the outer `bill-card` div.

`isExpanded` initialization changes from `useState(false)` to `useState(highlighted)` so a highlighted card opens immediately.

#### 3d. CSS

Append to `App.css`:

```css
@keyframes bill-card-highlight-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
  60%  { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.bill-card-highlighted {
  animation: bill-card-highlight-pulse 1.5s ease-out;
}
```

Uses the existing `--green` accent (`#10B981`) so the highlight matches the app's visual language — no generic blue glow.

#### 3e. Wiring in `BillTracker`'s render

In the `visibleBills.map(...)` block, pass `highlighted={bill.id === newlyAddedBillId}` and `cardRef={bill.id === newlyAddedBillId ? newBillRef : null}` to each `BillCard`.

### 4. `updateBill` — follow month changes

```js
const updateBill = (updatedBill) => {
  pushHistory(bills);
  const prev = bills.find(b => b.id === updatedBill.id);
  setBills(prevBills => prevBills.map(b => b.id === updatedBill.id ? updatedBill : b));
  if (prev && prev.month !== updatedBill.month) {
    setSelectedMonth(updatedBill.month);
  }
};
```

The selected month follows the bill so the user doesn't lose it.

## Data Flow

```
Upload / Manual Add
  └─> handleCapture / addManualBill
        ├─> setBills([newBill, ...])
        ├─> setSelectedMonth(newBill.month)   // NEW
        └─> setNewlyAddedBillId(newBill.id)   // NEW
              └─> effect: scrollIntoView + setTimeout(clear, 1500ms)

BillCard render
  └─> if (bill.id === newlyAddedBillId) → mounts expanded, ring pulses, ref attached

Edit bill month
  └─> updateBill(updatedBill)
        ├─> setBills(...)
        └─> if month changed → setSelectedMonth(updatedBill.month)   // NEW
```

## Affected Files

| File | Change |
|---|---|
| `bill-tracker/vite.config.js` | Add `port: 5173`, `strictPort: true` |
| `bill-tracker/src/App.jsx` | State for `newlyAddedBillId`, ref, effect, updates in `handleCapture` / `addManualBill` / `updateBill`, prop threading to `BillCard`, `BillCard` accepts `highlighted` + `cardRef` |
| `bill-tracker/src/App.css` | Add `@keyframes bill-card-highlight-pulse` and `.bill-card-highlighted` class |

No new files.

## Testing

Existing test files (`*.test.js`) cover pure helpers in `spendingMath.js`, `peerProtocol.js`, `billExtractor.js`. The changes in this design are React state and DOM behavior, not pure logic, so test coverage is manual.

**Manual verification checklist:**

1. **Persistence:** Start `npm run dev`, add a bill, stop, restart. Bill should be present. With another process holding 5173, restart should now FAIL with a clear port-in-use error rather than starting on 5174.
2. **Upload auto-month (success path):** Currently viewing May 2026. Upload a bill dated March 2026 (or rig the OCR result). After upload completes, selected month should be March 2026 and the new bill should be visible, expanded, and the ring pulse should play once.
3. **Upload auto-month (error path):** Upload with a deliberately-broken state (e.g., remove API key after capture); the fallback bill should be visible, expanded, with ring pulse.
4. **Manual add on past month:** Navigate to April 2026, click "Manual". New bill should be created with month April 2026 (not May), expanded, visible.
5. **Edit month forward:** Open a bill currently in May 2026, change its month to June 2026. View should switch to June, bill stays expanded and visible.
6. **Edit month backward:** Open a bill in May, change to January. View should switch to January.
7. **Scroll on long lists:** Add many bills, then upload one for an old month. Page should smoothly scroll to the new bill.
8. **Highlight cleans up:** After ~1.5s the pulse should fade and `newlyAddedBillId` should be cleared (subsequent scrolls/clicks should not re-trigger).

## Out of Scope

- Import-JSON button (user said keep the current scope; can be a follow-up if data is stranded on another port).
- Migrating away from `localStorage`.
- Toast notification on add (user chose ring fade instead).
- Highlight animation for bills modified by `updateBill` (only newly-added bills highlight).

## Risks

- **`scrollIntoView({ behavior: 'smooth' })`** is supported in all modern browsers but a user with reduced-motion preferences set may dislike it. Acceptable for now; can wrap in `matchMedia('(prefers-reduced-motion)')` later if needed.
- **Search active during upload:** clearing `searchTerm` is a side effect the user might not expect. Mitigation: only clear if the new bill would otherwise be hidden by the search. Simpler alternative: always clear. Choosing always-clear for simplicity; the search is global and easy to retype.
