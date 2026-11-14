# Desktop launcher — design (short)

**Date:** 2026-11-13 · **Size:** small change

## Intent
Starting Tallio means opening PowerShell and typing `npm run dev`, which gets tedious. The user wants a Tallio icon they can double-click to open the app.

## Goals
- A **Tallio** shortcut on the Desktop and in the Start menu, using Tallio's own icon. It can be pinned to the taskbar from the Start menu.
- Double-click → Tallio opens in its **own app window**: no tabs and no address bar.
- No PowerShell or console window is left on screen.
- Double-clicking while Tallio is already running just opens another window. It doesn't fail or start a second server.

## Non-goals
- A stable or separate copy of `master` (option B, rejected). The icon runs **whatever is checked out in this folder**, the same as `npm run dev` today.
- Stopping the server when the window closes. The server keeps running quietly in the background until logoff or reboot.
- Packaging for other machines. The Tauri phase covers that.

## Anti-goals
- **Never change the origin.** All data lives in Chrome's localStorage/IndexedDB under `http://localhost:5173`. If the launcher used a different port, host or browser profile, Tallio would open looking empty.

## Constraints (from recon)
- `vite.config.js` pins `port: 5173, strictPort: true`.
- The default browser is Chrome (`ChromeHTML`) with a single profile (`Default`), so `chrome --app=` reaches the same localStorage.
- Desktop is redirected to OneDrive. Resolve it via `[Environment]::GetFolderPath('Desktop')`.
- This folder switches branches often, and some branches predate the launcher. So the shortcut must **not** point at files inside the repo.

## Approaches
- **A — launch the current working copy (CHOSEN by user).** Start the dev server hidden if it isn't already running, then open the app window. Nothing about the data changes.
- B — separate stable copy of `master` built on launch, served at a new port. Rejected: it needs a one-time data move and has more moving parts.

## Design
- `launcher/Start-Tallio.ps1`:
  1. Probe `http://localhost:5173/`. If it answers, skip to step 3.
  2. Otherwise start `npm run dev` hidden in the repo folder, logging to `%LOCALAPPDATA%\Tallio\dev-server.log`. Poll for up to about 30 s. On timeout, show a message box that points at the log.
  3. Open `chrome.exe --app=http://localhost:5173/`. Fall back to Edge `--app`, then to the default browser.
- `launcher/Install-Launcher.ps1` is run once, and re-run if the repo moves. It copies the launcher script and the icon into `%LOCALAPPDATA%\Tallio\`, records the repo path, and creates `Tallio.lnk` on the Desktop and in Start Menu → Programs. The shortcut runs PowerShell minimized with `-WindowStyle Hidden`, so no console flashes.
- `launcher/tallio.ico` is generated once from `public/icon.svg` by rendering it to PNG with headless Chrome and packing that into a multi-size ICO. It is committed.
- A README "Getting started" note covers the one-time install.

## Left to the builder (my calls)
- No VBScript wrapper, because VBScript is being phased out of Windows 11. Hidden PowerShell is used instead.
- Verification is a manual run-through, since there are no vitest tests for shell scripts: cold start, warm start, re-install, and data still present.
- Work goes on its own branch `feat/desktop-launcher` off `master`, separate from the in-progress `feat/business-class`.
