// builtins/fun.js —— 趣味/文字类内置指令（重构样板：按类型独立存放）。
// 只 import 纯文本生成器 funpacks.js；发文本经注入的 sendText(body, text, tag)。
// 不 import brain、不 import gacha；保持零副作用、可 node --check 自证。
// 每个键的 fn(body, args) 复刻原 brain 内联壳的渲染与参数语义，仅输出 tag 统一为 "fun"。
import {
  yiyan, poem, trivia, pickup, poison, praise, simpc, persona,
  tarotDraw, luckReport, kfc, dailyNum,
} from "../funpacks.js";

export function funCommands({ sendText }) {
  const send = (body, text) => sendText(body, text, "fun");
  const gen = (fn) => ({ fn: async (body) => send(body, String(fn())) });
  const tpl = (render) => ({ fn: async (body, args) => send(body, render(body, args)) });

  function targetName(body, args) {
    const at = (body.message || []).find((s) => s.type === "at" && s.data && s.data.qq && !["all", "0"].includes(String(s.data.qq)));
    if (at) return `@${at.data.qq} `;
    const id = args && args[0] && /^\d{5,}$/.test(args[0]) ? args[0] : null;
    if (id) return `@${id} `;
    return "你";
  }

  function drawTarot(n) {
    return `🔮 抽了 ${n} 张塔罗牌：\n${tarotDraw(n).join("\n")}`;
  }

  return {
    一言: tpl(() => `「${yiyan()}」`),
    诗词: gen(poem),
    冷知识: tpl(() => `🧠 冷知识：${trivia()}`),
    土味情话: tpl((body, args) => pickup(targetName(body, args))),
    毒鸡汤: tpl(() => `🍃 毒鸡汤：${poison()}`),
    彩虹屁: tpl((body, args) => praise(targetName(body, args))),
    舔狗日记: tpl((body, args) => simpc(targetName(body, args))),
    今日人设: tpl(() => `🎭 今日人设：你是一只${persona()}。`),
    塔罗: tpl((body, args) => {
      const n = Math.min(3, Math.max(1, parseInt((args && args[0]) || "3", 10) || 3));
      return drawTarot(n);
    }),
    今日人品: tpl((body) => luckReport(dailyNum(body.user_id, "luck"))),
    疯狂星期四: gen(kfc),
  };
}