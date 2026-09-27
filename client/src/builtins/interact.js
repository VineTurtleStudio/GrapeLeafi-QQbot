// builtins/interact.js —— 戳一戳/拍一拍类互动指令 + 常用群管理补充指令。
//
// 为什么单独一个文件：这些都属于「轻交互 + 轻管理」，逻辑都很短（3~15 行），
// 不值得各自开一个文件，但放一起又不属于 moderation（管理）或 funpacks（娱乐）。
//
// 只用已在项目中验证过能用的 OneBot 动作：
//   set_group_ban / set_group_kick / set_group_card / set_group_whole_ban
//   delete_msg / get_group_member_info / get_group_info
//   group_poke / friend_poke / send_poke
// 不调任何没验证过的接口，避免在真实 QQ 上翻车。

import { resolveTarget, parseDurationSec, fmtDuration } from "./common.js";

// QQ 戳一戳的可用类型。编号沿用 Mirai 的 PokeMessage.Types（NapCat 的 poke 消息段同一套）：
//   普通戳一戳 type=1~6、id=-1，任何账号都能用；
//   SVIP 专属 type=126、id 是动作号，bot 号不是 SVIP 就发不出去。
// 「敲门」没收录：Mirai 自己的表里它和「碎屏」都是 id=2002，而且不在他们的 values 数组里，
// 编号到底对不对没法确认，宁可少给一个也不让主人踩坑。
// 「拍一拍」「捏一捏」不在这个表里——QQ 没有独立的拍/捏动作，那两条指令只是发句文案。
const POKE_TYPES = {
  戳一戳: { type: "1", id: "-1" },
  比心: { type: "2", id: "-1" },
  点赞: { type: "3", id: "-1" },
  心碎: { type: "4", id: "-1" },
  "666": { type: "5", id: "-1" },
  放大招: { type: "6", id: "-1" },
  抓一下: { type: "126", id: "2001", svip: true },
  碎屏: { type: "126", id: "2002", svip: true },
  勾引: { type: "126", id: "2003", svip: true },
  手雷: { type: "126", id: "2004", svip: true },
  结印: { type: "126", id: "2005", svip: true },
  召唤术: { type: "126", id: "2006", svip: true },
  玫瑰花: { type: "126", id: "2007", svip: true },
  让你皮: { type: "126", id: "2009", svip: true },
  宝贝球: { type: "126", id: "2011", svip: true },
};
const POKE_TYPE_NAMES = Object.keys(POKE_TYPES).join("、");

export function interactCommands({ gateway, sendText, sendMsg, textSeg }) {
  // 真的戳出去。
  // 踩过的坑：OneBot 的 poke「消息段」只有 type/id，没有「戳谁」这个字段，
  // 把它塞进群消息里并不能可靠地戳到指定的人。要戳某个具体的人只能走 action。
  // 而 action 这块各实现不一样，所以按「标准老接口 → NapCat 原生接口」的顺序都试一遍。
  async function pokeUser(body, userId) {
    const uid = Number(userId);
    if (!uid) return { error: "没解析出对方 QQ 号" };
    const attempts =
      body.message_type === "group"
        ? [
            ["group_poke", { group_id: body.group_id, user_id: uid }],
            ["send_poke", { user_id: uid, group_id: body.group_id }],
          ]
        : [
            ["friend_poke", { user_id: uid }],
            ["send_poke", { user_id: uid }],
          ];
    const errs = [];
    for (const [action, params] of attempts) {
      try {
        await gateway.call(action, params);
        return { action };
      } catch (e) {
        errs.push(`${action}（${e && e.message ? e.message : e}）`);
      }
    }
    return { error: `网关这几个戳一戳接口都没成功：${errs.join("；")}` };
  }

  // /戳一戳 @某人 [类型]
  // 类型是可选的；不填就是最普通的戳一戳（type=1）。
  // 带类型时额外发一个 poke 消息段——类型只能通过消息段表达，action 不接受类型参数。
  // 消息段被网关拒了也不影响前面已经戳成功，所以这里吞掉异常只在文案里提一句。
  async function doPokeCmd(body, args, defaultLabel) {
    const t = resolveTarget(body, args);
    if (!t.id) {
      // 私聊里没有 @，只能直接写 QQ 号，所以用法提示按聊天类型给不一样的
      const usage =
        body.message_type === "group"
          ? `用法：/${defaultLabel} @某人${defaultLabel === "戳一戳" ? " [类型]" : ""}`
          : `用法：/${defaultLabel} 对方QQ号${defaultLabel === "戳一戳" ? " [类型]" : ""}（私聊里不用 @，直接写 QQ 号）`;
      return sendText(body, `${usage}\n可用类型：${POKE_TYPE_NAMES}`, "poke");
    }
    const rest = (t.rest || []).map((x) => String(x));
    const wantType = rest[0] ? String(rest[0]).trim() : defaultLabel;
    const spec = POKE_TYPES[wantType];
    if (!spec) {
      return sendText(body, `没有「${wantType}」这种戳一戳。可用：${POKE_TYPE_NAMES}`, "poke");
    }
    const r = await pokeUser(body, t.id);
    if (r.error) return sendText(body, `戳一戳失败：${r.error}`, "poke");
    // 花样（type≠1）只能靠 poke 消息段表达，而消息段没有「戳谁」这个字段，
    // 所以它必然是尽力而为：action 负责「戳到指定的人」，消息段只负责「换个花样」。
    // 两条路都成功才算花样生效，任何一条失败都要在文案里说清楚，不能报成「已戳一个比心」。
    let extra = "";
    if (spec.type !== "1") {
      try {
        await sendMsg(body, [{ type: "poke", data: { type: spec.type, id: spec.id } }], "poke");
        extra = spec.svip ? "，已附带 SVIP 花样（bot 号不是 SVIP 可能发不出去）" : "，已附带花样";
      } catch (e) {
        extra = `，${wantType}花样没发出去（${e && e.message ? e.message : e}），只戳了普通的一下`;
      }
    }
    const who = t.id === String(body.self_id) ? "我自己" : `${t.id}`;
    return sendText(body, `已戳 ${who} 一下${extra}`, "poke");
  }

  return {
    // —— 戳一戳类 ——
    // QQ 的戳一戳是「通知事件 + 主动动作」两回事：
    //   被动：别人戳 bot 会收到 sub_type=poke 的通知（brain-notice.js 里回话）；
    //   主动：/戳一戳 @某人 会真的调 group_poke/friend_poke 戳回去。
    // 之前这里只发一句文案，注释还写着「不能主动发起」——那是错的，
    // NapCat 明确支持 group_poke / friend_poke / send_poke 三个动作。
    // 这几个不设 groupOnly：QQ 私聊也能戳（单人戳），去掉 groupOnly 后
    // pokeUser() 里的 friend_poke 分支才是活代码，不然那两行一直是死代码。
    // 私聊里 @不好使，直接 /戳一戳 12345678 就行（resolveTarget 认纯数字 QQ）。
    回戳: {
      fn: async (body, args) => doPokeCmd(body, args, "戳一戳"),
      cooldownSec: 5,
    },
    戳一戳: {
      fn: async (body, args) => doPokeCmd(body, args, "戳一戳"),
      cooldownSec: 5,
    },
    // 下面这几个是「花样戳一戳」的快捷写法，等价于 /戳一戳 @某人 比心
    比心: {
      fn: async (body, args) => doPokeCmd(body, args, "比心"),
      cooldownSec: 5,
    },
    点赞: {
      fn: async (body, args) => doPokeCmd(body, args, "点赞"),
      cooldownSec: 5,
    },
    拍一拍: {
      fn: async (body, args) => interactCommandsAlias(body, args, sendText, "拍一拍"),
      cooldownSec: 5,
    },
    捏一捏: {
      fn: async (body, args) => interactCommandsAlias(body, args, sendText, "捏一捏"),
      cooldownSec: 5,
    },

    // —— 群管理补充 ——
    踢禁: {
      fn: async (body, args) => {
        const { id: target, rest } = resolveTarget(body, args);
        if (!target) return sendText(body, "用法：/踢禁 @某人 [时长]  —— 踢出并禁止再进，例如 /踢禁 @某人 7天", "kickban");
        const durText = rest.join(" ").trim();
        const dur = /[\d.]/.test(durText) ? parseDurationSec(durText) : 30 * 86400;
        try {
          await gateway.call("set_group_ban", { group_id: body.group_id, user_id: Number(target), duration: dur });
          await gateway.call("set_group_kick", { group_id: body.group_id, user_id: Number(target) });
          return sendText(body, `已把 ${target} 踢出群聊，并禁止 ${fmtDuration(dur)} 内重新加入。`, "kickban");
        } catch (err) {
          return sendText(body, `操作失败：${err.message}（需 bot 是该群管理员）`, "kickban");
        }
      },
      adminOnly: true,
      groupOnly: true,
    },
    查名片: {
      fn: async (body, args) => {
        if (body.message_type !== "group") return sendText(body, "/查名片 只能在群里用。", "getcard");
        const { id: target } = resolveTarget(body, args);
        const uid = Number(target || body.user_id);
        try {
          const info = await gateway.call("get_group_member_info", { group_id: body.group_id, user_id: uid });
          const role = { owner: "群主", admin: "管理员", member: "成员" }[info.role] || info.role || "成员";
          const card = info.card || "（没设群名片）";
          const nick = info.nickname || "";
          const when = info.join_time ? new Date(info.join_time * 1000).toISOString().slice(0, 10) : "未知";
          const last = info.last_sent_time ? new Date(info.last_sent_time * 1000).toISOString().slice(0, 16).replace("T", " ") : "未知";
          return sendText(
            body,
            [
              `👤 ${nick}（${uid}）`,
              `身份：${role}`,
              `群名片：${card}`,
              `入群时间：${when}`,
              `最后发言：${last}`,
            ].join("\n"),
            "getcard",
          );
        } catch (err) {
          return sendText(body, `查询失败：${err.message}`, "getcard");
        }
      },
      groupOnly: true,
    },
    群档案: {
      fn: async (body) => {
        if (body.message_type !== "group") return sendText(body, "/群档案 只能在群里用。", "groupinfo");
        try {
          const info = await gateway.call("get_group_info", { group_id: body.group_id });
          return sendText(
            body,
            [
              `🏠 ${info.group_name || "（无名群）"}（${body.group_id}）`,
              `成员：${info.member_count ?? "?"} 人`,
              `上限：${info.max_member_count ?? "?"} 人`,
              `创建于：${info.group_create_time ? new Date(info.group_create_time * 1000).toISOString().slice(0, 10) : "未知"}`,
            ].join("\n"),
            "groupinfo",
          );
        } catch (err) {
          return sendText(body, `查询失败：${err.message}`, "groupinfo");
        }
      },
      groupOnly: true,
    },
  };
}

function interactCommandsAlias(body, args, sendText, label) {
  if (body.message_type !== "group") return sendText(body, `/${label} 只能在群里用。`, "poke");
  const t = resolveTarget(body, args);
  if (!t.id) return sendText(body, `用法：/${label} @某人`, "poke");
  const lines = {
    戳一戳: [`👆 戳了 ${t.id} 一下～`, `👉 已戳 ${t.id}`, `😆 ${t.id} 被我戳啦！`],
    拍一拍: [`👏 拍了拍 ${t.id} 的肩膀`, `🫶 拍了拍 ${t.id}`, `💓 拍了拍 ${t.id}，夸了夸 TA`],
    捏一捏: [`🫳 捏了捏 ${t.id} 的脸`, `😆 捏了捏 ${t.id}，软软的`, `🤏 又捏了捏 ${t.id}`],
  };
  const pool = lines[label] || lines["戳一戳"];
  return sendText(body, pool[Math.floor(Math.random() * pool.length)], "poke");
}
