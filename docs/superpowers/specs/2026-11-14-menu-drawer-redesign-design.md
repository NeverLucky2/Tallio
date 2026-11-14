# Menu drawer redesign — design

**Date:** 2026-11-14 · **Branch:** `feat/menu-drawer` (off `master`) · **Size:** small change

## Intent

The main screen looks right; the drawer behind the header avatar does not. It is
a flat list of six unrelated actions with emoji icons, near-synonym labels, a
status line detached from the actions that change it, and a destructive action
that looks like every other row. Bring it up to the standard of the main screen
without changing what any action does.

The user approved the look from a static mockup (today vs. proposed, linked and
unlinked states) on 2026-11-14.

## Goals

- Same actions as today, regrouped into three sections.
- Labels that say what each action does.
- The live-file status sits with the actions that change it.
- Restore shows its consequence before the click.
- Icons from the app's line-icon set (`UiIcon`), in wells like the sidebar rows.
- Proper keyboard and focus behaviour.

## Non-goals

- No change to what any action does (export, restore, link, open, unlink,
  Appearance, Settings all call the same handlers as today).
- Restore keeps its existing `window.confirm`.
- Settings dialog and top bar are a separate later pass.

## Anti-goals

- No new features hiding in the drawer. No new settings.
- Nothing that looks like an account or sign-in; Tallio has none.

## Approaches

1. **Restructure the drawer in place (chosen).** `AvatarDrawer` takes sections
   instead of a flat list; a new file card replaces the status pill. Small,
   keeps the entry point the user already knows.
2. **Popover menu under the avatar instead of a full-height drawer.** Lighter,
   but the budget-file card with up to three buttons crowds a popover, and the
   drawer pattern itself was never the complaint.
3. **Move data actions into the Settings dialog, leave two links in the drawer.**
   Buries backup/restore one level deeper for a user who reconciles carefully
   and wants those close at hand.

## Design

### Layout (top to bottom)

- **Header:** the user's chosen header avatar (from Appearance, unchanged
  source) in a rounded-square well · title "Tallio" · subtitle "Private to this
  device" · close button (line ×, 28px hit area).
- **Section "Personalize":**
  - Appearance — hint "Theme, icons, background" — chevron
  - Settings — hint "Scanning, display size, celebrations" — chevron
- **Section "Budget file"** (only when the File System Access API is supported,
  as today): one card.
  - *Unlinked:* hollow dot · "Stored in this browser only" · "Link a file and
    every change autosaves to it." · buttons **Link a budget file** (primary),
    **Open existing…**
  - *Linked:* filled accent dot · "Autosaving" plus " · saved h:mm AM/PM" when
    `lastSavedAt` is set · file name in mono · "Every change is written to this
    file." · buttons **Change file**, **Open another…**, **Unlink**. Card takes
    the accent tint/border.
- **Section "Backups":**
  - Download a backup — hint "One-time copy as a .tallio file" (today's Export)
  - Restore from backup… — hint "Replaces everything on this device" in red;
    hover accent is red instead of the theme accent.
- **Footer:** "Tallio" left; storage used ("0.4 MB stored") right, from the
  existing `getStorageEstimate()`; right side omitted when unsupported.

### Label mapping (handlers unchanged)

| Today | New |
|---|---|
| Export | Download a backup |
| Restore from backup | Restore from backup… |
| Save to a budget file | Link a budget file |
| Save to a different file | Change file |
| Open a budget file | Open existing… / Open another… |
| Unlink file | Unlink |

### Behaviour

- Selecting any row or card button runs its handler, then closes the drawer
  (as today).
- On open, focus moves to the close button. Tab and Shift+Tab cycle within the
  panel. On close, focus returns to the avatar trigger.
- Escape, scrim click and × close (as today).
- Closing slides the panel out (~180ms) before unmount; skipped under reduced
  motion, like the existing open animation.
- Colours, radii and fonts come from existing tokens so both finishes
  (Instrument, Bullion) and user themes carry through. Section labels and
  footer use `--font-mono`.

### Code shape

- `AvatarDrawer` props: `sections` (`[{ title, items: [{ icon, label, hint,
  danger, onSelect }] }]`) replaces `items`; `fileCard` slot replaces
  `statusSlot` and renders between the first and last section under the
  "Budget file" label; `footerNote` replaces `version`.
- New `BudgetFileCard` component (status, fileName, lastSavedAt, onLink, onOpen,
  onUnlink). `LiveFilePill` and its test are removed (only the drawer used it).
- `UiIcon` gains: `palette`, `download`, `restore`, `close`, `chevronRight`.
- `App.jsx` builds the sections and card from the same handlers it uses now.

### Calls made by Claude (not explicitly decided by the user)

- The header keeps the user's custom avatar rather than the tally mark shown in
  the mockup, since Appearance lets them choose it.
- Version string dropped from the footer (it reads "0.0.0"); storage used shown
  instead.
- Saved time shown as a clock time rather than a live-updating "2m ago".
- Exit animation included.
- Work happens on a new branch off `master`, separate from the in-progress
  `feat/business-class`.

## Testing

TDD, inline. Update `AvatarDrawer.test.jsx` for sections, hints, danger row,
focus-on-open, focus trap, focus return, exit animation / reduced motion. New
`BudgetFileCard.test.jsx` for both states and each button. `UiIcon.test.jsx`
for the new names. App smoke test: drawer opens and shows the three sections.
Full suite green before finishing; then verify in the running app.
