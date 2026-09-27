param(
    [string]$Version = "v4.18.28",
    [switch]$OneKey
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "bot"
$targetDir = Join-Path $dest "napcat"
$asset = if ($OneKey) { "NapCat.Shell.Windows.OneKey.zip" } else { "NapCat.Shell.zip" }

if (Test-Path -LiteralPath (Join-Path $targetDir "NapCatWinBootMain.exe")) {
    Write-Host "已存在 NapCat，跳过下载。(如需强制重装，请先删除 bot\napcat)" -ForegroundColor Yellow
    exit 0
}

Write-Host "正在下载 NapCat $Version / $asset (镜像 ghfast.top)…" -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$zip = Join-Path $dest $asset
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri "https://ghfast.top/https://github.com/NapNeko/NapCatQQ/releases/download/$Version/$asset" -OutFile $zip -Headers @{ "User-Agent" = "opencode" } -TimeoutSec 300
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Expand-Archive -Path $zip -DestinationPath $targetDir -Force
Remove-Item $zip -Force

if ($OneKey) {
    Write-Host "一键包已就绪。请运行 bot\napcat 下的 NapCatInstaller.exe 完成 QQ+NapCat 自动部署。" -ForegroundColor Green
} else {
    Write-Host "NapCat Shell 已就绪 (bot\napcat)。" -ForegroundColor Green
    Write-Host "前提: 本机已安装 QQ 桌面版 (建议 9.9.22-40990 及以上, 见 bot\napcat\qqnt.json)。" -ForegroundColor Yellow
    Write-Host "下一步: .\scripts\start-all.ps1" -ForegroundColor Green
    Write-Host "提示: 若本机还没有 QQ，可用 .\scripts\download-napcat.ps1 -OneKey 获取官方一键包。" -ForegroundColor Yellow
}