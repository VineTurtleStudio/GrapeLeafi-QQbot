param(
    [long]$QQ = -1
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath (Join-Path $root "client\node_modules"))) {
    Write-Host "检测到缺少依赖，正在安装依赖(ws / @napi-rs/canvas)…" -ForegroundColor Yellow
    Push-Location (Join-Path $root "client")
    try {
        & npm.cmd install --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { exit 1 }
    } finally { Pop-Location }
}

Write-Host "[1/2] 启动 Node 客户端 (反向 WS 服务端 127.0.0.1:8181)…" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start-client.ps1")

Start-Sleep -Seconds 2
Write-Host "[2/2] 启动 NapCat 协议端 (本窗口将显示 QQ 登录/日志)…" -ForegroundColor Green
$args = @("-File", (Join-Path $PSScriptRoot "start-napcat.ps1"))
if ($QQ -gt 0) { $args += "-QQ"; $args += $QQ }
& powershell -NoProfile -ExecutionPolicy Bypass @args