import { randomInt } from "node:crypto";
import { logger } from "./logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAIL_DECAY_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 2000;

const D = {
  minDelayMs: 600,
  maxDelayMs: 1800,
  groupCooldownMs: 3000,
  userCooldownMs: 3000,
  burstLimit: 20,
  burstWindowSec: 60,
  dailyCap: 500,
  maxTextLength: 500,
  sameTextGapMs: 0,
  hourlyCap: 120,
  groupIdDailyCap: 200,
  autoMuteMinutes: 5,
  autoMuteFailStreak: 3,
  maxQueueLength: 200,
  maxQueueWaitMs: 600000,
  sendTimeoutMs: 30000,
  concurrency: 3,
  maxPenalty: 4,
};

export class Sender {
  constructor(gateway, options = {}) {
    this.gateway = gateway;
    this.options = { ...D, ...options };
    this.queue = [];
    this.workers = 0;
    this.busyKeys = new Set();
    this.lastSentAt = new Map();
    this.burstTimestamps = [];
    this.hourlyTimestamps = [];
    this.sameTextAt = new Map();
    this.groupDaily = new Map();
    this.dailyCount = 0;
    this.dailyDate = this.#today();
    this.penalty = 1;
    this.failStreak = 0;
    this.lastFailAt = 0;
    this.softMuteUntil = 0;
    this.sentTotal = 0;
    this.droppedTotal = 0;
  }

  #today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  setRuntime(partial = {}) {
    const SAFE = [
      "minDelayMs",
      "maxDelayMs",
      "groupCooldownMs",
      "userCooldownMs",
      "burstLimit",
      "burstWindowSec",
      "hourlyCap",
      "dailyCap",
      "groupIdDailyCap",
      "maxQueueLength",
      "concurrency",
      "sendTimeoutMs",
      "maxPenalty",
    ];
    let applied = 0;
    for (const key of SAFE) {
      if (!(key in partial) && !(key in this.options)) continue;
      const v = partial[key];
      if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) {
        this.options[key] = Number(v);
        applied++;
      }
    }
    return { applied, options: { ...this.options } };
  }

  #resetDailyIfNeeded() {
    const today = this.#today();
    if (today !== this.dailyDate) {
      this.dailyDate = today;
      this.dailyCount = 0;
      this.groupDaily.clear();
    }
  }

  #clampText(text, max) {
    if (typeof text !== "string") return text;
    if (text.length <= max) return text;
    return text.slice(0, max) + "…";
  }

  enqueue({ type, targetId, message, tag = "manual", fromUserId = null, deadlineAt = null }) {
    const key = `${type}:${targetId}`;
    const text = this.#extractText(message);
    const requestedDeadline = Number(deadlineAt);
    const hasDeadline = deadlineAt !== null && deadlineAt !== undefined && Number.isFinite(requestedDeadline);
    const payload = {
      type,
      targetId,
      message,
      tag,
      fromUserId,
      key,
      text,
      pushedAt: Date.now(),
      deadlineAt: hasDeadline ? requestedDeadline : null,
    };

    if (payload.deadlineAt && Date.now() >= payload.deadlineAt) {
      this.droppedTotal++;
      return Promise.resolve({ ok: false, reason: "deadline" });
    }
    if (Date.now() < this.softMuteUntil) {
      this.droppedTotal++;
      logger.warn(`[antiRisk] 软静默中(风控退避，剩余 ${Math.ceil((this.softMuteUntil - Date.now()) / 1000)}s)，丢弃 #${tag}`);
      return Promise.resolve({ ok: false, reason: "soft_mute" });
    }
    if (this.queue.length >= this.options.maxQueueLength) {
      this.droppedTotal++;
      logger.warn(`[antiRisk] 队列已满(${this.options.maxQueueLength})，丢弃 #${tag}`);
      return Promise.resolve({ ok: false, reason: "queue_full" });
    }

    return new Promise((resolve) => {
      payload.resolve = resolve;
      this.queue.push(payload);
      this.#ensureWorkers();
    });
  }

  #extractText(message) {
    if (typeof message === "string") return message;
    if (Array.isArray(message)) {
      return message
        .map((s) => (s.type === "text" && s.data && s.data.text ? s.data.text : ""))
        .join("");
    }
    return "";
  }

  async #waitWithin(item, ms) {
    const delay = Math.max(0, Number(ms) || 0);
    if (!item.deadlineAt) {
      await sleep(delay);
      return true;
    }
    const remaining = item.deadlineAt - Date.now();
    if (remaining <= 0) return false;
    await sleep(Math.min(delay, remaining));
    return Date.now() < item.deadlineAt;
  }

  #ensureWorkers() {
    const max = Math.max(1, Number(this.options.concurrency) || 1);
    while (this.workers < max && this.queue.length) {
      this.workers++;
      this.#worker()
        .catch(() => {})
        .finally(() => {
          this.workers--;
          if (this.queue.length) this.#ensureWorkers();
        });
    }
  }

  async #worker() {
    while (this.queue.length) {
      const idx = this.queue.findIndex((it) => !this.busyKeys.has(it.key));
      if (idx === -1) {
        await sleep(120);
        continue;
      }
      const item = this.queue.splice(idx, 1)[0];
      this.busyKeys.add(item.key);
      try {
        await this.#process(item);
      } finally {
        this.busyKeys.delete(item.key);
      }
    }
  }

  async #process(item) {
    const o = this.options;
    const { minDelayMs, maxDelayMs, groupCooldownMs, userCooldownMs, burstLimit, burstWindowSec, dailyCap, maxTextLength, sameTextGapMs, hourlyCap, groupIdDailyCap, maxQueueWaitMs, sendTimeoutMs, maxPenalty } = o;

    this.#resetDailyIfNeeded();

    const drop = (reason, note) => {
      this.droppedTotal++;
      logger.warn(`[antiRisk] ${note}，丢弃 #${item.tag}`);
      item.resolve({ ok: false, reason });
    };
    const waitOrDrop = async (ms, note) => {
      if (await this.#waitWithin(item, ms)) return true;
      drop("deadline", note);
      return false;
    };

    if (item.deadlineAt && Date.now() >= item.deadlineAt) {
      drop("deadline", "已超过指令截止时间");
      return;
    }
    if (Date.now() - item.pushedAt > maxQueueWaitMs) {
      drop("queue_stale", "在队列中等待过久");
      return;
    }
    if (this.dailyCount >= dailyCap) {
      drop("daily_cap", `今日发送已达上限(${dailyCap})`);
      return;
    }
    if (item.type === "group") {
      const used = this.groupDaily.get(item.targetId) || 0;
      if (used >= groupIdDailyCap) {
        drop("group_daily_cap", `该群今日发送已达上限(${groupIdDailyCap})`);
        return;
      }
    }
    if (item.text && sameTextGapMs > 0) {
      const textKey = `${item.key}|${item.text}`;
      if (this.sameTextAt.has(textKey)) {
        const gap = Date.now() - this.sameTextAt.get(textKey);
        if (gap < sameTextGapMs) {
          drop("same_text", `与 ${Math.round(gap / 1000)} 秒前的内容重复`);
          return;
        }
      }
    }

    if (item.type === "group") {
      if (!(await this.#waitTarget(item, item.key, groupCooldownMs * this.penalty))) {
        drop("deadline", "群冷却等待超出截止时间");
        return;
      }
    } else {
      if (!(await this.#waitTarget(item, item.key, userCooldownMs * this.penalty))) {
        drop("deadline", "私聊冷却等待超出截止时间");
        return;
      }
    }
    if (!(await this.#waitWindowCapacity(item, "burst", burstLimit, burstWindowSec))) {
      drop("deadline", "突发限流等待超出截止时间");
      return;
    }
    if (!(await this.#waitWindowCapacity(item, "hourly", hourlyCap, 3600))) {
      drop("deadline", "小时限流等待超出截止时间");
      return;
    }
    if (!(await waitOrDrop(randomInt(Math.max(0, minDelayMs), Math.max(minDelayMs + 1, maxDelayMs)), "随机发送延迟超出截止时间"))) return;

    const action = item.type === "group" ? "send_group_msg" : "send_private_msg";
    const params = {
      [item.type === "group" ? "group_id" : "user_id"]: item.targetId,
      message:
        typeof item.message === "string"
          ? this.#clampText(item.message, maxTextLength)
          : item.message.map((s) => ({ ...s })),
    };

    for (let attempt = 0; attempt <= 1; attempt++) {
      const remaining = item.deadlineAt ? item.deadlineAt - Date.now() : sendTimeoutMs;
      if (remaining <= 0) {
        drop("deadline", "发送前已超过截止时间");
        return;
      }
      const callTimeout = Math.min(sendTimeoutMs, Math.max(1000, remaining));
      try {
        const data = await this.gateway.call(action, params, callTimeout);
        if (item.deadlineAt && Date.now() > item.deadlineAt) {
          drop("deadline", "网关发送超过截止时间");
          return;
        }
        this.#markSent(item);
        this.sentTotal++;
        this.penalty = 1;
        this.failStreak = 0;
        this.lastFailAt = 0;
        item.resolve({ ok: true, data });
        return;
      } catch (err) {
        const isNetwork = /timeout|not connected/i.test(err.message);
        if (attempt === 0 && isNetwork) {
          if (item.deadlineAt && Date.now() >= item.deadlineAt) {
            drop("deadline", "网关重试前已超过截止时间");
            return;
          }
          logger.warn(`[antiRisk] 发送 #${item.tag} 网络异常，稍后重试: ${err.message}`);
          if (!(await waitOrDrop(RETRY_DELAY_MS, "重试等待超出截止时间"))) return;
          continue;
        }
        if (this.lastFailAt && Date.now() - this.lastFailAt > FAIL_DECAY_MS) {
          this.failStreak = 0;
          this.penalty = 1;
        }
        this.lastFailAt = Date.now();
        this.failStreak++;
        this.penalty = Math.min(this.penalty * 2, maxPenalty);
        this.droppedTotal++;
        logger.error(`[antiRisk] 发送失败(惩罚倍数=${this.penalty}，失败连击=${this.failStreak}): ${err.message}`);
        if (this.failStreak >= o.autoMuteFailStreak && Date.now() >= this.softMuteUntil) {
          this.softMuteUntil = Date.now() + o.autoMuteMinutes * 60000;
          logger.error(`[antiRisk] 连续 ${this.failStreak} 次发送失败，触发软静默 ${o.autoMuteMinutes} 分钟（疑似风控，暂停外发）`);
        }
        item.resolve({ ok: false, reason: "api_error", error: err.message });
        return;
      }
    }
  }

  reset() {
    const pending = this.queue.splice(0);
    for (const item of pending) item.resolve({ ok: false, reason: "reset" });
    this.penalty = 1;
    this.failStreak = 0;
    this.lastFailAt = 0;
    this.softMuteUntil = 0;
    logger.warn(`[antiRisk] 已手动重置风控状态，清空 ${pending.length} 条待发`);
  }

  async #waitTarget(item, key, cooldownMs) {
    const last = this.lastSentAt.get(key);
    if (!last) return true;
    const remain = last + cooldownMs - Date.now();
    if (remain <= 0) return true;
    return this.#waitWithin(item, remain);
  }

  async #waitWindowCapacity(item, name, limit, windowSec) {
    if (!Number.isFinite(limit) || !Number.isFinite(windowSec) || limit <= 0) return true;
    const isBurst = name === "burst";
    while (true) {
      const now = Date.now();
      const cur = (isBurst ? this.burstTimestamps : this.hourlyTimestamps).filter((t) => now - t < windowSec * 1000);
      if (isBurst) this.burstTimestamps = cur;
      else this.hourlyTimestamps = cur;
      if (cur.length < limit) return true;
      if (!(await this.#waitWithin(item, cur[0] + windowSec * 1000 - now + 10))) return false;
    }
  }

  #markSent(item) {
    const now = Date.now();
    this.lastSentAt.set(item.key, now);
    this.burstTimestamps.push(now);
    this.hourlyTimestamps.push(now);
    if (this.burstTimestamps.length > 500) this.burstTimestamps = this.burstTimestamps.slice(-100);
    if (this.hourlyTimestamps.length > 2000) this.hourlyTimestamps = this.hourlyTimestamps.slice(-1000);
    if (item.type === "group") {
      this.groupDaily.set(item.targetId, (this.groupDaily.get(item.targetId) || 0) + 1);
    }
    if (item.text) this.sameTextAt.set(`${item.key}|${item.text}`, now);
    if (this.sameTextAt.size > 2000) {
      const keys = [...this.sameTextAt.keys()];
      for (let i = 0; i < 1000; i++) this.sameTextAt.delete(keys[i]);
    }
    this.dailyCount++;
  }

  stats() {
    return {
      sent: this.sentTotal,
      dropped: this.droppedTotal,
      queue: this.queue.length,
      sending: this.busyKeys.size,
      daily: this.dailyCount,
      dailyCap: this.options.dailyCap,
      groupDailyCap: this.options.groupIdDailyCap,
      hourlyCap: this.options.hourlyCap,
      penalty: this.penalty,
      failStreak: this.failStreak,
      softMuteUntil: this.softMuteUntil,
    };
  }
}

export function textSeg(text) {
  return { type: "text", data: { text } };
}

export function atSeg(qq) {
  return { type: "at", data: { qq: String(qq) } };
}

export function replySeg(messageId) {
  return { type: "reply", data: { id: String(messageId) } };
}

export function plainText(message) {
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message
      .map((s) => {
        if (s.type === "text" && s.data && s.data.text) return s.data.text;
        if (s.type === "at" && s.data && s.data.qq && !["all", "0"].includes(s.data.qq)) return `@${s.data.qq}`;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function isCommand(text, prefix, command) {
  return text === `${prefix}${command}` || text.startsWith(`${prefix}${command} `);
}

export { randomInt };