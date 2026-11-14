# Menu Drawer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the avatar drawer into three labelled sections with a budget-file status card, line icons, clear labels, and proper focus/close behaviour, without changing what any action does.

**Architecture:** `AvatarDrawer` stays the single drawer shell but takes `sections` instead of a flat `items` list, a `fileCard` slot, and a `footerNote`. A new presentational `BudgetFileCard` replaces `LiveFilePill`. `App.jsx` builds both from the handlers it already has.

**Tech Stack:** React 19, Vite, Vitest + Testing Library (jsdom), plain CSS with the existing design tokens.

**Spec:** `docs/superpowers/specs/2026-11-14-menu-drawer-redesign-design.md`

## Global Constraints

- Branch `feat/menu-drawer` (off `master`). No handler behaviour changes; Restore keeps its `window.confirm`.
- Exact copy (labels, hints, section titles) is fixed by the spec and repeated in the tasks below; do not reword.
- Colours, radii, fonts only from existing tokens (`--bg-card`, `--bg-raised`, `--bg-card-hover`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-dim`, `--accent`, `--accent-dim`, `--accent-border`, `--red`, `--font-mono`, `--well-radius` is NOT used here: wells are `6px` squares). No hard-coded theme colours beyond the fallbacks already in `AvatarDrawer.css`.
- Chrome icons come from `UiIcon` by name; no emoji in the drawer.
- Tests: no RTL auto-cleanup in this project, so every test file calls `afterEach(() => cleanup())`. App smoke tests that seed `tallio-accounts` must also seed `tallio-schema-version`.
- Run a single file with `npx vitest run <path>`; full suite with `npx vitest run`.
- Commit after each task; end commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. **Double-click on a row while the drawer is sliding out** — the action runs once and `onClose` fires once. (Task 4)
2. **Browser without the File System Access API** — no "Budget file" label, no empty gap. (Task 3)
3. **Drawer reopened before the close animation finishes** — it opens normally, not stuck in the closing state. (Task 4)
4. **Very long linked file name** — wraps inside the card; full name available on hover (`title`). (Task 2)
5. **Storage estimate unsupported, or tall content at 150% display size** — footer note omitted cleanly; the middle of the drawer scrolls while header and footer stay put. (Task 5 helper test + Task 5 manual check)

---

### Task 1: New chrome icons

**Files:**
- Modify: `src/ui/UiIcon.jsx` (the `PATHS` map)
- Test: `src/ui/UiIcon.test.jsx`

**Interfaces:**
- Produces: `UiIcon` names `palette`, `download`, `restore`, `close`, `chevronRight`.

- [ ] **Step 1: Write the failing test**

```jsx
it.each(['palette', 'download', 'restore', 'close', 'chevronRight'])('renders the %s icon', (name) => {
  const { container } = render(<UiIcon name={name} />);
  expect(container.querySelector('svg path')).toBeTruthy();
});
```

- [ ] **Step 2:** Run `npx vitest run src/ui/UiIcon.test.jsx` — expect 5 failures (svg is null).

- [ ] **Step 3: Add to `PATHS`** (single `d` string each, matching the approved mockup):

```js
palette:  'M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.5-.9-2.5 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4c0-4.5-4-8.2-9-8.2z M7.5 12h.01 M9.5 7.8h.01 M14.5 7.8h.01',
download: 'M12 4v12 M7 11l5 5 5-5 M5 20h14',
restore:  'M4 12a8 8 0 1 0 2.6-5.9 M4 4v4.5h4.5 M12 8v4.5l3 1.8',
close:    'M6 6l12 12 M18 6L6 18',
chevronRight: 'M9 6l6 6-6 6',
```

- [ ] **Step 4:** Run the file again — expect all pass.
- [ ] **Step 5:** Commit `feat(menu): add drawer chrome icons to UiIcon`.

---

### Task 2: BudgetFileCard

**Files:**
- Create: `src/BudgetFileCard.jsx`
- Test: `src/BudgetFileCard.test.jsx`

**Interfaces:**
- Produces: `export default function BudgetFileCard({ status, fileName, lastSavedAt, onLink, onOpen, onUnlink })`. `status === 'linked'` selects the linked state; anything else is unlinked. It only calls the handlers; closing the drawer is the caller's job (Task 5 wraps handlers).
- Root element: `<div className="budget-file-card">`, plus class `is-linked` when linked.

- [ ] **Step 1: Write the failing tests**

```jsx
describe('BudgetFileCard', () => {
  afterEach(() => cleanup());

  it('unlinked: status, hint, and two actions', () => {
    const calls = [];
    const { getByText, queryByText, container } = render(
      <BudgetFileCard status="unlinked" fileName={null} lastSavedAt={null}
        onLink={() => calls.push('link')} onOpen={() => calls.push('open')} onUnlink={() => calls.push('unlink')} />,
    );
    expect(getByText('Stored in this browser only')).toBeTruthy();
    expect(getByText('Link a file and every change autosaves to it.')).toBeTruthy();
    expect(container.querySelector('.budget-file-card').className).not.toContain('is-linked');
    fireEvent.click(getByText('Link a budget file'));
    fireEvent.click(getByText('Open existing…'));
    expect(calls).toEqual(['link', 'open']);
    expect(queryByText('Unlink')).toBeNull();
  });

  it('linked: file name, saved time, and three actions', () => {
    const calls = [];
    const at = new Date(2026, 10, 14, 14, 14).getTime();
    const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const { getByText, container } = render(
      <BudgetFileCard status="linked" fileName="Household-2026.tallio" lastSavedAt={at}
        onLink={() => calls.push('link')} onOpen={() => calls.push('open')} onUnlink={() => calls.push('unlink')} />,
    );
    expect(container.querySelector('.budget-file-card').className).toContain('is-linked');
    expect(getByText(`Autosaving · saved ${time}`)).toBeTruthy();
    expect(getByText('Household-2026.tallio').getAttribute('title')).toBe('Household-2026.tallio');
    expect(getByText('Every change is written to this file.')).toBeTruthy();
    fireEvent.click(getByText('Change file'));
    fireEvent.click(getByText('Open another…'));
    fireEvent.click(getByText('Unlink'));
    expect(calls).toEqual(['link', 'open', 'unlink']);
  });

  it('linked with no save yet shows plain "Autosaving"', () => {
    const { getByText } = render(
      <BudgetFileCard status="linked" fileName="a.tallio" lastSavedAt={null} onLink={() => {}} onOpen={() => {}} onUnlink={() => {}} />,
    );
    expect(getByText('Autosaving')).toBeTruthy();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/BudgetFileCard.test.jsx` — expect failure (module not found).

- [ ] **Step 3: Implement `BudgetFileCard`.** Structure: `.budget-file-card` > `.budget-file-stat` (a `.budget-file-dot` span + the status text in one text node) > optional `.budget-file-name` (with `title={fileName}`) > `<p className="budget-file-hint">` > `.budget-file-actions` with `<button type="button" className="btn">`; "Link a budget file" gets `btn btn-primary`. Saved time: `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`.

- [ ] **Step 4:** Run the file — expect pass.
- [ ] **Step 5:** Commit `feat(menu): BudgetFileCard status card`.

---

### Task 3: AvatarDrawer sections, layout and styling

**Files:**
- Modify: `src/AvatarDrawer.jsx`, `src/AvatarDrawer.css` (drawer rules only; leave the `.avatar-trigger*` rules untouched)
- Test: `src/AvatarDrawer.test.jsx`

**Interfaces:**
- Consumes: `UiIcon` names from Task 1.
- Produces: `AvatarDrawer({ open, onClose, sections = [], fileCard = null, footerNote = '', avatar = null, reducedMotion })`.
  - `sections`: `[{ title: string, items: [{ icon: string /* UiIcon name */, label: string, hint?: string, danger?: boolean, chevron?: boolean, onSelect: () => void }] }]`.
  - `fileCard`: a node. When non-null it renders after the **first** section under a "Budget file" section label; when null neither the label nor a wrapper renders.
  - Removed props: `items`, `statusSlot`, `version`.
  - `aria-label` stays `"Account menu"` (App and tests locate the dialog by it); the visible title is "Tallio", subtitle "Private to this device".

- [ ] **Step 1: Rewrite the test fixtures and add tests.** Replace `mkItems` with:

```jsx
const mkSections = (calls = []) => [
  { title: 'Personalize', items: [
    { icon: 'palette', label: 'Appearance', hint: 'Theme, icons, background', chevron: true, onSelect: () => calls.push('appearance') },
    { icon: 'settings', label: 'Settings', hint: 'Scanning, display size, celebrations', chevron: true, onSelect: () => calls.push('settings') },
  ] },
  { title: 'Backups', items: [
    { icon: 'download', label: 'Download a backup', hint: 'One-time copy as a .tallio file', onSelect: () => calls.push('export') },
    { icon: 'restore', label: 'Restore from backup…', hint: 'Replaces everything on this device', danger: true, onSelect: () => calls.push('restore') },
  ] },
];
```

Update the seven existing tests to pass `sections={mkSections(calls)}` and `reducedMotion={true}` (so close is synchronous; Task 4 covers the animated path). In "renders items + dialog role", drop the `version` assertion and assert instead:

```jsx
expect(getByText('Tallio')).toBeTruthy();
expect(getByText('Private to this device')).toBeTruthy();
expect(getByText('Personalize')).toBeTruthy();
expect(getByText('Backups')).toBeTruthy();
expect(getByText('Theme, icons, background')).toBeTruthy();
expect(panel.querySelectorAll('.avatar-drawer-item svg.ui-icon').length).toBeGreaterThanOrEqual(4);
```

New tests:

```jsx
it('marks danger rows', () => {
  const { getByText } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
  expect(getByText('Restore from backup…').closest('button').className).toContain('danger');
  expect(getByText('Download a backup').closest('button').className).not.toContain('danger');
});

it('renders the file card under a "Budget file" label after the first section', () => {
  const { getByText, getByTestId, container } = render(
    <AvatarDrawer open onClose={() => {}} sections={mkSections()} fileCard={<div data-testid="fc" />} reducedMotion />,
  );
  expect(getByText('Budget file')).toBeTruthy();
  const titles = [...container.querySelectorAll('.avatar-drawer-section-title')].map((n) => n.textContent);
  expect(titles).toEqual(['Personalize', 'Budget file', 'Backups']);
  expect(getByTestId('fc')).toBeTruthy();
});

it('omits the "Budget file" label when there is no file card', () => {
  const { queryByText } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
  expect(queryByText('Budget file')).toBeNull();
});

it('shows the footer note when given, and no note element when empty', () => {
  const { getByText, container, rerender } = render(
    <AvatarDrawer open onClose={() => {}} sections={mkSections()} footerNote="0.4 MB stored" reducedMotion />,
  );
  expect(getByText('0.4 MB stored')).toBeTruthy();
  rerender(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
  expect(container.querySelector('.avatar-drawer-foot-note')).toBeNull();
});
```

- [ ] **Step 2:** Run `npx vitest run src/AvatarDrawer.test.jsx` — expect failures on the new assertions.

- [ ] **Step 3: Implement the markup.** Panel children in order: `.avatar-drawer-head` (avatar node in a `.avatar-drawer-avatar` well, title/subtitle, close button containing `<UiIcon name="close" size={15} />`, `aria-label="Close menu"`) → `.avatar-drawer-body` (scrolls) containing, per section, a `.avatar-drawer-section-title` and its rows; the file card block after the first section → `.avatar-drawer-foot` ("Tallio" left, `.avatar-drawer-foot-note` right). Row: `<button className="avatar-drawer-item [danger]">` > `.avatar-drawer-item-icon` (well holding `<UiIcon name={it.icon} size={15} />`) > `.avatar-drawer-item-text` (`.avatar-drawer-item-label`, optional `.avatar-drawer-item-hint`) > optional `<UiIcon name="chevronRight" size={13} className="avatar-drawer-item-chev" />`. Key rows by `label`, sections by `title`.

- [ ] **Step 4: Restyle `AvatarDrawer.css` (drawer rules).** Values from the approved mockup:
  - Panel: width `300px`, `padding: 0`, flex column; head `padding: 14px 14px 13px` with `border-bottom: 1px solid var(--border)`; body `flex: 1; overflow-y: auto; padding: 6px 8px 10px`; foot `border-top: 1px solid var(--border); padding: 9px 16px; font: 10.5px var(--font-mono); color: var(--text-muted)`, space-between.
  - Avatar well and row icon wells: `36px` / `28px` squares, `border-radius: 8px` / `6px`, `border: 1px solid var(--border)`, background `color-mix(in srgb, var(--text) 4.5%, transparent)`.
  - Section title: `var(--font-mono)`, `10px`, `letter-spacing: .16em`, uppercase, `var(--text-muted)`, `padding: 14px 8px 6px`.
  - Row: `padding: 8px`, `gap: 11px`, `border-radius: 6px`, `border-left: 2px solid transparent`; hover → `background: var(--bg-card-hover)`, `border-left-color: var(--accent)`, icon colour `var(--accent)`. Label `font-weight: 500`; hint `11.5px`, `var(--text-muted)`, single line with ellipsis. Danger: hint `color-mix(in srgb, var(--red) 75%, var(--text-muted))`; hover border and icon `var(--red)`.
  - `:focus-visible` on rows, close button and card buttons: `outline: 2px solid var(--accent); outline-offset: 1px`.
  - Close button: `28px` square, `border-radius: 6px`, muted; hover shows `var(--bg-card-hover)`.
  - Card (`.budget-file-card`): `margin: 2px 8px 8px`, `border: 1px solid var(--border)`, `border-radius: 8px`, `padding: 11px 12px 12px`, `background: var(--bg-raised)`; `.is-linked` → `border-color: var(--accent-border); background: var(--accent-dim)`. Dot `8px` circle, hollow `1.5px` muted border; linked → filled `var(--accent)` with `box-shadow: 0 0 0 3px var(--accent-dim)`. File name: `var(--font-mono)`, `12px`, `overflow-wrap: anywhere`. Hint `11.5px` muted, `margin: 5px 0 10px`. Actions: flex, `gap: 6px`, wrap.
  - Delete the now-unused `.avatar-drawer-status`, `.avatar-drawer-version` rules.

- [ ] **Step 5:** Run `npx vitest run src/AvatarDrawer.test.jsx` — expect pass. (`App.jsx` still passes the old props until Task 5; the app renders an empty drawer in between, which is expected mid-plan.)
- [ ] **Step 6:** Commit `feat(menu): sectioned drawer layout and styling`.

---

### Task 4: Focus management and close animation

**Files:**
- Modify: `src/AvatarDrawer.jsx`, `src/AvatarDrawer.css`
- Test: `src/AvatarDrawer.test.jsx`

**Interfaces:**
- Consumes: Task 3's `AvatarDrawer` props (unchanged).
- Produces (behaviour):
  - On open: remember `document.activeElement`, focus the close button. When the drawer unmounts or `open` goes false: restore focus to the remembered element if it is still in the document.
  - Tab on the last focusable element in the panel moves to the first; Shift+Tab on the first moves to the last. Focusable = `button:not([disabled])` inside the panel.
  - Close requests (×, scrim, Escape, row select): with reduced motion call `onClose` immediately. Otherwise add class `closing` to the panel (and scrim) and call `onClose` exactly once on the panel's `animationend`, or after a `220ms` fallback timer, whichever comes first. Row select runs `onSelect` immediately, before the animation. Further close requests or row clicks while `closing` are ignored.
  - `closing` resets whenever `open` changes.

- [ ] **Step 1: Write the failing tests**

```jsx
it('moves focus to the close button on open and restores it on close', () => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  const { getByLabelText, rerender } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
  expect(document.activeElement).toBe(getByLabelText('Close menu'));
  rerender(<AvatarDrawer open={false} onClose={() => {}} sections={mkSections()} reducedMotion />);
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it('traps Tab within the panel', () => {
  const { getByLabelText, getByText } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
  const first = getByLabelText('Close menu');
  const last = getByText('Restore from backup…').closest('button');
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);
});

it('animated close: onClose fires once, after the slide-out ends', () => {
  let closed = 0;
  const { container, getByLabelText } = render(<AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections()} reducedMotion={false} />);
  fireEvent.click(getByLabelText('Close menu'));
  const panel = container.querySelector('.avatar-drawer-panel');
  expect(panel.className).toContain('closing');
  expect(closed).toBe(0);
  fireEvent.animationEnd(panel);
  fireEvent.animationEnd(panel);
  expect(closed).toBe(1);
});

it('animated close falls back to a 220ms timer', () => {
  vi.useFakeTimers();
  let closed = 0;
  const { container } = render(<AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections()} reducedMotion={false} />);
  fireEvent.click(container.querySelector('.avatar-drawer-scrim'));
  vi.advanceTimersByTime(219);
  expect(closed).toBe(0);
  vi.advanceTimersByTime(1);
  expect(closed).toBe(1);
  vi.useRealTimers();
});

it('double-clicking a row runs the action once and closes once', () => {
  const calls = []; let closed = 0;
  const { getByText, container } = render(<AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections(calls)} reducedMotion={false} />);
  fireEvent.click(getByText('Settings'));
  fireEvent.click(getByText('Settings'));
  fireEvent.animationEnd(container.querySelector('.avatar-drawer-panel'));
  expect(calls).toEqual(['settings']);
  expect(closed).toBe(1);
});

it('reopening clears the closing state', () => {
  const { container, getByLabelText, rerender } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion={false} />);
  fireEvent.click(getByLabelText('Close menu'));
  rerender(<AvatarDrawer open={false} onClose={() => {}} sections={mkSections()} reducedMotion={false} />);
  rerender(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion={false} />);
  expect(container.querySelector('.avatar-drawer-panel').className).not.toContain('closing');
});
```

(Add `vi` to the vitest import.)

- [ ] **Step 2:** Run the file — expect the six new tests to fail.
- [ ] **Step 3: Implement** per the Interfaces block. Keep the pending-close timer in a ref and clear it on unmount and when `open` changes. The Tab handler goes on the panel's `onKeyDown`.
- [ ] **Step 4: CSS.** `.avatar-drawer-panel.closing { animation: avatar-drawer-out .18s ease-in forwards; }` with `@keyframes avatar-drawer-out { to { transform: translateX(100%); } }`; `.avatar-drawer-scrim.closing { opacity: 0; transition: opacity .18s ease-in; }`. Both disabled inside the existing `prefers-reduced-motion` block and under `.no-anim`.
- [ ] **Step 5:** Run the file — expect all pass.
- [ ] **Step 6:** Commit `feat(menu): drawer focus trap, focus return, close animation`.

---

### Task 5: Wire into App, footer storage note, remove the pill

**Files:**
- Modify: `src/storagePersist.js`, `src/storagePersist.test.js` (create if absent), `src/App.jsx` (the `<AvatarDrawer …/>` block near line 600 and the `LiveFilePill` import), `src/App.css` (delete the two `.live-file-pill` rules near line 4063)
- Delete: `src/LiveFilePill.jsx`, `src/LiveFilePill.test.jsx`
- Create: `src/__smoke__/menuDrawer.test.jsx`

**Interfaces:**
- Consumes: `AvatarDrawer` (Tasks 3–4), `BudgetFileCard` (Task 2).
- Produces: `export function formatStorageNote(info)` in `storagePersist.js` — returns `''` when `!info || !info.supported`, else `` `${(info.usage / 1048576).toFixed(1)} MB stored` ``.

- [ ] **Step 1: Failing helper test**

```js
describe('formatStorageNote', () => {
  it('formats usage in MB', () => {
    expect(formatStorageNote({ supported: true, usage: 419430, quota: 1 })).toBe('0.4 MB stored');
  });
  it('is empty when unsupported or missing', () => {
    expect(formatStorageNote({ supported: false, usage: 0, quota: 0 })).toBe('');
    expect(formatStorageNote(null)).toBe('');
  });
});
```

- [ ] **Step 2:** Run it — expect failure; implement `formatStorageNote`; run — expect pass.

- [ ] **Step 3: Failing smoke test** `src/__smoke__/menuDrawer.test.jsx` (follow `importExport.test.jsx` for setup: `fake-indexeddb/auto`, `IconLibraryProvider`, mock `../reloadApp.js`, `localStorage.clear()` in `beforeEach`, `cleanup` in `afterEach`):

```jsx
it('opens the drawer with grouped actions and no emoji rows', async () => {
  const { getByLabelText, findByRole } = renderApp();
  fireEvent.click(getByLabelText('Account menu & settings'));
  const dialog = await findByRole('dialog', { name: 'Account menu' });
  const q = within(dialog);
  expect(q.getByText('Personalize')).toBeTruthy();
  expect(q.getByText('Backups')).toBeTruthy();
  expect(q.getByText('Appearance')).toBeTruthy();
  expect(q.getByText('Settings')).toBeTruthy();
  expect(q.getByText('Download a backup')).toBeTruthy();
  expect(q.getByText('Restore from backup…')).toBeTruthy();
  expect(q.queryByText('Export')).toBeNull();
  expect(q.queryByText('Budget file')).toBeNull(); // jsdom has no File System Access API
});

it('Settings row opens the settings dialog', async () => {
  const { getByLabelText, findByRole, findByText } = renderApp();
  fireEvent.click(getByLabelText('Account menu & settings'));
  const dialog = await findByRole('dialog', { name: 'Account menu' });
  fireEvent.click(within(dialog).getByText('Settings'));
  expect(await findByText('Display size')).toBeTruthy();
});
```

- [ ] **Step 4:** Run `npx vitest run src/__smoke__/menuDrawer.test.jsx` — expect failure (old props ignored, rows missing).

- [ ] **Step 5: Rewire `App.jsx`.**
  - `sections`: "Personalize" → Appearance (`palette`, hint "Theme, icons, background", chevron, `setScreen('appearance')`), Settings (`settings`, hint "Scanning, display size, celebrations", chevron, `openSettings()`); "Backups" → Download a backup (`download`, hint "One-time copy as a .tallio file", `exportData()`), Restore from backup… (`restore`, hint "Replaces everything on this device", `danger`, `importInputRef.current?.click()`).
  - `fileCard`: `liveFile.supported ? <BudgetFileCard status={liveFile.status} fileName={liveFile.fileName} lastSavedAt={liveFile.lastSavedAt} onLink={…linkNewFile} onOpen={…openFile} onUnlink={…unlink} /> : null`, each handler followed by `setDrawerOpen(false)` (card buttons close the drawer like rows do).
  - `footerNote`: state `storageNote`, refreshed in an effect when `drawerOpen` becomes true via `getStorageEstimate().then((i) => setStorageNote(formatStorageNote(i)))`.
  - `avatar`: unchanged (`appearance.appIcons.headerAvatar`).
  - Remove the `LiveFilePill` import and `version`/`statusSlot`/`items` props.

- [ ] **Step 6:** Delete `LiveFilePill.jsx`, its test, and the `.live-file-pill` CSS rules. `grep -rn "LiveFilePill\|live-file-pill" src` must return nothing.

- [ ] **Step 7:** Run `npx vitest run` (full suite) and `npx eslint src` — expect all green, no new lint errors.

- [ ] **Step 8: Verify in the running app** (`http://localhost:5173`, Chrome): open the drawer; check the three sections, the unlinked card, hover and red danger hover, Tab cycling, Escape and × slide-out, focus returning to the avatar. Switch finish to Bullion in Appearance and re-check. Set display size to 150% in Settings and confirm the middle scrolls with header and footer fixed. Do not click Restore, Link, Open or Unlink against real data.

- [ ] **Step 9:** Commit `feat(menu): wire redesigned drawer into App; remove LiveFilePill`.
