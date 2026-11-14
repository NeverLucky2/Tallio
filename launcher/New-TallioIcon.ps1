# Dev tool: renders public/icon.svg into launcher/tallio.ico (16–256 px, rounded corners).
# Re-run only if the logo changes; the generated .ico is committed.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TallioLauncher.psm1') -Force

$svg = Join-Path (Split-Path $PSScriptRoot -Parent) 'public\icon.svg'
$browser = Find-AppBrowser
if (-not $browser) { throw 'Chrome or Edge is needed to render the icon.' }

$work = Join-Path $env:TEMP 'tallio-icon'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$html = Join-Path $work 'icon.html'
$png256 = Join-Path $work 'icon-256.png'
Remove-Item -LiteralPath $png256 -ErrorAction SilentlyContinue

Set-Content -LiteralPath $html -Encoding UTF8 -Value (
    "<!doctype html><html><body style='margin:0;background:transparent'>" +
    "<img src='$(([Uri]$svg).AbsoluteUri)' style='display:block;width:256px;height:256px;border-radius:22%'>" +
    "</body></html>")

# Separate --user-data-dir so the headless render never touches the real Chrome profile.
Start-Process -FilePath $browser -Wait -ArgumentList @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--default-background-color=00000000', '--window-size=256,256',
    "--user-data-dir=`"$work\chrome-profile`"", "--screenshot=`"$png256`"",
    ([Uri]$html).AbsoluteUri)
if (-not (Test-Path -LiteralPath $png256)) { throw "The browser didn't write $png256" }

$pngs = foreach ($size in 16, 24, 32, 48, 64, 128) {
    $p = Join-Path $work "icon-$size.png"
    Resize-Png -SourcePath $png256 -OutPath $p -Size $size
    $p
}
$ico = Join-Path $PSScriptRoot 'tallio.ico'
ConvertTo-Ico -PngPaths (@($pngs) + $png256) -OutPath $ico
"Rendered: $png256"
"Wrote:    $ico"
