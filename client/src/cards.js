// cards.js —— 抽卡玩法层：光玉收支、抽卡、双池保底、图鉴、分解。
// 常量/卡牌库/素材扫描在 cards-meta.js，结算图合成在 cards-image.js。
// 本文件底部 re-export 全部对外符号，旧调用方 import { CardGame } from './cards.js' 无需改动。
import { join } from "node:path";
import { loadJSON, saveJSON } from "./storage.js";
import { logger } from "./logger.js";
import {
  PRICE_PER_PULL, MAX_PULL, RARES, RARE_RANK, DEFAULT_DECAY, DEFAULT_EXCHANGE_RATE, POOL_CFG,
  normalizeCardsMeta, loadCardsMeta, saveCardsMeta, cardImagePath, scanCardsDir, norm, rarityOf,
} from "./cards-meta.js";

export class CardGame {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.statePath = join(dataDir, "cardgame.json");
    this.#boot();
  }

  #boot() {
    this.meta = loadCardsMeta(this.dataDir);
    this.state = loadJSON(this.statePath, { users: {} });
    this.#migrateState();
  }

  reloadMeta() {
    this.meta = loadCardsMeta(this.dataDir);
    logger.info("[cards] 卡牌数据库已重载");
    return this.meta;
  }

  save() {
    saveJSON(this.statePath, this.state);
  }

  // 旧状态键（v1）迁到 v2：pity key 加 pack 前缀，collection 卡号改为 packId#id。
  #migrateState() {
    if (this.state.__v === 2) return;
    const defId = (this.meta.packs[0] && this.meta.packs[0].id) || "ab";
    for (const u of Object.values(this.state.users || {})) {
      if (u.pity && typeof u.pity === "object") {
        for (const [k, v] of Object.entries(u.pity)) {
          if (k.split(":").length === 2) {
            delete u.pity[k];
            u.pity[`${defId}:${k}`] = v;
          }
        }
      }
      if (u.collection && typeof u.collection === "object") {
        const nc = {};
        for (const [id, cnt] of Object.entries(u.collection)) {
          nc[id.indexOf("#") >= 0 ? id : `${defId}#${id}`] = cnt;
        }
        u.collection = nc;
      }
    }
    this.state.__v = 2;
    this.save();
  }

  #packOf(packId) {
    return (this.meta.packs || []).find((p) => p.id === packId) || this.meta.packs[0] || null;
  }

  #charOf(packId, charKey) {
    const p = this.#packOf(packId);
    return (p && p.characters && p.characters[charKey]) || null;
  }

  #user(uid) {
    const key = String(uid);
    if (!this.state.users[key]) this.state.users[key] = { stones: 0, collection: {}, pity: {} };
    return this.state.users[key];
  }

  stonesOf(uid) {
    return this.#user(uid).stones || 0;
  }

  grantStones(uid, n) {
    const u = this.#user(uid);
    u.stones = (u.stones || 0) + n;
    this.save();
    return { ok: true, stones: u.stones, gained: n };
  }

  spendStones(uid, n) {
    const u = this.#user(uid);
    const cur = u.stones || 0;
    if (cur < n) return { ok: false, short: n - cur, stones: cur };
    u.stones = cur - n;
    this.save();
    return { ok: true, stones: u.stones, spent: -n };
  }

  // ===== 以下为主人专用数据修复（绝对值设定） =====

  /** 直接把光玉定为 n（grantStones 是加减，这个是定值） */
  setStones(uid, n) {
    const u = this.#user(uid);
    const before = u.stones || 0;
    u.stones = Math.max(0, Math.trunc(Number(n) || 0));
    this.save();
    return { ok: true, before, after: u.stones };
  }

  /**
   * 直接设定保底计数。poolKey 形如 "ab:work:ab" / "ab:char:kanade"。
   * 传 null 视为清空该池的保底。sr/ssr 省略表示不改那一项。
   * 上限按当前卡池配置夹住，否则设成 999 会让下次抽卡立刻白给 SSR。
   */
  setPity(uid, poolKey, patch = {}) {
    const u = this.#user(uid);
    const key = String(poolKey);
    if (patch === null || patch.clear) {
      const existed = Object.prototype.hasOwnProperty.call(u.pity, key);
      delete u.pity[key];
      this.save();
      return { ok: true, existed, poolKey: key };
    }
    const cur = u.pity[key] || { sr: 0, ssr: 0 };
    const before = { ...cur };
    const cfg = this.#pityLimits(key);
    const pick = (v, curV) => {
      if (v === undefined || v === null) return Math.max(0, Math.trunc(Number(curV) || 0));
      const n = Math.trunc(Number(v));
      // 兜底：任何非有限数都当 0，绝不让 NaN 混进存档（JSON 里 NaN 会变成 null）
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    let sr = pick(patch.sr, cur.sr);
    let ssr = pick(patch.ssr, cur.ssr);
    // 不允许超过触发阈值，否则等于变相白给
    if (cfg) {
      sr = Math.min(sr, Math.max(0, Math.trunc(cfg.srPity) - 1));
      ssr = Math.min(ssr, Math.max(0, Math.trunc(cfg.ssrPity) - 1));
    }
    u.pity[key] = { sr, ssr };
    this.save();
    return { ok: true, poolKey: key, before, after: { sr, ssr }, limits: cfg || null };
  }

  /** 从 poolKey 反查该池的保底阈值，用于夹住设定值 */
  #pityLimits(poolKey) {
    const [packId, type, key] = String(poolKey).split(":");
    if (type !== "work" && type !== "char") return null;
    const pack = this.#packOf(packId);
    if (!pack) return null;
    if (!(type === "work" ? (pack.works || {})[key] : (pack.characters || {})[key])) return null;
    // 注意：#rates() 依赖 pool.packId 与 pool.type，而 pack.works[key] 这个对象里
    // 并没有这两个字段，直接传它会拿到 {}，进而让下面的夹取算出 NaN 并写坏存档。
    // 这里只传它需要的字段，与 pityStatus() 的读路径保持一致。
    let cfg;
    try { cfg = this.#rates({ packId, type }); } catch { return null; }
    return cfg && Number.isFinite(cfg.srPity) && Number.isFinite(cfg.ssrPity) ? cfg : null;
  }

  /**
   * 把某张卡的持有数直接定为 n。n<=0 视为删除这张卡。
   * 用于修「重复卡计数错了」这类问题。
   */
  setCardCount(uid, packId, id, n) {
    const u = this.#user(uid);
    const fk = `${packId}#${id}`;
    const before = u.collection[fk] || 0;
    const target = Math.max(0, Math.trunc(Number(n) || 0));
    if (target === 0) delete u.collection[fk];
    else u.collection[fk] = target;
    this.save();
    return { ok: true, key: fk, before, after: target };
  }

  /** 彻底删除某人的光玉/收藏/保底档案 */
  removeUser(uid) {
    const key = String(uid);
    const existed = Object.prototype.hasOwnProperty.call(this.state.users, key);
    if (existed) {
      delete this.state.users[key];
      this.save();
    }
    return { ok: true, existed };
  }

  /** 某人收藏与保底的总览（数据概览用） */
  summaryOf(uid) {
    const u = this.state.users[String(uid)] || {};
    const coll = Object.values(u.collection || {});
    return {
      stones: u.stones || 0,
      distinct: coll.length,
      copies: coll.reduce((a, b) => a + (Number(b) || 0), 0),
      pools: Object.keys(u.pity || {}).length,
    };
  }

  #normPool(pool) {
    if (!pool || !pool.type || !pool.key) return pool;
    if (pool.packId) return pool;
    const r = this.resolvePool(pool.key);
    if (r && r.type === pool.type) return r;
    return { ...pool, packId: (this.meta.packs[0] && this.meta.packs[0].id) || "ab" };
  }

  #workOf(pool) {
    pool = this.#normPool(pool);
    const p = this.#packOf(pool.packId);
    if (!p) return null;
    if (pool.type === "work") return (p.works || {})[pool.key] || null;
    const ch = (p.characters || {})[pool.key];
    if (!ch) return null;
    return (p.works || {})[ch.work] || null;
  }

  currencyName(pool) {
    const w = this.#workOf(pool);
    const p = pool && this.#packOf(pool.packId);
    return (w && w.currencyName) || (p && p.currencyName) || "光玉";
  }

  priceOf(pool) {
    const w = this.#workOf(pool);
    const p = pool && this.#packOf(pool.packId);
    return Number((w && w.price) || (p && p.price) || PRICE_PER_PULL);
  }

  priceOfName(pool) {
    return { name: this.currencyName(pool), price: this.priceOf(pool) };
  }

  decayOf() {
    const d = this.meta.decay || {};
    const out = {};
    for (const r of RARES) out[r] = Number(d[r]) || DEFAULT_DECAY[r];
    return out;
  }

  exchangeRate() {
    return Number(this.meta.exchange && this.meta.exchange.rate) || DEFAULT_EXCHANGE_RATE;
  }

  #rates(pool) {
    pool = this.#normPool(pool);
    const p = pool && this.#packOf(pool.packId);
    const o = (p && p.rates && p.rates[pool.type]) || {};
    return { ...(POOL_CFG[pool.type] || {}), ...o };
  }

  #foundKey(packId, id) {
    return `${packId}#${id}`;
  }

  #keyParts(fk) {
    const i = String(fk).indexOf("#");
    return i < 0 ? { packId: this.meta.packs[0] && this.meta.packs[0].id, id: fk } : { packId: fk.slice(0, i), id: fk.slice(i + 1) };
  }

  #resolveFoundKey(raw) {
    const s = String(raw);
    if (s.indexOf("#") < 0) {
      for (const p of this.meta.packs || []) {
        if (p.cards && p.cards[s]) return this.#foundKey(p.id, s);
      }
      return null;
    }
    return s;
  }

  decompose(uid, raw) {
    const u = this.#user(uid);
    const key = this.#resolveFoundKey(String(raw));
    if (!key) return { ok: false, reason: "no-card", count: 0 };
    const { packId, id } = this.#keyParts(key);
    const p = this.#packOf(packId);
    const meta = p && p.cards && p.cards[id];
    if (!meta) return { ok: false, reason: "no-card", count: 0 };
    const cnt = u.collection[key] || 0;
    if (cnt < 2) return { ok: false, reason: "no-dupe", count: cnt };
    const r = rarityOf(meta);
    const gain = this.decayOf()[r];
    u.collection[key] -= 1;
    if (u.collection[key] === 0) delete u.collection[key];
    u.stones = (u.stones || 0) + gain;
    this.save();
    return { ok: true, id, rarity: r, gained: gain, left: cnt - 1, stones: u.stones };
  }

  giveCard(uid, packId, id) {
    const p = this.#packOf(packId);
    const meta = p && p.cards && p.cards[String(id)];
    if (!meta) return { ok: false, reason: "no-card" };
    const key = this.#foundKey(packId, String(id));
    const u = this.#user(uid);
    u.collection[key] = (u.collection[key] || 0) + 1;
    this.save();
    return { ok: true, id: String(id), rarity: rarityOf(meta), count: u.collection[key] };
  }

  removeCard(uid, packId, id) {
    const key = this.#foundKey(packId, String(id));
    const u = this.#user(uid);
    const cnt = u.collection[key] || 0;
    if (cnt <= 0) return { ok: false, reason: "no-own", count: 0 };
    u.collection[key] = cnt - 1;
    if (u.collection[key] === 0) delete u.collection[key];
    this.save();
    return { ok: true, id: String(id), remain: cnt - 1 };
  }

  grantAllCards(uid, packId) {
    const u = this.#user(uid);
    const target = packId ? [packId] : this.packIdList();
    let n = 0;
    const per = [];
    for (const pid of target) {
      const p = this.#packOf(pid);
      if (!p) continue;
      const ids = Object.keys(p.cards || {});
      if (!ids.length) continue;
      let cnt = 0;
      for (const id of ids) {
        const key = this.#foundKey(pid, id);
        u.collection[key] = (u.collection[key] || 0) + 1;
        cnt++;
      }
      n += cnt;
      per.push(`${p.name || pid}:${cnt}`);
    }
    this.save();
    return { ok: true, granted: n, packs: per };
  }

  clearCollection(uid, packId) {
    const u = this.#user(uid);
    let removed = 0;
    for (const [fk, cnt] of Object.entries(u.collection || {})) {
      const { packId: pk, id } = this.#keyParts(fk);
      if (packId && pk !== packId) continue;
      removed += cnt;
      delete u.collection[fk];
    }
    this.save();
    return { ok: true, removed };
  }

  #pityState(uid, poolKey) {
    const u = this.#user(uid);
    if (!u.pity[poolKey]) u.pity[poolKey] = { sr: 0, ssr: 0 };
    return u.pity[poolKey];
  }

  #cardsOfChar(packId, charKey) {
    const p = this.#packOf(packId);
    const out = [];
    for (const [id, c] of Object.entries((p && p.cards) || {})) {
      if (c.character === charKey) out.push({ id, meta: c });
    }
    return out;
  }

  poolCards(pool) {
    pool = this.#normPool(pool);
    const p = this.#packOf(pool.packId);
    if (!p) return [];
    if (pool.type === "work") {
      const out = [];
      for (const [id, c] of Object.entries(p.cards || {})) {
        const w = c.work || ((p.characters || {})[c.character] && p.characters[c.character].work);
        if (w === pool.key) out.push({ id, meta: c });
      }
      return out;
    }
    return this.#cardsOfChar(pool.packId, pool.key);
  }

  resolvePool(alias) {
    const a = norm(alias);
    if (!a) return null;
    for (const pack of this.meta.packs || []) {
      for (const [wk, w] of Object.entries(pack.works || {})) {
        const names = [wk, w.name || "", ...(w.aliases || [])].map(norm);
        if (names.includes(a)) return { type: "work", key: wk, packId: pack.id, display: w.name || wk };
      }
      for (const [ck, ch] of Object.entries(pack.characters || {})) {
        const names = [ck, ch.name || "", ch.en || "", ...(ch.aliases || [])].map(norm);
        if (names.includes(a)) return { type: "char", key: ck, packId: pack.id, display: ch.name || ck };
      }
    }
    return null;
  }

  poolInfo(pool) {
    pool = this.#normPool(pool);
    const cards = this.poolCards(pool);
    const byRarity = { SSR: 0, SR: 0, R: 0, N: 0 };
    for (const { meta } of cards) byRarity[rarityOf(meta)] += 1;
    return { total: cards.length, byRarity };
  }

  workList() {
    const out = [];
    for (const pack of this.meta.packs || []) {
      for (const [key, w] of Object.entries(pack.works || {})) {
        out.push({ key, packId: pack.id, packName: pack.name || pack.id, name: w.name || key });
      }
    }
    return out;
  }

  charList() {
    const out = [];
    for (const pack of this.meta.packs || []) {
      for (const [key, ch] of Object.entries(pack.characters || {})) {
        out.push({ key, packId: pack.id, packName: pack.name || pack.id, name: ch.name || key });
      }
    }
    return out;
  }

  totalCards() {
    let n = 0;
    for (const p of this.meta.packs || []) n += Object.keys(p.cards || {}).length;
    return n;
  }

  #pickCard(cardsById, rarity) {
    const pool = [];
    for (const c of cardsById) {
      if (rarityOf(c.meta) === rarity) pool.push(c);
    }
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    let best = null;
    let bestRank = -1;
    for (const c of cardsById) {
      const rk = RARE_RANK[rarityOf(c.meta)];
      if (rk > bestRank) { bestRank = rk; best = c; }
    }
    return best;
  }

  pull(uid, pool, n = 1) {
    pool = this.#normPool(pool);
    const cfg = this.#rates(pool);
    const poolKey = `${pool.packId}:${pool.type}:${pool.key}`;
    const cardsById = this.poolCards(pool);
    if (!cardsById.length) return { ok: false, reason: "pool-empty", poolKey };
    const p = this.#pityState(uid, poolKey);
    const pack = this.#packOf(pool.packId);
    const firstWork = pack && Object.keys(pack.works || {})[0];

    const got = [];
    for (let i = 0; i < n; i += 1) {
      let rarity;
      if (p.ssr >= cfg.ssrPity - 1) {
        rarity = "SSR";
      } else if (Math.random() < cfg.ssr) {
        rarity = "SSR";
      } else if (p.sr >= cfg.srPity - 1) {
        rarity = "SR";
      } else {
        const tail = Math.random();
        if (tail < cfg.sr / (1 - cfg.ssr)) rarity = "SR";
        else if (tail < (cfg.sr + cfg.r) / (1 - cfg.ssr)) rarity = "R";
        else rarity = "N";
      }
      const card = this.#pickCard(cardsById, rarity);
      if (!card) return { ok: false, reason: "pool-empty", poolKey };
      if (rarity === "SSR") { p.ssr = 0; p.sr = 0; }
      else if (rarity === "SR") { p.ssr += 1; p.sr = 0; }
      else { p.ssr += 1; p.sr += 1; }
      const meta = card.meta;
      const ch = this.#charOf(pool.packId, meta.character);
      const cardInfo = {
        id: card.id,
        rarity,
        character: meta.character,
        charName: (ch && ch.name) || meta.character,
        work: meta.work || (ch && ch.work) || firstWork || "",
        file: this.#iconFile(pool.packId, card.id),
      };
      const fk = this.#foundKey(pool.packId, card.id);
      this.#user(uid).collection[fk] = (this.#user(uid).collection[fk] || 0) + 1;
      got.push(cardInfo);
    }
    this.save();
    return { ok: true, cards: got, cost: n * PRICE_PER_PULL, poolKey };
  }

  #iconFile(packId, id) {
    const p = this.#packOf(packId);
    if (!p || !p.assetRoot) return null;
    // 复用 cardImagePath，别再自己拼一遍路径：
    // 原来的写法硬编码 `${id}i.png`，既漏了三位补零（1~99 号卡全空），
    // 也漏了 jpg/webp 和末段 721-731 这种不规则区间。
    return cardImagePath(p.assetRoot, "icon", String(id));
  }

  pityStatus(uid) {
    const u = this.#user(uid);
    const out = {};
    for (const [k, v] of Object.entries(u.pity || {})) {
      const parts = k.split(":");
      if (parts.length < 3) continue;
      const [pid, type, ...rest] = parts;
      const key = rest.join(":");
      if (type !== "work" && type !== "char") continue;
      const cfg = this.#rates({ packId: pid, type });
      const p = this.#packOf(pid);
      out[k] = {
        display: type === "work" ? ((p && p.works && p.works[key] && p.works[key].name) || key) : ((this.#charOf(pid, key) && this.#charOf(pid, key).name) || key),
        ssr: v.ssr, ssrPity: cfg.ssrPity,
        sr: v.sr, srPity: cfg.srPity,
      };
    }
    return out;
  }

  collectionOf(uid) {
    const u = this.#user(uid);
    const col = u.collection || {};
    const entries = [];
    let total = 0;
    const byRarity = { SSR: 0, SR: 0, R: 0, N: 0 };
    for (const [fk, cnt] of Object.entries(col)) {
      const { packId, id } = this.#keyParts(fk);
      const p = this.#packOf(packId);
      const meta = p && p.cards && p.cards[id];
      if (!meta) continue;
      const r = rarityOf(meta);
      const ch = this.#charOf(packId, meta.character);
      byRarity[r] += 1;
      total += cnt;
      entries.push({
        id,
        packId,
        rarity: r,
        charName: (ch && ch.name) || meta.character,
        count: cnt,
      });
    }
    entries.sort((a, b) => { const d = RARE_RANK[b.rarity] - RARE_RANK[a.rarity]; return d || (Number(a.id) - Number(b.id)); });
    return { total, distinct: entries.length, byRarity, entries };
  }

  packIdList() {
    return (this.meta.packs || []).map((p) => p.id);
  }

  packOfAlias(alias) {
    const a = norm(alias);
    if (!a) return null;
    for (const p of this.meta.packs || []) {
      const names = [p.id, p.name || "", p.com || ""].map(norm);
      if (names.includes(a)) return { packId: p.id, pack: p };
    }
    for (const p of this.meta.packs || []) {
      for (const [wk, w] of Object.entries(p.works || {})) {
        const names = [wk, w.name || "", ...(w.aliases || [])].map(norm);
        if (names.includes(a)) return { packId: p.id, pack: p };
      }
    }
    return null;
  }

  packAsset(packId, kind, id) {
    const p = this.#packOf(packId);
    const root = p && p.assetRoot;
    if (!root || !id) return null;
    if (kind !== "icon" && kind !== "card" && kind !== "detail") kind = "icon";
    return cardImagePath(root, kind, String(id));
  }

  cardLookup(packId, id) {
    id = String(id);
    const p = this.#packOf(packId);
    const meta = p && p.cards && p.cards[id];
    if (!meta) return null;
    const ch = this.#charOf(packId, meta.character);
    const wk = meta.work || (ch && ch.work) || null;
    const work = (wk && p.works && p.works[wk]) || null;
    return {
      id,
      rarity: rarityOf(meta),
      character: meta.character || "",
      char: ch ? { name: ch.name || meta.character, en: ch.en || "" } : null,
      work: work ? { key: wk, name: work.name || wk } : null,
      pack: { id: p.id, name: p.name || p.id },
    };
  }
}

// —— 对外 API 汇总（保持历史 import 路径可用）——
export {
  PRICE_PER_PULL, MAX_PULL, RARES, RARE_RANK, DEFAULT_DECAY, DEFAULT_EXCHANGE_RATE, POOL_CFG,
  normalizeCardsMeta, loadCardsMeta, saveCardsMeta, cardImagePath, scanCardsDir,
} from "./cards-meta.js";
export { buildPullImage, buildCardWallImage, buildCardViewImage } from "./cards-image.js";
