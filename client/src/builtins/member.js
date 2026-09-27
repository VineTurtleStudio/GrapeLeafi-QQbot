// builtins/member.js —— 查询类内置指令（me/info/groupinfo/头像）。
// 只依赖注入的 { gateway, sendText, sendMsg, textSeg } 与 common 工具；
// 不 import brain、不 import gacha；可 node --check 自证。

import { resolveTarget } from "./common.js";

async function resolveGroup(body, args, gateway) {
  const list = args || [];
  const num = list.find((a) => /^\d{5,12}$/.test(a));
  if (num) return { id: num, rest: list.filter((a) => a !== num) };
  const name = list.join(" ").trim();
  if (!name) {
    if (body.message_type === "group") return { id: String(body.group_id), rest: [] };
    return { id: null, rest: [] };
  }
  if (gateway) {
    try {
      const groups = await gateway.call("get_group_list", {});
      const arr = Array.isArray(groups) ? groups : Array.isArray(groups?.data) ? groups.data : [];
      const hit = arr.find((g) => String(g.group_name || "").includes(name));
      if (hit) return { id: String(hit.group_id), rest: [] };
    } catch {}
  }
  return { id: null, rest: list, unresolved: name };
}

export function memberCommands({ gateway, sendText, sendMsg, textSeg }) {
  return {
    me: {
      fn: async (body, args) => {
        const { id } = resolveTarget(body, args);
        const target = id || String(body.user_id);
        try {
          const info = await gateway.call("get_stranger_info", { user_id: Number(target) });
          const sexMap = { male: "男", female: "女", unknown: "保密" };
          const head = id ? `「${info.nickname ?? target}」的资料` : "你的资料";
          return sendText(
            body,
            `${head}：昵称 ${info.nickname ?? "?"}｜性别 ${sexMap[info.sex] ?? info.sex ?? "?"}｜年龄 ${info.age ?? "?"}\nQQ ${target}`,
            "me"
          );
        } catch (err) {
          return sendText(body, `查询失败：${err.message}`, "me");
        }
      },
    },
    info: {
      fn: async (body, args) => {
        if (body.message_type !== "group") return;
        const { id } = resolveTarget(body, args);
        const target = id || String(body.user_id);
        try {
          const info = await gateway.call("get_group_member_info", { group_id: body.group_id, user_id: Number(target) });
          const who = info.card || info.nickname || "?";
          const head = id ? `「${who}」在本群` : "你在本群";
          return sendText(
            body,
            `${head}：昵称 ${who}｜头衔 ${info.title || "无"}｜角色 ${info.role || "?"}`,
            "info"
          );
        } catch (err) {
          return sendText(body, `查询失败：${err.message}`, "info");
        }
      },
      groupOnly: true,
    },
    groupinfo: {
      fn: async (body, args) => {
        const { id, unresolved } = await resolveGroup(body, args, gateway);
        if (!id) {
          return sendText(
            body,
            unresolved
              ? `没有找到群「${unresolved}」，请用群号或 bot 所在群的群名。`
              : "用法：/群信息 [群名/群号]（在群里可省略，默认当前群）",
            "groupinfo"
          );
        }
        try {
          const info = await gateway.call("get_group_info", { group_id: Number(id) });
          let owner = info.owner_id ?? null;
          if (!owner) {
            try {
              const members = await gateway.call("get_group_member_list", { group_id: Number(id) });
              const own = (members || []).find((m) => m.role === "owner");
              if (own) owner = own.user_id;
            } catch (_) {}
          }
          const ownerName = owner ? (owner === info.owner_id ? `[QQ:${owner}]` : owner) : "?";
          return sendText(
            body,
            `群「${info.group_name ?? "?"}」\n群号 ${info.group_id}｜人数 ${info.member_count}/${info.max_member_count}｜群主 ${ownerName}`,
            "groupinfo"
          );
        } catch (err) {
          return sendText(body, `查询失败：${err.message}`, "groupinfo");
        }
      },
    },
    头像: {
      fn: async (body, args) => {
        const { id } = resolveTarget(body, args);
        const qq = id || body.user_id;
        return sendMsg(body, [textSeg(`这是 ${qq} 的头像：\n`), { type: "image", data: { file: `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=640` } }], "avatar");
      },
    },
  };
}