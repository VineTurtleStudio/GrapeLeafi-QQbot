// builtins/checkin.js —— 每日签到类内置指令（签到/等级/面板）。
// 只依赖注入的 { checkins, sendText, sendMsg, textSeg } 与 checkinImage/logger；不 import brain、不 import gacha；可 node --check 自证。

import { buildCheckinCard, profileText } from "../checkinImage.js";
import { titlesForGroup } from "../levelTitles.js";
import { logger } from "../logger.js";

function senderName(body) {
  return body && body.sender && (body.sender.card || body.sender.nickname)
    ? body.sender.card || body.sender.nickname
    : `QQ${body.user_id}`;
}

function panelSegs() {
  return [
    { type: "markdown", data: { content: "## 🍇 葡萄工作台\n点击下方按钮快速操作 👇" } },
    {
      type: "keyboard",
      data: {
        rows: [
          [
            { type: "button", text: "✅ 签到", id: "cb.signin" },
            { type: "button", text: "🎣 钓鱼", id: "cb.fish" },
          ],
          [
            { type: "button", text: "🔮 运势", id: "cb.luck" },
            { type: "button", text: "🏷️ 等级", id: "cb.level" },
          ],
        ],
      },
    },
  ];
}

function panelFallbackText() {
  return "🍇 葡萄工作台（当前协议端不支持按钮卡片，手动输入对应指令即可）：\n签到 → /签到\n钓鱼 → /钓鱼\n运势 → /运势\n等级 → /等级";
}

// 等级卡右侧立绘：从用户已抽到的卡里挑一张（collectionOf 已按稀有度降序排），
// 用卡面（card），不用 detail —— detail 是详细卡牌信息、满是数值和边框，
// 当立绘太花了。detail 读不到时再退回它。抽不到卡就返回 null，绘图层回退渐变。
function pickSplash(cards, uid) {
  if (!cards || typeof cards.collectionOf !== "function") return null;
  let col;
  try {
    col = cards.collectionOf(uid);
  } catch {
    return null;
  }
  const entries = (col && col.entries) || [];
  for (const e of entries) {
    if (!e || typeof cards.packAsset !== "function") continue;
    for (const kind of ["card", "detail"]) {
      try {
        const f = cards.packAsset(e.packId, kind, e.id);
        if (f) return { file: f, name: e.charName || "", rarity: e.rarity || "" };
      } catch {}
    }
  }
  return null;
}

async function checkinImgSeg(cards, content, body, res, stones, extra) {
  try {
    const img = await buildCheckinCard({
      uid: body.user_id,
      name: senderName(body),
      stones,
      ...res,
      ...(extra || {}),
      titles: titlesForGroup(content, body.message_type === "group" ? body.group_id : ""),
      splash: pickSplash(cards, body.user_id),
    });
    if (img) return { type: "image", data: { file: img.dataUrl } };
  } catch (err) {
    logger.warn(`[checkin] 签到图生成失败: ${err.message}`);
  }
  return null;
}

export function checkinCommands({ checkins, cards, content, sendText, sendMsg, textSeg }) {
  return {
    签到: {
      fn: async (body) => {
        const res = checkins.doCheckin(body.user_id);
        let stoneGain = 0;
        if (cards && !res.already) {
          stoneGain = Math.min(4 + (Number(res.streak) || 1), 10);
          cards.grantStones(body.user_id, stoneGain);
        }
        const stones = cards ? cards.stonesOf(body.user_id) : 0;
        const line = res.already
          ? `📅 今天已经签到过啦~（💠 光玉 ${stones}）`
          : `📅 签到成功！+${res.gained} 积分${res.levelUp ? `，升级到 Lv.${res.level} 🎉` : ""}，💠 +${stoneGain} 光玉（现有 ${stones} 光玉，连续 ${res.streak} 天）`;
        const segs = [textSeg(line)];
        const img = await checkinImgSeg(cards,content,body, res, stones);
        if (img) segs.push(img);
        else segs.push(textSeg(profileText(res)));
        return sendMsg(body, segs, "checkin");
      },
    },
    等级: {
      fn: async (body) => {
        const res = checkins.profile(body.user_id);
        const stones = cards ? cards.stonesOf(body.user_id) : 0;
        const already = checkins.hasCheckedToday(body.user_id);
        const segs = [textSeg(`🧾 你的等级档案：Lv.${res.level}｜积分 ${res.points}｜光玉 ${stones}｜连续签到 ${res.streak} 天｜累计 ${res.totalDays} 天`)];
        const img = await checkinImgSeg(cards,content,body, res, stones, { already, gained: 0 });
        if (img) segs.push(img);
        return sendMsg(body, segs, "level");
      },
    },
    面板: {
      fn: async (body) => {
        const r = await sendMsg(body, panelSegs(), "panel");
        if (r && r.ok === false) {
          await sendMsg(body, [textSeg(panelFallbackText())], "panel");
        }
      },
    },
  };
}