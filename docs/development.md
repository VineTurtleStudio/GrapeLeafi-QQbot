# 开发指南（简短版）

面向想改代码的人。跑起来的方式见根目录 README；本文只讲「怎么改」。

## 目录速览

```
client/src/main.js          入口：读配置、装插件、起网关/控制台
client/src/brain.js         消息处理核心（指令分发、AI、关键词）
client/src/commands/        ★ 指令插件目录：每个 .js 自动注册一条指令
client/src/builtins/        内置指令（签到/抽卡/管理等，按类型分文件）
client/src/console/         控制台页面（单页应用，拼接 page/*.js）
launcher/                   C# 启动器（WinForms，csc 直接编译）
scripts/dev.ps1             开发模式：热重载启动客户端
scripts/build-launcher.ps1  编译启动器
```

## 如何加一条指令（三选一）

### 1. 不改代码：控制台「预设指令」
控制台 → 预设指令 → 添加。支持固定回复、正则、API 转发。零重启，立即生效。

### 2. 插件（推荐的代码方式）
在 `client/src/commands/` 下新建一个 `.js`，重启客户端（或用 dev.ps1 自动重启）即可：

```js
export function commands(ctx) {
  return {
    指令名: {
      aliases: ["别名"],           // 可选
      category: "插件",            // 可选，控制台分组
      description: "帮助里的一句话", // 可选
      cooldownSec: 5,              // 可选，默认 3
      adminOnly: false,            // 可选
      fn: async (body, args) => {
        await ctx.sendText(body, `收到：${args.join(" ")}`);
      },
    },
  };
}
```

规则：
- 与内置指令重名时内置优先，插件那条被丢弃（看启动日志 `[plugins]`）。
- 单个插件出错只记日志，不影响机器人和其他插件。
- fn 执行带 10 秒超时，写死循环不会卡住消息流。
- ctx 可用：`sendText/sendMsg/textSeg/gateway/getContent/dataDir/logger/isAdmin/isGroupPrivileged/cmdCooldown/nickname/prefix`。

### 3. 内置指令（要进 /help 分类表时）
在 `client/src/builtins/` 对应类型文件里加，并到 `client/src/brain-registry.js` 登记
`CMD_CATEGORY`（分类）和 `NAME_MAP`（别名）。漏登记 NAME_MAP 的表现是「指令完全静默」。

## 如何改主题

- **控制台**：CSS 变量在 `client/src/console/page/01-shell.js` 顶部（`--bg/--fg/--line/--accent` 等），
  暗/亮两套。页面右上角 ◐ 可切换，选择记在 localStorage。
- **启动器**：`launcher/Ui.cs` 的主题色与 `MainForm` 的样式常量。

## 如何调试

```powershell
# 开发模式（热重载，改 client/src 保存即重启）
.\scripts\dev.ps1

# 只做语法检查（不启动）
runtime\node\node.exe --check client\src\main.js
runtime\node\node.exe --check client\src\brain.js

# 日志
notepad logs\client.log          # 客户端（含 [plugins] 插件注册日志）
notepad logs\launcher-crash.log  # 启动器崩溃
```

- 控制台页面挂了（白屏）：页面会直接显示脚本错误信息（01-shell.js 里挂了全局 error 捕获）。
- 指令没反应：先看日志里有没有 `[plugins] 注册指令` / `[cmd]` 行；
  群里没反应通常是「本群未开启」，发 `/开启 <指令名>`。
- 启动器改动：`.\scripts\build-launcher.ps1 -SkipToolsCheck`（exe 被占用时加 `-OutDir`）。

## 打包分发

```powershell
.\scripts\package.ps1 -Force              # 绿色文件夹到 dist\GrapeLeafi
.\scripts\package.ps1 -Force -Clean -Zip  # 去个人化 + zip
```
