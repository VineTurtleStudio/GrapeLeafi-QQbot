$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$clientDir = Join-Path $root "client"

$stopScript = Join-Path $PSScriptRoot "stop-client.ps1"
if (Test-Path -LiteralPath $stopScript) {
    & $stopScript -Quiet
}

Push-Location $clientDir
try {
    & node "src\main.js"
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "客户端异常退出，退出码 $LASTEXITCODE" -ForegroundColor Red
    }
} catch {
    Write-Host "启动失败: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Pop-Location
}