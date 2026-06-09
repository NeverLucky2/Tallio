# Avatar Left Drawer — Design

**Date:** 2026-06-08
**Status:** Approved (brainstorming complete)

## Intent

Turn the header avatar into the entry point for account-level actions. Clicking the
avatar slides a panel in from the left (over the avatar) that hosts **Appearance**,
**Settings**, and **Export** — decluttering the header by removing those three standalone
buttons. The avatar is also enlarged.

## Behavior

- The avatar (enlarged to ~**2.2em**, circular) is the trigger. Clicking it opens a
  **left slide-in drawer that covers the avatar**, with a dimming **scrim** behind it.
- The drawer closes on: **scrim click**, the **×** button, **Escape**, or **selecting an
  item**.
- **Reduced motion** (`prefers-reduced-motion`) → no slide animation; the panel simply
  appears/disappears. Scrim still present.
- Drawer contents (top → bottom):
  - Header: avatar glyph + "Your Tallio" / "Account" label + **×** close button.
  - Nav items:
    - **🎨 Appearance** → `setScreen('appearance')`
    - **⚙ Settings** → `openSettings()`
    - **↗ Export** → `exportData()`
  - Footer: small version label (`Tallio v<pkg.version>`).
- The standalone **🎨 Appearance, ⚙ Settings, and ↗ Export** buttons are **removed** from
  the header. The header keeps: Categories · Account Types · Reports · Scan · Upload ·
  Pair Phone · Undo.
- The **logo click-streak easter egg moves from the avatar to the "Tallio" wordmark**
  (`<h1 class="brand-title">`): 7 quick clicks → reveal. Konami code + console art unchanged.

## Architecture

- **`AvatarDrawer.jsx`** (presentational) + **`AvatarDrawer.css`** (own file so the
  uncommitted `App.css` WIP stays untouched; the avatar-size bump is a scoped selector).
  - Props: `open` (bool), `onClose` (fn), `items` (array of `{ icon, label, onSelect }`),
    `version` (string), `reducedMotion` (optional; defaults to the
    `prefers-reduced-motion` check used elsewhere).
  - Returns `null` when `open` is false. When open, renders scrim + panel; the panel
    plays a one-shot CSS slide-in (`@keyframes`, disabled under reduced motion). Close is
    immediate (unmount). `role="dialog"`, `aria-modal`, `aria-label="Account menu"`.
    Escape handled internally; scrim click → `onClose`.
- **`App.jsx`**:
  - New state `const [drawerOpen, setDrawerOpen] = useState(false)`.
  - Replace the `.header-avatar-wrap` span with an avatar **trigger button** (`onClick` →
    `setDrawerOpen(true)`, `aria-label="Account menu"`) wrapping the `<Icon>`.
  - Render `<AvatarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} version={pkg.version}
    items={[{icon:'🎨',label:'Appearance',onSelect:() => setScreen('appearance')}, {icon:'⚙',label:'Settings',onSelect:() => openSettings()}, {icon:'↗',label:'Export',onSelect:() => exportData()}]} />`.
    Each item's `onSelect` runs then the drawer closes (drawer calls `onClose` after select).
  - Move `eggs.registerLogoClick` onto the `<h1 className="brand-title">` wordmark
    (`onClick`).
  - Remove the three header `<button>`s (Appearance, Settings, Export).

## Edge cases
- Selecting Appearance/Settings/Export closes the drawer before the screen/modal opens
  (no stacked overlays).
- Drawer + existing modals: Settings opens as its own modal on top after the drawer closes;
  Appearance is a full screen swap; no z-index conflict (drawer closes first).
- Reduced motion: scrim + panel appear without transition.

## Testing
Repo conventions: Vitest + @testing-library/react, jsdom; `afterEach(cleanup)`; no jest-dom.
- **`AvatarDrawer.test.jsx`**:
  - Renders nothing (no `.avatar-drawer-panel`) when `open=false`.
  - When `open=true`: renders the three items; `role="dialog"` + `aria-label` present.
  - Clicking an item calls its `onSelect` and then `onClose`.
  - Scrim click → `onClose`; Escape → `onClose`.
- **Manual-verify** (`npm run dev`, port 5174): slide-in feel from the left over the
  avatar, scrim dimming, reduced-motion skip, enlarged avatar, the three items opening the
  right surfaces, header no longer shows the three buttons, and the easter egg now firing
  from the wordmark (7 clicks) while the avatar opens the drawer.

## Out of scope (deferred)
- **Embedded settings** (moving `SettingsPanel`'s controls inside the drawer) — chose the
  lighter nav style; can revisit later.
- The separately-queued **transfer searchable pickers** work is unrelated to this.

## Branch & workflow
Branch `avatar-menu` off `master` (`329645f`). Inline TDD: failing test → implement →
green → lint → commit; push as we go; one manual-verify checkpoint at the end.
