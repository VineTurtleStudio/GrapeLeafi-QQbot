# 配置文件详解

> 本文是 [GrapeLeafi-QQbot](../README.md) 的详细说明，内容与主 README 同步维护。

## 配置文件

### `bot/napcat/config/onebot11.json`（OneBot11 网络配置）

已预置一个**反向 WS 客户端**连到 Node 客户端：

| 字段 | 说明 |
| --- | --- |
| `websocketClients[].url` | `ws://127.0.0.1:8181/onebot/v11/ws` |
| `websocketClients[].token` | 与 `client/config.json` 的 `gateway.accessToken` 一致 |
| `messagePostFormat` | `array`（结构化消息段，匹配客户端解析） |
| `reportSelfMessage` | `false`（忽略自身消息） |

> 该默认配置在无账号专属配置（`onebot11_<QQ号>.json`）时生效。若之后在 WebUI 里新建连接，会生成账号专属文件覆盖默认值，勿删本方框里的文件，或手动把上面的反向 WS 也照抄过去。

### `client/config.json`（客户端）—— 唯一要你填的文件

> **所有个人信息都收在这一个文件里。** 首次运行没有它会自动从 `config.example.json`
> 复制一份（`start.bat` 也会提前做好），所以 clone 下来双击 `start.bat` 就能起。
> 启动日志里会直接列出「还差什么」，照着填即可。
>
> **不想手改文件？** 启动客户端后打开控制台的「**设置**」页，上面这些字段都能直接在网页上填，保存即生效。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `bot.adminIds` | | **主人 QQ 数组**（主人拥有全部权限，不受白名单/静默/限流限制）。**只有 `/设置`、`/修复` 这类主人指令需要它，日常聊天/签到/图鉴/扭蛋都不需要**，所以留空也能正常玩。要填就填**你用来跟机器人聊天的那个号**——不能填登录机器人的号，机器人会忽略自己发的消息 |
| `bot.nickname` | | 机器人昵称（群内喊昵称可触发回复） |
| `bot.napcat.mode` | | 登录方式：`qr`(默认)/`quick`/`password`，见「登录」一节 |
| `bot.napcat.qq` | `quick` 必填 | 要免扫码登录的 QQ 号 |
| `bot.napcat.password` | `password` 必填 | QQ 密码。**明文存储，泄露等于账号被接管**，详见「账号密码登录的风险」 |
| `bot.napcat.webuiToken` | | NapCat 管理页 token，**留空即可**，启动时自动生成 32 位随机值 |
| `gateway.accessToken` | | 接入 token，**留空即可**，启动时自动生成并同步到 NapCat |
| `gateway` | | 端口/path（8181），必须与 NapCat 反向 WS 一致 |
| `bot.commandPrefix` | | 指令前缀（默认 `/`） |
| `bot.replyGroups` | | 留空=所有群应答；填群号数组=白名单 |
| `bot.replyPrivate` | | 私聊策略：`all`(默认，开箱即用)/`whitelist`/`off`。收紧成 `whitelist` 时记得同时填 `bot.adminIds` 或 `bot.privateWhitelist`，否则私聊全被静默丢弃 |
| `bot.privateWhitelist` | | 允许私聊的用户 QQ 数组 |
| `bot.groupReplyGapMs` | | 群内**自动接话**（关键字）的最小间隔(ms，默认 0=不限制)；指令与 `@bot` 不受此限 |
| `bot.keywordAutoReply` | | 是否启用关键字自动回复（默认 true） |
| `bot.quietHours` | | `{enabled, start:"23:30", end:"06:30", allowGroups:[]}` 深夜静默（只影响群聊；私聊仍会回，主人不受影响） |
| `bot.userRateLimit` | | `{windowSec:300, max:20}` 每用户长窗口回复频率上限（主人不受影响） |
| `bot.flood` | | `{enabled, windowSec:10, max:8, muteSec:15, maxMuteSec:120, warn:true, warnGapSec:180}` 短时刷屏检测：按「群/私聊 + 用户」统计，窗口内超过 `max` 条才静默，静默时间按次翻倍；主人不受影响 |
| `bot.privateReplyGapMs` | | 私聊额外总闸(ms，默认 0=不限制)；AI 会话间隔另见 `bot.ai.cooldownSec` |
| `bot.aiReplyGapMs` | | 可选的按「群/私聊 + 用户」AI 总闸(ms，默认 0=不额外限制)。AI 会话间隔看 `bot.ai.cooldownSec`（默认 20 秒） |
| `bot.ai` | | **接口**：`{enabled, baseUrl, apiKey, model, temperature, maxTokens, timeoutSec, cooldownSec, retries, noThinking, hideThinking}`；**什么时候问**：`{trigger:"mention"\|"keyword"\|"active"\|"off", triggerWords:["问","ai","chat"], groups:[], privateEnabled, replyToBot}`；**读多少上下文**：`{contextTurns:12, contextMinutes:30, rememberTurns:6, maxContextChars:200, maxReplyChars:0}`。`noThinking`/`hideThinking` 见下方「AI 总是自言自语」 |
| `bot.games` | | `{lotteryCooldownSec, fishingCooldownSec, fortunePerDay}` 小游戏参数 |
| `console` | | `{enabled, host:"127.0.0.1", port:9632, token:""}` 本地控制台（token 非空时需带 `?token=`，页面加载后会自动从地址栏抹掉；`host` 改成非本机地址时**必须**配 token，否则启动即报错。改成 `0.0.0.0` + token 后手机同 Wi-Fi 即可访问，详见「控制台安全边界」） |
| `scheduler` | | `{enabled, checkEverySec}` 定时提醒开关 |
| `antiRisk.concurrency` | | 同时发送的最大条数（默认 3，跨会话并发） |
| `antiRisk.sendTimeoutMs` | | 单条发送等待协议端回执的超时(ms，默认 120000；**要压到 30s 就填 30000**，别和下面「防风控清单」里的单位搞混) |
| `antiRisk.maxPenalty` | | 发送失败时的最大惩罚倍率（默认 4） |
| `antiRisk.*` | | 其余防风控参数（`minDelayMs`/`maxDelayMs`/`groupCooldownMs`/`userCooldownMs`/`burstLimit`/`burstWindowSec`/`hourlyCap`/`dailyCap`/`groupIdDailyCap`/`sameTextGapMs`/`autoMuteFailStreak`/`autoMuteMinutes`/`maxQueueLength`/`maxQueueWaitMs`/`maxTextLength`，见「防风控清单」） |

**没有任何一项是必填的。** 三个 token 全部留空，程序启动时会自动生成并
同步到 `bot/napcat/config/`，NapCat 那边的反向 WS 条目**没有也会自动建一条**
（以前只改 token、从不建条目，于是全新装必然是「控制台永远未连接 + 所有回复失效」，
而且一行日志都不打）。所以你**不需要再去 NapCat 的配置文件里手动对一遍**——
以前这一步最容易漏，两边不一致的表现只是静默重连，很难查。

机器人的昵称也会自动认领：首次连上协议端时用 OneBot 的 `get_login_info` 把你扫码登录的那个
QQ 的昵称取回来写进 `bot.nickname`。

`bot.adminIds` 同样不是必填——它只影响 `/设置`、`/修复` 这类主人指令。
要填就填**你用来跟机器人聊天的那个号**，别填登录机器人的号（机器人会忽略自己发的消息）。

密码是唯一的例外：`password` 模式必须你自己填，且是明文。

**哪些改动热生效**：在控制台「设置」页保存后，`bot` 段（主人、昵称、前缀、白名单、免打扰、频率限制、AI、游戏冷却）与 `scheduler` 段**立即生效**，不用重启。
**必须重启**：`gateway` 监听地址/端口/path、`console` 自身配置、`antiRisk` 全部数值——这些在进程启动时绑定或构造，改了不重启不生效。

### `client/data/content.json`（用户内容，控制台可视化编辑）

| 字段 | 说明 |
| --- | --- |
| `settings.groupReplyMode` | `"keyword"`=自由回复（默认，群里没点名也能对关键字接话）；`"mention"`=仅 @ 回复（群里必须 @它/喊昵称/用 `/` 指令才回） |
| `settings.keywordMaxLen` | 关键字长句上限（0=不限制；填 N 则群内超过 N 字的消息不再触发 包含/正则 关键字） |
| `settings.replyGroups` | 全局应答群白名单（数组，空=所有群都应答）；会覆盖 `config.json` 的 `bot.replyGroups` |
| `settings.blockGroups` | 群黑名单（数组），黑名单群一律静默（含 @/指令） |
| `settings.quietAllowGroups` | 深夜静默白名单（数组），与配置里的 `quietHours.allowGroups` 合并生效 |
| `settings.gates` | 节流覆盖：`{groupReplyGapMs?, privateReplyGapMs?, aiReplyGapMs?}`（毫秒，`0`=关闭该间隔） |
| `settings.riskgate` | 风控参数覆盖（控制台「风控·节流」页）：`{minDelayMs, maxDelayMs, groupCooldownMs, userCooldownMs, burstLimit, burstWindowSec, hourlyCap, dailyCap, groupIdDailyCap, maxQueueLength, concurrency, sendTimeoutMs, maxPenalty}`，空字符串表示不覆盖，保存/启动即实时应用到发送队列 |
| `settings.replyQuote` | 回复是否引用原消息（控制台「回复设置」勾选）：`true`（默认）回复带「引用某条消息」段；`false` 所有回复直接发送不引用 |
| `settings.groupEnabled` | 群指令开关：`{"cat:生日": [群号], "cmd:钓鱼": [群号]}`；键存在则只有列出的群可用，键不存在按默认（`defaultOff` 之外全开）；群内 `/开启` `/关闭` 自动维护 |
| `settings.defaultOff` | 默认关闭的类型/指令清单（数组，默认 `["生日","文娱","互动","联网"]`）——不在任何群开启的话，这些命令会回复「还没开启」；**主人（`adminIds`）豁免** |
| `settings.events` | 群事件回应：`{welcome:{enabledGroups:[],text}, leave:{enabledGroups:[],text}, poke:{enabledGroups:[],replies:[]}}`，全默认空=关闭；文案占位符 `{qq}` `{nick}` `{player}` |
| `birthdays` | 生日提醒：`{enabled, time:"00:00", notice, enabledGroups:[群号], items:[{id,name,date,series,builtin,groups}]}`；`items` 内置 Key 数据全局生效（`groups:[]`），自定义条目带 `groups:[本群号]` 仅该群生效；`lastFired` 记录当天已推送日期（自动维护） |
| `builtins` | 内置指令开关与参数：`{ "指令规范名": {enabled?, cooldownSec?, adminOnly?, groups?, allowPrivate?} }`（规范名如 `me`/`mute`/`运势`，即 `NAME_MAP` 的目标键；如 `{"me": {"enabled": false}}` 可关闭 `/我的`；`cooldownSec` 不填=0 不限制） |
| `presets.commands` | 预设指令：`{name, reply, randomReplies?, image?, timeReplies?, cooldownSec, adminOnly, groups, allowPrivate}`；`cooldownSec` 不填=0 不限制 |
| `presets.keywords` | 关键字回复：`{match, matches?, reply, randomReplies?, image?, imageDir?, repeat?, timeReplies?, contains?, useRegex?, mentionOnly?, excludeWords?, adminOnly?, cooldownSec, groups, allowPrivate}`；`cooldownSec` 不填=0 不限制；`matches` 为一个关键字的多个词（任一命中即触发，无则用 `match`）；`image` 固定一张图（本地路径/http），`imageDir` 填目录则**从整个图库随机抽一张**（分号或换行分隔可填多个目录，含全部子文件夹，支持 png/jpg/jpeg/gif/webp）；`adminOnly` 勾上后仅 主人/群主/群管理/被 `/给予` 授予权限 者 能触发 |
| `timeReplies` | 分时段文案：`{morning?, afternoon?, evening?, night?}`，按服务器时间选，空时段回退到 `reply` |
| `ai.systemPrompt` / `offlineReply` / `errorReply` | AI 人设与兜底话术 |
| `lottery.dir` | 抽签图片目录（自动扫描其中的图片） |
| `schedule` | 定时任务：`{id, time:"08:00", groups:[群号], message, enabled}` |

### `client/data/cards.json`（卡牌信息库，配置）

`version` 当前为 2。顶层字段：

| 字段 | 说明 |
| --- | --- |
| `packs[]` | 卡包：`id`(短名，`/抽卡` 用它)、`name`、`com`(群号)、`assetRoot`(素材根目录)、`currencyName`(默认「光玉」)、`price`(单抽价格，默认 5)、`works`、`characters`、`cards`、`rates` |
| `works{}` | 作品池：`{ name, currencyName, price, aliases[] }` |
| `characters{}` | 角色池：`{ name, en, work, aliases[] }` |
| `cards{}` | **每张卡的元数据**，键是卡号：`{ "100": { character:"hisako", rarity:"SR", work:"ab" } }`。当前 731 条。**缺 `rarity` 一律按 `N` 处理** |
| `rates` | 各池概率/保底，形如 `{"work":{ssr,sr,r,ssrPity,srPity},"char":{...}}`。**留空 `{}` 时用代码默认值**（即上表），控制台改过才写这里 |
| `decay` | 分解回收光玉：`{"SSR":50,"SR":20,"R":5,"N":1}` |
| `exchange.rate` | `/兑换` 兑换倍率，1 积分 = 多少光玉（当前 1） |

**`assetRoot` 现在只写相对 `assets/` 的短路径**，例如 `"cards/ab"`。
以前写的是项目外的绝对路径，换台机器就得手动改一遍，改漏了表现为「图鉴全空」但没有任何报错。
绝对路径仍然支持（老配置不用改），三种写法都认：

| 写法 | 结果 |
| --- | --- |
| `"cards/ab"` | `<项目根>/assets/cards/ab`（推荐） |
| `"${assets}/cards/ab"` | 同上，显式写法 |
| `"D:\Media\MyCards"` | 原样使用，适合素材放在项目外 |
| `""` 或 `"******"` | 空，表示还没配，对应功能安静地不显示图，不报错 |

素材按 `assetRoot/{Icon,Card,Detail}/<卡号起-卡号止>/` 分目录存放，命名约定为
**Icon=`<卡号>i.png`**、**Card=`<卡号>.png`**、**Detail=`<卡号>d.png`**。

两处比文档更宽松的地方（都是被现实打出来的）：

- **编号区间不必严格按 30 一段。** 代码按实际区间匹配，`721-731` 这种尾段也能用。
- **文件名里的编号补不补零都行。** `001i.png` 和 `1i.png` 都能识别——
  1~99 号卡以前因为被补成三位而匹配不到，整段图鉴是空的。

完整目录结构和素材分类见 [`assets/README.md`](../assets/README.md)。当前只有 1 个卡包 `ab`，
**素材为第三方所有，不随项目分发**。

### `client/data/checkins.json`（签到，玩家数据）

`users[QQ] = { points, earned, streak, bestStreak, totalDays, lastCheckin }`。`earned` 是只增不减的累计积分（升级唯一依据），`points` 是可花余额。早期档案缺 `earned` 会在加载时自动回填。

### `client/data/games.json`（运行时数据，自动生成）

钓鱼仓库、金币、运势/抽签冷却记录等，删除即重置。
