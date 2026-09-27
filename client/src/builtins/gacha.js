// builtins/gacha.js —— 小游戏/占卜类内置指令（运势/抽签/钓鱼/鱼塘/卖鱼）。
// 只依赖注入的 sendText/sendMsg/textSeg/games/content；纯壳复刻原 brain 内联行为。
import { scanLotteryImages, imageSegFromFile } from "../games.js";

export function gachaCommands({ sendText, sendMsg, textSeg, games, content }) {
  return {
    运势: {
      fn: async (body) => {
        const r = games.fortune(body.user_id);
        return sendText(body, `🔮 今日运势：${r.text}${r.today ? "" : " (本日首次抽取)"}`, "fortune");
      },
    },
    抽签: {
      fn: async (body) => {
        const cd = games.lotteryCooldown(body.user_id);
        if (cd > 0) return sendText(body, `签筒还在摇晃，等 ${cd} 秒再抽吧~`, "lottery");
        const images = scanLotteryImages(content.lottery.dir);
        if (!images.length) {
          games.markLottery(body.user_id);
          return sendText(body, "没有找到签文图片，请在控制台里配置抽签图片目录。", "lottery");
        }
        const pick = images[Math.floor(Math.random() * images.length)];
        const level = pick.level ? `「${pick.level}」` : "";
        const segs = [textSeg(`🔮 你抽到一支签${level}\n`), await imageSegFromFile(pick.file)];
        games.markLottery(body.user_id);
        return sendMsg(body, segs, "lottery");
      },
    },
    钓鱼: {
      fn: async (body) => {
        const r = games.fish(body.user_id);
        return sendText(body, r.text, "fish");
      },
    },
    鱼塘: {
      fn: async (body) => {
        return sendText(body, games.fishpond(body.user_id), "fishpond");
      },
    },
    卖鱼: {
      fn: async (body) => {
        return sendText(body, games.sell(body.user_id), "sell");
      },
    },
  };
}