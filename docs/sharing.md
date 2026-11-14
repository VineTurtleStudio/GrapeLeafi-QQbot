# 分享给别人 / 二次部署

> 本文是 [GrapeLeafi-QQbot](../README.md) 的详细说明，内容与主 README 同步维护。

## 分享给别人 / 二次部署

一句话：**双击 `share.bat`**，它会在项目旁边生成一份 `GrapeLeafi-QQbot-share` 目录，
你的 QQ 号、token、全部用户数据、整套 NapCat 都已经剔除，产物只有 1MB 左右，可以直接发出去。

```
双击 share.bat
  └─ 自动剔除 ── client\config.json    你的 QQ 号 / 网关 token / AI key
                 client\data\          签到积分、卡牌收藏、生日表、群设置等全部用户数据
                 bot\                  整套 NapCat（config\ 里是按 QQ 号命名的登录态）
                 node_modules\         依赖，别人 npm install 就能重建
  └─ 自动复查 ── 产物若仍检出个人信息，直接删掉产物并报错，绝不让你误发
```

想让别人直接拿到 zip：把命令改成 `share.bat --zip`。
产物目录已存在时想覆盖：加 `--force`。

### 别人拿到之后（约 5 分钟，全程不用改代码、不用改配置）

1. 解压；
2. **双击 `start.bat`**（自动装依赖 + 下载 NapCat + 从模板生成 `config.json`）；
3. 按提示用 QQ 扫码登录 NapCat（第一次会弹二维码）；
4. 用**另一个 QQ** 私聊机器人或拉它进群，发 `/ping`、`/签到`、`/help` 试一句。

到第 4 步就已经能用了：接入 token、NapCat 的反向 WS 条目、机器人的昵称都是启动时自动写好的。

**想要主人权限**（改设置、数据修复指令）时再补一步：控制台「设置」页填
`bot.adminIds`，保存立刻生效。填**你用来跟机器人聊天的那个号**，不是登录机器人的号。

> 首次运行即使忘了建 `config.json` 也不会崩：程序会自动套用 `config.example.json` 启动，
> 控制台能正常打开，在网页里填完保存就落成真正的配置文件了。
> 但**语法错误不会被静默吞掉** —— 真坏了会直接报错停下，绝不拿默认值覆盖你的原文件。

### 手工检查

```
node scripts\leak-scan.mjs              检查当前目录能不能直接分享（不能，会列出问题）
node scripts\leak-scan.mjs <某目录>      检查某个副本干不干净
```

它会揪出：混进来的 `config.json` / `bot\napcat\` / `assets\` / `node_modules\` /
`client\data\backups\`、任何 `.bak` 自动备份、疑似密钥的 32 位十六进制串、
7~11 位的真实号码、暴露盘符的绝对路径（**正斜杠反斜杠都认**）、`file://` 与 UNC 网络路径。
哈希常量、PowerShell 注册表路径（`HKLM:\...`）、占位号、文档里的通用示例路径不会误报。

> **`client/data/` 是条件规则，不是无条件禁掉。** 那个目录里混着两种东西：
> 公开的结构性内容（生日表、事件文案、AI 人设、头衔、图源、卡池元数据 —— 该分享）
> 和只属于你的东西（预设指令、关键字回复、定时文案，以及按真实 QQ 号做键的签到积分抽卡 —— 绝不能分享）。
> 整个禁掉的话，别人装完是个**什么都没有的空壳**。
> 所以 `share.bat` 会生成一份**去个人化的数据模板**：功能留下、内容清空、群号清空、玩家数据留空壳，
> 然后严格校验产物里一个号码、一个本机绝对路径都不剩（5 位起步，比这里的 7 位规则更严）。
> 扫描时 `client/data/` 里带号就判错，并指出是哪个文件带号。

> **`assets/` 在扫描规则里是禁止项，但允许保留 `assets/README.md` 和空目录占位文件。**
> 也就是说：分享包和 GitHub 仓库里只留素材怎么放的说明，不带任何图片。

### 用 git 的话

仓库根目录的 `.gitignore` 已排除 `config.json`、`client/data/`、`bot/`、`assets/` 里的图片、`node_modules/`、日志和备份，
正常 `git add .` 不会误提交隐私。但**注意它只对 git 生效**——
打包 ZIP / 拷文件夹 / 发网盘时它一行都不管，那些隐私会原封不动跟着走，所以那种场景请用 `share.bat`。

> **走 GitHub 时 `client/data/` 整个是空的**（`.gitignore` 排除 + 里面都是本地数据）。
> 想要 GitHub 上也有配置模板，把 `share.bat` 生成的 `-share` 目录推上去，
> 那里面的 `client/data/` 已经是去号版本了。

`.gitignore` 里所有目录项都写成 `xxx/*` 而不是 `xxx/`，这是刻意的：
git 遇到被排除的目录就不再往下遍历，此时对目录内文件的 `!` 反向包含是**无效**的
（Git 官方文档明确说明父目录被排除时无法重新包含其中文件）。

### 上传到 GitHub

`share.bat` 生成的 `-share` 目录就是可以直接推上去的内容。**它不是空壳**：

| 目录 | 里面有什么 |
|---|---|
| `client/src/`、`scripts/` | 全部源码 |
| `client/config.example.json` | 带注释的配置模板，clone 后自动复制成 `config.json` |
| `client/data/` | **去个人化的数据模板**：47 项内置功能开关、136 条生日、事件文案、AI 人设、葡家头衔、6 个二次元图源、731 张卡的元数据都在；**预设指令、关键字回复、定时文案一律清空**，群号清空、玩家数据留空壳 |
| `assets/README.md` + 6 个空分类目录 | 素材怎么放的说明（无图片） |
| `bot/PLACE_NAPCAT_HERE.txt` | 提示 `install.bat` 会自动下载 NapCat |

**不带**：`config.json`（你的 QQ 和 token）、真实玩家数据、`bot/napcat/`、`node_modules/`、图片、`*.bak` 备份。

推荐加一层 git 再推：

```bat
cd ..\GrapeLeafi-QQbot-share
git init
git add .
git status                     :: 推之前先看一眼，确认没有 config.json
git commit -m "Initial commit"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

`git status` 里只要出现 `config.json`、任何 `*.bak`、或任何图片，就停下来处理，别直接推。
