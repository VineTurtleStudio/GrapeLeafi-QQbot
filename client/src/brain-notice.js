// brain-notice.js —— QQ 群事件/通知处理。
// 覆盖：入群欢迎、退群告别、戳一戳（拍一拍/捏一捏等）、群聊精华、管理员变动、禁言变动、加好友申请。
//
// 设计要点：
// 1) 所有文案都走 renderTemplate，所以和预设指令共用同一套占位符（{nick} {qq} {at} {rand:..} {role} 等），
//    不再是只有 {player} {qq} 两个私有变量。
// 2) 每个事件都能配 enabledGroups / cooldownSec / image，走同一套「群范围 + 冷却」逻辑。
// 3) 冷却是必须的：QQ 上被连续戳很容易触发，沒冷却会把群刷屏。
import { renderTemplate } from "./brain-template.js";

const NOTICE_DEFAULTS = {
  welcome: { enabledGroups: [], text: "欢迎新成员～在群里说句话认识一下吧！", cooldownSec: 0 },
  leave: { enabledGroups: [], text: "有一位伙伴离开了，愿 TA 前程似锦～", cooldownSec: 0 },
  poke: { enabledGroups: [], replies: ["好痒啊", "戳我干嘛～", "再戳我要收费了哦", "干嘛呀，咩咩~"], cooldownSec: 30, image: "", allowPrivate: false },
  essence: { enabledGroups: [], text: "📌 {nick} 刚把一条消息设为群精华：{title}", cooldownSec: 0 },
  admin: { enabledGroups: [], text: "🔧 群管理员变动：{action} {nick}", cooldownSec: 0 },
  ban: { enabledGroups: [], text: "🔇 {nick} {action}", cooldownSec: 0 },
  friend: { enabledGroups: [], text: "", cooldownSec: 0 },
};

function evOf(settings, key) {
  const ev = (settings && settings.events) || {};
  const cur = ev[key] || {};
  // 只在「磁盘上真的写了」时才算启用，避免 DEFAULT_CONTENT 的默认文案被误当成用户配置。
  // 但 enabledGroups 非空就一定是用户主动配的，所以以它为准。
  const merged = { ...NOTICE_DEFAULTS[key], ...cur };
  if (!Array.isArray(merged.enabledGroups)) merged.enabledGroups = [];
  return merged;
}

export function createNoticeHandler({ sender, textSeg, getContent }) {
  const lastAt = new Map(); // `${key}:${scope}` -> 时间戳，用于冷却

  // 事件的生效范围：enabledGroups 为空 = 所有群都生效（和内置指令的「留空=全部」一致）。
  // 原来这里空数组直接返回 false，语义和别的开关正好相反：控制台输入框只写
  // 「启用群(逗号分隔)」也没说空是什么意思，结果戳 bot 一点反应都没有。
  // 需要只对个别群生效时才往里填群号。
  function groupEnabled(cfg, groupId) {
    if (!cfg) return false;
    if (!Array.isArray(cfg.enabledGroups) || !cfg.enabledGroups.length) return true;
    return cfg.enabledGroups.map(String).includes(String(groupId));
  }

  function cooled(key, scope, sec) {
    const gap = Number(sec) || 0;
    if (gap <= 0) return false;
    const k = `${key}:${scope}`;
    const now = Date.now();
    const prev = lastAt.get(k) || 0;
    if (now - prev < gap * 1000) return true;
    lastAt.set(k, now);
    return false;
  }

  async function replyGroup(groupId, text, tag, image = "", selfId = "") {
    const segs = [];
    if (text) segs.push(textSeg(text));
    if (image) segs.push({ type: "image", data: { file: image } });
    if (!segs.length) return;
    await sender.enqueue({ type: "group", targetId: groupId, message: segs, tag, fromUserId: String(selfId || "") });
  }

  // 私聊回复。好友戳一戳用：OneBot 的 poke 事件在好友场景下不带 group_id，
  // 没法走 replyGroup，只能按 user_id 私聊回去。
  async function replyPrivate(userId, text, tag, image = "", selfId = "") {
    const segs = [];
    if (text) segs.push(textSeg(text));
    if (image) segs.push({ type: "image", data: { file: image } });
    if (!segs.length) return;
    await sender.enqueue({ type: "private", targetId: userId, message: segs, tag, fromUserId: String(selfId || "") });
  }

  /**
   * 把事件文案套上模板。vars 里给的是「被操作的人」和「戳人的人」两套昵称/QQ，
   * 因为戳一戳里「{nick}」按直觉应该指被戳的那个（也就是 bot 自己没意义），
   * 所以 poke 场景下 {nick} 给戳人者的群名片，{player} 也给戳人者，保持向后兼容。
   */
  function fill(tpl, vars) {
    if (!tpl) return "";
    return String(renderTemplate(tpl, vars))
      .replace(/\{player\}/g, vars.playerNick || String(vars.playerQq || ""))
      .replace(/\{title\}/g, vars.title || "")
      .replace(/\{action\}/g, vars.action || "");
  }

  return async function handleNotice(body) {
    const content = getContent();
    const st = content.settings || {};
    const gid = body.group_id;
    const group = body.message_type === "group" || gid != null;

    // —— 入群 ——
    if (body.notice_type === "group_increase") {
      const cfg = evOf(st, "welcome");
      if (!groupEnabled(cfg, gid)) return;
      if (cooled("welcome", gid, cfg.cooldownSec)) return;
      const vars = { qq: body.user_id, nick: body.user_id, playerQq: body.user_id, gid, self: body.self_id };
      return replyGroup(gid, fill(cfg.text, vars), "welcome", cfg.image, body.self_id);
    }

    // —— 退群（自己被踢不提示）——
    if (body.notice_type === "group_decrease") {
      if (body.sub_type === "kick_me") return;
      const cfg = evOf(st, "leave");
      if (!groupEnabled(cfg, gid)) return;
      if (cooled("leave", gid, cfg.cooldownSec)) return;
      const vars = { qq: body.user_id, nick: body.user_id, playerQq: body.user_id, gid, self: body.self_id };
      return replyGroup(gid, fill(cfg.text, vars), "leave", cfg.image, body.self_id);
    }

    // —— 戳一戳 / 拍一拍 / 捏一捏 ——
    // OneBot 标准是 sub_type:"poke"；NapCat 等实现会额外带 action(戳一戳) 与 suffix(的可爱小纸条)。
    // 群戳和好友戳是同一个 sub_type，靠「有没有 group_id」区分：
    // 群戳带 group_id/user_id/target_id，好友戳只有 user_id/target_id。
    if (body.notice_type === "notify" && body.sub_type === "poke") {
      // 只有「戳的是 bot 本人」才回，避免把群友互相戳也接进来
      if (String(body.target_id) !== String(body.self_id)) return;
      const cfg = evOf(st, "poke");
      // 好友戳一戳：原来这里直接 if (!group) return，把好友戳整个丢掉了——
      // 表现就是「群里被戳会回话，好友戳一点反应都没有」，看起来像坏了。
      // 默认不响应私聊（allowPrivate），要主人自己去控制台勾：
      // 私聊没有 enabledGroups 能限范围，不设闸的话陌生人戳一下就回一句，容易被骚扰。
      if (!group) {
        if (cfg.allowPrivate !== true) return;
        if (cooled("poke", `pv:${body.user_id}`, cfg.cooldownSec)) return;
        const plist = Array.isArray(cfg.replies) ? cfg.replies.filter(Boolean) : [];
        if (!plist.length) return;
        const ptpl = plist[Math.floor(Math.random() * plist.length)];
        const pvars = {
          qq: body.self_id,
          nick: body.self_id,
          playerQq: body.user_id,
          playerNick: body.user_id,
          action: body.action || "戳一戳",
          gid: "",
          self: body.self_id,
        };
        const psuffix = body.suffix ? String(body.suffix) : "";
        return replyPrivate(body.user_id, fill(ptpl, pvars) + psuffix, "poke", cfg.image, body.self_id);
      }
      if (!groupEnabled(cfg, gid)) return;
      // 冷却按「戳人的人 + 群」算：同一个人连戳不刷屏，不同人可以各回一次
      if (cooled("poke", `${gid}:${body.user_id}`, cfg.cooldownSec)) return;
      const list = Array.isArray(cfg.replies) ? cfg.replies.filter(Boolean) : [];
      if (!list.length) return;
      const tpl = list[Math.floor(Math.random() * list.length)];
      const vars = {
        qq: body.self_id,
        nick: body.self_id,
        playerQq: body.user_id,
        playerNick: body.user_id,
        action: body.action || "戳一戳",
        gid,
        self: body.self_id,
      };
      // 后缀：NapCat 的 suffix 形如 "的可爱小纸条"，拼在文案后面更有「谁戳了什么」的味
      const suffix = body.suffix ? String(body.suffix) : "";
      return replyGroup(gid, fill(tpl, vars) + suffix, "poke", cfg.image, body.self_id);
    }

    // —— 群聊精华 ——
    if (body.notice_type === "group_essence") {
      const cfg = evOf(st, "essence");
      if (!groupEnabled(cfg, gid)) return;
      if (cooled("essence", gid, cfg.cooldownSec)) return;
      const vars = { qq: body.user_id, nick: body.user_id, playerQq: body.user_id, title: body.title || "", gid, self: body.self_id };
      return replyGroup(gid, fill(cfg.text, vars), "essence", cfg.image, body.self_id);
    }

    // —— 管理员变动 ——
    if (body.notice_type === "group_admin") {
      const cfg = evOf(st, "admin");
      if (!groupEnabled(cfg, gid)) return;
      const vars = { qq: body.user_id, nick: body.user_id, playerQq: body.user_id, action: body.sub_type === "set" ? "被设为" : "被取消", gid, self: body.self_id };
      return replyGroup(gid, fill(cfg.text, vars), "admin", cfg.image, body.self_id);
    }

    // —— 禁言/解禁变动 ——
    if (body.notice_type === "group_ban") {
      const cfg = evOf(st, "ban");
      if (!groupEnabled(cfg, gid)) return;
      const vars = { qq: body.user_id, nick: body.user_id, playerQq: body.user_id, action: body.sub_type === "ban" ? "被禁言了" : "被解除禁言", gid, self: body.self_id };
      return replyGroup(gid, fill(cfg.text, vars), "ban", cfg.image, body.self_id);
    }

    // —— 加好友申请（私聊回）——
    if (body.notice_type === "friend_add") {
      const cfg = evOf(st, "friend");
      if (!cfg.text) return;
      const vars = { qq: body.user_id, nick: body.user_id, playerQq: body.user_id };
      return sender.enqueue({ type: "private", targetId: body.user_id, message: [textSeg(fill(cfg.text, vars))], tag: "friend", fromUserId: String(body.self_id) });
    }
  };
}

export { NOTICE_DEFAULTS };
