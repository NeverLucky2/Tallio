# What the Tallio shortcut runs (from %LOCALAPPDATA%\Tallio\, put there by Install-Launcher.ps1).
# Starts the dev server hidden if needed, then opens Tallio in its own app window.
Import-Module (Join-Path $PSScriptRoot 'TallioLauncher.psm1') -Force
try {
    Invoke-TallioLaunch -Config (Read-TallioConfig (Join-Path $PSScriptRoot 'launcher.json')) `
        -LogPath (Join-Path $PSScriptRoot 'dev-server.log')
} catch {
    Show-TallioError $_.Exception.Message
}
