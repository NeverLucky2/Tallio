# What the Tallio shortcut runs (from %LOCALAPPDATA%\Tallio\, put there by Install-Launcher.ps1).
# Starts the dev server hidden if needed, then opens Tallio in its own app window.
# Every failure ends in a message — a hidden launcher must never fail silently.
param(
    # How to tell the user about a failure. Defaults to a message box; tests pass a capture.
    [scriptblock]$Notify
)

try {
    Import-Module (Join-Path $PSScriptRoot 'TallioLauncher.psm1') -Force -ErrorAction Stop
} catch {
    $msg = "Tallio's launcher files are missing or damaged. Run launcher\Install-Launcher.ps1 again from the Tallio project folder."
    if ($Notify) { & $Notify $msg; return }
    # The module (and its Show-TallioError) didn't load, so show a plain box directly.
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
    [void][System.Windows.Forms.MessageBox]::Show($owner, $msg, 'Tallio', 'OK', 'Error')
    $owner.Dispose()
    return
}

if (-not $Notify) { $Notify = { param($m) Show-TallioError $m } }
try {
    Invoke-TallioLaunch -Config (Read-TallioConfig (Join-Path $PSScriptRoot 'launcher.json')) `
        -LogPath (Join-Path $PSScriptRoot 'dev-server.log')
} catch {
    & $Notify $_.Exception.Message
}
