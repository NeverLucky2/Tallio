# One-time setup: puts a Tallio shortcut on the Desktop and in the Start menu.
# Re-run it if you move the project folder. Usage, from the project folder:
#   powershell -ExecutionPolicy Bypass -File launcher\Install-Launcher.ps1
param([string]$RepoPath = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TallioLauncher.psm1') -Force

$made = Install-TallioLauncher -RepoPath (Resolve-Path -LiteralPath $RepoPath).Path `
    -InstallDir (Join-Path $env:LOCALAPPDATA 'Tallio') `
    -ShortcutDirs @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
$made | ForEach-Object { "Created $_" }
'Double-click Tallio on your Desktop to start.'
