// builtins/game.js —— 小游戏/互动类内置指令（重构样板：按类型独立存放）。
// 依赖注入 { sendText, sendMsg, gateway, dataDir, cmdCooldown, isAdmin, isGroupPrivileged }；
// 只 import 纯存储模块 merit.js；不 import brain、不 import gacha；可 node --check 自证。
import { addMerit, meritTop } from "../merit.js";

const guessNumbers = new Map();

export function gameCommands({ sendText, sendMsg, gateway, dataDir, cmdCooldown, isAdmin, isGroupPrivileged }) {
  return {
    猜数字: {
      fn: async (body, args) => {
        const key = body.message_type === "group" ? `g:${body.group_id}` : `p:${body.user_id}`;
        const cmd = String(args && args[0] || "").toLowerCase();
        if (cmd === "不猜了" || cmd === "quit" || cmd === "停") {
          guessNumbers.delete(key);
          return sendText(body, "好啦，这局认输，下次再来~", "guess");
        }
        if (!guessNumbers.has(key)) {
          guessNumbers.set(key, { target: 1 + Math.floor(Math.random() * 100), tries: 0 });
          return sendText(body, `🎯 猜数字开始！我在 1~100 之间想了一个数，发送「猜 N」来猜，/猜 不猜了 可中途退出。`, "guess");
        }
        const st = guessNumbers.get(key);
        const n = parseInt(cmd, 10);
        if (!Number.isFinite(n) || n < 1 || n > 100) return sendText(body, "请输入 1~100 之间的数字，比如「猜 50」。", "guess");
        st.tries++;
        if (n === st.target) {
          guessNumbers.delete(key);
          return sendText(body, `🎉 猜对啦！答案就是 ${st.target}，用了 ${st.tries} 次，聪明！`, "guess");
        }
        return sendText(body, n < st.target ? `小了~ 再往大猜（已猜 ${st.tries} 次）` : `大了~ 再往大猜（已猜 ${st.tries} 次）`, "guess");
      },
    },
    敲木鱼: {
      fn: async (body) => {
        const crit = Math.random() < 0.15;
        const n = crit ? 8 : 1;
        const u = addMerit(dataDir, body.user_id, n);
        return sendText(body, `🪵 咚！敲了一下木鱼${crit ? "，触发暴击：" : "，"}功德 +${n}（累计 ${u.n}）。`, "merit");
      },
    },
    功德榜: {
      fn: async (body) => {
        const top = meritTop(dataDir, 10);
        if (!top.length) return sendText(body, "还没有人敲过木鱼，快发 /敲木鱼 开张吧～", "merit");
        const lines = top.map((x, i) => `${i + 1}. 「${x.uid}」功德 ${x.n}`);
        return sendText(body, `🪷 功德排行榜 Top10：\n${lines.join("\n")}`, "merit");
      },
    },
    抽群友: {
      fn: async (body) => {
        if (body.message_type !== "group") return sendText(body, "抽群友只能在群里玩哦～", "pick");
        try {
          const r = await gateway.call("get_group_member_list", { group_id: body.group_id });
          const list = Array.isArray(r) ? r : Array.isArray(r && r.list) ? r.list : Array.isArray(r && r.data) ? r.data : [];
          if (!list.length) return sendText(body, "暂时拉不到群成员列表，晚点再抽~", "pick");
          const lucky = list[Math.floor(Math.random() * list.length)];
          const name = String(lucky.card || lucky.nickname || lucky.user_id);
          const ats = [{ type: "at", data: { qq: String(lucky.user_id) } }];
          return sendMsg(body, [...ats, { type: "text", data: { text: ` 幸运观众抽到：${name}！举手来领奖～` } }], "pick");
        } catch (err) {
          return sendText(body, `抽不了啦：${err.message}`, "pick");
        }
      },
    },
    轮盘: {
      fn: async (body) => {
        if (body.message_type !== "group") return sendText(body, "轮盘是群内游戏哦～", "roulette");
        const cd = cmdCooldown("roulette:" + body.group_id, "roulette", 3600);
        if (cd > 0) return sendText(body, `弹巢还在冷却，等 ${Math.ceil(cd / 60)} 分钟再来~`, "roulette");
        const fire = Math.random() < 1 / 6;
        if (!fire) return sendText(body, "咔嗒……空膛。你活着撑过了这一发（每小时可玩一次）。", "roulette");
        const victim = Number(body.user_id);
        const victimIsPriv = isAdmin(victim) || (await isGroupPrivileged(body));
        if (!victimIsPriv) {
          try {
            await gateway.call("set_group_ban", { group_id: body.group_id, user_id: victim, duration: 300 });
            return sendText(body, "BOOM——！！这一发打中了，送你 5 分钟安静时间好好反思～", "roulette");
          } catch (err) {
            return sendText(body, `BOOM！！中枪了！但我权限不够执行禁言（${err.message}），这次放过你。`, "roulette");
          }
        }
        return sendText(body, "哎呀，敢朝管理员开枪？这一次只当玩笑，下次可就不客气了。", "roulette");
      },
    },
  };
}