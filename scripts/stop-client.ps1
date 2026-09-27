param(
    [switch]$Quiet
)

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot

function Get-ClientPids {
    $ports = @(8181, 9632)
    $cfgPath = Join-Path $root "client\config.json"
    if (Test-Path -LiteralPath $cfgPath) {
        try {
            $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($cfg.gateway.port) { $ports += [int]$cfg.gateway.port }
            if ($cfg.console.port) { $ports += [int]$cfg.console.port }
        } catch {}
    }

    $found = @()
    foreach ($p in ($ports | Sort-Object -Unique)) {
        $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            if ($c.OwningProcess) { $found += [int]$c.OwningProcess }
        }
    }

    $nodeProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($proc in $nodeProcs) {
        $cl = $proc.CommandLine
        if ($cl -and $cl -match 'main\.js' -and $cl -notmatch 'node_modules') {
            $found += [int]$proc.ProcessId
        }
    }

    return ($found | Sort-Object -Unique)
}

$targets = @(Get-ClientPids)
if ($targets.Count -eq 0) {
    if (-not $Quiet) { Write-Host "没有正在运行的客户端实例。" -ForegroundColor Yellow }
    exit 0
}

foreach ($procId in $targets) {
    if (-not $Quiet) { Write-Host "正在关闭客户端进程 PID $procId ..." -ForegroundColor Yellow }
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 600

$left = @(Get-ClientPids)
if ($left.Count -eq 0) {
    if (-not $Quiet) { Write-Host "已关闭全部客户端实例。" -ForegroundColor Green }
    exit 0
}
if (-not $Quiet) { Write-Host "仍有进程未关闭: $($left -join ', ')" -ForegroundColor Red }
exit 0
