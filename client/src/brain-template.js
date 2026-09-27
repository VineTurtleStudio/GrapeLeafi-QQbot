// brain-template.js —— brain 的「无状态」层：消息模板渲染、API 返回解析、@ 提取、时长解析、默认配置。
// 这些函数不依赖 createBrain 闭包里的任何状态，因此可以单独引入做单元测试。
import { textSeg } from "./antiRisk.js";

export const DEFAULTS = {
  commandPrefix: "/",
  nickname: "bot",
  replyGroups: [],
  replyPrivate: "whitelist",
  adminIds: [],
  privateWhitelist: [],
  groupReplyGapMs: 8000,
  quietHours: { enabled: true, start: "23:30", end: "06:30", allowGroups: [] },
  userRateLimit: { windowSec: 300, max: 20 },
  keywordAutoReply: true,
  privateReplyGapMs: 10000,
  aiReplyGapMs: 20000,
  ai: {
    enabled: false,
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    temperature: 0.8,
    maxTokens: 600,
    timeoutSec: 40,
    cooldownSec: 20,
  },
  games: { lotteryCooldownSec: 600, fishingCooldownSec: 30, fortunePerDay: true },
};

export const CB_MAP = { "cb.signin": "签到", "cb.fish": "钓鱼", "cb.luck": "运势", "cb.level": "等级" };

export function callbackOfText(text) {
  if (!text) return null;
  const m = String(text).match(/cb\.[A-Za-z]+/g) || [];
  for (const t of m) {
    const hit = CB_MAP[t.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

export function atUsers(body) {
  return (body.message || [])
    .filter(
      (s) =>
        s.type === "at" &&
        s.data &&
        s.data.qq &&
        !["all", "0"].includes(String(s.data.qq)) &&
        String(s.data.qq) !== String(body.self_id)
    )
    .map((s) => String(s.data.qq));
}

export function parseDurationSec(arg) {
  const m = String(arg || "");
  const n = parseFloat(m);
  if (Number.isNaN(n) || n <= 0) return 600;
  if (m.includes("秒")) return Math.round(n);
  if (m.includes("时")) return Math.round(n * 3600);
  if (m.includes("天")) return Math.round(n * 86400);
  if (m.includes("周")) return Math.round(n * 604800);
  return Math.round(n * 60);
}

export const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function renderTemplate(text, vars) {
  if (!text) return "";
  const v = vars || {};
  const args = Array.isArray(v.args) ? v.args : [];
  const isAdminNow = v.owner === true || v.grantedAdmin === true || v.role === "owner" || v.role === "admin";
  const roleLabel =
    v.owner === true ? "主人" : v.grantedAdmin === true ? "管理员" : v.role === "owner" ? "群主" : v.role === "admin" ? "群管理" : "成员";
  const pick = (c) => {
    const i = c.indexOf("|");
    return i >= 0 ? [c.slice(0, i), c.slice(i + 1)] : [c, ""];
  };
  const rand = (m, lo, hi) => {
    const a = Number.parseInt(lo, 10);
    const b = Number.parseInt(hi, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return m;
    const mn = Math.min(a, b);
    const mx = Math.max(a, b);
    return String(mn + Math.floor(Math.random() * (mx - mn + 1)));
  };
  return String(text)
    .replace(/\{args\}/g, args.join(" "))
    .replace(/\{(\d+)\}/g, (m, i) => args[Number(i) - 1] || "")
    .replace(/\{rand:(-?\d+),(-?\d+)\}/g, rand)
    .replace(/\{qq\}/g, v.qq != null ? String(v.qq) : "")
    .replace(/\{self\}/g, v.self != null ? String(v.self) : "")
    .replace(/\{player\}/g, v.playerNick != null ? String(v.playerNick) : v.playerQq != null ? String(v.playerQq) : "")
    .replace(/\{playerqq\}/g, v.playerQq != null ? String(v.playerQq) : "")
    .replace(/\{nick\}/g, v.nick != null ? String(v.nick) : "")
    .replace(/\{gid\}/g, v.gid != null ? String(v.gid) : "")
    .replace(/\{date\}/g, v.date || "")
    .replace(/\{time\}/g, v.time || "")
    .replace(/\{targetqq\}/g, v.target ? String(v.target) : "")
    .replace(/\{target\}/g, v.target ? "\u0001" : "")
    .replace(/\{ifowner:([^}]*)\}/g, (m, c) => (v.owner === true ? pick(c)[0] : pick(c)[1]))
    .replace(/\{ifadmin:([^}]*)\}/g, (m, c) => (isAdminNow ? pick(c)[0] : pick(c)[1]))
    .replace(/\{role\}/g, roleLabel)
    .replace(/\{at\}/g, "\u0000");
}

export function templateSegs(text, vars) {
  const rendered = renderTemplate(text, vars);
  if (!rendered) return [];
  if (!rendered.includes("\u0000") && !rendered.includes("\u0001")) return [textSeg(rendered)];
  const out = [];
  const self = vars && vars.qq != null ? String(vars.qq) : null;
  const tgt = vars && vars.target ? String(vars.target) : null;
  for (const part of rendered.split(/([\u0000\u0001])/)) {
    if (part === "\u0000") {
      if (self) out.push({ type: "at", data: { qq: self } });
    } else if (part === "\u0001") {
      if (tgt) out.push({ type: "at", data: { qq: tgt } });
    } else if (part) {
      out.push(textSeg(part));
    }
  }
  return out;
}

export function parseApiResult(raw) {
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return [String(raw || "")];
  }
  const asMsg = (m) => {
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m;
    if (m && typeof m === "object" && m.message != null) return m.message;
    return String(JSON.stringify(m));
  };
  if (Array.isArray(data)) return data.map(asMsg).filter((m) => m !== "" && m != null);
  if (data && typeof data === "object") {
    if (Array.isArray(data.messages)) return data.messages.map(asMsg).filter((m) => m !== "" && m != null);
    if (data.message != null) return [data.message];
  }
  return [String(raw || "")];
}
