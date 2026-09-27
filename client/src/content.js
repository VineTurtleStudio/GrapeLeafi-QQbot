import { join } from "node:path";
import { loadJSON, saveJSON } from "./storage.js";
import { logger } from "./logger.js";
import { KEY_BIRTHDAYS } from "./birthdays.js";
import { DEFAULT_TITLES } from "./levelTitles.js";

export const DEFAULT_CONTENT = {
  settings: {
    groupReplyMode: "keyword",
    replyGroups: [],
    blockGroups: [],
    quietAllowGroups: [],
    gates: {},
    riskgate: {},
    groupEnabled: {},
    defaultOff: ["生日", "文娱", "互动", "联网"],
    events: {
      welcome: { enabledGroups: [], text: "欢迎新成员～在群里说句话认识一下吧！" },
      leave: { enabledGroups: [], text: "有一位伙伴离开了，愿 TA 前程似锦～" },
      poke: { enabledGroups: [], replies: ["戳我干嘛～", "再戳我要收费了哦", "干嘛呀，咩咩~"] },
    },
  },
  builtins: {},
  presets: {
    commands: [
      {
        name: "早安",
        reply: "早上好呀～新的一天也要元气满满！",
        timeReplies: {
          morning: "早上好呀～新的一天也要元气满满！",
          afternoon: "午安～吃过午饭了吗？",
          evening: "晚上好～今天过得怎么样？",
          night: "这么晚还不睡吗？早点休息呀～",
        },
        cooldownSec: 120,
        adminOnly: false,
        groups: [],
        allowPrivate: true,
      },
      {
        name: "晚安",
        reply: "晚安好梦，明天见✨",
        timeReplies: {
          morning: "早上好～怎么一早就说晚安呀？",
          afternoon: "午安～午睡时间到了吗？",
          evening: "晚上好～现在说晚安还早哦。",
          night: "晚安好梦，明天见✨",
        },
        cooldownSec: 120,
        adminOnly: false,
        groups: [],
        allowPrivate: true,
      },
    ],
    keywords: [
      { match: "早安", reply: "早上好呀～新的一天也要元气满满！", contains: false, timeReplies: { morning: "早上好呀～新的一天也要元气满满！", afternoon: "午安～吃过午饭了吗？", evening: "晚上好～今天过得怎么样？", night: "这么晚还不睡吗？早点休息呀～" }, cooldownSec: 60, groups: [], allowPrivate: true },
      { match: "晚安", reply: "晚安好梦，明天见✨", contains: false, timeReplies: { morning: "早上好～怎么一早就说晚安呀？", afternoon: "午安～午睡时间到了吗？", evening: "晚上好～现在说晚安还早哦。", night: "晚安好梦，明天见✨" }, cooldownSec: 60, groups: [], allowPrivate: true },
      { match: "在吗", reply: "在的在的，有什么事呀？", contains: true, cooldownSec: 60, groups: [], allowPrivate: true },
      { match: "你好", reply: "你好呀，我是葡叶酱～", contains: true, cooldownSec: 60, groups: [], allowPrivate: true },
      { match: "你是谁", reply: "我是葡叶酱，这里的守园机器人～", contains: true, cooldownSec: 120, groups: [], allowPrivate: true },
    ],
  },
  ai: {
    systemPrompt:
      "你是「葡叶酱」，一个住在QQ里的机器人。回答要简短、生动、有温度，用中文，一般不超过100字。除非被要求，否则不要用markdown。",
    offlineReply: "葡叶酱还没连上AI大脑，等主人配置好 API key 就能陪你聊天啦。",
    errorReply: "啊哦，AI 走神了，稍后再试一次吧。",
  },
  lottery: {
    // 抽签配图目录。留空表示「还没配」，由使用者自己在控制台「抽签图片」页填。
    // 这里绝不能写死任何绝对路径：写死的话，每个拿到这份代码的人都会看到
    // 我本机的盘符和私有素材目录名（分享出去的源码里也会原样带着）。
    dir: "",
  },
  anime: {
    timeoutSec: 15,
    deletedIds: [],
    sources: [
      {
        id: "xjh-acg",
        name: "岁月小筑",
        url: "https://img.xjh.me/random_img.php?return=json&type=bg&ctype=acg",
        mode: "json",
        imageField: "img",
        enabled: true,
        sfw: true,
        note: "ACG 分类；2026-09-25 实测可用",
      },
      {
        id: "horosama-anime",
        name: "赫萝",
        url: "https://api.horosama.com/random.php?name=anime&type=profile&format=json&resolution=small",
        mode: "json",
        imageField: "url",
        enabled: true,
        sfw: true,
        note: "动漫头像；2026-09-25 实测可用",
      },
      {
        id: "paugram-wallpaper",
        name: "保罗",
        url: "https://api.paugram.com/wallpaper/",
        mode: "image",
        imageField: "",
        enabled: true,
        sfw: true,
        note: "随机动漫壁纸；2026-09-25 实测可用",
      },
      {
        id: "suyan-comic",
        name: "素颜动漫",
        url: "https://api.suyanw.cn/api/comic.php",
        mode: "image",
        imageField: "",
        enabled: true,
        sfw: true,
        note: "文档旧地址已修正；2026-09-25 实测可用",
      },
      {
        id: "mwm-mobile",
        name: "MWM 移动端",
        url: "https://t.mwm.moe/mp",
        mode: "image",
        imageField: "",
        enabled: true,
        sfw: true,
        note: "WebP 随机图片；2026-09-25 实测可用",
      },
      {
        id: "loliapi-bg",
        name: "LoliAPI",
        url: "https://www.loliapi.com/bg/?type=url",
        mode: "text",
        imageField: "",
        enabled: true,
        sfw: true,
        note: "文档旧路径已修正；2026-09-25 实测可用",
      },
    ],
  },
  birthdays: {
    enabled: true,
    time: "00:00",
    notice: "🎂 今天是 {name} 的生日～让我们一起祝TA生日快乐！",
    enabledGroups: [],
    items: KEY_BIRTHDAYS,
  },
  // 葡家等级头衔：默认 10 档、每 10 级一档，画在等级卡昵称右侧。
  // levelTitlesByGroup 是群级覆盖（群主 @bot /设置头衔 写进来的），没设过的群用全局表。
  levelTitles: DEFAULT_TITLES.map((t) => ({ ...t })),
  levelTitlesByGroup: {},
  schedule: [
    {
      id: "morning",
      time: "08:00",
      groups: [],
      message: "早安～葡叶酱来报道了！(每日 08:00 推送)",
      enabled: false,
    },
  ],
};

// 内容缓存。
//
// 原来是「一个全局槽位」cache，带来两个隐患：
//   1) loadContent(dirA) 之后再 loadContent(dirB)，dirB 会拿到 dirA 的内容——
//      因为 if (cache) return cache 直接短路了，dataDir 形同虚设；
//   2) brain-notice.js 和 scheduler.js 调的是 getContent()、**不传 dataDir**。
//      只要 cache 恰好是 null（resetContentCache() 之后、或进程刚起步），
//      contentPath(undefined) 会 join(undefined, ...) 直接抛错。
// 现在按 dataDir 分槽位记，并且不传 dataDir 时退回「当前唯一那份」而不是崩。
const caches = new Map();
let injected = null; // setContent() 显式注入的内容（测试用），优先于磁盘
let ver = 1;

export function getVersion() {
  return ver;
}

export function contentPath(dataDir) {
  return join(dataDir, "content.json");
}

export function loadContent(dataDir) {
  if (injected) return injected;
  const key = dataDir || "";
  if (caches.has(key)) return caches.get(key);
  const disk = loadJSON(contentPath(dataDir), {});
  const def = structuredClone(DEFAULT_CONTENT);
  const merged = {
    ...def,
    ...disk,
    settings: { ...def.settings, ...(disk.settings || {}) },
    builtins: { ...(def.builtins || {}), ...(disk.builtins || {}) },
    presets: {
      ...(def.presets || {}),
      ...(disk.presets || {}),
      commands: (disk.presets && disk.presets.commands) || def.presets.commands || [],
      keywords: (disk.presets && disk.presets.keywords) || def.presets.keywords || [],
    },
    anime: {
      ...(def.anime || {}),
      ...((disk.anime && typeof disk.anime === "object") ? disk.anime : {}),
    },
  };
  caches.set(key, merged);
  return merged;
}

// 不传 dataDir 是合法的（brain-notice.js / scheduler.js 就是这么调的）：
// 有多份缓存时无法判断要哪一份，返回默认内容而不是抛错。
export function getContent(dataDir) {
  if (injected) return injected;
  if (dataDir && caches.has(dataDir)) return caches.get(dataDir);
  if (!dataDir && caches.size === 1) return caches.values().next().value;
  if (!dataDir) return structuredClone(DEFAULT_CONTENT);
  return loadContent(dataDir);
}

export function setContent(obj) {
  injected = obj;
  return obj;
}

// 会污染原型链的三个键。JSON.parse 会把它们保留成「自有属性」（不触发 setter），
// JSON.stringify 也会照样写回文件，于是它们能一路落盘；
// 直到某处用 Object.assign(target, parsed) 重新灌进去时，__proto__ 的 setter 才被触发，
// target 的原型被换成攻击者给的对象。自有属性仍然优先，所以配置看着「正常」，
// 但任何缺失键的读取都会落到被注入的原型上，而且 Object.keys 看不见它——极难排查。
const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 深拷贝并剥掉原型链污染键。 */
export function stripProtoKeys(value, depth = 0) {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) return value.map((v) => stripProtoKeys(v, depth + 1));
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const k of Object.keys(value)) {
    if (PROTO_KEYS.has(k)) continue;
    out[k] = stripProtoKeys(value[k], depth + 1);
  }
  return out;
}

/**
 * 原地剔除原型链污染键，返回是否真的剔过东西。
 *
 * 为什么不用 stripProtoKeys 重建：saveContent 的调用方普遍持有 content 的引用，
 * 重建对象会让 getContent() 返回的引用和调用方手里的不是同一个（contentcache 测试
 * 就是守着这条契约）。所以这里只做 delete，引用保持不变。
 */
export function scrubProtoKeysInPlace(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== "object") return false;
  let removed = false;
  if (Array.isArray(value)) {
    for (const v of value) if (scrubProtoKeysInPlace(v, depth + 1)) removed = true;
    return removed;
  }
  for (const k of Object.keys(value)) {
    if (PROTO_KEYS.has(k)) {
      delete value[k];
      removed = true;
      continue;
    }
    if (scrubProtoKeysInPlace(value[k], depth + 1)) removed = true;
  }
  return removed;
}

/**
 * 安全版 Object.assign：跳过原型链污染键。
 * 展开语法 {...src} 本身就是安全的（走 [[DefineOwnProperty]]），
 * 但 Object.assign 走 [[Set]] 会触发 __proto__ setter，所以热路径上要用这个。
 */
export function safeAssign(target, ...srcs) {
  for (const src of srcs) {
    if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(src)) {
      if (PROTO_KEYS.has(k)) continue;
      target[k] = src[k];
    }
  }
  return target;
}

export function saveContent(dataDir, obj) {
  const target = obj || getContent(dataDir);
  // 落盘前最后一道关口：脏数据永远进不了 content.json。
  // 原地 delete 而不是重建对象——调用方普遍持有 content 的引用，重建会破坏引用同一性。
  if (scrubProtoKeysInPlace(target)) logger.warn("[content] 已剔除 content 中的原型链污染键（__proto__/constructor/prototype）");
  injected = target;
  caches.set(dataDir || "", target);
  ver += 1;
  saveJSON(contentPath(dataDir), target || DEFAULT_CONTENT);
  return target;
}

export function resetContentCache() {
  caches.clear();
  injected = null;
}