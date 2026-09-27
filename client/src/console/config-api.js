// console/config-api.js —— 控制台的「内容合并 + config.json 读写」纯逻辑。
// identOfEntry/mergeArrayById/applyDeletions 负责把页面提交的数组按 id 合并进 content.json；
// SECRET_PATHS/maskSecrets/validateConfig 负责密钥脱敏与配置合法性校验。
import { isUnfilled } from "../setup.js";

export function identOfEntry(e, kind) {
  if (!e) return "";
  if (kind === "commands") return "cmd:" + String(e.name || "").trim();
  if (kind === "keywords") return "kw:" + String(e.match || "").trim() + "|" + (Array.isArray(e.groups) ? e.groups : []).join(",");
  if (kind === "schedule") return "sch:" + String(e.id || e.time || "");
  if (kind === "animeSources") return "anime:" + String(e.id || e.url || "").trim();
  return kind + ":" + JSON.stringify(e);
}

export function mergeArrayById(serverArr, postedArr, kind) {
  const out = [];
  const idx = new Map();
  for (const it of serverArr || []) {
    const k = identOfEntry(it, kind);
    if (!k) continue;
    idx.set(k, out.length);
    out.push(it);
  }
  for (const it of postedArr || []) {
    const k = identOfEntry(it, kind);
    if (!k) continue;
    const pos = idx.get(k);
    if (pos === undefined) {
      idx.set(k, out.length);
      out.push(it);
    } else {
      out[pos] = it;
    }
  }
  return out;
}

export function applyDeletions(arr, deleted, kind) {
  if (!deleted || !deleted.length) return arr;
  const del = new Set(deleted);
  return (arr || []).filter((it) => !del.has(identOfEntry(it, kind)));
}

// ===== config.json 读写支持 =====
// 敏感值（token / apiKey / accessToken）绝不下发到页面，截图分享控制台不会泄露密钥。
// 协议上也不用「空字符串」表达"保持原值"——那和"清空"没法区分：
//   GET  → config 里敏感字段置空，另给 secretsSet 说明哪些「本来有值」
//   POST → 只提交 secrets 里显式列出的路径，其余敏感字段一律不动
// 这样清空 token（合法的运维动作）和忘记填 token 不会被混为一谈。

/** 需要脱敏的字段路径（点号分隔） */
export const SECRET_PATHS = [
  "gateway.accessToken",
  "console.token",
  "bot.ai.apiKey",
  // QQ 密码：漏了就等于把 QQ 账号交出去。NapCat 那边要 MD5，
  // 但我们存的是原始密码（掩码后前端回传空串，服务端保留原值），
  // 所以这个字段在响应里必须永远是空的。
  "bot.napcat.password",
  "bot.napcat.webuiToken",
];

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, val) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== "object" || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = val;
}

/** 下发页面：敏感值置空，并报告哪些字段本来有值 */
export function maskSecrets(cfg) {
  const out = structuredClone(cfg);
  const secretsSet = [];
  for (const p of SECRET_PATHS) {
    const v = getPath(out, p);
    // 占位符（****** / 空）不算「已设置」。install.bat 把模板原样复制成 config.json，
    // 所以新装的人所有密钥字段都是 ******；以前这里一律报「已设置」，
    // 设置页就会把一句谎话显示给用户，而点「清空」反倒才是唯一能用的操作。
    if (typeof v === "string" && v && !isUnfilled(v)) {
      secretsSet.push(p);
      setPath(out, p, "");
    }
  }
  return { config: out, secretsSet };
}
export const isPort = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 65535;

/**
 * 保存前的 sanity check。宁可拒绝保存，也不要写进去一个主人自己都进不上的配置——
 * 那种情况重启后控制台连不上，等于把机器人锁在门外，只能手动改文件。
 */
export function validateConfig(cfg) {
  if (typeof cfg !== "object" || cfg === null) return "配置无效";

  if (cfg.gateway) {
    const g = cfg.gateway;
    if (!isPort(g.port)) return "gateway.port 必须是 1~65535 的整数（当前：" + JSON.stringify(g.port) + "）";
    if (!g.path || !String(g.path).startsWith("/")) return "gateway.path 必须以 / 开头，例如 /onebot/v11/ws";
    if (!g.host) return "gateway.host 不能为空";
  }

  const bot = cfg.bot || {};
  if (bot.commandPrefix !== undefined && !String(bot.commandPrefix)) return "bot.commandPrefix 不能为空";
  if (bot.adminIds !== undefined) {
    if (!Array.isArray(bot.adminIds)) return 'bot.adminIds 必须是数组，例如 ["123456789"]';
    // 空数组是合法状态：主人可以在控制台里主动清空，不该被拦。
    if (!bot.adminIds.length) {
      // 放行
    } else {
      // 模板里填的是 ******，那是「还没填」而不是「填错了」。
      // 不区分的话，新人从控制台改任何设置都会被这条拦下，
      // 而且报错写「不像 QQ 号」，看不出到底该填什么。
      const PLACEHOLDER = /^\*+$|^(null|undefined|-|your_token_here)$/i;
      const real = bot.adminIds.filter((x) => !PLACEHOLDER.test(String(x).trim()));
      if (!real.length) {
        return "还没填主人 QQ 号：请把 bot.adminIds 里的 ****** 换成你自己的 QQ 号（5~11 位数字）。不填的话群里没人有主人权限。";
      }
      const bad = real.filter((x) => !/^\d{5,11}$/.test(String(x).trim()));
      if (bad.length) return "bot.adminIds 里有不像 QQ 号的项：" + bad.join("、") + "（应为 5~11 位数字）";
    }
  }
  if (bot.replyPrivate !== undefined && ["all", "off", "whitelist"].indexOf(bot.replyPrivate) < 0) {
    return "bot.replyPrivate 只能是 all / off / whitelist";
  }
  if (bot.quietHours) {
    const q = bot.quietHours;
    for (const k of ["start", "end"]) {
      if (q[k] === undefined) continue;
      // 光靠 ^\d{1,2}:\d{2}$ 是不够的：25:00、99:99 都长那样但根本不是时间
      const mm = /^(\d{1,2}):(\d{1,2})$/.exec(String(q[k]).trim());
      if (!mm || Number(mm[1]) > 23 || Number(mm[2]) > 59) {
        return "bot.quietHours." + k + " 不是合法时间（当前：" + q[k] + "，应为 HH:MM 且小时 0~23、分钟 0~59）";
      }
    }
  }
  if (bot.userRateLimit) {
    const u = bot.userRateLimit;
    if (u.max !== undefined && Number(u.max) <= 0) return "bot.userRateLimit.max 必须大于 0";
    if (u.windowSec !== undefined && Number(u.windowSec) <= 0) return "bot.userRateLimit.windowSec 必须大于 0";
  }
  if (bot.ai) {
    const a = bot.ai;
    if (a.temperature !== undefined && !(Number(a.temperature) >= 0 && Number(a.temperature) <= 2)) {
      return "bot.ai.temperature 必须在 0~2 之间";
    }
    if (a.maxTokens !== undefined && Number(a.maxTokens) <= 0) return "bot.ai.maxTokens 必须大于 0";
    if (a.timeoutSec !== undefined && Number(a.timeoutSec) <= 0) return "bot.ai.timeoutSec 必须大于 0";
    if (a.cooldownSec !== undefined && Number(a.cooldownSec) < 0) return "bot.ai.cooldownSec 不能为负";
  }

  if (cfg.console && !isPort(cfg.console.port)) {
    return "console.port 必须是 1~65535 的整数（当前：" + JSON.stringify(cfg.console.port) + "）";
  }
  if (cfg.scheduler && cfg.scheduler.enabled !== undefined && typeof cfg.scheduler.enabled !== "boolean") {
    return "scheduler.enabled 必须是 true/false";
  }
  return null;
}

