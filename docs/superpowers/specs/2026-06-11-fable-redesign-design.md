# Tallio Premium Redesign — "Bullion / Instrument" Finishes

- **Date:** 2026-06-11
- **Branch:** `feat/fable-redesign` (off `master`)
- **Status:** Approved by user (brainstorm 2026-06-11, visual companion session `3045-1781201340`)
- **Mockups:** `.superpowers/brainstorm/3045-1781201340/content/directions.html` (three directions),
  `finish-toggle-v2.html` (approved live toggle demo — the implementation contract)

## 1. Goal

Make Tallio's home screen feel genuinely premium — distinctive and polished, not a generic
dashboard — while serving two users with different tastes:

- **Dad (primary daily user, laptop screen):** meticulous, reconciles to the dollar, wants calm,
  legible, statement-like surfaces.
- **Owner:** prefers dense, modern fintech (Linear/Mercury energy).

The resolution is **one design skeleton with two selectable "finishes"**:

- **Bullion** *(default)* — an heirloom ledger: serif identity layer, minted-coin icon wells,
  double-rule totals, dotted leaders, hairline rules, ink debits.
- **Instrument** — a precision terminal: full-bleed app frame, flat stepped planes, mono labels,
  boxed chips, keyboard hints, red debits.

Same DOM, same components, same information, same tests — the difference is design tokens plus a
scoped stylesheet. The brand (tally-mark + Fraunces "Tallio" wordmark) is **shared across both
finishes** (user decision).

### Non-goals (this pass)

- Reports, transaction/transfer/account editors, Settings, Appearance screens get **foundation
  inheritance only** (new fonts, new button dress via existing classes). Their layout redesign is a
  later phase.
- No reconciliation *feature* (the register footer reports facts that exist today; a true
  reconciliation workflow is a future-phase idea).
- No keyboard shortcut beyond `/` (no `S`-for-scan hint until it works).
- No mobile-first pass; existing responsive breakpoints keep working.

## 2. Appearance model: three orthogonal axes

| Axis | Controls | Source | Status |
|---|---|---|---|
| **Theme** | Color (6 presets + custom) | `themes.js` tokens | existing, untouched |
| **Finish** | Form: type, density, radii, rules, chrome | **new** `appearance.finish` | this spec |
| **Background** | Atmosphere: photos, wallpapers, effects | existing background system | untouched |

Rules:

- Theme recolors a finish (all finish dress uses `var(--accent)` etc., never literal colors).
- Finish never sets color-identity tokens; it may *use* them (e.g., double rules are
  `color-mix(in srgb, var(--accent) 50%, transparent)`).
- Both finishes show identical information ("information parity"): the month delta and register
  footer exist in both, dressed differently.

## 3. Brand identity (shared)

- **Mark:** a tally "gate of five" (four vertical strokes + one diagonal), inline SVG drawn with
  `var(--accent)` strokes. New tiny component `src/TallyMark.jsx` (props: `size`), reused in the
  header and the empty state.
- **Wordmark:** "Tallio" in Fraunces 500, normal posture (the Cormorant italic treatment retires).
  No per-letter accent coloring — the mark carries the accent.
- The logo-click easter egg (`eggs.registerLogoClick`) stays attached to the wordmark.
- The old `brand-sub` ("Accounts") label is removed; the nav identifies location.

## 4. App-wide foundations

### 4.1 Fonts (index.html + tokens)

Google Fonts link replaces Cormorant Garamond / Outfit / JetBrains Mono with:

- **Fraunces** (`ital,opsz,wght` 300–700) → `--font-display`
- **Geist** (400–700) → `--font-ui`
- **Geist Mono** (400–600) → Instrument `--font-mono`
- **IBM Plex Mono** (400–600) → Bullion `--font-mono`

`--font-mono` becomes finish-scoped (set under `[data-finish]`, fallback in `:root`). All screens
inherit the new faces immediately via the existing token indirection.

### 4.2 Buttons (global classes, restyled in place)

- `.btn-primary`: the blue/purple gradient dies. Primary = theme accent. Bullion: soft accent
  gradient "stamp" (derived from `--accent` via color-mix), radius 7px, subtle inner highlight.
  Instrument: flat `var(--accent)`, radius 6px. Text color: dark ink over accent (existing themes
  all have light-enough accents; use a fixed near-black with high alpha).
- `.btn` (secondary): quiet ghost — transparent bg, `--border-strong` border, muted → text on hover.
- `.btn-undo.active`, `.btn-add`, `.btn-danger` keep their semantic tinting, re-dressed on the new
  ghost base.
- Editors/Reports inherit these automatically — no layout changes there this pass.

### 4.3 CSS architecture

- **New `src/finishes.css`** (imported in `App.jsx` after `App.css`): the two token sets under
  `.app-root[data-finish="bullion"]` / `[data-finish="instrument"]`, plus all
  `[data-finish="instrument"]`-scoped structural overrides. Bullion is the base dress written into
  the components' own styles; Instrument overrides it (matches the approved demo's mechanism).
- `App.css`: `:root` font tokens updated; header + home-screen sections rewritten in place (the
  ad-hoc rem-based block at the end is replaced); `app-bg-gradient` becomes the Bullion-only gold
  top glow (`display:none` under Instrument), driven by `--accent`.
- Existing class names are kept wherever the DOM survives (`.account-row`, `.register-table`,
  `.txn-*`, `.avatar-trigger`, …). New/renamed DOM (net-worth block) gets new classes and updated
  tests via TDD.

### 4.4 Finish tokens (the contract from the demo)

| Token / surface | Bullion | Instrument |
|---|---|---|
| `--font-mono` (figures) | IBM Plex Mono | Geist Mono |
| Top bar | 62px, transparent, hairline bottom | 50px, raised bg, border bottom |
| Nav links | small-caps tracked, gold dot on active | mono lowercase, gold underline on active |
| Body | centered max-width 1280, 30px gutters | full-bleed grid, sidebar rail w/ own bg + border-right |
| Icon wells | round "coins", accent-tinted ring | 6px squares, neutral border |
| Register container | raised "sheet" card (radius 12, border) | flat plane, no card |
| Net worth figure | Fraunces 34px, small cents | Geist 24px tabular |
| Totals | 3px double accent rule, dotted leaders | 1px border, no leaders |
| Month delta | quiet mono text line | boxed chip |
| Debit amounts (`--debit-color`) | ink (`--text`) | `--red` |
| Inputs (register filters) | underline only | boxed, raised bg, `/` kbd hint visible |
| Category display | bare icon-well + muted text | boxed chip |
| Top glow | accent radial, on | off |

## 5. Finish system plumbing

- `useAppearance`: `finish` field (default `'bullion'`), `setFinish(id)` setter, included in
  `snapshot()`/`restore()` and persisted in the existing `tallio-appearance` localStorage key.
  Existing stored data lacking `finish` merges to the default — no migration needed.
- `App.jsx`: `appearanceForUI.setFinish` wraps with `pushHistory()` → **finish flips are undoable**
  (Ctrl+Z and every Undo button).
- `.app-root` gets `data-finish={appearance.finish}`. All overlays/screens render inside
  `.app-root`, so they inherit. Phone-pairing routes (`/pair`) don't use `.app-root` and are
  unaffected.
- Finish transitions: CSS `transition` on the morphing properties (the demo's cross-fade), disabled
  under `prefers-reduced-motion`.

## 6. Home screen design

### 6.1 Top bar (replaces current header)

Left → right:

1. **Brand:** TallyMark + "Tallio" (Fraunces; 24px Bullion / 20px Instrument). Easter egg click
   handler on the wordmark.
2. **Nav:** Accounts (current, `aria-current="page"`) · Reports · Categories · Account types —
   button elements styled as links, replacing the three old `.btn` screen switchers.
3. **Actions (right-aligned):** ↑ Upload · ⌘ Pair phone (paired state: ✓ Phone linked, green tint)
   · ↩ Undo with count badge (existing `UndoButton`) · **◉ Scan bill** (the one primary button).
4. **Avatar (far right):** the user's custom avatar icon in a round well + caret — moves from the
   left of the wordmark to the end of the bar. `AvatarDrawer` slides in **from the right**
   (CSS + small component change; scrim/Escape behavior unchanged).

### 6.2 Accounts sidebar (`AccountList`)

- **Net-worth block** (replaces `household-strip`; new DOM + classes, tests updated):
  - small-caps label "Net worth";
  - figure (count-up + value-flash preserved), dollars/cents split so Bullion can shrink cents;
  - finish-dressed rule;
  - **month delta line** — new pure function `monthToDateDelta(transactions, now)` in
    `accountsModel.js`: net change from transactions dated in the current calendar month across all
    accounts (transfers cancel out). Display: `▲ +$2,140.18 this month` (green) / `▼ −…` (red) /
    muted `$0.00 this month` when zero;
  - "Cash & investments" and "You owe" pairs (existing `householdTotals`), dotted leaders in
    Bullion.
- **Groups:** existing `groupOrder`/`groupFor` grouping; small-caps group label + count.
- **Rows:** icon well (coin/square per finish) + name + mono balance; selected = accent edge bar +
  raised bg; liabilities negative in red. Existing hover micro-motion kept.
- **Add account:** dashed ghost row (existing element, re-dressed).

### 6.3 Register

- **Sheet:** Bullion wraps the register in a raised card; Instrument lays it flat. The sheet (and
  Instrument's sidebar rail) participate in the background-photo frost system: backgrounds derive
  from `--bg-raised` through the existing `--surface-alpha`/`--surface-blur` knobs.
- **Header row:** icon well + account name (`--font-display`) + small-caps type tag + right-aligned
  Balance (label + mono figure; Bullion adds the double rule) + actions: **+ New entry** (primary),
  ⇄ Transfer (ghost), ✎ edit-account icon ghost (replaces the floating toolbar above the register).
- **Filters:** search / month / category — underline fields (Bullion) vs boxed fields (Instrument).
  **`/` focuses the register search** in both finishes (guarded: not while typing in an
  input/textarea/contentEditable, not while any overlay/editor is open); the kbd hint badge renders
  only in Instrument.
- **Table (compact + bank layouts):** both get the same dress — small-caps/mono column headers with
  accent hairline, sortable header buttons kept (`th-sort`), hairline row rules, date column in
  `--font-mono` small caps, amounts/balances in `--font-mono` tabular: credits `--green`, debits
  `var(--debit-color)` (ink/red per finish; applies to the bank layout's Payment column too),
  balance muted, negative balance red. Split rows keep the inset marker + "▸ N splits" mark
  (re-dressed `SplitChevron`); transfer chips keep the jump-to-account ↗ button (bare gold text in
  Bullion, boxed chip in Instrument).
- **Footer (facts only):** left "N entries · <period or 'All activity'>", right "Last entry
  <date>". No reconciliation claims.
- **Empty state:** dimmed TallyMark glyph + existing copy + primary CTA, re-dressed.

### 6.4 Finish picker (Appearance → Theme tab)

Top of `ThemeTab`, above theme swatches: a two-card radiogroup ("Finish"), each card a small pure-CSS
wireframe thumbnail (serif sheet vs flat rail) + name + one-liner. Selecting calls
`appearance.setFinish` (undoable, persisted, instant). Keyboard/a11y: `role="radiogroup"`,
arrow-key navigation matching existing tab patterns.

## 7. Motion

- Keep: count-up (`useCountUp`), value flash (`useValueFlash`), container fade-in, row hover nudge.
- New: finish cross-fade (CSS transitions on bg/border/radius/font-size), button press states
  (Bullion soft lift; Instrument instant bg-step).
- All new motion sits behind the existing `prefers-reduced-motion` guards in `microMotion.css` /
  `finishes.css`.

## 8. Hard constraints (verified untouched)

- `Icon.jsx` emoji/image icons everywhere (accounts, categories, avatar) — wells wrap, never
  replace, the `Icon` component.
- 6 themes + custom colors (`themes.js` derivation) — all finish dress uses theme tokens.
- Background photos/wallpapers/effects + frosted surfaces.
- Undo everywhere, including the new finish setting.
- Scan / Upload / phone pairing flows.
- All `tallio-*` localStorage keys and IndexedDB image store: no schema changes beyond the additive
  `finish` field inside `tallio-appearance`.
- `--ui-scale` display-size knob.

## 9. Testing & verification

- Inline TDD (no subagents): failing test → implement → green, per component.
- Updated tests: `AccountList` (net-worth block DOM), `App` header (nav buttons, avatar position),
  `Register` (footer, filters), `AvatarDrawer` (right side), `ThemeTab` (picker).
- New tests: `monthToDateDelta` math (month boundaries, transfers, empty), `useAppearance.finish`
  (default, persist, snapshot/restore round-trip), finish picker behavior, `/` shortcut focus +
  guards, `data-finish` attribute wiring.
- Visual checkpoints: dev server review of both finishes × Nocturne + Parchment (darkest/lightest)
  × background photo on/off.
- Gate for every checkpoint: full `npx vitest run` green + `npm run build` clean.

## 10. Later phases (out of scope, recorded)

1. Reports + editors/modals full re-dress on the finish system.
2. Appearance/Settings screens' own layout polish.
3. Reconciliation workflow (mark-reconciled-through + footer integration) — strong dad fit.
4. More keyboard affordances (N = new entry, S = scan) once implemented for real.
5. Deferred from earlier: TransferEditor searchable pickers.
