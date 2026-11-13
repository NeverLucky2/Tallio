# Desktop Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a double-clickable **Tallio** Desktop and Start-menu shortcut. It starts the dev server hidden if it isn't already running, then opens Tallio in a Chrome app window at `http://localhost:5173/`.

**Architecture:** All logic lives in one PowerShell module, `launcher/TallioLauncher.psm1`, and is unit-tested with Pester. Two thin scripts wrap it:
- `Start-Tallio.ps1` is what the shortcut runs.
- `Install-Launcher.ps1` is run once.

The installer copies the runtime files to `%LOCALAPPDATA%\Tallio\`, so switching branches in the repo never breaks the shortcut. A one-off dev script, `New-TallioIcon.ps1`, renders `public/icon.svg` into the committed `launcher/tallio.ico`.

**Tech Stack:** Windows PowerShell 5.1, Pester **3.4.0** (built into Windows: use 3.x syntax such as `Should Be` and `Mock -ModuleName`, and install nothing), System.Drawing, WScript.Shell COM, headless Chrome.

**Spec:** `docs/superpowers/specs/2026-11-13-desktop-launcher-design.md`

## Global Constraints

- The URL is exactly `http://localhost:5173/`. Never another port, host or browser profile, because all user data lives at that origin.
- The browser is Chrome `--app=<url>` on the default profile. Do **not** pass `--user-data-dir` or `--profile-directory` when launching the app window. Fall back to Edge `--app`, then to the default browser.
- The install dir is `%LOCALAPPDATA%\Tallio\`. It holds `Start-Tallio.ps1`, `TallioLauncher.psm1`, `tallio.ico`, `launcher.json` and `dev-server.log`.
- `launcher.json` has the shape `{ "repoPath": "<abs path>", "url": "http://localhost:5173/" }`.
- The shortcut is named `Tallio.lnk`, in `[Environment]::GetFolderPath('Desktop')` and `[Environment]::GetFolderPath('Programs')`.
- The shortcut target is `$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`. Its arguments are exactly `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<installDir>\Start-Tallio.ps1"`. WindowStyle is `7` (minimized).
- The server start timeout is 30 s.
- No VBScript. No new npm dependencies. No changes under `src/`.
- Run the test command for every task: `powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester -Script launcher/tests/TallioLauncher.Tests.ps1 -EnableExit"`
- Commits: add named files only (never `git add -A`). End messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**User-facing error copy** (exact, shown in a message box titled `Tallio`):
- Config missing: `Tallio's launcher isn't set up yet. Run launcher\Install-Launcher.ps1 from the Tallio project folder.`
- Repo missing: `Couldn't find the Tallio project at <repoPath>. If you moved it, run launcher\Install-Launcher.ps1 again from its new location.`
- npm missing: `Couldn't find npm. Is Node.js installed?`
- Timeout: `Tallio didn't start within 30 seconds.` + blank line + `Details are in:` + newline + `<logPath>`

## Review Focus

1. **Paths with spaces.** The repo, the log and the install dir all live under `OneDrive\Documents\...` or the user folder. Every path passed through `cmd /c` or `-File` must be quoted. Pinned by tests in Task 1 (log path with spaces) and Task 4 (shortcut arguments).
2. **The repo moved or was renamed**, for example a OneDrive path change. The user expects the friendly "re-run the installer" message, not a 30 s hang. Pinned in Task 1.
3. **Vite fails to start**, for example `node_modules` missing after a branch switch, or the port held by something else. The user expects the timeout message box with the log path after 30 s, and no browser window opened onto a dead page. Pinned in Task 3.
4. **Vite listening on IPv6 `::1` only.** The probe must still see the server, otherwise every launch would try to start a second server, which fails on `strictPort`. Verified live in Task 5, Step 3.
5. **The installer never ran, or `%LOCALAPPDATA%\Tallio` was deleted.** The user expects the "isn't set up yet" message. Pinned in Task 2.

---

### Task 0: Branch + commit spec and plan

- [ ] **Step 1:** `git switch -c feat/desktop-launcher master`. The untracked spec and plan move with the working tree. `feat/business-class` has no uncommitted work besides `.claude/settings.local.json`.
- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-11-13-desktop-launcher-design.md docs/superpowers/plans/2026-11-13-desktop-launcher.md
git commit -m "docs: desktop launcher design + implementation plan"
```

---

### Task 1: Server probe, wait and start

**Files:**
- Create: `launcher/TallioLauncher.psm1`
- Create: `launcher/tests/TallioLauncher.Tests.ps1`

**Interfaces — Produces:**
- `Test-TallioServer -Url <string> [-TimeoutMilliseconds <int> = 2000]` → `[bool]`. Returns `$true` if the server answers with **any** HTTP status, including 4xx and 5xx. Returns `$false` on connection refused or timeout. Use `[Net.HttpWebRequest]` with `.Proxy = $null`. A `WebException` that carries a `.Response` counts as up.
- `Wait-TallioServer -Url <string> [-TimeoutSeconds <int> = 30] [-IntervalMilliseconds <int> = 500] [-Probe <scriptblock>]` → `[bool]`. `-Probe` defaults to `{ Test-TallioServer -Url $Url }`. It polls until the probe returns `$true` (returns `$true`) or the deadline passes (returns `$false`).
- `Start-TallioServer -RepoPath <string> -LogPath <string>` → nothing. It throws the exact **Repo missing** copy if `<RepoPath>\package.json` is absent, and the **npm missing** copy if `Get-Command npm.cmd -ErrorAction SilentlyContinue` is null. It creates the log's parent dir, then runs `Start-Process -FilePath $env:ComSpec -ArgumentList "/c npm run dev > `"$LogPath`" 2>&1" -WorkingDirectory $RepoPath -WindowStyle Hidden`.

- [ ] **Step 1: Write the failing tests**

Test file header (shared by every later task):

```powershell
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here '..\TallioLauncher.psm1') -Force

function Get-FreePort {
    $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $l.Start()
    $p = $l.LocalEndpoint.Port; $l.Stop(); $p
}

# HttpListener answering every request with $Status from a background runspace.
# Returns the listener; .Close() it in `finally` — that unblocks GetContext() so the runspace exits
# (PowerShell.Stop() would hang on the blocking native call).
function Start-FakeServer([int]$Port, [int]$Status) {
    $h = New-Object Net.HttpListener; $h.Prefixes.Add("http://localhost:$Port/"); $h.Start()
    $null = [powershell]::Create().AddScript({
        param($h, $status)
        while ($h.IsListening) {
            try { $c = $h.GetContext(); $c.Response.StatusCode = $status; $c.Response.Close() } catch { break }
        }
    }).AddArgument($h).AddArgument($Status).BeginInvoke()
    $h
}
```

```powershell
Describe 'Test-TallioServer' {
    It 'is true when the server answers 200' {
        $port = Get-FreePort; $srv = Start-FakeServer $port 200
        try { Test-TallioServer -Url "http://localhost:$port/" | Should Be $true } finally { $srv.Close() }
    }
    It 'is true when the server answers 404 (any HTTP answer means up)' {
        $port = Get-FreePort; $srv = Start-FakeServer $port 404
        try { Test-TallioServer -Url "http://localhost:$port/" | Should Be $true } finally { $srv.Close() }
    }
    It 'is false when nothing listens' {
        Test-TallioServer -Url "http://localhost:$(Get-FreePort)/" | Should Be $false
    }
}

Describe 'Wait-TallioServer' {
    It 'returns true once the probe succeeds' {
        $state = @{ n = 0 }
        $probe = { $state.n++; $state.n -ge 3 }.GetNewClosure()
        Wait-TallioServer -Url 'x' -TimeoutSeconds 5 -IntervalMilliseconds 10 -Probe $probe | Should Be $true
        $state.n | Should Be 3
    }
    It 'returns false when the deadline passes' {
        Wait-TallioServer -Url 'x' -TimeoutSeconds 1 -IntervalMilliseconds 50 -Probe { $false } | Should Be $false
    }
}

Describe 'Start-TallioServer' {
    It 'throws the re-run-installer message when the repo is gone' {
        { Start-TallioServer -RepoPath "$TestDrive\nope" -LogPath "$TestDrive\l.log" } |
            Should Throw "Couldn't find the Tallio project at $TestDrive\nope"
    }
    It 'throws when npm is missing' {
        Set-Content "$TestDrive\package.json" '{}'
        Mock Get-Command { $null } -ModuleName TallioLauncher -ParameterFilter { $Name -eq 'npm.cmd' }
        { Start-TallioServer -RepoPath $TestDrive -LogPath "$TestDrive\l.log" } | Should Throw "Couldn't find npm"
    }
    It 'starts npm run dev hidden in the repo, logging to a quoted path with spaces' {
        Set-Content "$TestDrive\package.json" '{}'
        Mock Start-Process {} -ModuleName TallioLauncher
        $log = "$TestDrive\App Data\Tallio\dev-server.log"
        Start-TallioServer -RepoPath $TestDrive -LogPath $log
        Test-Path (Split-Path $log) | Should Be $true
        Assert-MockCalled Start-Process -ModuleName TallioLauncher -Times 1 -ParameterFilter {
            $WindowStyle -eq 'Hidden' -and $WorkingDirectory -eq $TestDrive -and
            ($ArgumentList -join ' ') -eq "/c npm run dev > `"$log`" 2>&1"
        }
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL, because the module file doesn't exist and the import errors.
- [ ] **Step 3: Implement the three functions** in `launcher/TallioLauncher.psm1` per the Interfaces block. End the module with `Export-ModuleMember -Function *-Tallio*, *-AppBrowser, *-BrowserLaunch, ConvertTo-Ico, Resize-Png`. Later tasks add those names.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: `Passed: 8 Failed: 0`.
- [ ] **Step 5: Commit**: `git add launcher/TallioLauncher.psm1 launcher/tests/TallioLauncher.Tests.ps1`, message `feat(launcher): dev-server probe, wait and hidden start`.

---

### Task 2: Config + browser choice

**Files:** Modify `launcher/TallioLauncher.psm1` and `launcher/tests/TallioLauncher.Tests.ps1`.

**Interfaces — Produces:**
- `Write-TallioConfig -Path <string> -RepoPath <string> [-Url <string> = 'http://localhost:5173/']` writes `launcher.json` (UTF-8).
- `Read-TallioConfig -Path <string>` → a PSCustomObject with `repoPath` and `url`. It throws the exact **Config missing** copy if the file is absent.
- `Find-AppBrowser [-Candidates <string[]>]` → the first existing path, or `$null`. Default candidates, in order:
  - `$env:ProgramFiles\Google\Chrome\Application\chrome.exe`
  - `${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe`
  - `$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe`
  - `${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe`
  - `$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe`
- `Get-BrowserLaunch -BrowserPath <string|null> -Url <string>` → a hashtable to splat into `Start-Process`. It returns `@{ FilePath = $BrowserPath; ArgumentList = @("--app=$Url") }`, or `@{ FilePath = $Url }` (default browser) when `$BrowserPath` is null or empty.

- [ ] **Step 1: Write the failing tests**

```powershell
Describe 'Tallio config' {
    It 'round-trips repoPath and the default url' {
        Write-TallioConfig -Path "$TestDrive\launcher.json" -RepoPath 'C:\My Projects\tallio'
        $c = Read-TallioConfig -Path "$TestDrive\launcher.json"
        $c.repoPath | Should Be 'C:\My Projects\tallio'
        $c.url | Should Be 'http://localhost:5173/'
    }
    It 'explains how to set up when the config is missing' {
        { Read-TallioConfig -Path "$TestDrive\none.json" } | Should Throw "Tallio's launcher isn't set up yet"
    }
}

Describe 'Find-AppBrowser' {
    It 'returns the first candidate that exists' {
        New-Item "$TestDrive\edge.exe" -ItemType File | Out-Null
        Find-AppBrowser -Candidates @("$TestDrive\chrome.exe", "$TestDrive\edge.exe") | Should Be "$TestDrive\edge.exe"
    }
    It 'returns null when none exist' {
        Find-AppBrowser -Candidates @("$TestDrive\nope.exe") | Should BeNullOrEmpty
    }
}

Describe 'Get-BrowserLaunch' {
    It 'opens an app window when a browser was found' {
        $l = Get-BrowserLaunch -BrowserPath 'C:\chrome.exe' -Url 'http://localhost:5173/'
        $l.FilePath | Should Be 'C:\chrome.exe'
        $l.ArgumentList | Should Be '--app=http://localhost:5173/'
    }
    It 'falls back to the default browser' {
        $l = Get-BrowserLaunch -BrowserPath $null -Url 'http://localhost:5173/'
        $l.FilePath | Should Be 'http://localhost:5173/'
        $l.ContainsKey('ArgumentList') | Should Be $false
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL, "The term 'Write-TallioConfig' is not recognized".
- [ ] **Step 3: Implement the four functions** per the Interfaces block.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: `Passed: 14 Failed: 0`.
- [ ] **Step 5: Commit**: `feat(launcher): launcher config + app-window browser choice`.

---

### Task 3: Launch orchestration + `Start-Tallio.ps1`

**Files:**
- Modify: `launcher/TallioLauncher.psm1` and its tests
- Create: `launcher/Start-Tallio.ps1`

**Interfaces:**
- Consumes everything from Tasks 1 and 2.
- Produces `Invoke-TallioLaunch -Config <pscustomobject> -LogPath <string> [-TimeoutSeconds <int> = 30]`:
  1. If `Test-TallioServer` is false, it calls `Start-TallioServer`, then `Wait-TallioServer`. If the wait fails, it throws the exact **Timeout** copy, using `$TimeoutSeconds` and `$LogPath`.
  2. It then runs `$launch = Get-BrowserLaunch -BrowserPath (Find-AppBrowser) -Url $Config.url` followed by `Start-Process @launch`. Splatting needs a variable.
- Produces `Show-TallioError -Message <string>`, a `System.Windows.Forms.MessageBox` titled `Tallio` with the Error icon.
- `Start-Tallio.ps1` has no params. It imports `$PSScriptRoot\TallioLauncher.psm1`, then:

  ```powershell
  try {
      Invoke-TallioLaunch -Config (Read-TallioConfig "$PSScriptRoot\launcher.json") -LogPath "$PSScriptRoot\dev-server.log"
  } catch {
      Show-TallioError $_.Exception.Message
  }
  ```

- [ ] **Step 1: Write the failing tests**

```powershell
# Pester 3.x: Assert-MockCalled defaults to Describe scope, so every assertion here passes -Scope It.
Describe 'Invoke-TallioLaunch' {
    $cfg = [pscustomobject]@{ repoPath = 'C:\repo'; url = 'http://localhost:5173/' }
    Mock Find-AppBrowser { 'C:\chrome.exe' } -ModuleName TallioLauncher
    Mock Start-Process {} -ModuleName TallioLauncher
    Mock Start-TallioServer {} -ModuleName TallioLauncher

    It 'just opens the window when the server is already up' {
        Mock Test-TallioServer { $true } -ModuleName TallioLauncher
        Invoke-TallioLaunch -Config $cfg -LogPath 'C:\l.log'
        Assert-MockCalled Start-TallioServer -ModuleName TallioLauncher -Times 0 -Exactly -Scope It
        Assert-MockCalled Start-Process -ModuleName TallioLauncher -Times 1 -Exactly -Scope It -ParameterFilter {
            $FilePath -eq 'C:\chrome.exe' -and $ArgumentList -eq '--app=http://localhost:5173/' }
    }
    It 'starts the server first when it is down, then opens the window' {
        Mock Test-TallioServer { $false } -ModuleName TallioLauncher
        Mock Wait-TallioServer { $true } -ModuleName TallioLauncher
        Invoke-TallioLaunch -Config $cfg -LogPath 'C:\l.log'
        Assert-MockCalled Start-TallioServer -ModuleName TallioLauncher -Times 1 -Exactly -Scope It -ParameterFilter {
            $RepoPath -eq 'C:\repo' -and $LogPath -eq 'C:\l.log' }
        Assert-MockCalled Start-Process -ModuleName TallioLauncher -Times 1 -Exactly -Scope It
    }
    It 'throws the timeout message and opens no window when the server never comes up' {
        Mock Test-TallioServer { $false } -ModuleName TallioLauncher
        Mock Wait-TallioServer { $false } -ModuleName TallioLauncher
        { Invoke-TallioLaunch -Config $cfg -LogPath 'C:\l.log' } | Should Throw "Tallio didn't start within 30 seconds."
        Assert-MockCalled Start-Process -ModuleName TallioLauncher -Times 0 -Exactly -Scope It
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL, "Invoke-TallioLaunch is not recognized".
- [ ] **Step 3: Implement `Invoke-TallioLaunch` and `Show-TallioError`, and create `Start-Tallio.ps1`** per the Interfaces block.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: `Passed: 17 Failed: 0`.
- [ ] **Step 5: Commit**: add the module, tests and `launcher/Start-Tallio.ps1`. Message: `feat(launcher): launch orchestration + Start-Tallio entry script`.

---

### Task 4: Icon + installer + README

**Files:**
- Modify: `launcher/TallioLauncher.psm1` and its tests
- Create: `launcher/New-TallioIcon.ps1`, `launcher/Install-Launcher.ps1`, `launcher/tallio.ico` (generated)
- Modify: `README.md`, in the "Run the dev server" section around line 100

**Interfaces — Produces:**
- `ConvertTo-Ico -PngPaths <string[]> -OutPath <string>` writes a PNG-compressed ICO. It is an algorithm the tests don't fully determine, so here is the layout:
  - ICONDIR: `u16 0`, `u16 1`, `u16 count`.
  - One 16-byte ICONDIRENTRY per PNG: width `u8`, height `u8` (both `0` means 256), `u8 0` colors, `u8 0` reserved, `u16 1` planes, `u16 32` bpp, `u32` byte length, `u32` offset.
  - Then the raw PNG bytes, in order. All values are little-endian.
  - Read width and height from the PNG IHDR: big-endian `u32` at bytes 16 and 20.
- `Resize-Png -SourcePath <string> -OutPath <string> -Size <int>` uses System.Drawing with HighQualityBicubic, PixelFormat Format32bppArgb, and saves as PNG.
- `New-TallioShortcut -Path <string> -ScriptPath <string> -IconPath <string> -WorkingDirectory <string>` creates a `.lnk` via `WScript.Shell`. Target, arguments and WindowStyle follow Global Constraints. IconLocation is `"$IconPath,0"` and Description is `Open Tallio`.
- `Install-TallioLauncher -RepoPath <string> -InstallDir <string> -ShortcutDirs <string[]> [-Url <string> = 'http://localhost:5173/']` → `[string[]]` of the created shortcut paths. It:
  1. creates `InstallDir`;
  2. copies `Start-Tallio.ps1`, `TallioLauncher.psm1` and `tallio.ico` from `<RepoPath>\launcher`, overwriting;
  3. calls `Write-TallioConfig "<InstallDir>\launcher.json"`;
  4. calls `New-TallioShortcut "<dir>\Tallio.lnk"` for each dir.
- `New-TallioIcon.ps1` (dev tool, no params, run from anywhere):
  1. Write a temp HTML file that shows `public/icon.svg` at 256×256 with `border-radius: 22%` on a transparent background.
  2. Screenshot it: `chrome --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --window-size=256,256 --user-data-dir="$env:TEMP\tallio-icon-chrome" --screenshot=<png> <html>`, using `Start-Process -Wait`.
  3. Run `Resize-Png` to sizes 16, 24, 32, 48, 64 and 128.
  4. Run `ConvertTo-Ico` on all seven sizes into `launcher/tallio.ico`.
- `Install-Launcher.ps1` has `param([string]$RepoPath = (Split-Path $PSScriptRoot -Parent))`. It calls `Install-TallioLauncher` with `-InstallDir "$env:LOCALAPPDATA\Tallio"` and the Desktop and Programs folders, then prints each shortcut path and the line `Double-click Tallio on your Desktop to start.`

- [ ] **Step 1: Write the failing tests**

```powershell
function New-TestPng([string]$Path, [int]$Size) {
    Add-Type -AssemblyName System.Drawing
    $b = New-Object Drawing.Bitmap $Size, $Size; $b.Save($Path, [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
}

Describe 'ConvertTo-Ico' {
    It 'packs PNGs into a valid ICO directory' {
        New-TestPng "$TestDrive\16.png" 16; New-TestPng "$TestDrive\256.png" 256
        ConvertTo-Ico -PngPaths "$TestDrive\16.png", "$TestDrive\256.png" -OutPath "$TestDrive\t.ico"
        $b = [IO.File]::ReadAllBytes("$TestDrive\t.ico")
        [BitConverter]::ToUInt16($b, 2) | Should Be 1          # type = icon
        [BitConverter]::ToUInt16($b, 4) | Should Be 2          # count
        $b[6] | Should Be 16                                    # entry 0 width
        $b[6 + 16] | Should Be 0                                # entry 1 width 256 -> 0
        $off = [BitConverter]::ToUInt32($b, 6 + 16 + 12)
        $b[($off + 1)..($off + 3)] -join ',' | Should Be '80,78,71'   # 'PNG' signature at entry 1's offset
        $len16 = (Get-Item "$TestDrive\16.png").Length; $len256 = (Get-Item "$TestDrive\256.png").Length
        $b.Length | Should Be (6 + 32 + $len16 + $len256)
    }
}

Describe 'Resize-Png' {
    It 'writes a PNG of the requested size' {
        New-TestPng "$TestDrive\src.png" 256
        Resize-Png -SourcePath "$TestDrive\src.png" -OutPath "$TestDrive\32.png" -Size 32
        $i = [Drawing.Image]::FromFile("$TestDrive\32.png"); try { $i.Width | Should Be 32 } finally { $i.Dispose() }
    }
}

Describe 'Install-TallioLauncher' {
    It 'copies runtime files, records the repo, and creates a hidden-PowerShell shortcut' {
        $repo = "$TestDrive\my repo"; New-Item "$repo\launcher" -ItemType Directory | Out-Null
        'Start-Tallio.ps1', 'TallioLauncher.psm1', 'tallio.ico' | ForEach-Object { Set-Content "$repo\launcher\$_" 'x' }
        $inst = "$TestDrive\App Data\Tallio"; $desk = "$TestDrive\Desk"; New-Item $desk -ItemType Directory | Out-Null

        $made = Install-TallioLauncher -RepoPath $repo -InstallDir $inst -ShortcutDirs @($desk)

        $made | Should Be "$desk\Tallio.lnk"
        'Start-Tallio.ps1', 'TallioLauncher.psm1', 'tallio.ico' | ForEach-Object { "$inst\$_" | Should Exist }
        (Read-TallioConfig "$inst\launcher.json").repoPath | Should Be $repo
        $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut("$desk\Tallio.lnk")
        $lnk.TargetPath | Should Match 'WindowsPowerShell\\v1\.0\\powershell\.exe$'
        $lnk.Arguments | Should Be "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$inst\Start-Tallio.ps1`""
        $lnk.IconLocation | Should Be "$inst\tallio.ico,0"
        $lnk.WindowStyle | Should Be 7
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL, "ConvertTo-Ico is not recognized".
- [ ] **Step 3: Implement the four module functions, then create the two scripts** per the Interfaces block.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: `Passed: 20 Failed: 0`.
- [ ] **Step 5: Generate the icon.** Run `powershell -NoProfile -ExecutionPolicy Bypass -File launcher/New-TallioIcon.ps1`. Then Read the 256 PNG it rendered (the script prints the temp path). Check that it is 256×256 with transparent rounded corners and the gold tally centered. If headless Chrome ignores `--window-size` or the transparency flag, fix it in the script and re-run.
- [ ] **Step 6: Update the README.** Under "Run the dev server", add a `### Desktop shortcut (Windows)` subsection. It should say:
  - run `powershell -ExecutionPolicy Bypass -File launcher\Install-Launcher.ps1` once, and again if the folder moves;
  - this adds Tallio to the Desktop and Start menu, and it can be pinned to the taskbar from Start;
  - the server keeps running in the background until sign-out, so `npm run dev` reports "port in use" while it runs;
  - the log is at `%LOCALAPPDATA%\Tallio\dev-server.log`;
  - to remove it, delete the two shortcuts and `%LOCALAPPDATA%\Tallio`.
- [ ] **Step 7: Commit**: add the module, tests, `launcher/New-TallioIcon.ps1`, `launcher/Install-Launcher.ps1`, `launcher/tallio.ico` and `README.md`. Message: `feat(launcher): Tallio icon, one-time installer, README`.

---

### Task 5: Real install + smoke test (manual, no code unless a defect turns up)

- [ ] **Step 1:** Run `powershell -NoProfile -ExecutionPolicy Bypass -File launcher/Install-Launcher.ps1`. Expected: it prints `...\OneDrive\Desktop\Tallio.lnk` and `...\Start Menu\Programs\Tallio.lnk`.
- [ ] **Step 2: Cold start.** Stop any server on 5173 (`Get-NetTCPConnection -LocalPort 5173 -State Listen` → stop its owning `node` process). Run the shortcut with `Start-Process "$([Environment]::GetFolderPath('Desktop'))\Tallio.lnk"`. Expected:
  - within about 5 s, a Chrome app window shows Tallio with the user's existing data;
  - no console window stays open;
  - `dev-server.log` shows Vite `Local: http://localhost:5173/`.
- [ ] **Step 3: IPv6 check (Review Focus 4).** With the server up, `Import-Module launcher/TallioLauncher.psm1; Test-TallioServer -Url 'http://localhost:5173/'` returns `True`. Also run `Get-NetTCPConnection -LocalPort 5173 -State Listen` and note whether Vite is on `::1`, `127.0.0.1` or both.
- [ ] **Step 4: Warm start.** Run the shortcut again. Expected: a second app window opens in under about 2 s, and only one `node` process is listening on 5173.
- [ ] **Step 5: Failure path.** Temporarily point `launcher.json`'s `repoPath` at a non-existent folder and run the shortcut with the server stopped. Expected: the **Repo missing** message box. Restore it by re-running the installer.
- [ ] **Step 6:** Ask the user to double-click the Desktop icon themselves, and check that the icon looks right and their data is there.
- [ ] **Step 7:** Finish the branch with superpowers:finishing-a-development-branch.
