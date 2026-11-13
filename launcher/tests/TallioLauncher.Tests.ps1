# Pester 3.4 (ships with Windows PowerShell 5.1). Run from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester -Script launcher/tests/TallioLauncher.Tests.ps1 -EnableExit"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here '..\TallioLauncher.psm1') -Force

function Get-FreePort {
    $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $l.Start()
    $p = $l.LocalEndpoint.Port; $l.Stop(); $p
}

# HttpListener answering every request with $Status from a background runspace.
# Returns the listener; .Close() it in `finally` — that unblocks GetContext() so the runspace exits
# (PowerShell.Stop() would hang on the blocking native call).
function Start-FakeServer([int]$Port, [int]$Status, [string]$Body = '') {
    $h = New-Object Net.HttpListener; $h.Prefixes.Add("http://localhost:$Port/"); $h.Start()
    $null = [powershell]::Create().AddScript({
        param($h, $status, $body)
        while ($h.IsListening) {
            try {
                $c = $h.GetContext(); $c.Response.StatusCode = $status
                $bytes = [Text.Encoding]::UTF8.GetBytes($body)
                $c.Response.OutputStream.Write($bytes, 0, $bytes.Length); $c.Response.Close()
            } catch { break }
        }
    }).AddArgument($h).AddArgument($Status).AddArgument($Body).BeginInvoke()
    $h
}

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

Describe 'Test-TallioPage' {
    It 'is true when the page is Tallio' {
        $port = Get-FreePort; $srv = Start-FakeServer $port 200 '<html><head><title>Tallio</title></head></html>'
        try { Test-TallioPage -Url "http://localhost:$port/" | Should Be $true } finally { $srv.Close() }
    }
    It 'is false when some other app is on the port' {
        $port = Get-FreePort; $srv = Start-FakeServer $port 200 '<html><head><title>Other Vite App</title></head></html>'
        try { Test-TallioPage -Url "http://localhost:$port/" | Should Be $false } finally { $srv.Close() }
    }
    It 'is false when nothing listens' {
        Test-TallioPage -Url "http://localhost:$(Get-FreePort)/" | Should Be $false
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
    # Pester 3.x scopes mocks to the enclosing Describe/Context, so isolate this one.
    Context 'npm is not on PATH' {
        It 'throws when npm is missing' {
            Set-Content "$TestDrive\package.json" '{}'
            Mock Get-Command { $null } -ModuleName TallioLauncher -ParameterFilter { $Name -eq 'npm.cmd' }
            { Start-TallioServer -RepoPath $TestDrive -LogPath "$TestDrive\l.log" } | Should Throw "Couldn't find npm"
        }
    }
    It 'starts npm run dev hidden in the repo, logging to a quoted path with spaces' {
        Set-Content "$TestDrive\package.json" '{}'
        Mock Start-Process {} -ModuleName TallioLauncher
        $log = "$TestDrive\App Data\Tallio\dev-server.log"
        Start-TallioServer -RepoPath $TestDrive -LogPath $log
        Test-Path (Split-Path $log) | Should Be $true
        Assert-MockCalled Start-Process -ModuleName TallioLauncher -Times 1 -Exactly -Scope It -ParameterFilter {
            $WindowStyle -eq 'Hidden' -and $WorkingDirectory -eq $TestDrive -and
            ($ArgumentList -join ' ') -eq "/c npm run dev > `"$log`" 2>&1"
        }
    }
}

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

# Pester 3.x: Assert-MockCalled defaults to Describe scope, so every assertion here passes -Scope It.
Describe 'Invoke-TallioLaunch' {
    $cfg = [pscustomobject]@{ repoPath = 'C:\repo'; url = 'http://localhost:5173/' }
    Mock Find-AppBrowser { 'C:\chrome.exe' } -ModuleName TallioLauncher
    Mock Start-Process {} -ModuleName TallioLauncher
    Mock Start-TallioServer {} -ModuleName TallioLauncher
    Mock Test-TallioPage { $true } -ModuleName TallioLauncher

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
    Context 'another app already holds the port' {
        It 'refuses to open that app in the Tallio window' {
            Mock Test-TallioServer { $true } -ModuleName TallioLauncher
            Mock Test-TallioPage { $false } -ModuleName TallioLauncher
            { Invoke-TallioLaunch -Config $cfg -LogPath 'C:\l.log' } | Should Throw 'Something else is already using port 5173'
            Assert-MockCalled Start-Process -ModuleName TallioLauncher -Times 0 -Exactly -Scope It
        }
    }
}

Describe 'New-TallioDialogOwner' {
    It 'is a topmost owner so the error box cannot open behind other windows' {
        $f = New-TallioDialogOwner
        try { $f.TopMost | Should Be $true; $f.ShowInTaskbar | Should Be $false } finally { $f.Dispose() }
    }
}

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

# Keep last: it unloads the module to simulate a damaged install, then re-imports it.
Describe 'Start-Tallio.ps1' {
    It 'reports damaged launcher files instead of failing silently' {
        $inst = "$TestDrive\inst"; New-Item $inst -ItemType Directory | Out-Null
        Copy-Item (Join-Path $here '..\Start-Tallio.ps1') $inst   # no TallioLauncher.psm1 beside it
        $state = @{ msg = $null }
        $notify = { param($m) $state.msg = $m }.GetNewClosure()
        Remove-Module TallioLauncher -Force
        try { & "$inst\Start-Tallio.ps1" -Notify $notify 2>$null } catch { }
        finally { Import-Module (Join-Path $here '..\TallioLauncher.psm1') -Force }
        $state.msg | Should Match 'missing or damaged'
    }
}
