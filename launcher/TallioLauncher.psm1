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

Export-ModuleMember -Function *-Tallio*, *-AppBrowser, *-BrowserLaunch, ConvertTo-Ico, Resize-Png
