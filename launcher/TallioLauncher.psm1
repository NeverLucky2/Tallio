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

Export-ModuleMember -Function *-Tallio*, *-AppBrowser, *-BrowserLaunch, ConvertTo-Ico, Resize-Png
