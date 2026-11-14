# 维护与扩展

> 本文是 [GrapeLeafi-QQbot](../README.md) 的详细说明，内容与主 README 同步维护。

## 维护提示

- **改 `client/data/` 之前先停客户端**。运行中的进程持有内存状态，退出或下次签到时会把旧状态写回覆盖你的修改（这个坑已经踩过一次：修好的签到进度被旧进程冲掉了）。好消息是现在写入前会自动备份到 `data/backups/`，且存档损坏会直接中止启动而不是静默清零——但被旧进程覆盖属于「写入了合法但过期的数据」，备份也救不回你想要的版本，所以还是先停。
- **`data/backups/` 是自动生成的恢复点**，删掉不影响运行，只影响找回能力。恢复方法见上面「存档的耐久性保障」。
- **改存档结构记得升 `__v`**：`checkins.js` 的 `SCHEMA_VERSION` / `cards.js` 的 `__v`，并在迁移函数里补对应分支，否则迁移要么不跑要么每次启动都跑。
- 仓库根目录已有 `.gitignore`（排除 `config.json`、`client/data/`、`bot/`、`node_modules/`、日志、备份），**第一次提交前务必 `git status` 确认没有隐私文件被带进去**——`config.json` 和 `client/data/` 里是你的 QQ 号与全部玩家数据。
- **本项目没有正式的测试命令**（`package.json` 无 test 脚本），改动是用临时脚本跑的回归。脚本放在 `%TEMP%\opencode\*.test.mjs`，**未纳入仓库**。
  > ⚠️ **这些脚本会丢。** 它们只存在于系统临时目录，某次环境重置/磁盘清理就没了（本项目已经实际发生过一次，840 项回归脚本全被清空）。
  > 想长期维护就**把它们挪进仓库**（比如 `client/test/`），并在 `package.json` 加个 `test` 脚本指向一个批量运行器。
  > 目前仅存两个：`datatemplate.test.mjs`（去个人化数据模板 + 泄漏扫描规则，58 项）、`share-smoke.test.mjs`（分享产物冒烟：结构、内容加载、抽签空目录降级、内置功能开关，37 项，需传产物目录参数）。
  > `storage-backup` 必须以 `BOT_BACKUP_INTERVAL_MS=0` 跑（它要绕过 5 分钟备份节流来验证轮转上限），`storage-throttle` 相反要用默认值。跑错会得到 3 个假失败。
  > PowerShell 的执行策略默认禁止执行 `.ps1`，回归请逐个 `node xxx.test.mjs` 跑，别指望双击脚本。
- **控制台前端是字符串拼接的，别改 `console/page/*` 以外的拼接逻辑**：`src/console/page.js` 把 `page/01..08` 八段按文件名顺序拼成完整页面，源码里的 `\\` 是本来就有的字面反斜杠。两个必须知道的约束：
  - **`08-tabs-misc.js` 带着 `</script></body></html>` 收尾**，所以新分片不能排在它后面（页面会以「结尾不在末尾」失败）。新开分片要挑它前面的编号。
  - **单个分片不超过 500 行**（`console-page.test.mjs` 会拦）。`03-tabs-content.js` 放不下时内置指令那块已挪到 `07-tabs-builtins.js`。
  - `console-page.test.mjs` 默认只做结构校验（首尾完整、关键锚点、换行分隔符、内嵌脚本能过 `node --check`、分片行数）；只有设 `PAGE_STRICT=1` 时才与拆分前的备份逐字节比对，**而逐字节比对只是「纯搬迁」时的手段**，主动加功能后必然对不上。
- **换行分隔符只有一个坑，记牢**：`page/*` 是模板字面量，源码里写 `\\n` 拼出来才是浏览器里的**真换行**（`split('\n')` 能按行拆）；写 `\\\\n` 拼出来是字面 `\n`，会让「每行一个」的关键字框把全部内容粘成一行、存盘后再打开就乱。改这些文件时别顺手"修正"看着多余的转义。
- **`el(tag, cls, attrs)` 的第三个参数传数组时表示子节点**，会 append 进去。传对象才是属性。传错不报错，只是元素渲染成空的。
- **加新内置指令必须同时改四张表**，漏哪张都会出「静默」或归类错误：`src/brain-registry.js` 的 `NAME_MAP`（不登记就触发不了，且**完全没有报错**）与 `CMD_CATEGORY`（控制台归类）、`src/builtins/*.js` 里实际的注册键、以及 `src/console/page/03-tabs-content.js` 的 `BDEFS`（控制台开关清单）。排查「指令没反应」时先确认 `NAME_MAP` 里有这个名字。
  > `BDEFS` 的**键**和 `NAME_MAP` 的规范名不是一回事：群管理那批在 `BDEFS` 里用的是拼音键（`mute`/`unmute`/`kick`/`banall`/`unbanall`/`recall`），中文「禁言」「踢出」只是 `label`。在 `BDEFS` 里按中文写键 = 永远匹配不上，且没有任何报错。
- **想让主人改内置指令的文案**：在 `07-tabs-builtins.js` 的 `COPY_TPL` 里加一条，键必须是 `BDEFS` 的键。控制台「内置指令」页会自动出现「复制为预设 / 复制为关键字」按钮，把内置换成一条可编辑的预设，并把原内置自动关掉。**依赖真实数据的指令（签到/积分/抽卡/钓鱼等）不要加**——预设读不到存档，加了按钮等于骗人。
- **事件配置 UI 的键必须和后端一致**：`05-tabs-risk-ai.js` 里 `evEnsure('xxx')` 的键要和 `brain-notice.js` 的 `NOTICE_DEFAULTS` 完全对得上（`welcome`/`leave`/`poke`/`essence`/`admin`/`ban`/`friend`）。写错一个字母不报错，只是配了永远不生效。`console-events.test.mjs` 会直接对着后端源码比对这两份键。
- **`.bat` 文件里不许出现中文。** cmd 是按 OEM 代码页（中文系统是 936/GBK）读 `.bat` 的，不是 UTF-8。
  汉字被解成乱码不算最糟的——某些字节序列会让**下一行被当成命令执行**，
  实测 `share.bat` 直接报 `'发给别人?' 不是内部或外部命令` 然后整个脚本死掉。
  `chcp 65001` 救不了，因为坏掉的是「读 `.bat` 文件本身」这一步。
  规矩：`install.bat` / `start.bat` / `share.bat` 全部纯 ASCII，中文提示交给 Node 输出。
  `share-dist.test.mjs` 里有一条测试专门守这个（检查无非 ASCII 字节、无 BOM）。
- **往 `SECRET_PATHS` 加字段时要一起想清楚回传问题。** 掩码后前端拿到的是空串，
  保存时如果整份 POST 回来，服务端会用空串覆盖真实密码。现在靠 `body.secrets` 显式传密钥、
  服务端只更新密钥路径来避免（见 config-api 的保存逻辑）。加新密钥字段时别绕过这套。
- **「算占位符」的定义只有 `setup.js` 的 `isUnfilled()` 一处。**
  之前 `bootstrap-config.js` 自己硬编码了一份 QQ 号列表，模板把占位号从 `123456789`
  换成 `******` 之后就漏判了，主人权限相关的提示全部失效且不报错。现在两边共用一个函数。
- 排查指令问题时的 handy 手法：把 `client/src/brain-registry.js` 的 `NAME_MAP`（别名→规范名）、`CMD_CATEGORY`（规范名→开关类）、`client/src/console/page/03-tabs-content.js` 的 `BDEFS`（控制台开关清单）三张表和 `BUILTINS` 实际注册键对账，能一次抓出「注册了但触发不了」「归错类」「控制台关不掉」这类问题。**`NAME_MAP` 漏登记的表现是完全静默、不报错**，最难查，务必先看它。
- **「没反应」的第二常见原因：限流，不是 bug**。关键字回复除了自己的 `cooldownSec`（默认 0），还要过一道**群级间隔** `settings.gates.groupReplyGapMs`（默认 0；如果你在 `config.json` 或控制台填了非 0，`brain.js` 里在调 `tryKeyword` *之前* 就拦掉了）。所以同一群里连发两条关键字，第二条可能被静默丢弃——调试时先把 `groupReplyGapMs` 调 0。另一类是 `settings.defaultOff` 默认含 `生日/文娱/互动/联网`，这些分类的新指令要 `/开启 互动` 之类才生效，回复「XX 在本群还没开启」即属此类。
- **可编辑项的权限有三个字段，注意优先级**：`ownerOnly`（仅 `config.json` 的 `adminIds`，群主群管都不放行）> `adminOnly`（+ `permKey` 指定授权项）。控制台里勾一个会自动取消另一个。**「仅管理员」不等于「主人专属」**——这是最容易配错的地方。详见 `client/控制台指令填写说明.txt`。

---

## 扩展功能

**最简单**：打开控制台 http://127.0.0.1:9632，在「预设指令」里加一条即可（存到 `content.json`，热生效）。

**要写代码**：事件路由在 `client/src/brain.js`。内置指令在 `BUILTINS` 表里注册（键为归一化后的命令名），并在 `brain-registry.js` 的 `NAME_MAP` 里登记中文名/别名：

```js
// brain-registry.js 的 NAME_MAP 里加:
天气: "weather",            // 别名 → 归一化指令名
// builtins/ 里注册:
weather: {
  fn: async (body, args) => {
    await sendText(body, "今天晴，注意多喝水。", "weather");
  },
},
```

> 别忘了在 **`CMD_CATEGORY`**（同样在 `brain-registry.js`）里给 `weather` 归一个类（如 `weather: "联网"`），以及在控制台的 `BDEFS`（`client/src/console/page/03-tabs-content.js`）里加一条，否则控制台关不掉它。不登记类别的话 `/开启`/`/关闭` 和 `/开启` 的可选项列表里都不会出现它（会落到「其他」类被忽略）。`ownerOnly` / `adminOnly` 的指令可以不归类——它们本来就豁免群开关。

所有对外发送统一走 `sendText(body, ...)` / `sendMsg(body, segs)`（内部经 `sender.enqueue()` 防风控队列），**不要绕过它**直接 `gateway.call`（管理/查询类 API 调用除外）。图片/语音等富媒体消息段参考 OneBot 11 标准即可。
