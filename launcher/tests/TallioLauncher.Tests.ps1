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
