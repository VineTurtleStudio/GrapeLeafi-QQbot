// builtins/leveltitle.js —— 葡家等级头衔的查看与修改。
//
// 头衔表放在 content.levelTitles，画进等级卡（checkinImage.js），
// 也可以在控制台里编辑；这里提供群内指令，让群主不打开控制台也能改。
//
// 权限分两种情况，不能混用同一个判断：
//   群聊里改的是「本群覆盖表」，所以群主/群管理/被授予管理员/主人都可以（isGroupOwner）。
//   私聊里没有「本群」，改的必然是全局表 content.levelTitles，影响所有群，
//     因此只认主人（isAdmin）。这里原来写成 `message_type === "group" && isGroupOwner(...)`，
//     两个后果：主人在私聊里根本改不了全局表（唯一入口只能去群里改本群），
//     而 isGroupOwner 对「被授予管理员」也返回 true，等于一个群的管理员
//     私聊一下就能改全局头衔。所以私聊必须单独判 isAdmin。
//
// 没设过群覆盖就回落到全局表 content.levelTitles。

import { normalizeTitles, titleForLevel, titlesForGroup } from "../levelTitles.js";
import { logger } from "../logger.js";

function fmtList(list) {
  return list.map((t) => `${t.min} 级起：${t.text}`).join("\n");
}

export function levelTitleCommands({ content, saveContent, dataDir, isGroupOwner, isAdmin, sendText, checkins }) {
  const USAGE = "用法：/设置头衔 <起始等级> <头衔文字>\n例：/设置头衔 31 葡家编外辅导员\n重置：/设置头衔 重置（清掉本群覆盖，私聊则清掉全局表）";

  async function requireOwner(body) {
    // 私聊 = 改全局表，只放主人过。
    if (body.message_type !== "group") {
      if (isAdmin && isAdmin(body.user_id)) return true;
      await sendText(body, "私聊里改的是全局头衔表（影响所有群），只有主人能改。\n群主/管理员请在群里 @bot 发同一条指令，那样只改本群。", "title");
      return false;
    }
    if (await isGroupOwner(body)) return true;
    await sendText(body, "只有本群群主/管理员或主人能改头衔。", "title");
    return false;
  }

  async function doReset(body) {
    const gid = body.message_type === "group" ? String(body.group_id) : "";
    if (gid && content.levelTitlesByGroup) delete content.levelTitlesByGroup[gid];
    else if (!gid) delete content.levelTitles;
    try {
      await saveContent(dataDir, content);
    } catch (e) {
      logger.warn(`[title] 重置头衔失败: ${e.message}`);
      return sendText(body, `重置失败：${e.message}`, "title");
    }
    return sendText(body, `已把${gid ? "本群" : "全局"}头衔恢复成默认 10 档。`, "title");
  }

  return {
    // /头衔 —— 看自己的头衔；/头衔 列表 看整张表
    头衔: {
      fn: async (body, args) => {
        const gid = body.message_type === "group" ? String(body.group_id) : "";
        const list = titlesForGroup(content, gid);
        const a = (args || []).map((x) => String(x));
        if (a[0] === "列表" || a[0] === "list") {
          return sendText(body, `🍇 葡家等级头衔表${gid ? "（本群）" : "（全局）"}：\n${fmtList(list)}`, "title");
        }
        if (a[0] === "重置" || a[0] === "reset") {
          if (!(await requireOwner(body))) return;
          return doReset(body);
        }
        const lv = checkins ? checkins.profile(body.user_id).level : 1;
        return sendText(body, `🍇 你当前是 Lv.${lv}，头衔「${titleForLevel(list, lv)}」。\n用 /头衔 列表 看全部档位。`, "title");
      },
      cooldownSec: 3,
    },

    // /设置头衔 <起始等级> <头衔文字> —— 改某一档
    // /设置头衔 重置 —— 清掉本群覆盖（私聊则清掉全局表）
    设置头衔: {
      fn: async (body, args) => {
        if (!(await requireOwner(body))) return;
        const a = (args || []).map((x) => String(x));
        if (a[0] === "重置" || a[0] === "reset") return doReset(body);
        const min = Number(a[0]);
        if (!Number.isFinite(min) || min < 1) {
          return sendText(body, USAGE, "title");
        }
        const text = a.slice(1).join(" ").trim();
        if (!text) return sendText(body, USAGE, "title");
        const gid = body.message_type === "group" ? String(body.group_id) : "";
        const list = titlesForGroup(content, gid).slice();
        const i = list.findIndex((t) => Number(t.min) === Math.floor(min));
        if (i >= 0) list[i] = { min: Math.floor(min), text: text.slice(0, 24) };
        else list.push({ min: Math.floor(min), text: text.slice(0, 24) });
        const next = normalizeTitles(list);
        if (gid) {
          if (!content.levelTitlesByGroup) content.levelTitlesByGroup = {};
          content.levelTitlesByGroup[gid] = next;
        } else {
          content.levelTitles = next;
        }
        try {
          await saveContent(dataDir, content);
        } catch (e) {
          logger.warn(`[title] 保存头衔失败: ${e.message}`);
          return sendText(body, `保存失败：${e.message}`, "title");
        }
        return sendText(body, `已设置 ${Math.floor(min)} 级起为「${text.slice(0, 24)}」。\n当前表：\n${fmtList(next)}`, "title");
      },
      adminOnly: false,
      cooldownSec: 2,
    },
  };
}
