import { plainText, textSeg, replySeg } from "./antiRisk.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toMinutes, inSpan } from "./timeutil.js";
import { logger } from "./logger.js";
import { LlmClient } from "./llm.js";
import { Games } from "./games.js";
import { loadContent, saveContent, resetContentCache, setContent, safeAssign } from "./content.js";
import { CheckIns } from "./checkins.js";
import { buildHelpImage } from "./helpImage.js";
import { loadJSON, saveJSON } from "./storage.js";
import { funCommands } from "./builtins/fun.js";
import { netCommands } from "./builtins/net.js";
import { gameCommands } from "./builtins/game.js";
import { memberCommands } from "./builtins/member.js";
import { moderCommands } from "./builtins/moderation.js";
import { interactCommands } from "./builtins/interact.js";
import { permCommands } from "./builtins/perm.js";
import { checkinCommands } from "./builtins/checkin.js";
import { levelTitleCommands } from "./builtins/leveltitle.js";
import { helpCommands } from "./builtins/help.js";
import { settingsCommands } from "./builtins/settings.js";
import { gachaCommands } from "./builtins/gacha.js";
import { cardCommands } from "./builtins/card.js";
import { datafixCommands } from "./builtins/datafix.js";
import { CardGame } from "./cards.js";
import { DEFAULTS, callbackOfText, atUsers, escRe, renderTemplate, templateSegs, parseApiResult } from "./brain-template.js";
import { CMD_CATEGORY, categoryOfBuiltin, NAME_MAP } from "./brain-registry.js";
import { createNoticeHandler } from "./brain-notice.js";
import { createKeywordEngine } from "./brain-keyword.js";

// —— 对外 API 汇总（保持历史 import 路径可用）——
export { renderTemplate, templateSegs, parseApiResult } from "./brain-template.js";
export { CMD_CATEGORY, categoryOfBuiltin, NAME_MAP } from "./brain-registry.js";


export function createBrain({ sender, gateway, config = {}, dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data"), startedAt }) {
const opt = {
    ...DEFAULTS,
    ...(config || {}),
    ai: { ...DEFAULTS.ai, ...((config || {}).ai || {}) },
    userRateLimit: { ...DEFAULTS.userRateLimit, ...((config || {}).userRateLimit || {}) },
    quietHours: { ...DEFAULTS.quietHours, ...((config || {}).quietHours || {}) },
    games: { ...DEFAULTS.games, ...((config || {}).games || {}) },
    privateReplyGapMs: (config || {}).privateReplyGapMs ?? DEFAULTS.privateReplyGapMs,
    aiReplyGapMs: (config || {}).aiReplyGapMs ?? DEFAULTS.aiReplyGapMs,
  };
  let content = loadContent(dataDir);
  const groupCmdLast = new Map();
  const groupCmdDaily = new Map();
  const games = new Games({ dataDir, config: opt.games });
  const checkins = new CheckIns({ dataDir });
  const cards = new CardGame({ dataDir });
  const llm = new LlmClient(opt.ai);
  // 这两个会被下面的 applyBotConfig 改写，所以不能用 const 快照
  let prefix = opt.commandPrefix;
  let nickname = opt.nickname;
  const isAdmin = (uid) => opt.adminIds.map(String).includes(String(uid));

  /**
   * 热重载 bot 段配置。控制台改设置后调用，换主人/改昵称/调频率限制都不用重启。
   * 只处理能在运行时安全生效的字段；gateway 监听参数和 console 自身监听属于启动期参数，
   * 改了必须重启，由控制台明确标注。
   */
  function applyBotConfig(patch) {
    const p = patch && typeof patch === "object" ? patch : {};
    for (const key of Object.keys(p)) {
      if (p[key] === undefined) continue;
      opt[key] = p[key];
    }
    // 嵌套段做浅合并，避免控制台只提交 userRateLimit 时把 ai 段冲掉
    for (const key of ["ai", "userRateLimit", "quietHours", "games"]) {
      if (p[key] && typeof p[key] === "object") opt[key] = { ...(opt[key] || {}), ...p[key] };
    }
    prefix = opt.commandPrefix;
    nickname = opt.nickname;
    // Games / LlmClient 在构造时把配置快照进了实例字段，得显式推给它们
    try { games.applyConfig?.(opt.games); } catch (err) { logger.error(`[config] 应用游戏配置失败: ${err.message}`); }
    try { llm.applyConfig?.(opt.ai); } catch (err) { logger.error(`[config] 应用 AI 配置失败: ${err.message}`); }
    logger.info(`[config] bot 配置已热重载（主人: ${opt.adminIds.join(", ") || "未设置"}）`);
    return { adminIds: [...opt.adminIds], nickname: opt.nickname, commandPrefix: opt.commandPrefix };
  }

  const permsPath = join(dataDir, "permissions.json");
  let permStore = loadJSON(permsPath, {}) || {};

  function grantedOf(uid) {
    const e = permStore[String(uid)] || {};
    return { admin: !!e.admin, perms: Array.isArray(e.perms) ? e.perms : [] };
  }

  function savePerms() {
    saveJSON(permsPath, permStore);
  }

  const lastReplyAt = new Map();
  const userWindow = new Map();
  const cmdCooldownAt = new Map();
  const kwCooldownAt = new Map();
  const aiCooldownAt = new Map();
  const aiHistories = new Map();

  function quietNow() {
    if (!opt.quietHours.enabled) return false;
    const now = new Date();
    return inSpan(now.getHours() * 60 + now.getMinutes(), toMinutes(opt.quietHours.start), toMinutes(opt.quietHours.end));
  }

  function gate(key, gapMs) {
    const last = lastReplyAt.get(key);
    const now = Date.now();
    if (last && now - last < gapMs) return false;
    lastReplyAt.set(key, now);
    if (lastReplyAt.size > 2000) {
      const keys = [...lastReplyAt.keys()];
      for (let i = 0; i < 1000; i++) lastReplyAt.delete(keys[i]);
    }
    return true;
  }

  function gapVal(key) {
    const g = content.settings?.gates;
    const v = g && g[key];
    return v === undefined || v === null || v === "" ? opt[key] : Number(v);
  }

  function userAllowed(uid) {
    if (isAdmin(uid)) return true;
    const now = Math.floor(Date.now() / 1000);
    const arr = (userWindow.get(String(uid)) || []).filter((t) => now - t < opt.userRateLimit.windowSec);
    return arr.length < opt.userRateLimit.max;
  }

  function recordUser(uid) {
    if (isAdmin(uid)) return;
    const now = Math.floor(Date.now() / 1000);
    const arr = (userWindow.get(String(uid)) || []).filter((t) => now - t < opt.userRateLimit.windowSec);
    arr.push(now);
    userWindow.set(String(uid), arr);
  }

  function privateAllowed(uid) {
    if (opt.replyPrivate === "all") return true;
    if (opt.replyPrivate === "off") return false;
    return isAdmin(uid) || opt.privateWhitelist.map(String).includes(String(uid));
  }

  function cmdCooldown(scope, name, sec) {
    const key = `${scope}:${name}`;
    const now = Date.now();
    const last = cmdCooldownAt.get(key);
    if (last && now - last < sec * 1000) return Math.ceil((last + sec * 1000 - now) / 1000);
    cmdCooldownAt.set(key, now);
    return 0;
  }

  function kgCheck(scope, id, sec) {
    const key = `${scope}:${id}`;
    const now = Date.now();
    const last = kwCooldownAt.get(key);
    if (last && now - last < sec * 1000) return false;
    kwCooldownAt.set(key, now);
    return true;
  }

  function sendMsg(body, segs, tag = "cmd", deadlineAt = null) {
    const isGroup = body.message_type === "group";
    recordUser(body.user_id);
    const quote = (content.settings && content.settings.replyQuote) !== false;
    const message = quote ? [replySeg(body.message_id), ...segs] : segs;
    return sender.enqueue({
      type: isGroup ? "group" : "private",
      targetId: isGroup ? body.group_id : body.user_id,
      message,
      tag,
      fromUserId: body.user_id,
      deadlineAt,
    });
  }

  function sendText(body, text, tag = "cmd") {
    return sendMsg(body, [textSeg(text)], tag);
  }


  // 关键词回复引擎在 brain-keyword.js。这里必须晚于 senderName/panelSegs/timeReplyFor/
  // isGroupPrivileged 的定义（它们是 const/function 声明，位置敏感），所以放在这段之后。
  const keywordEngine = createKeywordEngine({
    gateway,
    checkins,
    senderName,
    panelSegs,
    panelFallbackText,
    timeReplyFor,
    isGroupPrivileged,
  });
  const { replySegs, performActions } = keywordEngine;

  function sendSegs(body, segs, tag = "cmd") {
    if (!segs || !segs.length) return Promise.resolve();
    return sendMsg(body, segs, tag);
  }

  function varsFor(body, args) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const nick = body.sender && (body.sender.card || body.sender.nickname) ? body.sender.card || body.sender.nickname : "";
    const targets = atUsers(body);
    return {
      args: Array.isArray(args) ? args : [],
      qq: body.user_id,
      gid: body.message_type === "group" ? body.group_id : "",
      nick,
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      target: targets[0] || "",
      role: body.sender && body.sender.role ? body.sender.role : "member",
      owner: isAdmin(body.user_id),
      grantedAdmin: grantedOf(body.user_id).admin,
    };
  }

  function segArrOf(m) {
    if (typeof m === "string" || (!m && typeof m !== "object")) return [textSeg(String(m || ""))];
    if (Array.isArray(m)) return m;
    return [m];
  }

  async function sendMulti(body, msgs, tag = "api") {
    if (!msgs || !msgs.length) return Promise.resolve();
    if (msgs.length === 1) return sendMsg(body, segArrOf(msgs[0]), tag);
    const isGroup = body.message_type === "group";
    const nodes = msgs.map((m) => ({
      type: "node",
      data: { name: nickname, uin: String(body.self_id ?? ""), content: segArrOf(m) },
    }));
    const action = isGroup ? "send_group_forward_msg" : "send_private_forward_msg";
    const params = isGroup ? { group_id: body.group_id, messages: nodes } : { user_id: body.user_id, messages: nodes };
    try {
      await gateway.call(action, params, 20000);
      return;
    } catch (err) {
      logger.warn(`[api] 合并转发失败，改逐条发送：${err.message}`);
      for (const m of msgs) await sendMsg(body, segArrOf(m), tag);
    }
  }

  async function handleApiCommand(e, body, args) {
    const name = e.name || "指令";
    const api = e.api || {};
    const url = String(api.url || "").trim();
    if (!url) {
      await sendText(body, `指令「${name}」未配置接口地址。`, "api");
      return;
    }
    const vars = varsFor(body, args);
    const send = api.send || "args";
    let content = args.join(" ");
    if (send !== "args") {
      content = cmdTextOf(body.message)
        .replace(/^@\d+\s*/, "")
        .replace(new RegExp(`^\\s*${escRe(prefix)}\\S+\\s*`), "")
        .replace(new RegExp(`^${escRe(String(name))}\\s*`), "")
        .trim();
    }
    const images = (body.message || [])
      .filter((s) => s.type === "image")
      .map((s) => (s.data ? s.data.url || s.data.file || "" : ""))
      .filter(Boolean);
    const payload = {
      command: name,
      user_id: String(body.user_id),
      group_id: body.message_type === "group" ? String(body.group_id) : "",
      nickname: vars.nick,
      text: content,
      images: send === "text_image" ? images : [],
      time: vars.time,
      date: vars.date,
    };
    const method = (api.method || "POST").toUpperCase();
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (api.authToken) headers.Authorization = `Bearer ${api.authToken}`;
    const timeoutMs = (Number(api.timeoutSec) > 0 ? Number(api.timeoutSec) : 25) * 1000;
    logger.info(`[api] 指令「${name}」调 ${method} ${url} (text=${payload.text || ""} images=${payload.images.length})`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let res;
      if (method === "GET") {
        const qs = new URLSearchParams();
        qs.set("command", name);
        qs.set("user_id", payload.user_id);
        qs.set("text", payload.text);
        for (const im of payload.images) qs.append("image", im);
        res = await fetch(url + (url.includes("?") ? "&" : "?") + qs.toString(), {
          headers: { Accept: headers.Accept, ...(headers.Authorization ? { Authorization: headers.Authorization } : {}) },
          signal: ctrl.signal,
        });
      } else {
        res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: ctrl.signal });
      }
      if (!res.ok) {
        const er = (await res.text()).slice(0, 200);
        throw new Error(er || `HTTP ${res.status}`);
      }
      const raw = await res.text();
      const msgs = parseApiResult(raw).map((m) => (typeof m === "string" ? renderTemplate(m, vars) : m));
      await sendMulti(body, msgs, name);
    } catch (err) {
      logger.error(`[api] 指令「${name}」调用失败: ${err.message}`);
      await sendText(body, `指令「${name}」调用失败：${err.message}`, "api");
    } finally {
      clearTimeout(timer);
    }
  }

  async function apiReply(body, text) {
    let ok = true;
    try {
      if (!gate(`api:${body.user_id}`, gapVal("aiReplyGapMs"))) return;
      if (!llm.isEnabled()) {
        await sendText(body, content.ai.offlineReply, "ai");
        return;
      }
      const key = body.message_type === "group" ? `g:${body.group_id}` : `p:${body.user_id}`;
      const remain = aiCooldownAt.get(key) || 0;
      const now = Date.now();
      if (now < remain) return;
      let history = (aiHistories.get(key) || []).filter(Boolean);
      history.push({ role: "user", content: text });
      history = history.slice(-12);
      const reply = await llm.chat(history, content.ai.systemPrompt);
      history.push({ role: "assistant", content: reply });
      if (history.length > 20) history = history.slice(-14);
      aiHistories.set(key, history);
      aiCooldownAt.set(key, now + opt.ai.cooldownSec * 1000);
      await sendText(body, reply, "ai");
    } catch (err) {
      ok = false;
      logger.error(`[ai] 对话失败: ${err.message}`);
      await sendText(body, content.ai.errorReply, "ai");
    }
    return ok;
  }

  async function hasAdmin(body, key = null) {
    if (isAdmin(body.user_id)) return true;
    const g = grantedOf(body.user_id);
    if (g.admin) return true;
    if (key && g.perms.includes(key)) return true;
    const role = body.sender && body.sender.role;
    if (role === "admin" || role === "owner") return true;
    if (body.message_type === "group" && gateway) {
      try {
        const info = await gateway.call("get_group_member_info", { group_id: body.group_id, user_id: body.user_id });
        if (info && (info.role === "admin" || info.role === "owner")) return true;
      } catch {}
    }
    return false;
  }

  async function isGroupPrivileged(body) {
    return hasAdmin(body, null);
  }

  function senderName(body) {
    return body && body.sender && (body.sender.card || body.sender.nickname)
      ? body.sender.card || body.sender.nickname
      : `QQ${body.user_id}`;
  }

  function panelSegs() {
    return [
      { type: "markdown", data: { content: "## 🍇 葡萄工作台\n点击下方按钮快速操作 👇" } },
      {
        type: "keyboard",
        data: {
          rows: [
            [
              { type: "button", text: "✅ 签到", id: "cb.signin" },
              { type: "button", text: "🎣 钓鱼", id: "cb.fish" },
            ],
            [
              { type: "button", text: "🔮 运势", id: "cb.luck" },
              { type: "button", text: "🏷️ 等级", id: "cb.level" },
            ],
          ],
        },
      },
    ];
  }

  function panelFallbackText() {
    return "🍇 葡萄工作台（当前协议端不支持按钮卡片，手动输入对应指令即可）：\n签到 → /签到\n钓鱼 → /钓鱼\n运势 → /运势\n等级 → /等级";
  }

  async function builtinTime(body) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return sendText(body, `🕐 现在是 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, "time");
  }
function groupFeaturesEnabled(body, found) {
    if (body.message_type !== "group") return true;
    if (isAdmin(body.user_id)) return true;
    const st = content.settings || {};
    if (found.builtin) {
      const b = BUILTINS[found.key];
      if (found.key === "ping" || found.key === "help") return true;
      if (b && (b.adminOnly || b.ownerOnly)) return true;
    }
    const gid = String(body.group_id);
    const cmdKey = found.builtin ? `cmd:${found.key}` : `cmd:${(found.entry && found.entry.name) || found.name}`;
    const ck = found.builtin ? `cat:${categoryOfBuiltin(found.key)}` : null;
    const e = st.groupEnabled || {};
    if (Array.isArray(e[cmdKey])) return e[cmdKey].map(String).includes(gid);
    if (ck && Array.isArray(e[ck])) return e[ck].map(String).includes(gid);
    const off = Array.isArray(st.defaultOff) ? st.defaultOff : [];
    if (off.includes(found.builtin ? found.key : (found.entry && found.entry.name))) return false;
    if (ck && off.includes(ck.slice(4))) return false;
    return true;
  }

  const BUILTINS = {
    ping: {
      fn: async (body) => {
        const latency = Date.now() - (body.time ? body.time * 1000 : Date.now());
        return sendText(body, `pong 延迟约 ${Math.abs(latency)}ms，运行中。`, "ping");
      },
    },
时间: { fn: builtinTime, cooldownSec: 0 },
    ...gachaCommands({ sendText, sendMsg, textSeg, games, content }),
    ...helpCommands({
      sendText, sendMsg, textSeg, buildHelpImage, logger, content, isAdmin, isGroupPrivileged,
      // 用取值器而不是直接传值：nickname / prefix 会被 applyBotConfig 热改
      // （控制台改设置、以及首次连上协议端时自动认领昵称），
      // 直接传值等于把当时的快照拍死，/help 会一直显示旧昵称直到重启。
      get nickname() { return nickname; },
      get prefix() { return prefix; },
    }),
    ...checkinCommands({ checkins, cards, content, sendText, sendMsg, textSeg }),
    ...levelTitleCommands({ content, saveContent, dataDir, isGroupOwner: isGroupPrivileged, isAdmin, sendText, checkins }),
    ...cardCommands({ cards, checkins, sendText, sendMsg, textSeg }),
    ...memberCommands({ gateway, sendText, sendMsg, textSeg }),
    ...moderCommands({ gateway, sendText }),
    ...interactCommands({ gateway, sendText, sendMsg, textSeg }),
    ...permCommands({ sendText, permStore, savePerms, grantedOf, isAdmin }),
    ...datafixCommands({ sendText, dataDir, checkins, cards, games, permStore, savePerms, grantedOf }),
    ...settingsCommands({ sendText, content, saveContent, dataDir, builtinsView: () => BUILTINS, cmdCategory: CMD_CATEGORY }),
    ...funCommands({ sendText }),
    ...netCommands({ sendText, sendMsg, textSeg, getContent: () => content, logger }),
    ...gameCommands({ sendText, sendMsg, gateway, dataDir, cmdCooldown, isAdmin, isGroupPrivileged }),
  };

  function lookupCommand(name) {
    if (NAME_MAP[name]) return { builtin: true, key: NAME_MAP[name], name };
    // 兜底：注册表里没登记别名，但 BUILTINS 确实有这个键，就当规范名直接用。
    // 以前只认 NAME_MAP，漏登记的表现是「指令彻底静默、不报错」，最难排查；
    // 加了这层以后，漏登记最坏只是别名不通，规范名仍然能调。
    if (Object.prototype.hasOwnProperty.call(BUILTINS, name)) return { builtin: true, key: name, name };
    const list = content.presets?.commands || [];
    let found = list.find((c) => c && c.name === name);
    if (!found) found = list.find((c) => c && Array.isArray(c.aliases) && c.aliases.map(String).includes(String(name)));
    if (found) return { builtin: false, entry: found, name };
    return null;
  }

  async function dispatchCommand(body, name, args) {
    const found = lookupCommand(name);
    if (!found) return false;
    const isGroup = body.message_type === "group";
    const birthdayToggle = found.key === "生日" && ["开启", "关闭", "开", "关", "开通", "取消", "on", "off"].includes(String(args && args[0] || "").toLowerCase());
    if (isGroup && !birthdayToggle && !groupFeaturesEnabled(body, found)) {
      const what = found.builtin ? found.key : (found.entry && found.entry.name) || found.name;
      const cd = cmdCooldown(`deny:${body.user_id}:${what}`, "deny", 20);
      if (cd === 0) {
        await sendText(body, `「${name}」在本群还没开启。发 /开启 ${what} 就能用了（也可开启整个类型，如 /开启 ${found.builtin ? categoryOfBuiltin(found.key) : "自定义"}）。`, "denied");
      }
      return true;
    }

    if (found.builtin) {
      const b = BUILTINS[found.key];
      const cfg = (content.builtins && content.builtins[found.key]) || {};
      if (cfg.enabled === false) return true;
      if (b.ownerOnly && !isAdmin(body.user_id)) return false;
      // 群指令在私聊里原本是直接 return true 静默吞掉：用户发了 /戳一戳 却一个字都收不到，
      // 看起来就像「指令没生效」。这里改成给一句明确提示（带冷却，避免被刷）。
      if (b.groupOnly && !isGroup) {
        const cd2 = cmdCooldown(`private:${body.user_id}`, "privateonly", 20);
        if (cd2 === 0) await sendText(body, `/${name} 只能在群聊里用。`, "privateonly");
        return true;
      }
      if (isGroup && Array.isArray(cfg.groups) && cfg.groups.length && !cfg.groups.map(String).includes(String(body.group_id))) return true;
      const allowPrivate = cfg.allowPrivate === undefined ? !b.groupOnly : cfg.allowPrivate;
      if (!isGroup && allowPrivate === false) {
        const cd2 = cmdCooldown(`private:${body.user_id}`, "privateonly", 20);
        if (cd2 === 0) await sendText(body, `/${name} 已被设置为只能在群聊里用（控制台 → 内置指令 → 私聊可用）。`, "privateonly");
        return true;
      }
      const adminOnly = cfg.adminOnly === undefined ? !!b.adminOnly : cfg.adminOnly;
      if (adminOnly && !(await hasAdmin(body, found.key))) {
        const cd = cmdCooldown(`deny:${body.user_id}`, "deny", 10);
        if (cd === 0) await sendText(body, "权限不够：该指令仅本群管理员/主人或被授权者可用。", "denied");
        return true;
      }
      const cdSec = cfg.cooldownSec == null ? 3 : Math.max(0, Number(cfg.cooldownSec));
      const cd = cmdCooldown(`${isGroup ? "g" : "p"}:${body.user_id}`, found.key, cdSec);
      if (cd > 0) return true;
      try {
        await b.fn(body, args);
      } catch (err) {
        logger.error(`[cmd] ${name} 执行出错: ${err.message}`);
        await sendText(body, `执行出错：${err.message}`, "cmd");
      }
      return true;
    }

      const e = found.entry;
      // 权限门禁。ownerOnly 优先于 adminOnly：勾了它就只认 config.json 的 adminIds，
      // 连群主/群管理/被授权者都不放行（内置的 /设积分 等就是这么做的）。
      if (e.ownerOnly && !isAdmin(body.user_id)) {
        const cd = cmdCooldown(`deny:${body.user_id}`, "deny", 10);
        if (cd === 0) await sendText(body, "权限不够：该指令仅主人可用。", "denied");
        return true;
      }
      if (e.adminOnly && !(await hasAdmin(body, e.permKey || null))) {
        const cd = cmdCooldown(`deny:${body.user_id}`, "deny", 10);
        if (cd === 0) await sendText(body, "权限不够：该指令仅本群管理员或主人可用。", "denied");
        return true;
      }
    if (isGroup && e.groups && e.groups.length && !e.groups.map(String).includes(String(body.group_id))) return true;
    if (!isGroup && e.allowPrivate === false) return true;
    const cd = cmdCooldown(`${isGroup ? "g" : "p"}:${body.user_id}:${e.name}`, e.name, e.cooldownSec ?? 5);
    if (cd > 0) return true;
    if (e.api && e.api.enabled !== false && e.api.url) {
      await handleApiCommand(e, body, args);
      return true;
    }
    await sendSegs(body, await replySegs(e, null, false, varsFor(body, args), body), "preset");
    return true;
  }

  function timeReplyFor(key) {
    const tr = key && key.timeReplies;
    if (!tr || typeof tr !== "object") return null;
    const h = new Date().getHours();
    if (h >= 5 && h < 12 && tr.morning) return tr.morning;
    if (h >= 12 && h < 18 && tr.afternoon) return tr.afternoon;
    if (h >= 18 && h < 22 && tr.evening) return tr.evening;
    if (tr.night) return tr.night;
    return null;
  }

  // gate: { owner: boolean, admin(key): boolean|Promise<boolean> }
  // ownerOnly 只认 config.json 的 adminIds；adminOnly 可以用 permKey 指定「授权项」来放行。
  async function keywordHit(text, mentioned = false, groupId = null, gate = { owner: false, admin: () => false }) {
    if (!text) return null;
    const list = content.presets?.keywords || [];
    for (const k of list) {
      if (!k) continue;
      const kws0 = Array.isArray(k.matches) && k.matches.length ? k.matches : [k.match].filter(Boolean);
      let kws = k.useRegex ? kws0 : kws0.flatMap((w) => String(w).split("/").map((s) => s.trim())).filter(Boolean);
      if (!kws.length) continue;
      const hasReply =
        k.reply || k.repeat || k.image || k.imageDir || (Array.isArray(k.randomReplies) && k.randomReplies.some(Boolean)) || timeReplyFor(k);
      if (!hasReply) continue;
      if (k.mentionOnly && !mentioned) continue;
      if (k.ownerOnly && !gate.owner) continue;
      if (k.adminOnly && !(await gate.admin(k.permKey || null))) continue;
      if (groupId != null && k.groups && k.groups.length && !k.groups.map(String).includes(String(groupId))) continue;
      let hit = false;
      const kwKey = kws[0];
      let matchedWord = null;
      for (const kw of kws) {
        if (k.useRegex) {
          try {
            const src = k.contains ? kw : `^(?:${kw})$`;
            if (new RegExp(src, "i").test(text)) { hit = true; matchedWord = kw; break; }
          } catch { /* 非法正则跳过该词 */ }
        } else if (k.contains ? text.includes(kw) : text === kw) {
          hit = true;
          matchedWord = kw;
          break;
        }
      }
      if (!hit) continue;
      if (Array.isArray(k.excludeWords)) {
        const bad = k.excludeWords.some((w) => w && String(w) && text.includes(String(w)));
        if (bad) continue;
      }
      return Object.assign({}, k, { match: k.match || kwKey, _mw: matchedWord });
    }
    return null;
  }

  async function tryKeyword(body, text, mentioned = false) {
    if (!opt.keywordAutoReply) return false;
    const isGroup = body.message_type === "group";
    // 只有真的存在「权限类关键字」时才去查权限，避免每条消息都打一次 get_group_member_info。
    const needAdmin = (content.presets?.keywords || []).some((x) => x && x.adminOnly && !x.ownerOnly);
    const needOwner = (content.presets?.keywords || []).some((x) => x && x.ownerOnly);
    const gate = {
      owner: needOwner ? isAdmin(body.user_id) : false,
      admin: async (key) => {
        if (!needAdmin) return false;
        return isGroup ? hasAdmin(body, key) : isAdmin(body.user_id);
      },
    };
    const k = await keywordHit(text, mentioned, isGroup ? String(body.group_id) : null, gate);
    if (!k) return false;
    if (!isGroup && k.allowPrivate === false) return false;
    const scope = `${isGroup ? "g:" + body.group_id : "p:" + body.user_id}`;
    const kwCd = k.cooldownSec ?? (timeReplyFor(k) ? 10 : 60);
    if (!kgCheck(scope, k._mw || k.match, kwCd)) return true;
    const kwMaxLen = Number((content.settings && content.settings.keywordMaxLen) ?? 0);
    if (isGroup && kwMaxLen > 0 && text.length > kwMaxLen && (k.contains || k.useRegex)) return false;
    let kwArgs = [];
    const mw = k._mw;
    if (mw) {
      if (k.useRegex) {
        try {
          const m = new RegExp(mw, "i").exec(text);
          if (m) {
            const groups = m.slice(1).filter((g) => g != null && String(g) !== "");
            if (groups.length) kwArgs = groups.flatMap((g) => String(g).split(/\s+/)).filter(Boolean);
            else {
              const tail = (text.slice(m.index + m[0].length) || "").trim();
              if (tail) kwArgs = tail.split(/\s+/);
            }
          }
        } catch { /* 忽略非法正则 */ }
      } else {
        const i = text.indexOf(mw);
        if (i >= 0) {
          const tail = text.slice(i + mw.length).trim();
          if (tail) kwArgs = tail.split(/\s+/);
        }
      }
    }
    const segs = await replySegs(k, text, true, varsFor(body, kwArgs), body);
    if (!segs) return false;
    await sendSegs(body, segs, "kw");
    return true;
  }

  function cmdTextOf(message) {
  if (typeof message === "string") return message;
  return (message || [])
    .filter((s) => s.type === "text" && s.data && s.data.text)
    .map((s) => s.data.text)
    .join("");
}

async function dispatchAddressed(body, clean) {
    let text = clean;
    if (text.startsWith(prefix)) text = text.slice(prefix.length).trim();
    if (!text) return false;
    const names = new Set(Object.keys(NAME_MAP));
    for (const c of (content.presets?.commands || [])) {
      if (!c) continue;
      if (c.name) names.add(String(c.name));
      if (Array.isArray(c.aliases)) for (const a of c.aliases) if (a) names.add(String(a));
    }
    const sorted = [...names].sort((a, b) => b.length - a.length);
    for (const nm of sorted) {
      if (nm && text.startsWith(nm) && (text.length === nm.length || text[nm.length] === " ")) {
        const rest = text.slice(nm.length).trim();
        const d = await dispatchCommand(body, nm, rest ? rest.split(/\s+/) : []);
        if (d) return true;
      }
    }
    return false;
  }

  async function tryGroupCmd(body, rawText) {
    if (body.message_type !== "group") return false;
    const gid = String(body.group_id);
    const uid = String(body.user_id);
    const text = String(rawText || "").trim();
    if (!text) return false;

    const gkws = (content.presets?.keywords || []).filter(
      (k) => k && k.groupMade && Array.isArray(k.groups) && k.groups.map(String).includes(gid)
    );

    const ACT = [
      ["添加指令", "add"],
      ["新增指令", "add"],
      ["教我", "add"],
      ["删除指令", "del"],
      ["移除指令", "del"],
      ["忘记", "del"],
      ["本群指令", "list"],
      ["查询指令", "list"],
      ["自定义指令", "list"],
      ["群指令", "list"],
    ];
    let act = null;
    let rest = text;
    for (const [word, a] of ACT) {
      if (text.startsWith(word)) {
        act = a;
        rest = text.slice(word.length).trim();
        break;
      }
    }
    if (!act) return false;

    if (act === "list") {
      if (!gkws.length) {
        await sendText(body, "本群还没有自定义指令。发送「@bot 添加指令 名字 机器人回复的内容」即可添加一条。", "gcmd");
      } else {
        const lines = gkws.map((k, i) => `${i + 1}. ${k.match} → ${k.reply || (k.randomReplies || [])[0] || "(图片等)"}`).join("\n");
        await sendText(body, `本群有 ${gkws.length} 条自定义指令：\n${lines}`, "gcmd");
      }
      return true;
    }

    const last = groupCmdLast.get(uid) || 0;
    if (Date.now() - last < 10000 && !isAdmin(uid)) {
      await sendText(body, "操作太频繁啦，10 秒后再试～", "gcmd");
      return true;
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    const used = groupCmdDaily.get(`${uid}:${dayKey}`) || 0;
    if (used >= 20 && !isAdmin(uid)) {
      await sendText(body, "今天添加/删除的指令太多啦（上限 20 条），明天再来吧。", "gcmd");
      return true;
    }

    const name = rest.split(/\s+/)[0] || "";
    const reply = rest.slice(name.length).trim();
    if (!name) {
      await sendText(
        body,
        act === "add"
          ? "语法：@bot 添加指令 名字 回复内容。例：「添加指令 寄寄 寄寄富」，之后群里发「寄寄」就自动回复「寄寄富」。"
          : "语法：@bot 删除指令 名字。例：「删除指令 寄寄」。",
        "gcmd"
      );
      return true;
    }
    if (name.startsWith("/") || name.length > 20) {
      await sendText(body, "指令名不能以 / 开头，且不能超过 20 个字。", "gcmd");
      return true;
    }

    if (act === "add") {
      if (!reply) {
        await sendText(body, "还要告诉我回复内容：@bot 添加指令 名字 回复内容。", "gcmd");
        return true;
      }
      const dup = (content.presets?.keywords || []).find(
        (k) => k && k.match === name && (!Array.isArray(k.groups) || k.groups.length === 0 || k.groups.map(String).includes(gid))
      );
      if (dup) {
        await sendText(body, `本群已经有「${name}」啦（或与全局关键字重名），先发「删除指令 ${name}」删掉再添加吧。`, "gcmd");
        groupCmdLast.set(uid, Date.now());
        groupCmdDaily.set(`${uid}:${dayKey}`, used + 1);
        return true;
      }
      (content.presets || (content.presets = {})).keywords.push({
        match: name,
        reply,
        contains: false,
        cooldownSec: 5,
        groups: [Number(gid)],
        allowPrivate: false,
        groupMade: true,
      });
      saveContent(dataDir, content);
      reload();
      groupCmdLast.set(uid, Date.now());
      groupCmdDaily.set(`${uid}:${dayKey}`, used + 1);
      await sendText(body, `已在本群添加指令「${name}」：群里发「${name}」即自动回复「${reply}」。发「本群指令」可查看，发「删除指令 ${name}」可删除。`, "gcmd");
      return true;
    }

    if (act === "del") {
      const idx = gkws.findIndex((k) => k.match === name);
      if (idx < 0) {
        await sendText(body, `本群没有「${name}」这条自定义指令。`, "gcmd");
        return true;
      }
      const target = gkws[idx];
      const allIdx = (content.presets?.keywords || []).indexOf(target);
      if (allIdx >= 0) content.presets.keywords.splice(allIdx, 1);
      saveContent(dataDir, content);
      reload();
      groupCmdLast.set(uid, Date.now());
      groupCmdDaily.set(`${uid}:${dayKey}`, used + 1);
      await sendText(body, `已删除本群指令「${name}」。`, "gcmd");
      return true;
    }
    return true;
  }

  async function respondGroup(body) {
    const text = (plainText(body.message) || "").trim();
    if (!text) return;

    const cmdText = (cmdTextOf(body.message) || text).trim();
    const parts = cmdText.split(/\s+/);
    const isCmd = parts[0].startsWith(prefix);
    const dispatch = isCmd ? await dispatchCommand(body, parts[0].slice(prefix.length), parts.slice(1)) : false;
    if (dispatch) return;
    if (await tryGroupCmd(body, cmdText)) return;
    const cbName = callbackOfText(cmdText);
    if (cbName) {
      if (await dispatchCommand(body, cbName, [])) return;
    }

    const selfId = String(body.self_id);
    const mentioned = body.message.some((s) => s.type === "at" && String(s.data.qq) === selfId);
    const called = text.startsWith(nickname);

    if (mentioned || called) {
      const clean = (cmdTextOf(body.message) || text).replace(new RegExp(`^${nickname}`, ""), "").trim();
      if (clean) {
        const d3 = await dispatchAddressed(body, clean);
        if (d3) return;
        if (clean.startsWith(prefix)) return;
        if (await tryGroupCmd(body, clean)) return;
        if (await tryKeyword(body, clean, true)) return;
        await apiReply(body, clean);
      } else {
        await sendText(body, "在的，随时喊我！输入 /help 看我能做什么。", "mention");
      }
      return;
    }

    if (content.settings?.groupReplyMode === "mention") return;
    if (!gate(`g:${body.group_id}`, gapVal("groupReplyGapMs"))) return;
    await tryKeyword(body, text, false);
  }

  async function respondPrivate(body) {
    const text = (plainText(body.message) || "").trim();
    if (!text) return;

    const cmdText = (cmdTextOf(body.message) || text).trim();
    const parts = cmdText.split(/\s+/);
    const raw = parts[0];
    if (raw.startsWith(prefix)) {
      const dispatched = await dispatchCommand(body, raw.slice(prefix.length), parts.slice(1));
      if (dispatched) return;
    }

    if (await tryKeyword(body, text, true)) return;
    await apiReply(body, text);
  }

  function reload() {
    resetContentCache();
    const next = loadContent(dataDir);
    for (const key of Object.keys(content)) delete content[key];
    // 必须用 safeAssign：Object.assign 会走 [[Set]]，若 content.json 里
    // 混进了 "__proto__"，这里就会把 content 的原型换掉（原型注入）。
    safeAssign(content, next);
    setContent(content);
    logger.info("[config] 已重新加载 content.json");
    cards.reloadMeta();
    return content;
  }


  const handleNotice = createNoticeHandler({ sender, textSeg, getContent: () => content });

  const handleEvent = async function (body) {
    if (!body) return;
    if (body.post_type === "notice") {
      await handleNotice(body);
      return;
    }
    if (body.post_type !== "message") return;
    if (String(body.self_id) === String(body.user_id)) return;

    let text = plainText(body.message);
    logger.info(`[${body.message_type}] ${body.user_id}: ${text || "(非文本)"}`);

    if (body.message_type === "group") {
      const gcfg = content.settings || {};
      let wgroups = gcfg.replyGroups;
      if (!Array.isArray(wgroups)) wgroups = opt.replyGroups || [];
      wgroups = wgroups.map(String);
      if (wgroups.length && !wgroups.includes(String(body.group_id))) return;
      const bgroups = Array.isArray(gcfg.blockGroups) ? gcfg.blockGroups : [];
      if (bgroups.map(String).includes(String(body.group_id))) {
        logger.info(`[gate] 群 ${body.group_id} 在黑名单，跳过回复`);
        return;
      }

      const atAll = (body.message || []).some((s) => s.type === "at" && ["all", "0"].includes(String(s.data.qq)));
      if (atAll) {
        logger.info(`[gate] 忽略 at-all 消息，避免互动放大`);
        return;
      }

      const admin = isAdmin(body.user_id);
      const allowQ = new Set([
        ...(opt.quietHours.allowGroups || []).map(String),
        ...Array.isArray(gcfg.quietAllowGroups) ? gcfg.quietAllowGroups.map(String) : [],
      ]);
      if (quietNow() && !admin && !allowQ.has(String(body.group_id))) {
        logger.info(`[gate] 深夜静默窗口，跳过群 ${body.group_id} 的回复`);
        return;
      }
      if (!userAllowed(body.user_id)) {
        logger.info(`[gate] 用户 ${body.user_id} 触发频率上限，跳过`);
        return;
      }
      await respondGroup(body);
      return;
    }

    if (body.message_type === "private") {
      if (!privateAllowed(body.user_id)) {
        if (opt.replyPrivate !== "off") {
          logger.info(`[gate] 私聊对方不在白名单，忽略 (uid=${body.user_id})`);
        }
        return;
      }
      if (quietNow() && !isAdmin(body.user_id)) {
        logger.info(`[gate] 深夜静默窗口，跳过私聊回复`);
        return;
      }
      if (!userAllowed(body.user_id)) {
        logger.info(`[gate] 用户 ${body.user_id} 触发频率上限，跳过`);
        return;
      }
      await respondPrivate(body);
    }
  };

  handleEvent.reload = reload;
  handleEvent.applyBotConfig = applyBotConfig;
  return handleEvent;
}
