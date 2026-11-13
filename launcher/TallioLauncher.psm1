# TallioLauncher — double-click launcher for the Tallio dev server (Windows PowerShell 5.1).
# All user data lives in the browser at http://localhost:5173/, so the launcher never changes
# port, host, or browser profile. See docs/superpowers/specs/2026-11-13-desktop-launcher-design.md.

# --- Dev server ----------------------------------------------------------------------------

function Test-TallioServer {
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$Url,
        [int]$TimeoutMilliseconds = 2000
    )
    $req = [Net.HttpWebRequest]::Create($Url)
    $req.Proxy = $null
    $req.Timeout = $TimeoutMilliseconds
    try {
        $req.GetResponse().Close()
        return $true
    } catch [Net.WebException] {
        # Any HTTP answer (404, 500…) still means something is serving; no response means down.
        if ($_.Exception.Response) { $_.Exception.Response.Close(); return $true }
        return $false
    }
}

function Wait-TallioServer {
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$Url,
        [int]$TimeoutSeconds = 30,
        [int]$IntervalMilliseconds = 500,
        [scriptblock]$Probe = { Test-TallioServer -Url $Url }
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        if (& $Probe) { return $true }
        if ((Get-Date) -ge $deadline) { return $false }
        Start-Sleep -Milliseconds $IntervalMilliseconds
    }
}

function Start-TallioServer {
    param(
        [Parameter(Mandatory)][string]$RepoPath,
        [Parameter(Mandatory)][string]$LogPath
    )
    if (-not (Test-Path -LiteralPath (Join-Path $RepoPath 'package.json'))) {
        throw "Couldn't find the Tallio project at $RepoPath. If you moved it, run launcher\Install-Launcher.ps1 again from its new location."
    }
    if (-not (Get-Command -Name 'npm.cmd' -ErrorAction SilentlyContinue)) {
        throw "Couldn't find npm. Is Node.js installed?"
    }
    $logDir = Split-Path -Parent $LogPath
    if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Start-Process -FilePath $env:ComSpec `
        -ArgumentList "/c npm run dev > `"$LogPath`" 2>&1" `
        -WorkingDirectory $RepoPath -WindowStyle Hidden
}

# --- Config --------------------------------------------------------------------------------

function Write-TallioConfig {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$RepoPath,
        [string]$Url = 'http://localhost:5173/'
    )
    [pscustomobject]@{ repoPath = $RepoPath; url = $Url } |
        ConvertTo-Json | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Read-TallioConfig {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Tallio's launcher isn't set up yet. Run launcher\Install-Launcher.ps1 from the Tallio project folder."
    }
    Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

# --- Browser -------------------------------------------------------------------------------

function Find-AppBrowser {
    param(
        # Chrome first (the user's default browser and where their data lives), then Edge.
        [string[]]$Candidates = @(
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
        )
    )
    foreach ($c in $Candidates) { if (Test-Path -LiteralPath $c) { return $c } }
    return $null
}

# Returns a hashtable to splat into Start-Process. No --user-data-dir / --profile-directory:
# the app window must use the default profile, where Tallio's localStorage lives.
function Get-BrowserLaunch {
    param(
        [AllowNull()][AllowEmptyString()][string]$BrowserPath,
        [Parameter(Mandatory)][string]$Url
    )
    if ([string]::IsNullOrEmpty($BrowserPath)) { return @{ FilePath = $Url } }
    return @{ FilePath = $BrowserPath; ArgumentList = @("--app=$Url") }
}

# --- Launch --------------------------------------------------------------------------------

# Start the dev server if it isn't already answering, then open Tallio in an app window.
# Throws (with user-facing copy) on any failure; Start-Tallio.ps1 turns that into a message box.
function Invoke-TallioLaunch {
    param(
        [Parameter(Mandatory)][pscustomobject]$Config,
        [Parameter(Mandatory)][string]$LogPath,
        [int]$TimeoutSeconds = 30
    )
    if (-not (Test-TallioServer -Url $Config.url)) {
        Start-TallioServer -RepoPath $Config.repoPath -LogPath $LogPath
        if (-not (Wait-TallioServer -Url $Config.url -TimeoutSeconds $TimeoutSeconds)) {
            throw "Tallio didn't start within $TimeoutSeconds seconds.`n`nDetails are in:`n$LogPath"
        }
    }
    $launch = Get-BrowserLaunch -BrowserPath (Find-AppBrowser) -Url $Config.url
    Start-Process @launch
}

function Show-TallioError {
    param([Parameter(Mandatory)][string]$Message)
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
        $Message, 'Tallio',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error)
}

# --- Icon (dev-time: used by New-TallioIcon.ps1) ----------------------------------------------

# Packs PNG files into a PNG-compressed .ico (supported since Windows Vista).
# Layout: ICONDIR (reserved 0, type 1, count) + one 16-byte ICONDIRENTRY per image + raw PNG bytes.
function ConvertTo-Ico {
    param(
        [Parameter(Mandatory)][string[]]$PngPaths,
        [Parameter(Mandatory)][string]$OutPath
    )
    $images = @($PngPaths | ForEach-Object { , [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $_).Path) })
    $stream = New-Object IO.MemoryStream
    $w = New-Object IO.BinaryWriter($stream)
    $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($png in $images) {
        # IHDR width/height: big-endian u32 at bytes 16 and 20. 256 is stored as 0.
        $width  = ([int]$png[16] -shl 24) -bor ([int]$png[17] -shl 16) -bor ([int]$png[18] -shl 8) -bor [int]$png[19]
        $height = ([int]$png[20] -shl 24) -bor ([int]$png[21] -shl 16) -bor ([int]$png[22] -shl 8) -bor [int]$png[23]
        $w.Write([byte]($width % 256)); $w.Write([byte]($height % 256))
        $w.Write([byte]0); $w.Write([byte]0)              # palette colors, reserved
        $w.Write([uint16]1); $w.Write([uint16]32)         # planes, bits per pixel
        $w.Write([uint32]$png.Length); $w.Write([uint32]$offset)
        $offset += $png.Length
    }
    foreach ($png in $images) { $w.Write($png) }
    $w.Flush()
    [IO.File]::WriteAllBytes($OutPath, $stream.ToArray())
    $w.Dispose()
}

function Resize-Png {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$OutPath,
        [Parameter(Mandatory)][int]$Size
    )
    Add-Type -AssemblyName System.Drawing
    $src = [Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourcePath).Path)
    $dst = New-Object Drawing.Bitmap($Size, $Size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($dst)
    try {
        $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.DrawImage($src, 0, 0, $Size, $Size)
        $dst.Save($OutPath, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $g.Dispose(); $dst.Dispose(); $src.Dispose()
    }
}

# --- Install -------------------------------------------------------------------------------

function New-TallioShortcut {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string]$IconPath,
        [Parameter(Mandatory)][string]$WorkingDirectory
    )
    $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($Path)
    $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
    $lnk.WorkingDirectory = $WorkingDirectory
    $lnk.IconLocation = "$IconPath,0"
    $lnk.WindowStyle = 7   # minimized, so the console never flashes up before -WindowStyle Hidden applies
    $lnk.Description = 'Open Tallio'
    $lnk.Save()
}

# Copies the runtime files out of the repo (so branch switches can't break the shortcut),
# records where the repo is, and creates a Tallio.lnk in each shortcut folder.
function Install-TallioLauncher {
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)][string]$RepoPath,
        [Parameter(Mandatory)][string]$InstallDir,
        [Parameter(Mandatory)][string[]]$ShortcutDirs,
        [string]$Url = 'http://localhost:5173/'
    )
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    foreach ($f in 'Start-Tallio.ps1', 'TallioLauncher.psm1', 'tallio.ico') {
        Copy-Item -LiteralPath (Join-Path $RepoPath "launcher\$f") -Destination (Join-Path $InstallDir $f) -Force
    }
    Write-TallioConfig -Path (Join-Path $InstallDir 'launcher.json') -RepoPath $RepoPath -Url $Url
    foreach ($dir in $ShortcutDirs) {
        $lnk = Join-Path $dir 'Tallio.lnk'
        New-TallioShortcut -Path $lnk -ScriptPath (Join-Path $InstallDir 'Start-Tallio.ps1') `
            -IconPath (Join-Path $InstallDir 'tallio.ico') -WorkingDirectory $InstallDir
        $lnk
    }
}

Export-ModuleMember -Function *-Tallio*, *-AppBrowser, *-BrowserLaunch, ConvertTo-Ico, Resize-Png
