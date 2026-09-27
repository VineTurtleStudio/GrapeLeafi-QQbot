import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { loadJSON, saveJSON } from "./storage.js";

const RARITY_ORDER = ["SSR", "SR", "R", "N"];

const RARITY_RATE = { SSR: 0.03, SR: 0.10, R: 0.27 };
const RATE_N = 0.6;

const COST_SINGLE = 100;
const COST_TEN = 900;           // 十连优惠价,且至少 1 张 SR+
const PITY_SOFT = 50;           // 50 抽后 SSR 概率开始软提升
const PITY_HARD = 80;           // 80 抽硬保底必出 SSR
const REWARD_DUP = { SSR: 200, SR: 80, R: 30, N: 15 };
const REWARD_FIRST_BONUS = { SSR: 120, SR: 60, R: 25, N: 10 };

const CMD_NAMES = {
  single: "ab单抽",
  ten: "ab十连",
  pool: "ab卡池",
  profile: "ab我的卡",
  rarityView: "ab稀有度",
  raritySet: "ab稀有度设置",
  cheat: "ab作弊",
};

function cleanId(name) {
  return String(name || "")
    .replace(/\.[^.\\/]+$/, "")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "_");
}

function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 文件名兜底稀有度：SSR/SR 显式后缀 > 稳定哈希。 */
function rarityFromName(name) {
  const u = String(name || "").toUpperCase();
  if (u.includes("SSR")) return "SSR";
  if (u.includes("SR")) return "SR";
  return "";
}

export class Gacha {
  constructor({ dataDir, spend, grant }) {
    this.storePath = join(dataDir, "gacha.json");
    this.rarityPath = join(dataDir, "gachaRarity.json");
    this.state = loadJSON(this.storePath, { users: {} });
    this.rarity = loadJSON(this.rarityPath, {}); // { [id]: { rarity, name?, char?, note? } }
    this.fullRarityPath = join(dataDir, "gachaRarityFull.json"); // 未采纳（校验失败兜底），仅占位避免拼错
    this.pool = [];
    this.scanPool();
    this.spend = typeof spend === "function" ? spend : null;
    this.grant = typeof grant === "function" ? grant : null;
  }

  save() {
    saveJSON(this.storePath, this.state);
  }

  saveRarity() {
    saveJSON(this.rarityPath, this.rarity);
  }

  #user(uid) {
    const key = String(uid);
    if (!this.state.users[key]) {
      this.state.users[key] = { cards: {}, pitySSR: 0, totalPulls: 0 };
    }
    return this.state.users[key];
  }

  /** 扫描 Card/Detail/Icon 三目录（含每 30 张一组的子目录），
      同一张卡以 id 去重；稀有度：rarity 表 > 文件名 > 稳定哈希。 */
  scanPool() {
    const out = [];
    const seen = new Set();
    for (const sub of ["Card", "Detail", "Icon"]) {
      const dir = join(this.cardRoot, sub);
      let entries;
      try {
        entries = readdirSync(dir, { recursive: true });
      } catch {
        continue;
      }
      for (const rel of entries || []) {
        const p = join(dir, rel);
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (!st.isFile()) continue;
        if (!/\.(png|jpe?g|webp|gif)$/i.test(rel)) continue;
        const id = cleanId(rel);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        let rarity = String((this.rarity[id] && this.rarity[id].rarity) || "").toUpperCase();
        if (!rarity) rarity = rarityFromName(rel);
        if (!rarity) {
          const h = hashStr(id);
          rarity = h % 100 < 3 ? "SSR" : h % 100 < 14 ? "SR" : h % 100 < 41 ? "R" : "N";
        }
        out.push({ id, rarity, file: p });
      }
    }
    this.pool = out;
    return out;
  }

  get poolEmpty() {
    return !this.pool.length;
  }

  #candidates(rarity) {
    const same = this.pool.filter((c) => c.rarity === rarity);
    return same.length ? same : this.pool;
  }

  #rollRarity(uid) {
    const u = this.#user(uid);
    const pity = u.pitySSR || 0;
    if (pity >= PITY_HARD) return "SSR";
    let ssr = RARITY_RATE.SSR;
    if (pity >= PITY_SOFT) {
      const t = (pity - PITY_SOFT + 1) / (PITY_HARD - PITY_SOFT);
      ssr += (1 - RARITY_RATE.SSR) * t;
    }
    const r = Math.random();
    if (r < ssr) return "SSR";
    if (r < ssr + RARITY_RATE.SR) return "SR";
    if (r < ssr + RARITY_RATE.SR + RARITY_RATE.R) return "R";
    return "N";
  }

  #drawOne(uid) {
    const rarity = this.#rollRarity(uid);
    let cand = this.#candidates(rarity);
    if (cand.some((c) => c.rarity === rarity)) cand = cand.filter((c) => c.rarity === rarity);
    const card = cand[Math.floor(Math.random() * cand.length)];
    if (!card) return { ok: false, empty: true };
    const u = this.#user(uid);
    const owned = (u.cards[card.id] || 0) > 0;
    u.cards[card.id] = (u.cards[card.id] || 0) + 1;
    if (rarity === "SSR") u.pitySSR = 0;
    else u.pitySSR = (u.pitySSR || 0) + 1;
    u.totalPulls = (u.totalPulls || 0) + 1;
    const reward = owned ? REWARD_DUP[rarity] : REWARD_FIRST_BONUS[rarity];
    return { ok: true, card, owned, rarity, reward };
  }

  roll(uid, n) {
    if (this.poolEmpty) return { ok: false, empty: true, msg: "卡池还没上架：Card/Detail/Icon 目录还是空的，等主人放卡图就能开抽啦～" };
    const cost = n >= 10 ? COST_TEN : COST_SINGLE;
    if (this.spend) {
      const s = this.spend(uid, cost);
      if (!s.ok) return { ok: false, short: s.short, cost, msg: `积分不足：需要 ${cost}，还差 ${s.short}（签到攒积分 / ab作弊 调）` };
    }
    const results = [];
    for (let i = 0; i < n; i++) {
      const r = this.#drawOne(uid);
      if (!r.ok) return { ok: false, empty: true, msg: "卡池异常，请稍后再试" };
      results.push(r);
    }
    if (n >= 10 && !results.some((r) => r.rarity === "SSR" || r.rarity === "SR")) {
      const last = results[results.length - 1];
      const sr = this.#candidates("SR");
      if (sr.length) {
        last.card = sr[Math.floor(Math.random() * sr.length)];
        last.rarity = "SR";
        last.tenGuarantee = true;
      }
    }
    const gained = results.reduce((a, r) => a + r.reward, 0);
    let dupReward = 0;
    for (const r of results) if (r.owned) dupReward += REWARD_DUP[r.rarity];
    if (this.grant && dupReward > 0) this.grant(uid, dupReward);
    this.save();
    return { ok: true, results, gained, dupReward, cost };
  }

  profile(uid) {
    const u = this.#user(uid);
    const byRarity = { SSR: 0, SR: 0, R: 0, N: 0 };
    for (const r of RARITY_ORDER) byRarity[r] = 0;
    for (const id of Object.keys(u.cards || {})) {
      let rarity = "N";
      const hit = this.pool.find((c) => c.id === id);
      if (hit) rarity = hit.rarity;
      byRarity[rarity] = (byRarity[rarity] || 0) + 1;
    }
    return {
      pitySSR: u.pitySSR || 0,
      totalPulls: u.totalPulls || 0,
      ownedKinds: Object.keys(u.cards || {}).length,
      byRarity,
    };
  }

  setRarity(id, rarity, extra = {}) {
    const clean = cleanId(id);
    const r = String(rarity || "").toUpperCase();
    if (!RARITY_ORDER.includes(r)) return { ok: false, msg: `稀有度需为 ${RARITY_ORDER.join("/")}` };
    this.rarity[clean] = { rarity: r, ...extra, updatedAt: Date.now() };
    this.saveRarity();
    this.scanPool();
    return { ok: true, id: clean, rarity: r };
  }

  getRarity(id) {
    const clean = cleanId(id);
    return this.rarity[clean] || null;
  }

  /** 控制台（ownerOnly）可读的稀有度表导出。 */
  rarityListView() {
    const rows = [];
    for (const id of Object.keys(this.rarity)) {
      rows.push({ id, ...this.rarity[id] });
    }
    rows.sort((a, b) => a.id.localeCompare(b.id, "en"));
    return rows;
  }
}

export { CMD_NAMES, RARITY_ORDER, RARITY_RATE, COST_SINGLE, COST_TEN, PITY_SOFT, PITY_HARD, REWARD_DUP };
