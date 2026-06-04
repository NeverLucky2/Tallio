# Handoff — Appearance Phase 3: Image-icons, Library & Appearance-Undo

**Date:** 2026-06-04
**Status:** Phase 1 (themes) ✅, Phase 2a (background rendering) ✅ — **merged to `master` via PR #10**. Phase 2b (photo backgrounds) + polish (framing/effects-strength/single-replace/rename-delete) + refinements (drag-to-pan, × delete) ✅ — **pushed in open PR #11** (`appearance-phase-2b` → `master`). Next: **Phase 3**.

---

## TL;DR for the next session

Implement **Phase 3 — image-icons + library**, plus the **undo of appearance changes** the user asked for (deferred from the 2b polish round). The original design spec already sketches Phase 3 (§3.1–3.4), but the **icon crop UX, the `<Icon>` object-URL cache architecture, and the appearance-undo scope are real design decisions** — so **start with the `brainstorming` skill**, lock those down, write the spec, then `writing-plans`, then execute with **inline TDD and a checkpoint after each task (no subagents), committing per task**. The user is meticulous (reconciles reports to the dollar) — **icon/readability changes must not regress**, and **deleting an in-use icon must degrade gracefully** (fallback glyph, never a crash).

**Paste-ready prompt is at the bottom.**

---

## Where the code is right now (git)

- `origin/master` tip `181d24a` = PR #10 merged (Phases 1, 2a, Undo-everywhere, Sub-categories Plan 1, Tallio rebrand).
- **Open PR #11** = branch `appearance-phase-2b` (origin/master + 32 commits): Phase 2b + polish + refinements. **745 tests / 60 files green, build clean, lint-clean.**
- Local `master` is in sync with `origin/master`. Old local `rename-to-tallio` branch still exists as a harmless backup.
- **Branch strategy for Phase 3:** if PR #11 is **merged**, branch from the updated `master`. If not yet merged, **stack on `appearance-phase-2b`** (Phase 3 depends on `useImageLibrary`/`imageStore` from 2b). **Lesson learned this round: push to the branch as you go so the open PR always reflects the latest** — don't keep 30+ commits local (PR #10 got merged before this session's work was pushed, which forced a separate PR #11).

## Specs to read first

- `docs/superpowers/specs/2026-06-03-appearance-and-backgrounds-design.md` — **§3.1–3.4 is the Phase 3 spec** (Icon renderer, route-all-icons, IconPicker crop step, grouped/searchable library).
- `docs/superpowers/specs/2026-06-04-appearance-phase-2b-polish-design.md` — note "§5 Undo deferred to Phase 3".
- The two executed plans (`...2026-06-03-appearance-phase-2b-photos.md`, `...2026-06-04-appearance-phase-2b-polish.md`) are good references for task granularity + how the canvas/IndexedDB testability boundaries were handled.

---

## What Phase 3 must deliver (from spec §3 + user request)

1. **`src/Icon.jsx` universal renderer** — `<Icon value={…} className?>`: emoji → text; `img:<id>` → rounded/circular `<img>` (`object-fit: cover`) from an **in-memory object-URL cache**; missing/deleted id → **fallback glyph** (graceful, no crash). Must render **synchronously** in long lists (no per-row async/flicker) → the cache is populated at startup.
2. **Route ALL icon rendering through `<Icon>`** — audit & replace direct emoji output: category lists, account lists/cards, nav, header avatar, transaction rows (category icons), IconPicker previews. Category/account `icon` field becomes emoji **or** `img:<id>`.
3. **Extend `src/IconPicker.jsx`** — keep `CURATED_ICONS` under a "Default icons" section; add "Your images" gallery (the library) + an **Upload action with a square crop/zoom step**. Selecting an image sets the field to `img:<id>`. One image reusable across many icons.
4. **Image library (Image Icons tab + picker)** — named, grouped (Family/Pets/Scenery + "＋ New group"), **searchable** via a pure filter in the `src/categoriesSearch.js` style. View / rename / re-group / **delete**; delete shows a **"used by N"** hint (graceful, no hard reference-counting) and in-use icons fall back to a glyph.
5. **Appearance undo (user request, NEW)** — undo of appearance changes (theme, background, framing, effects, icons). Scope is a design decision (see below).

## Open design questions to brainstorm BEFORE planning

- **Icon crop step:** reuse the Phase 2b framing model (store crop as data + render with `object-fit/object-position`/transform, **no re-encode**) vs. **re-encode a square thumb** at upload. Note `imageProcess.processImageFile` **already produces a ~128px center-cropped square `thumb`** — Phase 3 wants *user-controlled* square crop. Decide: per-icon crop framing stored where (image record? icon reference?), and whether all icons of one image share one crop or each can differ. (Phase 2b's `clampFraming`/`panFraming` drag-to-pan + zoom editor is a strong reference; icons are square aspect.)
- **`<Icon>` cache architecture:** module-level cache vs. React context/provider; how/when it loads all thumbs into object URLs at startup; revocation lifecycle; how `<Icon>` reads it synchronously. (`useImageLibrary` already lists records incl. `thumb` Blobs.)
- **Appearance-undo scope:** a simple **Reset/Revert** (e.g. revert to last-saved / to a preset) vs. a **step-by-step history stack** inside `useAppearance` vs. integrating with the app's **global ⎌ Undo** (`App.jsx` `pushHistory`/`undo`, which currently snapshots ledger/cats/accountTypes/acks — appearance is NOT in it). Recommend deciding granularity (per-change vs per-session) and whether redo is wanted.

## Reusable building blocks already in place (don't rebuild)

- **`src/useImageLibrary.js`** — `{ images, reload, addFromFile(file,meta), remove(id), updateMeta(id,patch) }`, resilient to missing IndexedDB. Built for exactly this reuse.
- **`src/imageStore.js`** — `putImage(file, meta, {process})`, `getImage`, `listImages` (sorted by createdAt), `updateImageMeta`, `deleteImage`, `putRecord`. Records: `{ id, blob, type, w, h, name, group, thumb, palette, createdAt }`.
- **`src/imageProcess.js`** — `processImageFile` (canvas re-encode + square `thumb` + palette) and pure `fitWithin`. Injectable into `putImage`.
- **`src/imageColors.js`** — pure `extractPalette`, `rgbToHex`.
- **`src/backgroundPhotos.js`** — pure `clampFraming`, `panFraming(start,dx,dy,w,h)`, `togglePhotoSelection`, `pruneDeletedPhoto` (crop/drag math reference).
- **`src/categoriesSearch.js`** — `filterCategoriesByQuery` pure-filter pattern to mirror for the library search.
- **`src/IconPicker.jsx`** — exports `CURATED_ICONS` + `IconPicker({ value, onChange })` popover (emoji grid + free-text). Extend, don't replace.
- **`src/useAppearance.js`** — persists `tallio-appearance` (localStorage); exposes `themeId, customTheme, background, appIcons, setTheme, updateCustom, resetCustomToPreset, updateBackground`. Note `appIcons: {}` map already in the data model for app-level icon overrides (e.g. `headerAvatar`). The undo work likely extends this hook.
- **Framing editor** in `src/BackgroundTab.jsx` (drag-to-pan `.bg-framing-clip` + zoom slider, object-URL preview with try/catch guard) — direct reference for the icon crop UI.

## Repo conventions (these have bitten us)

- **Tests:** Vitest + @testing-library/react, jsdom. Component tests **must** `import { cleanup } from '@testing-library/react'` + `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `.toBeNull()`, `container.querySelector`, `el.getAttribute`, `el.style.getPropertyValue`. Hooks: `renderHook`/`act`/`waitFor`.
- **jsdom gaps:** no canvas rendering, no IndexedDB, and `URL.createObjectURL` **throws "Not implemented"** (wrap in try/catch). Use `fake-indexeddb/auto` (already a devDep) for store/hook tests; stub `URL` via `vi.stubGlobal` where needed (see `useBackgroundPhotos.test.jsx`). Keep canvas/crop pixel logic pure + unit-tested; verify the actual canvas/visual bits manually via `npm run dev`.
- **Newer lint rule `react-hooks/set-state-in-effect`** is an ERROR — for legitimate object-URL-lifecycle effects, consolidate to a single `setState` and add a scoped `// eslint-disable-next-line react-hooks/set-state-in-effect` (see `BackgroundTab.jsx`).
- Run one file: `npx vitest run src/Foo.test.jsx`. Full: `npx vitest run` (currently **745 tests / 60 files**). Lint: `npx eslint <files>` → 0 errors. **Pre-existing eslint errors in `CategoryEditor.jsx`, `ColorPicker.jsx`, `IconPicker.jsx`, `spendingMath.js` are NOT ours — ignore** (but note: Phase 3 will modify `IconPicker.jsx`, so try to leave it no worse; its existing error is `react-refresh/only-export-components` from exporting `CURATED_ICONS` alongside the component).
- Commits: per task, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `LF will be replaced by CRLF` warnings are benign on Windows. Build sanity: `npm run build` (>500 kB chunk warning is pre-existing).
- Platform: Windows / PowerShell. The Bash tool runs **bash** (not PowerShell) — for `gh pr create` use `--body-file`, not PowerShell here-strings.

## Workflow conventions (user preference)

- Flow: **brainstorm → spec → plan → inline TDD by Claude with a checkpoint after each task**. The user reviews between tasks; **do not dispatch subagents** for implementation. Use `AskUserQuestion` (with `preview` ASCII for visual UI choices) to lock design forks.
- Group truly-pure foundational tasks and move through them; **pause for the user at manual-verification points** (canvas/visual) — the user runs `npm run dev` and confirms. Readability must never regress.
- After the phase: `finishing-a-development-branch`. **Push the branch and keep its PR updated as you go this time.**

---

## Paste-ready prompt for the next session

> Continue the Tallio "Make it Mine" Appearance feature: implement **Phase 3 — image-icons + library, plus undo of appearance changes**. Read `docs/superpowers/handoffs/2026-06-04-appearance-phase-3-handoff.md` first for full context, what's already built, conventions, and the branch strategy. The Phase 3 spec is `docs/superpowers/specs/2026-06-03-appearance-and-backgrounds-design.md` §3.1–3.4; appearance-undo was deferred here from the 2b polish.
>
> Because the icon **crop UX**, the **`<Icon>` object-URL cache architecture**, and the **appearance-undo scope** are genuine design decisions, **start with the `brainstorming` skill** to lock them down, then write the spec, then `writing-plans`, then execute with **inline TDD and a checkpoint after each task (no subagents), committing per task and pushing to the branch as you go**.
>
> Reuse the existing `useImageLibrary`, `imageStore`, `imageProcess`, `imageColors`, `categoriesSearch`, `IconPicker` (`CURATED_ICONS`), and the Phase 2b framing editor (drag-to-pan + zoom) as the crop reference. Mind repo conventions: Vitest + RTL, `afterEach(cleanup)`, no jest-dom; jsdom has no canvas/IndexedDB and `URL.createObjectURL` throws (use `fake-indexeddb`, stub `URL`, keep crop/pixel logic pure & unit-tested, verify canvas/visual bits via `npm run dev`); watch the `react-hooks/set-state-in-effect` error rule. Keep readability uncompromised and make a **deleted-but-in-use icon fall back to a glyph gracefully** (the user reconciles reports to the dollar). Branch: if PR #11 is merged, branch from `master`; otherwise stack on `appearance-phase-2b`.
