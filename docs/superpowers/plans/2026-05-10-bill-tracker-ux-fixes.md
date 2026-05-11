# Bill Tracker UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UX issues — `localStorage` data appearing lost across dev restarts, uploaded/manual/edited bills disappearing from view due to month-filter mismatch, and missing visual feedback after upload.

**Architecture:** Three small surgical changes:
1. Pin the Vite dev server port so `localStorage` always lives at the same origin.
2. Add a `newlyAddedBillId` state in `BillTracker` that auto-selects the bill's month, auto-expands the new `BillCard`, scrolls it into view, and plays a one-shot ring pulse before clearing itself.
3. In `updateBill`, sync `selectedMonth` whenever a bill's month field changes.

**Tech Stack:** React 19 + Vite, plain CSS, Vitest (node env, pure-helper tests only — no React Testing Library in this project, so React/DOM changes are verified manually per the existing project convention).

**Spec:** `docs/superpowers/specs/2026-05-10-bill-tracker-ux-fixes-design.md`

**Working directory for all paths and commands:** `bill-tracker/` (the inner `bill-tracker/bill-tracker/` directory — this is where `package.json`, `vite.config.js`, and `.git` live).

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `vite.config.js` | Modify | Pin dev server port to 5173 with strict-port |
| `src/App.css` | Modify | Add `@keyframes bill-card-highlight-pulse` and `.bill-card-highlighted` class |
| `src/App.jsx` | Modify | `BillCard` accepts `highlighted` + `cardRef`; `BillTracker` adds `newlyAddedBillId` state, ref, scroll-into-view effect; updates `handleCapture` / `addManualBill` / `updateBill`; threads props through `visibleBills.map` |

No new files. No new dependencies.

---

## Task 1: Pin dev server port

**Files:**
- Modify: `vite.config.js`

- [ ] **Step 1: Update `vite.config.js`**

Replace the entire `server` block. Current contents:

```js
server: {
  // Allow tunnel hosts (cloudflared, localtunnel, ngrok) for phone-pairing dev testing.
  allowedHosts: true,
},
```

With:

```js
server: {
  // Pin the port so localStorage stays at the same origin across restarts.
  // strictPort: true means Vite fails loudly on port conflict instead of
  // silently drifting to a different port (which would orphan saved bills).
  port: 5173,
  strictPort: true,
  // Allow tunnel hosts (cloudflared, localtunnel, ngrok) for phone-pairing dev testing.
  allowedHosts: true,
},
```

- [ ] **Step 2: Verify clean start**

Run: `npm run dev`
Expected: Vite reports `Local:   http://localhost:5173/` and no port-bumped message. Stop with Ctrl+C.

- [ ] **Step 3: Verify fail-loud on conflict**

In a second terminal, start a placeholder on 5173:
- macOS/Linux: `python3 -m http.server 5173`
- Windows (PowerShell): `python -m http.server 5173`

Then run `npm run dev` again.
Expected: Vite exits with an error similar to `Error: Port 5173 is already in use` (instead of starting on 5174). Stop the placeholder.

- [ ] **Step 4: Commit**

```bash
git add vite.config.js
git commit -m "fix(dev): pin Vite port to 5173 to stabilize localStorage origin"
```

---

## Task 2: Add highlight-pulse animation CSS

**Files:**
- Modify: `src/App.css` (append at end of file)

- [ ] **Step 1: Append the animation**

Open `src/App.css` and append at the end:

```css
/* Highlight ring for newly-added bills. Triggered by .bill-card-highlighted
   class applied for ~1.5s after a bill is created via upload, scan, or manual add. */
@keyframes bill-card-highlight-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
  60%  { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.bill-card-highlighted {
  animation: bill-card-highlight-pulse 1.5s ease-out;
}
```

The RGB `16, 185, 129` is the existing app accent (`--green`, `#10B981`) — matches the app's visual language.

- [ ] **Step 2: Verify CSS parses**

Run: `npm run dev`
Expected: dev server starts without any CSS errors in the terminal or browser console. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat(ui): add highlight-pulse animation for new bill cards"
```

---

## Task 3: Extend `BillCard` to accept `highlighted` and `cardRef` props

**Files:**
- Modify: `src/App.jsx:304-387` (the `BillCard` component)

- [ ] **Step 1: Change the `BillCard` signature and initial expanded state**

Find this line near `src/App.jsx:304`:

```js
const BillCard = ({ bill, onUpdate, onDelete, isMobile }) => {
  const [isExpanded, setIsExpanded] = useState(false);
```

Replace with:

```js
const BillCard = ({ bill, onUpdate, onDelete, isMobile, highlighted = false, cardRef = null }) => {
  const [isExpanded, setIsExpanded] = useState(highlighted);
```

When a card is rendered as "highlighted" (the freshly-added one), it mounts expanded so the user can review and edit it. The user can still toggle it shut.

- [ ] **Step 2: Attach the ref and class to the outer `bill-card` div**

In the same component, find:

```jsx
return (
    <div className="bill-card">
      <div className="bill-header" onClick={() => setIsExpanded(!isExpanded)}>
```

Replace with:

```jsx
return (
    <div
      ref={cardRef}
      className={`bill-card${highlighted ? ' bill-card-highlighted' : ''}`}
    >
      <div className="bill-header" onClick={() => setIsExpanded(!isExpanded)}>
```

This is the only change needed in this task. Defaults of `highlighted = false` and `cardRef = null` mean existing call sites (none yet pass the props) are unaffected.

- [ ] **Step 3: Verify build still works**

Run: `npm run dev`
Expected: app loads, existing bills render normally (no highlight ring since nothing passes `highlighted`). Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): BillCard accepts highlighted and cardRef props"
```

---

## Task 4: Add `newlyAddedBillId` state, ref, and scroll-into-view effect

**Files:**
- Modify: `src/App.jsx` inside `BillTracker` (around lines 616-713)

- [ ] **Step 1: Add the state and ref**

Find this block near `src/App.jsx:637-639`:

```js
const [showCamera, setShowCamera] = useState(false);
const [isProcessing, setIsProcessing] = useState(false);
const [processingStatus, setProcessingStatus] = useState('');
```

Append after the `processingStatus` line:

```js
const [newlyAddedBillId, setNewlyAddedBillId] = useState(null);
```

Then find `src/App.jsx:677-678`:

```js
const fileInputRef = useRef(null);
const toastTimerRef = useRef(null);
```

Append after `toastTimerRef`:

```js
const newBillRef = useRef(null);
```

- [ ] **Step 2: Add the scroll-into-view + auto-clear effect**

Find this effect near `src/App.jsx:709-713`:

```js
useEffect(() => {
  const handleResize = () => setWindowWidth(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

Insert immediately AFTER this block (so the new effect sits next to its peers):

```js
useEffect(() => {
  if (!newlyAddedBillId) return;
  newBillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const timer = setTimeout(() => setNewlyAddedBillId(null), 1500);
  return () => clearTimeout(timer);
}, [newlyAddedBillId]);
```

This is dependent only on `newlyAddedBillId`. When set, it scrolls to the (already-mounted) card and queues a 1500 ms timer to clear the ID — which removes the `.bill-card-highlighted` class on the next render.

- [ ] **Step 3: Verify build**

Run: `npm run dev`
Expected: app loads, no console errors. Nothing visibly changes yet because no handler sets `newlyAddedBillId`. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): add newlyAddedBillId state and scroll-into-view effect"
```

---

## Task 5: Update `handleCapture` to follow month, set newly-added ID, clear search

**Files:**
- Modify: `src/App.jsx:777-839` (the `handleCapture` function)

- [ ] **Step 1: Replace the success branch's `setBills` call**

The two `setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });` lines in `handleCapture` are identical strings, so use the surrounding lines to disambiguate.

Find this block near `src/App.jsx:816-818` (inside the `try`, right after `mappedItems.length > 0 ? ... : ...` is closed and `newBill` is built):

```js
        ],
      };

      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
    } catch (err) {
```

Replace with:

```js
        ],
      };

      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
      setSelectedMonth(newBill.month);
      setSearchTerm('');
      setNewlyAddedBillId(newBill.id);
    } catch (err) {
```

- [ ] **Step 2: Replace the error branch's `setBills` call**

Find this block near `src/App.jsx:830-834` (inside the `catch`, right after the fallback `newBill` object):

```js
        }],
      };
      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
    } finally {
```

Replace with:

```js
        }],
      };
      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
      setSelectedMonth(newBill.month);
      setSearchTerm('');
      setNewlyAddedBillId(newBill.id);
    } finally {
```

Both branches now (a) jump to the bill's month, (b) clear any active search filter that would hide it, and (c) trigger the auto-expand + scroll + pulse.

`handleCapture` is invoked by the camera path, file-upload path, and phone-paired capture (`desktopPeer.lastImage` effect at `App.jsx:662`), so these two edits cover all three capture entry points.

- [ ] **Step 3: Manual verification — upload an arbitrary-month bill**

Run: `npm run dev`, open the app. With at least 5 existing bills present so scrolling is observable:

1. Upload a bill. (If you have an API key configured, scan/upload a real receipt; if not, the error-path code still runs and creates a fallback bill.)
2. After processing completes, confirm:
   - Selected month chip in the header changes to match the bill's month.
   - Page smoothly scrolls down to the new card.
   - New card is expanded by default (vendor/month/items editable inline).
   - A green ring pulse animates once around the card and fades within ~1.5 s.
   - Search bar is empty if it was previously populated.

Stop with Ctrl+C when done.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(bills): auto-follow month, clear search, and highlight new bills after upload"
```

---

## Task 6: Update `addManualBill` to use selected month and highlight

**Files:**
- Modify: `src/App.jsx:854-863` (the `addManualBill` function)

- [ ] **Step 1: Replace the function body**

Find the function near `src/App.jsx:854`:

```js
const addManualBill = () => {
  pushHistory(bills);
  const newBill = {
    id: Date.now(),
    vendor: "",
    month: new Date().toISOString().slice(0, 7),
    items: [{ id: Date.now(), description: "", amount: 0, category: "Other", date: null }]
  };
  setBills(prev => [newBill, ...prev]);
};
```

Replace with:

```js
const addManualBill = () => {
  pushHistory(bills);
  const newBill = {
    id: Date.now(),
    vendor: "",
    month: selectedMonth,
    items: [{ id: Date.now(), description: "", amount: 0, category: "Other", date: null }]
  };
  setBills(prev => [newBill, ...prev]);
  setNewlyAddedBillId(newBill.id);
};
```

Two changes: `month` now uses `selectedMonth` (the user's current view, not today), and `setNewlyAddedBillId` triggers the auto-expand + scroll + pulse.

No `setSelectedMonth` call is needed because the new bill's month already equals `selectedMonth`. No `setSearchTerm('')` because a search bar isn't involved in the manual flow — but adding it would be harmless if the user is filtering. (Leaving it off for minimal surprise; see also Task 5.)

- [ ] **Step 2: Manual verification — manual-add on a past month**

Run: `npm run dev`. With several existing bills:

1. Use the month toggle (`‹` arrow) to navigate back two or three months.
2. Click `+ Manual`.
3. Confirm:
   - A new blank card appears at the top of the list.
   - Card is expanded (vendor, month input, and one blank item visible).
   - Page scrolls to the card.
   - The month input inside the card shows the past month (not today).
   - The pulse animates once and fades.
   - The header's month chip still shows that past month (didn't jump back to today).

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(bills): manual-add uses selected month and highlights new card"
```

---

## Task 7: Update `updateBill` to follow month changes

**Files:**
- Modify: `src/App.jsx:865-868` (the `updateBill` function)

- [ ] **Step 1: Replace the function body**

Find the function near `src/App.jsx:865`:

```js
const updateBill = (updatedBill) => {
  pushHistory(bills);
  setBills(prev => prev.map(bill => bill.id === updatedBill.id ? updatedBill : bill));
};
```

Replace with:

```js
const updateBill = (updatedBill) => {
  pushHistory(bills);
  const previous = bills.find(b => b.id === updatedBill.id);
  setBills(prev => prev.map(bill => bill.id === updatedBill.id ? updatedBill : bill));
  if (previous && previous.month !== updatedBill.month) {
    setSelectedMonth(updatedBill.month);
  }
};
```

`previous` is computed from the closure-captured `bills` value, which reflects state at the moment `updateBill` was invoked — correct for the comparison. The `setBills` updater function still runs against the latest state for the actual write.

- [ ] **Step 2: Manual verification — edit a bill's month forward and back**

Run: `npm run dev`. With a few bills present in the current month:

1. Click a bill to expand it.
2. Click the month input in the bill body and change it to next month (or some other month).
3. Confirm:
   - The header's month chip switches to the new month.
   - The bill stays expanded and visible — no need to scrub the month toggle to find it.
4. Change the same bill's month back to its original month.
5. Confirm the header chip follows again.

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(bills): selected month follows when a bill's month is edited"
```

---

## Task 8: Thread `highlighted` and `cardRef` props in the render

**Files:**
- Modify: `src/App.jsx:1062-1070` (the `visibleBills.map` render block)

- [ ] **Step 1: Update the `BillCard` render**

Find this block near `src/App.jsx:1062`:

```jsx
visibleBills.map(bill => (
  <BillCard
    key={bill.id}
    bill={bill}
    onUpdate={updateBill}
    onDelete={deleteBill}
    isMobile={isMobile}
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
    isMobile={isMobile}
    highlighted={bill.id === newlyAddedBillId}
    cardRef={bill.id === newlyAddedBillId ? newBillRef : null}
  />
))
```

Only the matching card receives the ref and the highlight flag; every other card gets `false` / `null`.

- [ ] **Step 2: End-to-end manual verification**

Run: `npm run dev`. Walk through all the user-visible flows one final time:

1. **Upload flow:** Upload (or scan) a bill. After processing, the new card auto-expands, the page scrolls to it, and a green ring pulses once.
2. **Manual flow:** Navigate to a past month, click `+ Manual`. New blank card appears in that past month, auto-expanded, with pulse.
3. **Edit-month flow:** Change an expanded bill's month input. Header chip follows; bill stays visible.
4. **Multi-add:** Upload one bill, then immediately upload another. The pulse should be on the second one; the first one is no longer highlighted (its class was removed when state changed).
5. **Highlight cleanup:** After ~1.5 s post-add, the ring is gone. Click around — nothing re-pulses.
6. **Persistence:** Stop `npm run dev`. Start it again. All bills are present and the dev server starts on port 5173.

If any step fails, fix it before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): wire highlighted and cardRef to newly-added BillCard"
```

---

## Task 9: Run unit tests and finalize

**Files:**
- None modified.

- [ ] **Step 1: Run the existing test suite**

Run: `npm test -- --run`
Expected: All existing tests pass. None of the files we touched (`vite.config.js`, `App.css`, `App.jsx`) have unit tests, so the test count should be unchanged from baseline.

- [ ] **Step 2: Commit the design spec (if not already)**

The spec file is currently untracked. Include it in the history.

```bash
git add docs/superpowers/specs/2026-05-10-bill-tracker-ux-fixes-design.md docs/superpowers/plans/2026-05-10-bill-tracker-ux-fixes.md
git commit -m "docs: bill tracker UX fixes design and plan"
```

- [ ] **Step 3: Final review with `git log`**

Run: `git log --oneline -10`
Expected: Recent commits in order:
- `docs: bill tracker UX fixes design and plan`
- `feat(ui): wire highlighted and cardRef to newly-added BillCard`
- `feat(bills): selected month follows when a bill's month is edited`
- `feat(bills): manual-add uses selected month and highlights new card`
- `feat(bills): auto-follow month, clear search, and highlight new bills after upload`
- `feat(ui): add newlyAddedBillId state and scroll-into-view effect`
- `feat(ui): BillCard accepts highlighted and cardRef props`
- `feat(ui): add highlight-pulse animation for new bill cards`
- `fix(dev): pin Vite port to 5173 to stabilize localStorage origin`

---

## Acceptance Criteria

All four spec issues resolved:

1. **Persistence:** Stopping and restarting `npm run dev` keeps bills visible. If 5173 is occupied, Vite fails with a clear error rather than drifting to another port.
2. **Upload auto-month:** A bill scanned/uploaded for a past month appears in view (selected month follows the bill's month, search is cleared, card is expanded and scrolled to).
3. **Upload feedback:** New bill auto-expands, page scrolls to it, green ring pulses for ~1.5 s.
4. **Edit-month auto-follow:** Changing a bill's month input updates the header's selected month so the bill stays visible.

Manual-add on a past month also now creates a bill in the user's currently-viewed month (not today).
