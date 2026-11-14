# 常见问题

> 本文是 [GrapeLeafi-QQbot](../README.md) 的详细说明，内容与主 README 同步维护。

- **launcher 报「provided QQ path is invalid」** → QQ 未安装或注册表路径异常，重新安装 QQ；或改用一键包 `download-napcat.ps1 -OneKey`；
- **双击 start.bat 窗口闪退** → 已修复（批处理内多行 if 块含括号导致 cmd 解析崩溃；现为 CRLF + 无括号文本）。若仍闪退，在项目目录按住 Shift 右键 →「在此处打开 PowerShell 窗口」，执行 `cmd /k start.bat` 打开看红字报错。
- **提示提权 / UAC** → NapCat 需要管理员权限注入 QQ。双击 start.bat 后会弹一次 UAC，点“是”；之后自动用 PowerShell 提权（无需安装 Windows Terminal）。
- **QQ 更新后连不上 / 日志出现「未找到对应版本的偏移数据」** → QQ 升级后 build 号变了，NapCat 需要同步升级。当前内置 NapCat **4.18.42**，已适配 QQ **9.9.36-53644**。以后 QQ 再自动更新导致同样问题时：
  - 先退出 QQ / NapCat，在项目目录执行 `.\scripts\update-napcat.ps1`（自动备份 + 下载最新 NapCat，保留 `config`）；
  - 若最新版仍未适配，可把 QQ 版本对齐到 NapCat release 说明里列出的 build，或改用 `download-napcat.ps1 -OneKey`（内置匹配版本的 QQ+NapCat，并默认关闭自动更新）；
- **客户端连不上** → 先看客户端窗口是否显示 `反向 WS 服务已启动`；确认 `bot\napcat\config\onebot11.json` 与 `client/config.json` 的 url/path/token 一致；
- **登录要输 token / 设备验证** → 新设备首次登录正常现象，在手机上确认即可；
- **AI 不回复 / 一直回兜底话术** → 检查 `client/config.json` 的 `bot.ai.enabled` 是否为 `true` 且 `apiKey` 已填（模板里的 `******` 算「没填」）；`baseUrl` 要与服务商匹配（DeepSeek 用 `https://api.deepseek.com/v1`，模型如 `deepseek-chat`）。控制台改完保存即热重载，不用重启；控制台「AI → 试聊」可直接测，并把实际发出的提示词摊开给你看；
- **被 @ 了但 AI 一声不吭** → 按顺序查这四处：① 「日志」页搜 `[ai]`，看是不是 `被回复间隔挡住` / `同一会话冷却中` / `跳过回复（group_not_in_ai_groups）` / `ai_trigger_off`；② 你发的是不是「在吗」「你好」这类默认**关键字**——它们比 AI 早生效，机器人会按预设回一句，AI 根本不会被调用；③ `bot.ai.groups` 是不是把这个群排除掉了；④ `bot.ai.trigger` 是不是 `off`；
- **AI 答非所问、不接上文** → 多半是上下文没带上：确认 `content.ai.includeContext` 为真、`bot.ai.contextTurns` 不是 0、`contextMinutes` 没设太短。用控制台「AI → 试聊」把那段聊天记录贴进「模拟群聊记录」框，能直接看到模型到底收到了什么；
- **AI 每次说话都像第一次见面** → `bot.ai.rememberTurns` 被设成了 0，它就没有「自己说过什么」的记录。默认 6；
- **AI 自言自语 / 把思考过程发到群里** → 见下方专门说明；
- **抽签没有图** → 控制台「抽签图片」里确认目录正确并「扫描预览」；目录里需有 png/jpg 等图片；
- **群管理指令无效** → 这些指令要求 bot 本身是该群管理员/群主；报错信息里会提示；
- **控制台一直显示「连接中…」** → 十有八九是**旧客户端实例还在后台跑**：新实例会因端口 8181 被占用而启动失败，于是你打开的还是旧进程的旧页面。处理：双击 `stop.bat`（或运行 `scripts\stop-client.ps1`）关掉所有客户端，再重新启动；然后按 **Ctrl+F5** 强制刷新。新版状态栏会显示 `端口/PID/构建`，据此可确认看到的是当前实例；若控制台端口被占用，日志会提示实际地址（自动顺延 9633…）；
- **多个群/多人同时发消息，有的没回复** → 同一会话严格排队、不同会话并发发送，慢的大图不会卡住其它会话；若仍无回复，看控制台状态栏的 `队列/丢弃` 与日志：常见原因是该会话刚回过（冷却）、`userRateLimit` 达到上限、深夜静默，或状态栏出现 `软静默ON`（点「重置风控 / 解除软静默」）；重复文本默认不再丢弃（`sameTextGapMs:0`）；
- **抽签很慢** → 签图原图 1~4MB，已自动压缩到约 200KB（首次编码约 100ms）再发送，上传明显更快；慢主要取决于 QQ 服务器上传速度；
- **第一次发消息 / 第一次响应很慢** → 是 NapCat 与 QQ 冷启动、首次建连的正常现象，通常几秒到十几秒，之后恢复正常；
- **发送提示风控/太频繁** → 客户端会自动降速；再把 `minDelayMs`、`groupCooldownMs` 调大；
- **下载失败** → 内置 ghfast.top 镜像；也可手动从 <https://github.com/NapNeko/NapCatQQ/releases> 下载 `NapCat.Shell.zip` 解压到 `bot\napcat\`。
