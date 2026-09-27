param(
    [long]$QQ = -1,
    [string]$Mode = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "bot\napcat"
$bats = @(
    "launcher.bat",
    "launcher-win10.bat",
    "NapCatWinBootMain.exe"
)
foreach ($f in $bats) {
    if (-not (Test-Path -LiteralPath (Join-Path $dir $f))) {
        Write-Host "缺少 NapCat 文件，请先运行 .\scripts\download-napcat.ps1" -ForegroundColor Red
        exit 1
    }
}

# ---- 登录方式：命令行 > client/config.json 的 bot.napcat.mode > 扫码（默认）----
# 约定：所有个人信息只填 client/config.json 一个文件，这里只读不写。
function Read-NapCatLogin {
    $cfgPath = Join-Path $root "client\config.json"
    $result = @{ mode = ""; qq = ""; password = ""; webuiPort = 6099 }
    if (-not (Test-Path -LiteralPath $cfgPath)) { return $result }
    try {
        $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Host "读 client/config.json 失败，改用扫码登录: $($_.Exception.Message)" -ForegroundColor Yellow
        return $result
    }
    if ($cfg.bot -and $cfg.bot.napcat) {
        $n = $cfg.bot.napcat
        if ($n.mode) { $result.mode = [string]$n.mode }
        if ($n.qq -and [string]$n.qq -notmatch '^\*+$') { $result.qq = [string]$n.qq }
        if ($n.password -and [string]$n.password -notmatch '^\*+$') { $result.password = [string]$n.password }
        if ($n.webuiPort) { $result.webuiPort = [int]$n.webuiPort }
    }
    return $result
}

$login = Read-NapCatLogin
if (-not $Mode) { $Mode = $login.mode }
if (-not $Mode) { $Mode = "qr" }
$Mode = $Mode.ToLower()

# 参数里给了 -QQ 就等于选了 quick
if ($QQ -gt 0 -and $Mode -eq "qr") { $Mode = "quick" }

$admin = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $admin) {
    Write-Host "NapCat 需要管理员权限注入 QQ，正在请求提权 (请在弹出的 UAC 窗口点击“是”)…" -ForegroundColor Yellow
    $argList = @("-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
    if ($QQ -gt 0) { $argList += "-QQ"; $argList += $QQ }
    if ($Mode) { $argList += "-Mode"; $argList += $Mode }
    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argList
    } catch {
        Write-Host "提权失败: $($_.Exception.Message)（UAC 被取消或受限）。请右键以管理员身份运行 start.bat。" -ForegroundColor Red
        exit 1
    }
    Write-Host "已在新的管理员窗口启动 NapCat，本窗口可关闭。" -ForegroundColor Green
    exit 0
}

if (-not (Get-ItemProperty -Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\QQ" -Name UninstallString -ErrorAction SilentlyContinue)) {
    Write-Host "未检测到已安装的 QQ 桌面版（NTQQ）。请先安装 QQ，或有更新需求可改用官方一键包。" -ForegroundColor Yellow
    Write-Host "下载 QQ: https://im.qq.com" -ForegroundColor Yellow
    exit 1
}

$release = [System.Environment]::OSVersion.Version
$launcher = if ($release.Build -ge 22000) { "launcher.bat" } else { "launcher-win10.bat" }
$full = Join-Path $dir $launcher

Write-Host "登录方式: $Mode" -ForegroundColor Cyan

switch ($Mode) {
    "quick" {
        $target = if ($QQ -gt 0) { $QQ } elseif ($login.qq) { $login.qq } else { 0 }
        if ($target -le 0) {
            Write-Host "快速登录需要填 QQ 号：请在 client/config.json 的 bot.napcat.qq 里填上，或用 start-napcat.bat -QQ <号码>。" -ForegroundColor Red
            Write-Host "该号必须至少扫码登录过一次，否则没有可用的登录态。" -ForegroundColor Yellow
            Write-Host "本次回退到扫码登录。" -ForegroundColor Yellow
            $Mode = "qr"
        } else {
            Write-Host "使用快速登录 -q $target (需该号在本机 QQ 登录过)" -ForegroundColor Yellow
        }
    }
    "password" {
        if (-not $login.password) {
            Write-Host "密码登录模式但 bot.napcat.password 是空的，本次回退到扫码登录。" -ForegroundColor Yellow
            $Mode = "qr"
        } else {
            Write-Host "=========================================================" -ForegroundColor Red
            Write-Host " 账号密码登录：风控风险明显更高，请先读完再决定" -ForegroundColor Red
            Write-Host "---------------------------------------------------------" -ForegroundColor Red
            Write-Host " * 腾讯对密码登录的风控远严于扫码，常见直接要求" -ForegroundColor Yellow
            Write-Host "   「需要验证码」或「需要新设备验证」，这两种都必须" -ForegroundColor Yellow
            Write-Host "   人工在 NapCat 管理页完成，程序无法自动绕过。" -ForegroundColor Yellow
            Write-Host " * 密码以明文存在 client/config.json 里。该文件一旦泄露" -ForegroundColor Yellow
            Write-Host "   等于 QQ 被别人直接接管。" -ForegroundColor Yellow
            Write-Host " * 优先级建议：quick（免扫码、风险低）> qr（最稳）> password" -ForegroundColor Yellow
            Write-Host "=========================================================" -ForegroundColor Red
            Write-Host "请在 NapCat 管理页完成登录: http://127.0.0.1:$($login.webuiPort)" -ForegroundColor Cyan
            Write-Host "若被风控要求验证码/新设备验证，请在该页面人工完成。" -ForegroundColor Yellow
        }
    }
    "qr" {
        Write-Host "扫码登录（默认方式，风控风险最低）。" -ForegroundColor Yellow
    }
    default {
        Write-Host "未知的登录方式 '$Mode'，按 qr 处理。允许值: qr / quick / password" -ForegroundColor Yellow
        $Mode = "qr"
    }
}

Write-Host "正在启动 NapCat (协议端, 管理员模式, $launcher)…" -ForegroundColor Green
if ($Mode -eq "quick" -and $target -gt 0) {
    Push-Location $dir
    try {
        & cmd.exe /c "`"$full`" -q $target"
    } finally { Pop-Location }
} else {
    Write-Host "启动后请在 QQ 客户端窗口扫码登录 bot 账号。" -ForegroundColor Yellow
    Push-Location $dir
    try {
        & cmd.exe /c "`"$full`""
    } finally { Pop-Location }
}
