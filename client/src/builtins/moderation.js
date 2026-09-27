// builtins/moderation.js —— 群管理类内置指令（群名片/群名/禁言/解禁/踢出/全体禁言/解除/撤回）。
// 只依赖注入的 { gateway, sendText } 与 common 工具；不 import brain、不 import gacha；可 node --check 自证。

import { resolveTarget, parseDurationSec, fmtDuration } from "./common.js";

export function moderCommands({ gateway, sendText }) {
  return {
    群名片: {
      fn: async (body, args) => {
        if (body.message_type !== "group") return;
        const at = (body.message || []).find((s) => s.type === "at" && s.data && s.data.qq && !["all", "0"].includes(String(s.data.qq)));
        const target = at ? Number(at.data.qq) : Number(body.user_id);
        const card = (args || []).join(" ").trim();
        if (!card) return sendText(body, "用法：/群名片 新名字（可 @别人改 TA 的名片）", "setcard");
        try {
          await gateway.call("set_group_card", { group_id: body.group_id, user_id: target, card });
          return sendText(body, `已把名片改成「${card}」（仅本群可见）`, "setcard");
        } catch (err) {
          return sendText(body, `改名片失败：${err.message}`, "setcard");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    群名: {
      fn: async (body, args) => {
        if (body.message_type !== "group") return;
        const name = (args || []).join(" ").trim();
        if (!name) return sendText(body, "用法：/群名 新群名", "setname");
        try {
          await gateway.call("set_group_name", { group_id: body.group_id, group_name: name });
          return sendText(body, `已把群名改为「${name}」`, "setname");
        } catch (err) {
          return sendText(body, `改群名失败：${err.message}`, "setname");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    mute: {
      fn: async (body, args) => {
        const { id: target, rest } = resolveTarget(body, args);
        if (!target) return sendText(body, "用法：/禁言 @某人 [时长] 或 /禁言 QQ号 [时长]，例如 /禁言 @葡萄 10分钟、/禁言 123456 10分钟", "mute");
        const durText = rest.join(" ").trim();
        const dur = /[\d.]/.test(durText) ? parseDurationSec(durText) : 600;
        try {
          await gateway.call("set_group_ban", { group_id: body.group_id, user_id: Number(target), duration: dur });
          return sendText(body, `已禁言 ${target} ${fmtDuration(dur)}。`, "mute");
        } catch (err) {
          return sendText(body, `禁言失败：${err.message}（需 bot 是该群管理员）`, "mute");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    unmute: {
      fn: async (body, args) => {
        const { id: target } = resolveTarget(body, args);
        if (!target) return sendText(body, "用法：/解禁 @某人 或 /解禁 QQ号", "unmute");
        try {
          await gateway.call("set_group_ban", { group_id: body.group_id, user_id: Number(target), duration: 0 });
          return sendText(body, `已解除 ${target} 的禁言。`, "unmute");
        } catch (err) {
          return sendText(body, `解禁失败：${err.message}（需 bot 是该群管理员）`, "unmute");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    kick: {
      fn: async (body, args) => {
        const { id: target } = resolveTarget(body, args);
        if (!target) return sendText(body, "用法：/踢出 @某人 或 /踢出 QQ号", "kick");
        try {
          await gateway.call("set_group_kick", { group_id: body.group_id, user_id: Number(target) });
          return sendText(body, `已把 ${target} 请出群聊。`, "kick");
        } catch (err) {
          return sendText(body, `踢出失败：${err.message}（需 bot 是该群管理员）`, "kick");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    banall: {
      fn: async (body) => {
        try {
          await gateway.call("set_group_whole_ban", { group_id: body.group_id, enable: true });
          return sendText(body, "已开启全体禁言。", "banall");
        } catch (err) {
          return sendText(body, `操作失败：${err.message}`, "banall");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    unbanall: {
      fn: async (body) => {
        try {
          await gateway.call("set_group_whole_ban", { group_id: body.group_id, enable: false });
          return sendText(body, "已解除全体禁言。", "unbanall");
        } catch (err) {
          return sendText(body, `操作失败：${err.message}`, "unbanall");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    recall: {
      fn: async (body) => {
        const replySegs = (body.message || []).filter((s) => s.type === "reply");
        if (!replySegs.length) return sendText(body, "用法：回复一条消息再发 /撤回", "recall");
        try {
          await gateway.call("delete_msg", { message_id: String(replySegs[0].data.id) });
          return sendText(body, "已撤回。", "recall");
        } catch (err) {
          return sendText(body, `撤回失败：${err.message}（需 bot 是该群管理员）`, "recall");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
  };
}