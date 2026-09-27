import { join } from "node:path";
import { loadJSON, saveJSON } from "./storage.js";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function shiftKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

// 等级按「累计积分」走游戏式经验条：每级所需 = 100 × 当前等级，升级后余量带入下一级。
// 关键：累计积分 earned 只增不减，且**只认签到送的**；发放（/发放 积分）与消费（兑换/扣除）
// 都只动余额 points。因此消费不掉级、发放不掉级、升级也不会把余额扣掉。
export const LEVEL_STEP = 100;

/**
 * 存档结构版本。2 = 引入 points/earned 分离、废弃 career 字段。
 * 改动存档结构时 +1，并在 #migrate() 里补对应分支，迁移才会只跑一次。
 */
export const SCHEMA_VERSION = 2;

export function levelOf(earned) {
  if (!(earned > 0)) return 1;
  return Math.floor((Math.sqrt(1 + (8 * earned) / LEVEL_STEP) + 1) / 2);
}

// 达到 level 级所需的累计积分（level=1 时为 0）
export function levelFloor(level) {
  const lv = Math.max(1, Math.floor(Number(level)) || 1);
  return (LEVEL_STEP * (lv - 1) * lv) / 2;
}

// 距下一级还差多少累计积分
export function nextNeed(earned) {
  const exp = Math.max(0, Number(earned) || 0);
  return Math.max(0, levelFloor(levelOf(exp) + 1) - exp);
}

export class CheckIns {
  constructor({ dataDir }) {
    this.path = join(dataDir, "checkins.json");
    this.state = loadJSON(this.path, { users: {} });
    this.#migrate();
  }

  save() {
    saveJSON(this.path, this.state);
  }

  // 累计积分机制上线前创建的档案没有 earned 字段。若只靠 profile() 里的兜底值显示，
  // 用户一旦把余额消费光，下次签到就会用缩水后的余额固化出错误的等级基准（进度回落）。
  // 这里在加载时就把 earned 落到存档里，并清掉已废弃的 career 字段。
  //
  // 用 __v 做版本门（与 cardgame.json 一致）：迁移只跑一次，之后靠 __v 判定，
  // 避免「每次启动都把老档案按 max() 重算一遍」这种隐式改写数据的行为。
  #migrate() {
    const users = this.state && this.state.users;
    if (!users || typeof users !== "object") {
      this.state.users = {};
      this.state.__v = SCHEMA_VERSION;
      this.save();
      return;
    }
    if (this.state.__v === SCHEMA_VERSION) return;

    let changed = false;
    for (const u of Object.values(users)) {
      if (!u || typeof u !== "object") continue;
      const points = Math.max(0, Number(u.points) || 0);
      const earned = Math.max(points, Number(u.earned) || 0, Number(u.career) || 0);
      if (u.points !== points) { u.points = points; changed = true; }
      if (u.earned !== earned) { u.earned = earned; changed = true; }
      if ("career" in u) { delete u.career; changed = true; }
    }
    if (this.state.__v !== SCHEMA_VERSION) { this.state.__v = SCHEMA_VERSION; changed = true; }
    if (changed) this.save();
  }

  #user(uid) {
    const key = String(uid);
    if (!this.state.users[key]) {
      this.state.users[key] = { points: 0, earned: 0, streak: 0, bestStreak: 0, totalDays: 0, lastCheckin: "" };
    }
    return this.state.users[key];
  }

  // 累计积分只认签到，所以这里直接读存档里的 earned。
  // 绝不能用 points 兜底 —— points 会被 /发放 抬高，那样发放就会间接升级。
  // 没有 earned 的老档案已在加载时的迁移里落盘补齐。
  // 用只读查找而不是 #user()：这是纯查询，看一眼等级不该往存档里写空记录。
  profile(uid) {
    const u = this.state.users[String(uid)] || {};
    const points = Math.max(0, Number(u.points) || 0);
    const earned = Math.max(0, Number(u.earned) || 0);
    const level = levelOf(earned);
    const base = levelFloor(level);
    const top = levelFloor(level + 1);
    return {
      points,
      earned,
      level,
      levelBase: base,
      levelExp: earned - base,
      levelSpan: top - base,
      levelPct: top > base ? Math.max(0, Math.min(1, (earned - base) / (top - base))) : 1,
      nextNeed: Math.max(0, top - earned),
      streak: u.streak || 0,
      bestStreak: u.bestStreak || 0,
      totalDays: u.totalDays || 0,
      lastCheckin: u.lastCheckin || "",
    };
  }

  hasCheckedToday(uid) {
    const u = this.state.users[String(uid)] || {};
    return u.lastCheckin === todayKey();
  }

  doCheckin(uid) {
    const today = todayKey();
    const before = this.profile(uid);
    if (before.lastCheckin === today) return { ok: false, already: true, ...before, gained: 0, levelUp: false };
    const u = this.#user(uid);
    u.streak = before.lastCheckin === shiftKey(today, -1) ? before.streak + 1 : 1;
    const gain = 10 + Math.min(u.streak - 1, 10);
    u.points += gain;
    u.earned = (Number(u.earned) || 0) + gain;
    u.totalDays += 1;
    u.bestStreak = Math.max(u.bestStreak, u.streak);
    u.lastCheckin = today;
    this.save();
    const after = this.profile(uid);
    return { ok: true, already: false, ...after, gained: gain, beforeLevel: before.level, levelUp: after.level > before.level };
  }

  // 消费只扣余额 points，不动 earned —— 这是「消费不掉级」的保证，改这里前先想清楚。
  spend(uid, n) {
    const before = this.profile(uid);
    if (before.points < n) return { ok: false, short: n - before.points, ...before, gained: 0 };
    const u = this.#user(uid);
    u.points -= n;
    this.save();
    return { ok: true, ...this.profile(uid), spent: -n };
  }

  // 发放只动余额 points，不动 earned —— 累计积分只认签到送的，发放不算。
  // 扣回（负数）走 spend()，同样不碰 earned，所以任何路径都不会降级。
  grant(uid, n) {
    const u = this.#user(uid);
    u.points += n;
    this.save();
    return { ok: true, ...this.profile(uid), granted: n };
  }

  // ===== 以下为主人专用数据修复（绝对值设定），走群聊指令调用 =====
  // 与 grant/spend 的区别：那两个是「加减」，这些是「定值」，用于修错数据。

  /** 直接把余额积分定为 n（不动 earned/等级） */
  setPoints(uid, n) {
    const before = this.profile(uid);
    const u = this.#user(uid);
    u.points = Math.max(0, Math.trunc(Number(n) || 0));
    this.save();
    return { ok: true, before, after: this.profile(uid) };
  }

  /**
   * 直接把累计积分 earned 定为 n —— 这是修等级的手段。
   * 会同步保证 earned 不低于余额，否则用户消费光余额后等级会显示得比实际低。
   */
  setEarned(uid, n) {
    const before = this.profile(uid);
    const u = this.#user(uid);
    const target = Math.max(0, Math.trunc(Number(n) || 0));
    u.earned = Math.max(target, u.points);
    this.save();
    return { ok: true, before, after: this.profile(uid), clamped: u.earned !== target };
  }

  /**
   * 修签到进度。参数均可省略，只改传入的字段。
   * 传 bestStreak 时会保证不小于 streak（历史最长不应小于当前连续）。
   * lastCheckin 传空字符串表示「清空」，即视为今天没签到，可以重新签。
   */
  setProgress(uid, patch = {}) {
    const before = this.profile(uid);
    const u = this.#user(uid);
    if (patch.streak !== undefined) u.streak = Math.max(0, Math.trunc(Number(patch.streak) || 0));
    if (patch.totalDays !== undefined) u.totalDays = Math.max(0, Math.trunc(Number(patch.totalDays) || 0));
    if (patch.lastCheckin !== undefined) u.lastCheckin = String(patch.lastCheckin || "").trim();
    if (patch.bestStreak !== undefined) u.bestStreak = Math.max(0, Math.trunc(Number(patch.bestStreak) || 0));
    else u.bestStreak = Math.max(u.bestStreak || 0, u.streak);
    this.save();
    return { ok: true, before, after: this.profile(uid) };
  }

  /** 把某人清零重置（保留档案结构，等于全新用户） */
  resetUser(uid) {
    const before = this.profile(uid);
    this.state.users[String(uid)] = { points: 0, earned: 0, streak: 0, bestStreak: 0, totalDays: 0, lastCheckin: "" };
    this.save();
    return { ok: true, before, after: this.profile(uid) };
  }

  /** 彻底删除某人档案。返回是否原本存在，避免「删不存在的用户」也回成功 */
  removeUser(uid) {
    const key = String(uid);
    const existed = Object.prototype.hasOwnProperty.call(this.state.users, key);
    if (existed) {
      delete this.state.users[key];
      this.save();
    }
    return { ok: true, existed };
  }

  /** 存档里有哪些用户、每人什么情况（数据概览用） */
  listUsers() {
    return Object.entries(this.state.users).map(([uid, u]) => ({ uid, ...this.profile(uid) }));
  }
}