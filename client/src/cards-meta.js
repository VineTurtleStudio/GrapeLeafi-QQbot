// cards-meta.js —— 卡牌「静态库」层：常量、cards.json 读写、素材目录扫描。
// 与 gameplay（卡片持有/抽卡/保底）和 cards-image.js（结算图合成）无关，故独立成文件。
// 读取顺序：dataDir/cards.json > 仓库默认 ../data/cards.json。
import { join } from "node:path";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveAssetPath } from "./assets-path.js";
import { loadJSON, saveJSON } from "./storage.js";
import { logger } from "./logger.js";

export const PRICE_PER_PULL = 5;
export const MAX_PULL = 10;
export const RARES = ["SSR", "SR", "R", "N"];
export const RARE_RANK = { SSR: 4, SR: 3, R: 2, N: 1 };
export const DEFAULT_DECAY = { SSR: 50, SR: 20, R: 5, N: 1 };
export const DEFAULT_EXCHANGE_RATE = 1;

export const POOL_CFG = {
  work: { ssr: 0.03, sr: 0.12, r: 0.3, ssrPity: 90, srPity: 10 },
  char: { ssr: 0.05, sr: 0.15, r: 0.3, ssrPity: 40, srPity: 10 },
};

const FALLBACK_META = fileURLToPath(new URL("../data/cards.json", import.meta.url));

export function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
}

export function rarityOf(meta) {
  const r = meta && meta.rarity ? String(meta.rarity).toUpperCase() : "N";
  return RARES.includes(r) ? r : "N";
}

// —— 卡牌数据库(normalize / read / write)，供 CardGame 与控制台共用 ——

export function normalizeCardsMeta(db) {
  if (!db || typeof db !== "object") db = {};
  if (Array.isArray(db.packs)) return db;
  const firstWork = Object.values(db.works || {})[0];
  return {
    version: 2,
    decay: db.decay,
    exchange: db.exchange,
    packs: [
      {
        id: db.packId || "ab",
        name: db.name || (firstWork && firstWork.name) || "默认卡包",
        com: db.com || "",
        assetRoot: db.assetRoot || "",
        currencyName: db.currencyName || "光玉",
        price: Number(db.price) || PRICE_PER_PULL,
        rates: db.rates || undefined,
        works: db.works || {},
        characters: db.characters || {},
        cards: db.cards || {},
      },
    ],
  };
}

export function loadCardsMeta(dataDir) {
  const candidates = [join(dataDir, "cards.json"), FALLBACK_META];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const db = loadJSON(p, null);
        if (db && typeof db === "object" && (db.cards || db.packs)) return normalizeCardsMeta(db);
      } catch (err) {
        logger.warn(`[cards] 卡牌库加载失败 ${p}: ${err.message}`);
      }
    }
  }
  return normalizeCardsMeta({ works: {}, characters: {}, cards: {}, assetRoot: "" });
}

export function saveCardsMeta(dataDir, meta) {
  saveJSON(join(dataDir, "cards.json"), normalizeCardsMeta(meta));
}

export function cardImagePath(root, kind, id) {
  if (!root || !id) return null;
  // 配置里可以只写相对 assets/ 的短路径（"cards/ab"），这里统一解析成绝对路径。
  // 不做这步的话，换台机器素材就全找不到，而且不报错、只是图鉴变空。
  root = resolveAssetPath(root);
  if (!root) return null;
  const no = Number(id);
  if (!no || no < 1) return null;
  const lo = Math.floor((no - 1) / 30) * 30 + 1;
  const hi = Math.ceil(no / 30) * 30;
  const range = `${String(lo).padStart(3, "0")}-${String(hi).padStart(3, "0")}`;
  const sub = { icon: "Icon", card: "Card", detail: "Detail" }[kind] || "Icon";
  const dir = join(root, sub, range);
  let targetDir = dir;
  if (!existsSync(dir)) {
    targetDir = null;
    try {
      for (const e of readdirSync(join(root, sub), { withFileTypes: true })) {
        if (e.isDirectory() && /^(\d+)-(\d+)$/.test(e.name)) {
          const parts = e.name.split("-").map(Number);
          if (no >= parts[0] && no <= parts[1]) {
            targetDir = join(root, sub, e.name);
            break;
          }
        }
      }
    } catch {}
  }
  if (!targetDir) return null;
  // 素材文件名是三位补零的（001i.png / 045.png / 007d.jpg），而配置和指令里的
  // 编号常常是不补零的（1 / 45 / 7）。只按原样匹配会让 1~99 号卡全部取不到图，
  // 表现为「前 99 张在图鉴里是空的」且不报任何错。所以两种写法都要认。
  const ids = [String(no), String(no).padStart(3, "0")].filter((v, i, a) => a.indexOf(v) === i);
  const suffixes = { icon: "i", card: "", detail: "d" }[kind] ?? "i";
  const re = new RegExp(`^(?:${ids.join("|")})${suffixes}\\.(png|jpe?g|webp)$`, "i");
  try {
    for (const f of readdirSync(targetDir, { withFileTypes: true })) {
      if (f.isFile() && re.test(f.name)) return join(targetDir, f.name);
    }
  } catch {}
  return null;
}

export function scanCardsDir(root) {
  root = resolveAssetPath(root);
  if (!root || !existsSync(root)) return { ok: false, error: `素材目录不存在或未配置：${root || "(空)"}` };
  const dirs = { Icon: "icon", Card: "card", Detail: "detail" };
  const map = new Map();
  const isImage = /\.(png|jpe?g|webp)$/i;
  const stats = { icon: { dirs: 0, files: 0 }, card: { dirs: 0, files: 0 }, detail: { dirs: 0, files: 0 } };
  for (const [dirName, key] of Object.entries(dirs)) {
    const base = join(root, dirName);
    if (!existsSync(base)) continue;
    let dirs = 0;
    let files = 0;
    try {
      for (const e of readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const sub = join(base, e.name);
        let fcount = 0;
        try {
          for (const f of readdirSync(sub, { withFileTypes: true })) {
            if (f.isFile() && isImage.test(f.name)) fcount += 1;
          }
        } catch {}
        dirs += 1;
        files += fcount;
        const rangeFiles = [];
        try {
          for (const f of readdirSync(sub, { withFileTypes: true })) {
            if (f.isFile() && isImage.test(f.name)) rangeFiles.push(f.name);
          }
        } catch {}
        for (const file of rangeFiles) {
          const m = /^(\d+)/.exec(file);
          if (!m) continue;
          let id = m[1];
          while (id.length < 3) id = `0${id}`;
          const rec = map.get(id) || { id, icon: false, card: false, detail: false };
          rec[key] = true;
          map.set(id, rec);
        }
      }
    } catch {}
    stats[key] = { dirs, files };
  }
  const cards = [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
  return { ok: true, cards, count: cards.length, stats };
}
