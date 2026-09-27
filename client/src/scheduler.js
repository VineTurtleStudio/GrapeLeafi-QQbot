import { isQuietNow, fmtHHMM, toMinutes, nowMinutes } from "./timeutil.js";
import { logger } from "./logger.js";
import { todayBirthdaysForGroup, birthdayLines, todayMd } from "./birthdays.js";
import { saveContent } from "./content.js";

export class Scheduler {
  constructor({ sender, getContent, quietHours = {}, checkEverySec = 20, dataDir = null }) {
    this.sender = sender;
    this.getContent = getContent;
    this.quietHours = quietHours;
    this.checkEverySec = checkEverySec;
    this.dataDir = dataDir;
    this.firedDates = new Map();
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.#tick(), this.checkEverySec * 1000);
    logger.info(`[schedule] 定时提醒已启动(每 ${this.checkEverySec}s 检查)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 控制台改免打扰时段后热重载，不必重启 */
  setQuietHours(q) {
    this.quietHours = q || {};
    logger.info(`[schedule] 免打扰时段已热重载（${this.quietHours.enabled ? `${this.quietHours.start}-${this.quietHours.end}` : "未启用"}）`);
    return this;
  }

  /** 检查间隔变了要重启定时器才生效（interval 创建时长度已固定） */
  setCheckEverySec(sec) {
    const n = Math.max(1, Math.trunc(Number(sec) || 20));
    if (n === this.checkEverySec) return this;
    this.checkEverySec = n;
    if (this.timer) {
      this.stop();
      this.start();
      logger.info(`[schedule] 检查间隔已改为 ${n}s 并重启定时器`);
    }
    return this;
  }

  #tick() {
    const content = this.getContent ? this.getContent() : null;
    const schedule = (content && content.schedule) || [];
    const today = new Date().toISOString().slice(0, 10);
    const now = nowMinutes();
    for (const job of schedule) {
      if (!job || !job.enabled || !job.time || !job.groups || !job.groups.length) continue;
      const fire = toMinutes(job.time);
      if (fire !== now) continue;
      const key = `${today}:${job.id}`;
      if (this.firedDates.get(key)) continue;
      this.firedDates.set(key, true);
      if (this.firedDates.size > 1000) this.firedDates.clear();
      if (isQuietNow(this.quietHours) && !job.groups.every((g) => (this.quietHours.allowGroups || []).includes(g))) {
        logger.info(`[schedule] ${job.id} 触发时间处于静默窗口，跳过`);
        continue;
      }
      for (const gid of job.groups) {
        this.sender.enqueue({
          type: "group",
          targetId: gid,
          message: job.message,
          tag: `sched:${job.id}`,
        });
      }
      logger.info(`[schedule] 已推送定时任务 ${job.id}(${fmtHHMM()}) 到 ${job.groups.length} 个群`);
    }
    this.#birthdayTick(content, now);
  }

  #birthdayTick(content, now) {
    const bd = content && content.birthdays;
    if (!bd || bd.enabled === false) return;
    const time = (bd.time && String(bd.time)) || "00:00";
    if (toMinutes(time) !== now) return;
    const groups = Array.isArray(bd.enabledGroups) ? bd.enabledGroups.map(String).filter(Boolean) : [];
    if (!groups.length) return;
    let bdToday = null;
    try {
      bdToday = todayMd();
    } catch {
      return;
    }
    if (bd.lastFired === bdToday) return;
    bd.lastFired = bdToday;
    try {
      saveContent(this.dataDir, content);
    } catch (err) {
      logger.warn(`[birthday] 记录 lastFired 持久化失败: ${err.message}`);
    }
    for (const gid of groups) {
      const persons = todayBirthdaysForGroup(content, gid);
      if (!persons.length) continue;
      const lines = birthdayLines(persons, bd.notice);
      const message = lines.map((t) => ({ type: "text", data: { text: t } }));
      this.sender.enqueue({ type: "group", targetId: gid, message, tag: "birthday" });
    }
    logger.info(`[birthday] ${bdToday} 生日推送完成，覆盖 ${groups.length} 个已开启群`);
  }
}