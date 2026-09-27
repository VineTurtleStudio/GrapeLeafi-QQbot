// brain-keyword.js —— 关键词自动回复引擎：随机回复、定时回复、关键词图库、签到图/面板插入、
// 以及模板里的 {ban}/{kick}/{recall} 等群管理动作。
// 原先这些逻辑埋在 brain.js 的 createBrain 闭包里，依赖十几个外部符号；
// 这里改成显式 deps 注入，便于单独测试，也避免 brain.js 无限膨胀。
import { textSeg } from "./antiRisk.js";
import { templateSegs, atUsers, parseDurationSec } from "./brain-template.js";
import { imageSegFromFile, scanDirImages, parseImageDirs } from "./games.js";
import { buildCheckinCard } from "./checkinImage.js";
import { logger } from "./logger.js";

export function createKeywordEngine(deps) {
  const {
    gateway,
    checkins,
    // 下面几个是 brain 闭包里的函数，用注入的方式拿，避免循环依赖
    senderName,
    panelSegs,
    panelFallbackText,
    timeReplyFor,
    isGroupPrivileged,
  } = deps;

  const kwImageListCache = new Map();
  const KW_IMAGE_CACHE_MS = 60000;

  function keywordImageFiles(dirs) {
    const key = dirs.join("\n");
    const now = Date.now();
    const hit = kwImageListCache.get(key);
    if (hit && now - hit.at < KW_IMAGE_CACHE_MS) return hit.files;
    const files = [];
    for (const dir of dirs) files.push(...scanDirImages(dir, { recursive: true }));
    if (kwImageListCache.size > 50) kwImageListCache.delete(kwImageListCache.keys().next().value);
    kwImageListCache.set(key, { at: now, files });
    return files;
  }

  async function imageSegOf(img) {
    if (!img) return null;
    try {
      if (/^https?:\/\//i.test(img)) return { type: "image", data: { file: img } };
      return await imageSegFromFile(img);
    } catch (err) {
      logger.warn(`[image] 无法读取图片 ${img}: ${err.message}`);
      return null;
    }
  }

  async function entryImageSeg(entry) {
    if (!entry) return null;
    const dirs = parseImageDirs(entry.imageDir);
    if (dirs.length) {
      const files = keywordImageFiles(dirs);
      if (!files.length) {
        logger.warn(`[image] 关键字图库目录里没有图片：${dirs.join(" / ")}`);
        return null;
      }
      return await imageSegOf(files[Math.floor(Math.random() * files.length)]);
    }
    if (entry.image) return await imageSegOf(entry.image);
    return null;
  }

  function pickReply(entry) {
    if (!entry) return "";
    const tt = timeReplyFor(entry);
    if (tt) return tt;
    const rr = Array.isArray(entry.randomReplies) ? entry.randomReplies.filter(Boolean) : [];
    if (rr.length) return rr[Math.floor(Math.random() * rr.length)];
    return entry.reply || "";
  }

  async function performActions(template, body) {
    if (!template || body.message_type !== "group") return template;
    const re = /\{(ban|unban|kick|banall|unbanall|recall)(?::([^}]*))?\}/g;
    const tokens = [...String(template).matchAll(re)];
    if (!tokens.length) return template;
    const target = atUsers(body)[0];
    if (!(await isGroupPrivileged(body))) return String(template).replace(re, "");
    const gid = body.group_id;
    const jobs = tokens
      .map((m) => {
        const kind = m[1];
        const arg = m[2];
        if (kind === "ban") {
          if (!target) return null;
          const dur = arg && /[\d.]/.test(arg) ? parseDurationSec(arg) : 600;
          return gateway.call("set_group_ban", { group_id: gid, user_id: Number(target), duration: dur }).catch(() => {});
        }
        if (kind === "unban") {
          if (!target) return null;
          return gateway.call("set_group_ban", { group_id: gid, user_id: Number(target), duration: 0 }).catch(() => {});
        }
        if (kind === "kick") {
          if (!target) return null;
          return gateway.call("set_group_kick", { group_id: gid, user_id: Number(target) }).catch(() => {});
        }
        if (kind === "banall") return gateway.call("set_group_whole_ban", { group_id: gid, enable: true }).catch(() => {});
        if (kind === "unbanall") return gateway.call("set_group_whole_ban", { group_id: gid, enable: false }).catch(() => {});
        if (kind === "recall") {
          const rp = (body.message || []).filter((s) => s.type === "reply" && s.data && s.data.id);
          if (!rp.length) return null;
          return gateway.call("delete_msg", { message_id: String(rp[0].data.id) }).catch(() => {});
        }
        return null;
      })
      .filter(Boolean);
    await Promise.all(jobs);
    return String(template).replace(re, "");
  }

  async function replySegs(entry, channelText = null, repeat = false, vars = null, body = null) {
    if (!entry) return null;
    const segs = [];
    const text = repeat && channelText && entry.repeat ? channelText : null;
    if (text) segs.push(textSeg(text));
    else {
      const t = pickReply(entry);
      if (t) {
        const rendered = body ? await performActions(t, body) : t;
        if (rendered) {
          let s = rendered;
          const wantPanel = body && /\{panel\}/.test(s);
          const wantSign = body && /\{signday\}/.test(s);
          if (wantPanel) s = s.replace(/\{panel\}/g, "");
          if (wantSign) s = s.replace(/\{signday\}/g, "");
          if (s.trim()) {
            if (vars) segs.push(...templateSegs(s, vars));
            else segs.push(textSeg(s));
          }
          if (wantSign) {
            const res = checkins.doCheckin(body.user_id);
            try {
              const img = await buildCheckinCard({ uid: body.user_id, name: senderName(body), ...res });
              if (img) segs.push({ type: "image", data: { file: img.dataUrl } });
              else segs.push(textSeg(`📅 ${res.already ? "今日已签到，连续 " + res.streak + " 天" : "签到成功 +" + res.gained + " 积分"}（图片生成失败）`));
            } catch (err) {
              logger.warn(`[checkin] 签到图生成失败: ${err.message}`);
            }
          }
          if (wantPanel) {
            if (gateway) segs.push(...panelSegs());
            else segs.push(textSeg(panelFallbackText()));
          }
        }
      }
    }
    if (entry.image || entry.imageDir) {
      const img = await entryImageSeg(entry);
      if (img) segs.push(img);
    }
    return segs.length ? segs : null;
  }

  return { replySegs, performActions, pickReply, entryImageSeg };
}
