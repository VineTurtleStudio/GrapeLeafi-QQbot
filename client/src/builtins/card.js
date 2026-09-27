// builtins/card.js —— 光玉抽卡/兑换/分解/图鉴内置指令。
// 只依赖注入的 { cards, checkins, sendText, sendMsg, textSeg }；不 import brain；可 node --check 自证。

import { MAX_PULL, RARES, buildPullImage, buildCardWallImage, buildCardViewImage } from "../cards.js";

const RANK = ["N", "R", "SR", "SSR"];

function atTarget(body) {
  const at = (body.message || []).find((s) => s.type === "at" && s.data && s.data.qq && !["all", "0"].includes(String(s.data.qq)));
  return at ? String(at.data.qq) : String(body.user_id);
}

function resolvePackIdOpt(args, cards) {
  const w = (args && args[0]) ? String(args[0]) : "";
  if (!w) return { packId: null };
  const r = cards.resolvePool(w);
  if (r && r.packId) return { packId: r.packId };
  const pk = cards.packOfAlias(w);
  if (pk) return { packId: pk.packId };
  return { err: `找不到作品或卡包「${w}」` };
}

function resolveCardRef(args, cards) {
  const words = (args || []).map(String);
  const a = words[0] || "";
  const b = words[1] || "";
  let packId = null;
  let num = "";
  if (/^\d+$/.test(a) && !b) {
    const ids = cards.packIdList();
    if (ids.length === 1) {
      packId = ids[0];
      num = a;
    } else {
      return { err: "有多个卡包，请指定作品" };
    }
  } else if (/^\d+$/.test(b)) {
    const r = cards.resolvePool(a);
    if (r && r.packId) {
      packId = r.packId;
    } else {
      const pk = cards.packOfAlias(a);
      if (pk) packId = pk.packId;
    }
    if (!packId) return { err: `找不到作品或卡包「${a}」` };
    num = b;
  } else {
    return { err: "编号需为数字" };
  }
  let info = cards.cardLookup(packId, num);
  if (!info && num.length === 1) info = cards.cardLookup(packId, num.padStart(3, "0"));
  if (!info && num.length === 2) info = cards.cardLookup(packId, num.padStart(3, "0"));
  if (!info) {
    const z = String(Number(num));
    if (z !== num) info = cards.cardLookup(packId, z);
  }
  return info ? { packId, num: info.id, info } : { err: `卡包中没有编号「${num}」的卡` };
}

function raritySummary(cards) {
  const cnt = {};
  for (const c of cards) cnt[c.rarity] = (cnt[c.rarity] || 0) + 1;
  return RARES.map((r) => (cnt[r] ? `${r}×${cnt[r]}` : "")).filter(Boolean).join("、") || "无";
}

async function sendResult(body, cards, title, sendText, sendMsg, textSeg) {
  const top = cards.slice().sort((a, b) => RANK.indexOf(b.rarity) - RANK.indexOf(a.rarity));
  const best = top[0];
  const lines = [
    `${title}`,
    `▸ ${raritySummary(cards)}`,
    `▸ 最高 ${best.rarity}：${best.charName}「${best.id}」`,
  ];
  const cardSegs = [textSeg(lines.join("\n"))];
  const img = await buildPullImage({ cards, title });
  if (img) {
    cardSegs.push({ type: "image", data: { file: img.dataUrl } });
  } else {
    for (const c of cards) {
      cardSegs.push(textSeg(`  ${c.rarity} ${c.charName}「${c.id}」`));
    }
  }
  return sendMsg(body, cardSegs, "cards");
}

async function doPull(body, n, alias, { cards, checkins, sendText, sendMsg, textSeg }) {
  if (!alias) {
    return sendText(body, "用法：/抽卡 <池> [数量]\n作品池：ab\n角色池：奏、由理、音无 …\n例：/抽卡 ab、/抽卡 奏 10\n光玉不足可用 /兑换 用积分兑换。", "cards");
  }
  n = Math.max(1, Math.min(MAX_PULL, n));
  const pool = cards.resolvePool(alias);
  if (!pool) return sendText(body, `找不到卡池「${alias}」，/卡池 查看可用池。`, "cards");
  const { name: cur, price } = cards.priceOfName(pool);
  const cost = n * price;
  const spend = cards.spendStones(body.user_id, cost);
  if (!spend.ok) {
    return sendText(body, `${cur}不足！本抽需 ${cost} ${cur}，还差 ${spend.short}（当前 ${spend.stones}）。可用 /兑换 用积分换${cur}，或 /分解 多余卡牌获得，记得 /签到 赚积分~`, "cards");
  }
  const res = cards.pull(body.user_id, pool, n);
  if (!res.ok) return sendText(body, "卡池暂无可抽的卡（请先配置卡牌信息/素材）。", "cards");
  const title = `${pool.display} · ${n === 1 ? "单抽" : `${n}连抽`}`;
  await sendResult(body, res.cards, title, sendText, sendMsg, textSeg);
  return sendText(body, `已消耗 ${cost} ${cur}，剩余 ${spend.stones} ${cur}。`, "cards");
}

export function cardCommands({ cards, checkins, sendText, sendMsg, textSeg }) {
  const inject = { cards, checkins, sendText, sendMsg, textSeg };
  return {
    抽卡: {
      fn: async (body, args) => {
        if (!args || !args.length) {
          return sendText(body, "用法：/抽卡 <池> [数量]\n作品池：ab\n角色池：奏、由理、音无 …\n例：/抽卡 ab、/抽卡 奏 10\n光玉不足可用 /兑换 用积分兑换。", "cards");
        }
        let n = 1;
        let alias = args[0];
        if (/^\d+$/.test(String(args[0]))) {
          n = Number(args[0]);
          alias = args[1];
        } else if (args[1] && /^\d+$/.test(String(args[1]))) {
          n = Number(args[1]);
        }
        return doPull(body, n, alias, inject);
      },
    },
    十连: {
      fn: async (body, args) => doPull(body, 10, args && args[0], inject),
    },
    兑换: {
      fn: async (body, args) => {
        const req = args && args[0];
        if (!req || !/^\d+$/.test(String(req))) {
          return sendText(body, `用法：/兑换 <数量> 把签到积分换成光玉（1 积分 = ${cards.exchangeRate()} 光玉）。`, "cards");
        }
        const n = Math.max(0, Number(req));
        if (!n) return sendText(body, "兑换数量要大于 0 哦。", "cards");
        const spend = checkins.spend(body.user_id, n);
        if (!spend.ok) {
          return sendText(body, `积分不足！需要 ${n} 积分，还差 ${spend.short}（当前 ${spend.points}）。`, "cards");
        }
        const gained = n * cards.exchangeRate();
        const g = cards.grantStones(body.user_id, gained);
        return sendText(body, `💠 兑换成功：-${n} 积分 → +${gained} 光玉（当前 ${g.stones} 光玉，${spend.points} 积分）。`, "cards");
      },
    },
    分解: {
      fn: async (body, args) => {
        const target = args && args[0];
        const decay = cards.decayOf();
        const hint = `用法：/分解 <卡号|全部> 把重复卡牌变成光玉（${RARES.map((r) => `${r}→${decay[r]}光玉`).join("，")}）。`;
        if (!target) return sendText(body, hint, "cards");
        if (String(target) === "全部") {
          const col = cards.collectionOf(body.user_id);
          const done = [];
          for (const e of col.entries) {
            if (e.count > 1) {
              const r = cards.decompose(body.user_id, e.id);
              if (r.ok) done.push(`${e.id}${e.rarity}+${r.gained}`);
            }
          }
          if (!done.length) return sendText(body, `没有可分解的重复卡，先 /抽卡 抽到重复的吧～（${hint}）`, "cards");
          const after = cards.stonesOf(body.user_id);
          return sendText(body, `♻️ 已分解全部重复卡：${done.join("，")}\n当前 ${after} 光玉。`, "cards");
        }
        const r = cards.decompose(body.user_id, String(target));
        if (!r.ok) {
          const reason = r.reason === "no-dupe" ? `${target} 没有重复卡（副本 ${r.count}）` : "卡牌不存在";
          return sendText(body, `分解失败：${reason}。${hint}`, "cards");
        }
        return sendText(body, `♻️ 分解 ${target}（${r.rarity}）+${r.gained} 光玉，剩余 ${r.left} 张，当前 ${r.stones} 光玉。`, "cards");
      },
    },
    光玉: {
      fn: async (body) => {
        const stones = cards.stonesOf(body.user_id);
        const prof = checkins.profile(body.user_id);
        return sendText(body, `💠 光玉 ${stones}\n🧾 积分 ${prof.points}（/兑换 <n> 可换成光玉${cards.exchangeRate() > 1 ? `×${cards.exchangeRate()}` : ""}）`, "cards");
      },
    },
    卡池: {
      fn: async (body, args) => {
        const alias = Array.isArray(args) ? args[0] : undefined;
        if (alias) {
          const pool = cards.resolvePool(alias);
          if (!pool) return sendText(body, `找不到卡池「${alias}」。`, "cards");
          const info = cards.poolInfo(pool);
          const { name: cur, price } = cards.priceOfName(pool);
          const parts = [`🃏 卡池「${pool.display}」`];
          parts.push(`卡牌 ${info.total} 张：${RARES.map((r) => `${r}×${info.byRarity[r] || 0}`).join(" ")}`);
          parts.push(`单抽 ${price} ${cur} / 十连 ${price * 10} ${cur}`);
          return sendText(body, parts.join("\n"), "cards");
        }
        const lines = ["🃏 可用卡池（作品）："];
        for (const w of cards.workList()) {
          const info = cards.poolInfo({ type: "work", key: w.key, packId: w.packId });
          const cur = cards.priceOfName({ type: "work", key: w.key, packId: w.packId });
          lines.push(`${w.name}（${w.key}）：${info.total} 张，单抽 ${cur.price} ${cur.name}`);
        }
        lines.push("🃏 角色池（/抽卡 <角色名>）：");
        for (const c of cards.charList()) {
          const info = cards.poolInfo({ type: "char", key: c.key, packId: c.packId });
          lines.push(`${c.name}：${info.total} 张`);
        }
        return sendText(body, lines.join("\n"), "cards");
      },
    },
    保底: {
      fn: async (body) => {
        const st = cards.pityStatus(body.user_id);
        const lines = ["🎯 当前保底进度："];
        if (!Object.keys(st).length) lines.push("还没有在任何池抽过卡。");
        for (const v of Object.values(st)) {
          const ssrLeft = v.ssrPity - v.ssr;
          const srLeft = Math.max(0, v.srPity - v.sr);
          lines.push(`${v.display}：SSR 已抽 ${v.ssr}/${v.ssrPity}（再 ${ssrLeft} 抽必出），SR+ 已 ${v.sr}/${v.srPity}（再 ${srLeft} 抽必出）`);
        }
        return sendText(body, lines.join("\n"), "cards");
      },
    },
    图鉴: {
      fn: async (body, args) => {
        const col = cards.collectionOf(body.user_id);
        if (!col.distinct) return sendText(body, "📖 还没有抽到任何卡，先 /抽卡 抽一张吧～", "cards");
        const PER = 20;
        const pages = Math.max(1, Math.ceil(col.entries.length / PER));
        let page = 1;
        if (args && args.length && /^\d+$/.test(String(args[0]))) {
          page = Math.max(1, Math.min(pages, Number(args[0])));
        }
        const slice = col.entries.slice((page - 1) * PER, page * PER);
        const img = await buildCardWallImage({
          items: slice,
          title: "📖 我的图鉴",
          page,
          pages,
          resolveImage: (it) => cards.packAsset(it.packId, "icon", it.id),
        });
        const parts = [textSeg(`📖 我的收藏：${col.distinct} 种（重复 ${col.total - col.distinct} 张）/ 全部 ${cards.totalCards()} 张\n稀有度：${RARES.map((r) => `${r}×${col.byRarity[r] || 0}`).join(" ")}`)];
        if (img) parts.push({ type: "image", data: { file: img.dataUrl } });
        return sendMsg(body, parts, "cards");
      },
    },
    查卡: {
      fn: async (body, args) => {
        const a = args && args[0] ? String(args[0]) : "";
        const b = args && args[1] ? String(args[1]) : "";
        const c3 = args && args[2] ? String(args[2]) : "";
        const usage = "用法：/查卡 <作品> <编号> [详情]\n作品：ab（或作品名/别名）\n例：/查卡 ab 001（卡面原图）、/查卡 ab 001 详情（详情大图）、/查卡 ab 001 小图（结算小图）";
        if (!a) return sendText(body, usage, "cards");
        let packId = null;
        let num = "";
        let kindArg = "";
        if (/^\d+$/.test(b)) {
          const r = cards.resolvePool(a);
          if (r && r.packId) { packId = r.packId; } else {
            const pk = cards.packOfAlias(a);
            if (pk) packId = pk.packId;
          }
          num = b;
          kindArg = c3;
        } else if (/^\d+$/.test(a) && !b) {
          const ids = cards.packIdList();
          if (ids.length === 1) {
            packId = ids[0];
            num = a;
          } else {
            return sendText(body, "有多个卡包，请指定作品：/查卡 <作品> <编号>", "cards");
          }
        } else {
          return sendText(body, usage, "cards");
        }
        if (!packId) return sendText(body, `找不到作品或卡包「${a}」，/卡池 查看可用池。`, "cards");
        const kw = kindArg.toLowerCase();
        const kind = /详情|detail/.test(kw) ? "detail" : /小图|icon/.test(kw) ? "icon" : "card";
        let info = cards.cardLookup(packId, num);
        if (!info && num.length === 1) info = cards.cardLookup(packId, num.padStart(3, "0"));
        if (!info && num.length === 2) info = cards.cardLookup(packId, num.padStart(3, "0"));
        if (!info) {
          const z = String(Number(num));
          if (z !== num) info = cards.cardLookup(packId, z);
        }
        if (!info) return sendText(body, `卡包中没有编号「${num}」的卡，/图鉴 看自己抽到的卡。`, "cards");
        const kindText = { detail: "详情大图", card: "卡面原图", icon: "结算小图" }[kind];
        const fp = cards.packAsset(packId, kind, info.id);
        const cap = `${info.pack.name} · #${info.id} ｜ ${info.rarity} ｜ ${info.char ? info.char.name : info.character || "未分配"}${info.work ? ` ｜ ${info.work.name}` : ""}`;
        const img = await buildCardViewImage({ file: fp, kindText, title: `${info.pack.name} · #${info.id}`, caption: cap });
        if (!img) return sendText(body, cap, "cards");
        const parts = [textSeg(`${cap}\n（缩略图墙用 /图鉴，任意卡用 /查卡 ${info.pack.id} ${info.id}）`)];
        parts.push({ type: "image", data: { file: img.dataUrl } });
        return sendMsg(body, parts, "cards");
      },
    },
    发放: {
      ownerOnly: true,
      fn: async (body, args) => {
        const words = (args || []).map(String);
        const usage = "用法：/发放 <积分|光玉> 数量 [@某人]\n例：/发放 积分 100 @葡萄、/发放 光玉 500 @葡萄\n负数可扣回：/发放 光玉 -50 @某人";
        if (!words.length) return sendText(body, usage, "grant");
        let kind = null;
        for (const w of words) {
          if (/积分|points/.test(w)) { kind = "points"; break; }
          if (/光玉|石头|stones/.test(w)) { kind = "stones"; break; }
        }
        if (!kind) return sendText(body, `先告诉我发什么：${usage}`, "grant");
        let amount = 0;
        for (const w of words) {
          if (/^-?\d+$/.test(w)) { amount = Number(w); break; }
        }
        if (!amount) return sendText(body, `数量需为数字：${usage}`, "grant");
        const target = atTarget(body);
        if (kind === "points") {
          if (amount > 0) {
            const r = checkins.grant(target, amount);
            return sendText(body, `✅ 已给 ${target} 发放 ${amount} 积分（当前 ${r.points} 积分，${r.level} 级）。`, "grant");
          }
          const r = checkins.spend(target, -amount);
          if (!r.ok) return sendText(body, `操作失败：${target} 积分不足（当前 ${r.points}）。`, "grant");
          return sendText(body, `✅ 已从 ${target} 扣除 ${-amount} 积分（当前 ${r.points} 积分）。`, "grant");
        }
        if (amount > 0) {
          const r = cards.grantStones(target, amount);
          return sendText(body, `✅ 已给 ${target} 发放 ${amount} 光玉（当前 ${r.stones} 光玉）。`, "grant");
        }
        const r = cards.spendStones(target, -amount);
        if (!r.ok) return sendText(body, `操作失败：${target} 光玉不足（当前 ${r.stones}）。`, "grant");
        return sendText(body, `✅ 已从 ${target} 扣除 ${-amount} 光玉（当前 ${r.stones} 光玉）。`, "grant");
      },
    },
    发卡: {
      ownerOnly: true,
      fn: async (body, args) => {
        const usage = "用法：/发卡 [作品] 编号 [@某人]\n例：/发卡 ab 001 @葡萄、/发卡 001（单卡包时可省略作品）";
        const parsed = resolveCardRef(args, cards);
        if (!parsed || parsed.err) return sendText(body, `${parsed ? parsed.err : "参数错误"}：${usage}`, "grant");
        const target = atTarget(body);
        const g = cards.giveCard(target, parsed.packId, parsed.num);
        const name = parsed.info.char ? parsed.info.char.name : parsed.info.character || "未分配";
        const wname = parsed.info.work ? ` ｜ ${parsed.info.work.name}` : "";
        return sendText(body, `🎴 已给 ${target} 发卡：${parsed.info.pack.name} #${parsed.info.id} ${parsed.info.rarity} ${name}${wname}（现有 ${g.count} 张）。`, "grant");
      },
    },
    删卡: {
      ownerOnly: true,
      fn: async (body, args) => {
        const usage = "用法：/删卡 [作品] 编号 [@某人]\n例：/删卡 ab 001 @葡萄、/删卡 001（单卡包时可省略作品）";
        const parsed = resolveCardRef(args, cards);
        if (!parsed || parsed.err) return sendText(body, `${parsed ? parsed.err : "参数错误"}：${usage}`, "grant");
        const target = atTarget(body);
        const r = cards.removeCard(target, parsed.packId, parsed.num);
        const name = parsed.info.char ? parsed.info.char.name : parsed.info.character || "未分配";
        const wname = parsed.info.work ? ` ｜ ${parsed.info.work.name}` : "";
        if (!r.ok) return sendText(body, `❌ ${target} 还没有这张卡：${parsed.info.pack.name} #${parsed.info.id}(${name})。`, "grant");
        return sendText(body, `🗑️ 已删除 ${target} 的卡：${parsed.info.pack.name} #${parsed.info.id} ${parsed.info.rarity} ${name}${wname}（剩余 ${r.remain} 张）。`, "grant");
      },
    },
    发全部: {
      ownerOnly: true,
      fn: async (body, args) => {
        const usage = "用法：/发全部 [作品] [@某人]\n例：/发全部 @葡萄（发全卡库每张1张）、/发全部 ab @葡萄（只发 Angel Beats!）";
        const pk = resolvePackIdOpt(args, cards);
        if (pk.err) return sendText(body, `${pk.err}：${usage}`, "grant");
        const target = atTarget(body);
        const r = cards.grantAllCards(target, pk.packId);
        const scope = pk.packId ? `卡包「${pk.packId}」` : "全部卡包";
        return sendText(body, `🎴 已给 ${target} 发放 ${scope}内 ${r.granted} 张卡（${r.packs.join("、")}）。`, "grant");
      },
    },
    删全部: {
      ownerOnly: true,
      fn: async (body, args) => {
        const usage = "用法：/删全部 [作品] [@某人]\n例：/删全部 @葡萄（清空全部收藏）、/删全部 ab @葡萄（只清空 Angel Beats!）";
        const pk = resolvePackIdOpt(args, cards);
        if (pk.err) return sendText(body, `${pk.err}：${usage}`, "grant");
        const target = atTarget(body);
        const r = cards.clearCollection(target, pk.packId);
        const scopeTxt = pk.packId ? `卡包「${pk.packId}」` : "全部收藏";
        if (!r.removed) return sendText(body, `🗑️ ${target} 在${scopeTxt}里还没有收藏卡。`, "grant");
        return sendText(body, `🗑️ 已清空 ${target} 的${scopeTxt}：共删除 ${r.removed} 张。`, "grant");
      },
    },
  };
}