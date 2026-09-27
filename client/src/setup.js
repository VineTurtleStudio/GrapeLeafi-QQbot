// 首次配置助手：把「要填的东西」收敛到 client/config.json 一个文件里，
// 并自动解决那些本来要在两个地方各填一遍的字段。
//
// 背景（都是实际踩过的坑）：
//   1. 接入 token 原本要在 client/config.json 和
//      bot/napcat/config/onebot11*.json 里各写一遍，两边不一致就「连不上」，
//      而报错只是静默重连，很难查。这里让 config.json 成为唯一数据源，启动时同步过去。
//   2. 分享出去的模板不能带真实 token，但留空又会让人一头雾水。
//      约定：空或 ****** 一律视为「没填」，由程序自动生成。
//   3. 新人不知道还差什么才能跑起来。unfilledFields() 把缺的东西列成清单，
//      控制台首屏直接显示，不用去猜。

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROJECT_ROOT } from "./assets-path.js";

/** 这些值等于「还没填」，不是有效配置 */
export const PLACEHOLDERS = new Set([
  "", "******", "********", "**********", "null", "undefined", "-", "your_token_here", "填你自己的",
]);

/** 判断某个配置值是不是占位符 */
export function isUnfilled(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0 || v.every((x) => isUnfilled(x));
  if (typeof v === "object") return Object.values(v).every((x) => isUnfilled(x));
  return PLACEHOLDERS.has(String(v).trim().toLowerCase());
}

/** 生成一个 32 位十六进制 token */
export function generateToken() {
  return randomBytes(16).toString("hex");
}

/** 本客户端在 NapCat 里那条反向 WS 连接该长什么样（字段名/默认值照抄 NapCat 自己写的那份） */
function newWsClient(gw) {
  return {
    name: "GrapeLeafi-client",
    enable: true,
    url: wsUrl(gw),
    messagePostFormat: "array",
    reportSelfMessage: false,
    reconnectInterval: 5000,
    token: gw.accessToken,
    debug: false,
    heartInterval: 30000,
    verifyCertificate: true,
  };
}

function wsUrl(gw) {
  return `ws://${gw.host || "127.0.0.1"}:${gw.port}${gw.path || "/onebot/v11/ws"}`;
}

/**
 * 列出「还没填、填了才能用」的个人信息项。
 * 控制台首屏拿去显示成待办清单。
 */
export function unfilledFields(config) {
  const out = [];
  const bot = config?.bot || {};
  const gw = config?.gateway || {};

  if (isUnfilled(bot.adminIds)) {
    out.push({
      path: "bot.adminIds",
      label: "主人 QQ 号",
      hint: "只有 /设置、/修复 这类主人指令需要它，日常聊天/签到/图鉴/扭蛋都不需要。" +
        "注意填你**用来跟机器人聊天**的那个号，不能填登录机器人的这个号 —— " +
        "机器人会忽略自己发的消息，填了等于没人有主人权限。",
      required: false,
    });
  }
  if (isUnfilled(gw.accessToken)) {
    out.push({
      path: "gateway.accessToken",
      label: "接入 token",
      hint: "留空即可，程序会自动生成并同步到 NapCat。",
      required: false,
      auto: true,
    });
  }
  if (isUnfilled(bot.napcat?.password) && String(bot.napcat?.mode || "qr") === "password") {
    out.push({
      path: "bot.napcat.password",
      label: "QQ 密码",
      hint: "当前是密码登录模式，必须填。留空则回退到扫码登录。",
      required: true,
    });
  }
  if (String(bot.napcat?.mode || "qr") === "quick" && isUnfilled(bot.napcat?.qq)) {
    out.push({
      path: "bot.napcat.qq",
      label: "要免扫码登录的 QQ 号",
      hint: "快速登录模式必须填，且该号需至少扫码登录过一次。",
      required: true,
    });
  }
  if (isUnfilled(bot.napcat?.webuiToken)) {
    out.push({
      path: "bot.napcat.webuiToken",
      label: "NapCat 管理页 token",
      hint: "留空即可，程序会自动生成一个 32 位随机值并同步到 NapCat。",
      required: false,
      auto: true,
    });
  }
  if (config?.bot?.ai?.enabled && isUnfilled(config.bot.ai.apiKey)) {
    out.push({
      path: "bot.ai.apiKey",
      label: "AI API key",
      hint: "已开启 AI 但没填 key，AI 相关功能会不可用。",
      required: true,
    });
  }

  // 「只收不回」的头号原因，而且完全静默：
  // 模板曾经把 bot.adminIds 留成 ******、privateWhitelist 留成 []、replyPrivate 留成 whitelist，
  // 三者一凑，privateAllowed() 对**所有人**都返回 false，私聊消息进来只打一行
  // 「[gate] 私聊对方不在白名单，忽略」就没了。日志不盯着看的话，
  // 表现就是「能收到消息但一条都不回」，跟「程序坏了」完全没法区分。
  // 模板已改成 replyPrivate="all"，所以新装不再命中这里；留着是为了提醒那些
  // 手动收紧成 whitelist 的人 —— 不然收紧的那一刻就是全静默失聪。
  if (bot.replyPrivate === "whitelist" && isUnfilled(bot.adminIds) && isUnfilled(bot.privateWhitelist)) {
    out.push({
      path: "bot.replyPrivate",
      label: "私聊白名单当前是空的",
      hint: `replyPrivate="whitelist" 但 bot.adminIds 和 bot.privateWhitelist 都没填，` +
        `所有私聊消息都会被直接忽略（只在日志里留一行，看不到就完全不知道原因）。` +
        `二选一：填 bot.adminIds（你用来跟机器人聊天的那个号），或把 replyPrivate 改成 "all"。`,
      required: true,
    });
  }
  return out;
}

/**
 * 用 NapCat 已经登录的那个 QQ 号，把机器人的「自称」补上。
 *
 * 为什么需要它：分享出去之后对方不该再手改 config.json —— 让他先填 QQ 号再扫码
 * 是本末倒置，而「这个 bot 叫什么」在扫码成功那一刻就已经确定了，没有任何理由还要人填。
 *
 * 特意**不**顺带填 bot.adminIds：登录的这个号就是机器人自己，而 brain.js 会丢掉
 * 机器人自己发的消息（self_id === user_id 直接 return，那是防止关键字回环的必需判断）。
 * 所以把它写进 adminIds 等于给一个「永远发不出主人指令」的人授予主人权限 ——
 * 看着像配好了，实际比留空还更容易让人以为能用。主人必须是另一个号，只能人填。
 *
 * 只在「确实是没填」时写，已有值一律不覆盖。
 * 返回 { changed, filled: [字段], nickname, adminId, reason }
 */
export function adoptIdentityFromLogin(config, login) {
  const uid = login && login.user_id != null ? String(login.user_id).trim() : "";
  const bot = config?.bot || (config.bot = {});
  if (!looksLikeQQ(uid)) {
    return { changed: false, filled: [], reason: `get_login_info 没给出可用的 QQ 号（${JSON.stringify(login)}）` };
  }
  const filled = [];
  if (isUnfilled(bot.nickname)) {
    bot.nickname = String(login.nickname || "").trim() || `QQ${uid}`;
    filled.push("bot.nickname");
  }
  return { changed: filled.length > 0, filled, nickname: bot.nickname, adminId: uid };
}

/** 原子写，且刻意不产生 backups/ 目录（那是第三方目录，不该被我们弄脏） */
function writeJSONAtomic(filePath, obj) {
  const dir = filePath.replace(/[\\/][^\\/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  renameSync(tmp, filePath);
}

/**
 * 让 config.json 成为接入 token 的唯一数据源。
 *
 * - token 没填（空/******）→ 随机生成一个，写回 config.json
 * - NapCat 那边没有指向本客户端的反向 WS 条目 → 补一个
 * - NapCat 那边的 token 与 config.json 不一致 → 改成一致
 *
 * 返回 { token, generated, synced: [改过的文件], created, skipped }
 * 拿不到写权限时只警告，不抛错：不该因为同步失败就让 bot 起不来。
 */
export function ensureGatewayToken(config, configPath, opts = {}) {
  const napcatConfigDir = opts.napcatConfigDir || join(PROJECT_ROOT, "bot", "napcat", "config");
  const log = opts.log || (() => {});
  const gw = config.gateway || (config.gateway = {});
  const saveConfig = opts.saveConfig || (() => {});

  let generated = false;
  if (isUnfilled(gw.accessToken)) {
    gw.accessToken = generateToken();
    generated = true;
    try {
      saveConfig();
      log(`[setup] 已自动生成接入 token 并写入 ${configPath}`);
    } catch (err) {
      log(`[setup] 警告：token 没能写回 ${configPath}（${err.message}），本次运行仍可用，但重启后会变`);
    }
  }

  const synced = [];
  const created = [];
  let skipped = null;
  {
    let files = [];
    try {
      if (!existsSync(napcatConfigDir)) mkdirSync(napcatConfigDir, { recursive: true });
      files = readdirSync(napcatConfigDir)
        .filter((f) => /^onebot11(_.*)?\.json$/i.test(f))
        .map((f) => join(napcatConfigDir, f));
    } catch (err) {
      skipped = `读不到 NapCat 配置目录（${err.message}）`;
    }

    // 一个 onebot11 配置都没有 = 协议端还从来没启动过（全新装 / 分享包第一天就是这个状态：
    // start-all 是先起客户端再起 NapCat，所以客户端跑的时候 NapCat 的 config 目录都还没建）。
    //
    // 以前这里直接 skipped 掉，于是「全新分享包」必须**跑第二遍** start.bat 才能连上：
    // 第一遍扫码时 NapCat 用自己的默认值建了个空的 websocketClients，客户端却已经错过了同步时机。
    // 而 NapCat 读配置的逻辑（napcat.mjs class yA.read）是
    //   存在 onebot11_<uin>.json 就用它，否则读 onebot11.json 当模板，再 save() 成 <uin> 那份。
    // 所以只要我们抢先写好 onebot11.json 这份「底模板」，**第一次扫码就能连上**。
    if (!files.length && !skipped) {
      const base = join(napcatConfigDir, "onebot11.json");
      try {
        writeJSONAtomic(base, { network: { websocketClients: [newWsClient(gw)] } });
        created.push(base);
        log(`[setup] NapCat 还没生成过配置，已先写好底模板 ${base}`);
        log(`[setup] 协议端首次登录时会拿它当模板，扫码后即可自动连上（url=${wsUrl(gw)}）`);
      } catch (err) {
        skipped = `没能预先写好 NapCat 底模板（${err.message}）；首次登录后重启一次客户端即可补上`;
      }
    }

    for (const f of files) {
      try {
        const raw = readFileSync(f, "utf8").replace(/^\uFEFF/, "");
        const j = JSON.parse(raw);
        const clients = j?.network?.websocketClients;
        if (!Array.isArray(clients)) continue;
        let touched = false;
        let ours = 0;
        for (const c of clients) {
          // 只动指向本客户端的连接；NapCat 可能还配了别的下游
          const url = String(c.url || "");
          if (!(url.includes(`:${config.gateway.port}`) || /GrapeLeafi/i.test(String(c.name || "")))) continue;
          ours++;
          if (c.token !== gw.accessToken) { c.token = gw.accessToken; touched = true; }
          // 主人显然是想连的，条目被关掉就重新打开
          if (c.enable === false) { c.enable = true; touched = true; }
        }
        // 一条都没有 = 这个 onebot11 配置里根本没配反向 WS 客户端。
        // 全新装 / 分享包必然落在这个分支：以前这里只管「改 token」，从不负责「建条目」，
        // 于是 NapCat 手里 websocketClients 是空的、什么都不往 8181 连，
        // 表现就是控制台永远「未连接」+ 所有回复失效，而且一行日志都没有——
        // 协议端「没配」和「配错了」在日志里长得一模一样。
        if (!ours) {
          clients.push(newWsClient(gw));
          writeJSONAtomic(f, j);
          created.push(f);
          log(`[setup] ${f} 里没有指向本客户端的反向 WS 条目，已自动添加（url=${wsUrl(gw)}）`);
          log(`[setup] 协议端要重启一次才会读这份配置：先关掉 NapCat，再 start-napcat.bat`);
          continue;
        }
        if (touched) {
          writeJSONAtomic(f, j);
          synced.push(f);
          log(`[setup] 已把接入 token 同步到 ${f}`);
        }
      } catch (err) {
        log(`[setup] 跳过 ${f}：${err.message}`);
      }
    }
  }

  return { token: gw.accessToken, generated, synced, created, skipped };
}

/**
 * 让 config.json 成为 NapCat 管理页 token 的唯一数据源。
 *
 * 为什么要管这个：NapCat 自带的默认 token 是 "grapeleafi-webui" 这种可猜值，
 * 而管理页能直接改配置、踢登录、看消息。控制台只绑 127.0.0.1 时风险有限，
 * 但只要有人把 host 改成 0.0.0.0（局域网手机访问是常见需求），猜到 token
 * 就等于拿到整个 bot 的控制权。所以这里强制换成 32 位随机值。
 *
 * 与 ensureGatewayToken 同样：拿不到写权限只警告，不阻止启动。
 */
export function ensureNapCatWebuiToken(config, configPath, opts = {}) {
  const napcatConfigDir = opts.napcatConfigDir || join(PROJECT_ROOT, "bot", "napcat", "config");
  const log = opts.log || (() => {});
  const saveConfig = opts.saveConfig || (() => {});
  const bot = config.bot || (config.bot = {});
  const nap = bot.napcat || (bot.napcat = {});

  const webuiPath = join(napcatConfigDir, "webui.json");
  if (!existsSync(webuiPath)) {
    return { skipped: "NapCat 尚未安装（没有 webui.json），跳过管理页 token 同步" };
  }

  let current = null;
  try {
    current = JSON.parse(readFileSync(webuiPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    return { skipped: `读 webui.json 失败（${err.message}），跳过同步` };
  }

  // 三种情况要动手：config 里没填、NapCat 那边没填、两边不一致
  const want = isUnfilled(nap.webuiToken) ? generateToken() : String(nap.webuiToken).trim();
  if (!isUnfilled(nap.webuiToken) && current.token === want) {
    return { token: want, changed: false };
  }

  try {
    writeJSONAtomic(webuiPath, { ...current, token: want });
  } catch (err) {
    return { skipped: `写 webui.json 失败（${err.message}），本次不改动 NapCat` };
  }

  const wasUnfilled = isUnfilled(nap.webuiToken);
  if (wasUnfilled) {
    nap.webuiToken = want;
  }

  // 端口也从 NapCat 那边对齐一次，省得两个地方各写一遍。
  // 和 token 一起写盘，不要分成两次 saveConfig —— 那会让 config.json 被写两遍，
  // 两次之间进程若被打断，文件就处于「token 已改、端口没改」的中间态。
  if (Number(current.port) > 0 && !nap.webuiPort) {
    nap.webuiPort = Number(current.port);
  }
  if (wasUnfilled) {
    try {
      saveConfig();
    } catch (err) {
      log(`[setup] 警告：管理页 token 没能写回 ${configPath}（${err.message}），下次启动会再生成一次`);
    }
  }

  log(`[setup] NapCat 管理页 token 已${wasUnfilled ? "生成" : "同步"}到 ${webuiPath}（管理页地址 http://127.0.0.1:${current.port}）`);
  return { token: want, changed: true };
}

/** 校验 QQ 号长得对不对，避免填了别的数字白折腾 */
export function looksLikeQQ(v) {
  const s = String(v || "").trim();
  return /^\d{5,11}$/.test(s);
}
