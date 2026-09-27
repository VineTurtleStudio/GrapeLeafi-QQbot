import { join } from "node:path";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { randomInt } from "node:crypto";
import { loadJSON, saveJSON } from "./storage.js";
import { logger } from "./logger.js";

const FORTUNES = [
  ["大吉 ★★★★★ 今天适合大胆行动，好事会主动找上门！", "大吉"],
  ["吉 ★★★★ 稳步前进，好运不期而至。", "吉"],
  ["小吉 ★★★ 多多补充水分，保持好心情。", "小吉"],
  ["中平 ★★★ 平淡是真，注意休息。", "中平"],
  ["末吉 ★★ 小事别纠结，放下更轻松。", "末吉"],
  ["凶 ★ 今天宜低调，不宜出头。", "凶"],
  ["大凶 ★ 别硬闯，躺平也是一种智慧。", "大凶"],
];

const DEFAULT_FISH_POOL = [
  { name: "水草", emoji: "🌿", w: 3000, price: 1, rarity: "普通" },
  { name: "虾米", emoji: "🦐", w: 2500, price: 2, rarity: "普通" },
  { name: "小鱼", emoji: "🐟", w: 2300, price: 5, rarity: "普通" },
  { name: "泥鳅", emoji: "🪱", w: 1800, price: 4, rarity: "普通" },
  { name: "破拖鞋", emoji: "🩴", w: 1650, price: 0, rarity: "杂物" },
  { name: "塑料瓶", emoji: "🥤", w: 1500, price: 0, rarity: "杂物" },
  { name: "空啤酒瓶", emoji: "🍾", w: 1350, price: 1, rarity: "杂物" },
  { name: "破靴子", emoji: "🥾", w: 1200, price: 0, rarity: "杂物" },
  { name: "河蟹", emoji: "🦀", w: 1000, price: 10, rarity: "普通" },
  { name: "鲫鱼", emoji: "🐠", w: 900, price: 12, rarity: "普通" },
  { name: "草鱼", emoji: "🐡", w: 700, price: 18, rarity: "普通" },
  { name: "生锈钥匙", emoji: "🔑", w: 600, price: 8, rarity: "杂物" },
  { name: "锦鲤", emoji: "🧡", w: 400, price: 40, rarity: "稀有" },
  { name: "珍珠蚌", emoji: "🦪", w: 320, price: 25, rarity: "稀有" },
  { name: "宝箱", emoji: "🧰", w: 220, price: 30, rarity: "稀有" },
  { name: "金龟", emoji: "🐢", w: 180, price: 120, rarity: "稀有" },
  { name: "青龙鱼", emoji: "🐉", w: 60, price: 500, rarity: "传说" },
  { name: "漂流诗卷", emoji: "📜", w: 45, price: 260, rarity: "传说" },
];

const EMPTY_FISH_RATE = 0.15;

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const NORMS = {
  大吉: 100,
  吉: 90,
  小吉: 80,
  中吉: 60,
  末吉: 50,
  凶: 20,
  大凶: 0,
};

export class Games {
  constructor({ dataDir, config = {} }) {
    this.path = join(dataDir, "games.json");
    this.lotteryCooldownSec = config.lotteryCooldownSec ?? 600;
    this.fishingCooldownSec = config.fishingCooldownSec ?? 30;
    this.fortunePerDay = config.fortunePerDay !== false;
    this.state = loadJSON(this.path, { users: {}, fortunes: {} });
  }

  save() {
    saveJSON(this.path, this.state);
  }

  /** 控制台改配置后热重载，避免必须重启才能调冷却 */
  applyConfig(config = {}) {
    if (config.lotteryCooldownSec !== undefined) this.lotteryCooldownSec = config.lotteryCooldownSec;
    if (config.fishingCooldownSec !== undefined) this.fishingCooldownSec = config.fishingCooldownSec;
    if (config.fortunePerDay !== undefined) this.fortunePerDay = config.fortunePerDay !== false;
    return this;
  }

  #user(uid) {
    const key = String(uid);
    if (!this.state.users[key]) {
      this.state.users[key] = { inv: {}, gold: 0, lastFishAt: 0, lastLotteryAt: 0 };
    }
    return this.state.users[key];
  }

  fortune(uid) {
    const key = String(uid);
    const today = todayKey();
    const rec = this.state.fortunes[key] || {};
    if (this.fortunePerDay && rec.date === today) {
      return { text: FORTUNES[rec.idx][0], today: true };
    }
    const idx = randomInt(FORTUNES.length);
    this.state.fortunes[key] = { date: today, idx };
    this.save();
    return { text: FORTUNES[idx][0], today: false };
  }

  // ===== 以下为主人专用数据修复（绝对值设定） =====

  /** 直接把金币定为 n */
  setGold(uid, n) {
    const u = this.#user(uid);
    const before = u.gold || 0;
    u.gold = Math.max(0, Math.trunc(Number(n) || 0));
    this.save();
    return { ok: true, before, after: u.gold };
  }

  /** 把某种鱼的持有数定为 n；n<=0 视为清掉这种鱼。省略鱼名则清空整个鱼篓 */
  setFish(uid, name, n) {
    const u = this.#user(uid);
    if (!name) {
      const before = Object.keys(u.inv || {}).length;
      u.inv = {};
      this.save();
      return { ok: true, cleared: before };
    }
    const key = String(name);
    const before = u.inv[key] || 0;
    const target = Math.max(0, Math.trunc(Number(n) || 0));
    if (target === 0) delete u.inv[key];
    else u.inv[key] = target;
    this.save();
    return { ok: true, fish: key, before, after: target };
  }

  /** 列出鱼池里所有鱼名，供指令补全/校验用 */
  fishNames() {
    return (DEFAULT_FISH_POOL || []).map((f) => f.name);
  }

  /** 清掉钓鱼/抽签冷却（lastFishAt/lastLotteryAt 归零），用于「冷却卡住」的修复 */
  clearCooldowns(uid) {
    const u = this.#user(uid);
    const before = { lastFishAt: u.lastFishAt || 0, lastLotteryAt: u.lastLotteryAt || 0 };
    u.lastFishAt = 0;
    u.lastLotteryAt = 0;
    this.save();
    return { ok: true, before };
  }

  /** 彻底删除某人的游戏档案 */
  removeUser(uid) {
    const key = String(uid);
    const existed = Object.prototype.hasOwnProperty.call(this.state.users, key);
    let hadFortune = false;
    if (existed) {
      delete this.state.users[key];
      hadFortune = Object.prototype.hasOwnProperty.call(this.state.fortunes, key);
      if (hadFortune) delete this.state.fortunes[key];
      this.save();
    }
    return { ok: true, existed, hadFortune };
  }

  summaryOf(uid) {
    const u = this.state.users[String(uid)] || {};
    const inv = u.inv || {};
    return {
      gold: u.gold || 0,
      fishKinds: Object.keys(inv).length,
      fishTotal: Object.values(inv).reduce((a, b) => a + (Number(b) || 0), 0),
    };
  }

  fish(uid) {
    const u = this.#user(uid);
    const remain = u.lastFishAt + this.fishingCooldownSec * 1000 - Date.now();
    if (remain > 0) {
      return { ok: false, text: `鱼钩还在甩干，等 ${Math.ceil(remain / 1000)} 秒再钓吧~` };
    }
    u.lastFishAt = Date.now();
    if (Math.random() < EMPTY_FISH_RATE) {
      this.save();
      return { ok: true, empty: true, text: "🫧 水面荡起波纹，提起竿头却空空如也——这一竿白等了。" };
    }
    const pick = pickWeighted(DEFAULT_FISH_POOL);
    u.inv[pick.name] = (u.inv[pick.name] || 0) + 1;
    this.save();
    const star = pick.rarity === "传说" ? "✨✨✨" : pick.rarity === "稀有" ? "✨" : "";
    return {
      ok: true,
      text: `🎣 钓上来 ${pick.emoji}${pick.name} ！[${pick.rarity}]${star}`,
      info: { ...pick, count: 1 },
    };
  }

  fishpond(uid) {
    const u = this.#user(uid);
    const rows = Object.entries(u.inv).filter(([, c]) => c > 0);
    if (!rows.length) return `你的鱼塘空空如也，先 /钓鱼 吧~`;
    const lines = rows.map(([n, c]) => `${n} ×${c}`).join("，");
    return `🐟 你的鱼塘：${lines}\n💰 金币：${u.gold}\n输入 /卖鱼 可以卖掉全部。`;
  }

  sell(uid) {
    const u = this.#user(uid);
    let coin = 0;
    const parts = [];
    for (const [name, c] of Object.entries(u.inv)) {
      if (!c) continue;
      const spec = DEFAULT_FISH_POOL.find((p) => p.name === name);
      const price = spec ? spec.price : 0;
      coin += price * c;
      if (price > 0) parts.push(`${name}×${c}`);
      u.inv[name] = 0;
    }
    for (const k of Object.keys(u.inv)) if (!u.inv[k]) delete u.inv[k];
    u.gold += coin;
    this.save();
    if (!parts.length) return "鱼塘里没东西可卖。";
    return `💰 卖掉了 ${parts.join("，")}，获得 ${coin} 金币！`;
  }

  lotteryCooldown(uid) {
    const u = this.#user(uid);
    const remain = u.lastLotteryAt + this.lotteryCooldownSec * 1000 - Date.now();
    return remain > 0 ? Math.ceil(remain / 1000) : 0;
  }

  markLottery(uid) {
    const u = this.#user(uid);
    u.lastLotteryAt = Date.now();
    this.save();
  }
}

let canvasMod = null;
async function canvasLib() {
  if (canvasMod !== null) return canvasMod;
  try {
    canvasMod = await import("@napi-rs/canvas");
  } catch (err) {
    logger.warn(`[image] 未加载 @napi-rs/canvas，将按原图发送: ${err.message}`);
    canvasMod = false;
  }
  return canvasMod;
}

const imageCache = new Map();

function localFileSeg(filePath) {
  return { type: "image", data: { file: `file:///${filePath.replace(/\\/g, "/").replace(/^\/+/, "")}` } };
}

export async function imageSegFromFile(filePath, { maxWidth = 1080, quality = 82 } = {}) {
  const lib = await canvasLib();
  if (!lib) return localFileSeg(filePath);
  try {
    const st = statSync(filePath);
    const cached = imageCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.seg;
    const img = await lib.loadImage(readFileSync(filePath));
    const scale = Math.min(1, maxWidth / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const cv = lib.createCanvas(w, h);
    cv.getContext("2d").drawImage(img, 0, 0, w, h);
    const buf = cv.toBuffer("image/jpeg", quality);
    const seg = { type: "image", data: { file: `base64://${buf.toString("base64")}` } };
    imageCache.set(filePath, { mtimeMs: st.mtimeMs, seg });
    if (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value);
    logger.info(`[image] 压缩抽签图 ${(st.size / 1024 / 1024).toFixed(2)}MB -> ${(buf.length / 1024).toFixed(0)}KB (${w}x${h})`);
    return seg;
  } catch (err) {
    logger.warn(`[image] 压缩失败，改为原图发送: ${err.message}`);
    return localFileSeg(filePath);
  }
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i;
const MAX_SCAN_DEPTH = 6;
const MAX_SCAN_FILES = 5000;

export function parseImageDirs(value) {
  return [...new Set(String(value == null ? "" : value)
    .split(/[;\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean))];
}

export function scanDirImages(dir, { recursive = true, maxDepth = MAX_SCAN_DEPTH, limit = MAX_SCAN_FILES } = {}) {
  const root = String(dir || "").trim();
  if (!root || !existsSync(root)) return [];
  const out = [];
  const walk = (current, depth) => {
    if (out.length >= limit || depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (err) {
      logger.warn(`[image] 读取目录失败 ${current}: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !IMAGE_EXT_RE.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

export function scanLotteryImages(dir) {
  if (!dir || !existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => IMAGE_EXT_RE.test(f))
      .map((f) => {
        const name = f.replace(/\.[^.]+$/, "");
        let level = null;
        for (const lv of Object.keys(NORMS)) {
          if (name.includes(lv)) {
            level = lv;
            break;
          }
        }
        return {
          file: join(dir, f),
          name,
          level,
          norm: level ? NORMS[level] : null,
        };
      });
  } catch (err) {
    logger.error(`[lottery] 扫描图片目录失败: ${err.message}`);
    return [];
  }
}