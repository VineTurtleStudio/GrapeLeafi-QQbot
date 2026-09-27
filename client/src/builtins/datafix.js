// builtins/datafix.js —— 主人专用的数据修复/存档维护指令。
//
// 设计要点：
//   1. 全部 ownerOnly，普通用户连「用法提示」都看不到（brain.js:881 的门禁在 fn 之前）。
//   2. 改数据一律走注入进来的实例方法（checkins/cards/games），不直接读写 json 文件。
//      因为 CheckIns/CardGame/Games 都把状态缓存在内存里，直接改文件会被下一次
//      实例保存整个覆盖回去——那样「改成功了但重启就没了」比改不了更坑。
//   3. 每个操作都先 backupNow() 落一个恢复点再动手。群聊里手滑打错数字是常事。
//   4. 设值类指令一律「绝对值」(/设积分 100)，与已有的 /发放（相对加减）区分开。

import { resolveTarget } from "./common.js";
import { backupNow, listBackups } from "../storage.js";
import { join } from "node:path";
import { setMerit, removeMerit, meritOf, loadMerit } from "../merit.js";

/** @某人 优先，没 @ 就落在自己身上 */
function atTarget(body) {
  const at = (body.message || []).find((s) => s.type === "at" && s.data && s.data.qq && !["all", "0"].includes(String(s.data.qq)));
  return at ? String(at.data.qq) : String(body.user_id);
}

/** 需要 @某人 时强制要求，避免「漏了 @ 把主人自己数据改了」这类误操作 */
function needTarget(body, sendText, tag) {
  const { id } = resolveTarget(body, []);
  if (id) return { id };
  return { err: `这条必须 @ 某人，不能作用于自己（防止手滑）。用法：/@昵称 你的指令。`, tag };
}

/** 从参数里取出第一个整数，支持负数 */
function intArg(args, re = /^-?\d+$/) {
  for (const w of (args || []).map(String)) {
    if (re.test(w)) return Number(w);
  }
  return null;
}

function fmtInt(n) {
  return String(Math.trunc(Number(n) || 0));
}

export function datafixCommands({ sendText, dataDir, checkins, cards, games, permStore, savePerms, grantedOf }) {
  const p = {
    checkins: join(dataDir, "checkins.json"),
    cardgame: join(dataDir, "cardgame.json"),
    games: join(dataDir, "games.json"),
    merit: join(dataDir, "merit.json"),
    permissions: join(dataDir, "permissions.json"),
  };

  /** 动手前先落恢复点，并把结果一并返回用于回执 */
  const guard = (key) => backupNow(p[key]);

  return {
    // ===== 绝对值设定 =====
    设积分: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setpoints");
        if (t.err) return sendText(body, t.err, t.tag);
        const n = intArg(args);
        if (n === null) return sendText(body, "用法：/设积分 <数量> @某人\n把余额积分直接定为该值（不改等级）。", "setpoints");
        const b = guard("checkins");
        const r = checkins.setPoints(t.id, n);
        return sendText(body, `✅ 已将 ${t.id} 的余额积分定为 ${fmtInt(r.after.points)}（原 ${fmtInt(r.before.points)}）。等级仍按累计 ${fmtInt(r.after.earned)} 计算，为 ${r.after.level} 级。${b ? "\n📦 已备份 checkins.json" : ""}`, "setpoints");
      },
    },

    设光玉: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setstones");
        if (t.err) return sendText(body, t.err, t.tag);
        const n = intArg(args);
        if (n === null) return sendText(body, "用法：/设光玉 <数量> @某人\n把光玉直接定为该值。", "setstones");
        const b = guard("cardgame");
        const r = cards.setStones(t.id, n);
        return sendText(body, `✅ 已将 ${t.id} 的光玉定为 ${fmtInt(r.after)}（原 ${fmtInt(r.before)}）。${b ? "\n📦 已备份 cardgame.json" : ""}`, "setstones");
      },
    },

    设等级: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setlevel");
        if (t.err) return sendText(body, t.err, t.tag);
        const n = intArg(args);
        if (n === null) return sendText(body, "用法：/设等级 <累计积分> @某人\n直接改累计积分 earned 来修等级。\n提示：不是填等级数字，而是填累计积分——1 级=0，2 级=100，3 级=300，4 级=600。", "setlevel");
        const b = guard("checkins");
        const r = checkins.setEarned(t.id, n);
        const extra = r.clamped ? `\n⚠️ 你给的值低于其余额积分 ${fmtInt(r.after.points)}，已自动抬到余额值——否则消费掉余额后等级会显示偏低。` : "";
        return sendText(body, `✅ 已将 ${t.id} 的累计积分定为 ${fmtInt(r.after.earned)}（原 ${fmtInt(r.before.earned)}），现为 ${r.after.level} 级，距下一级还差 ${fmtInt(r.after.nextNeed)}。${extra}${b ? "\n📦 已备份 checkins.json" : ""}`, "setlevel");
      },
    },

    // ===== 签到进度修复 =====
    改签到: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setcheckin");
        if (t.err) return sendText(body, t.err, t.tag);
        const words = (args || []).map(String);
        const patch = {};
        // 允许只传其中任意几项，用「键=值」写清楚最不容易搞错
        for (const w of words) {
          const m = w.match(/^(连续|天数|总天数|最长|上次|日期)=(.*)$/);
          if (!m) continue;
          const [, k, v] = m;
          if (k === "连续") patch.streak = intArg([v]);
          else if (k === "最长") patch.bestStreak = intArg([v]);
          else if (k === "天数" || k === "总天数") patch.totalDays = intArg([v]);
          else if (k === "上次" || k === "日期") patch.lastCheckin = v;
        }
        if (!Object.keys(patch).length) {
          return sendText(body, "用法：/改签到 键=值 ... @某人\n键：连续=<n> 天数=<n> 最长=<n> 上次=<YYYY-M-D>\n例：/改签到 连续=3 天数=12 上次= @某人\n上次传空值表示清空（视为今天没签到，可以立刻重新签）。", "setcheckin");
        }
        if (Object.values(patch).some((v) => v === null)) {
          return sendText(body, "有值不是数字，请检查格式。日期请用 2026-9-26 这样的 YYYY-M-D。", "setcheckin");
        }
        const b = guard("checkins");
        const r = checkins.setProgress(t.id, patch);
        const a = r.after;
        return sendText(body, `✅ 已修正 ${t.id} 的签到进度：连续 ${a.streak} 天 / 累计 ${a.totalDays} 天 / 最长 ${a.bestStreak} 天 / 上次 ${a.lastCheckin || "（空，可重新签）"}。\n（原：连续 ${r.before.streak} / 累计 ${r.before.totalDays} / 最长 ${r.before.bestStreak} / 上次 ${r.before.lastCheckin || "（空）"}）${b ? "\n📦 已备份 checkins.json" : ""}`, "setcheckin");
      },
    },

    重置签到: {
      ownerOnly: true,
      fn: async (body) => {
        const t = needTarget(body, sendText, "resetcheckin");
        if (t.err) return sendText(body, t.err, t.tag);
        const b = guard("checkins");
        const r = checkins.resetUser(t.id);
        return sendText(body, `🧹 已把 ${t.id} 的签到记录清零（原：余额 ${fmtInt(r.before.points)}、累计 ${fmtInt(r.before.earned)}、连续 ${r.before.streak} 天）。对方现在可以重新签到并从 1 级重新积累。${b ? "\n📦 已备份 checkins.json" : ""}`, "resetcheckin");
      },
    },

    // ===== 保底与卡牌 =====
    设保底: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setpity");
        if (t.err) return sendText(body, t.err, t.tag);
        const words = (args || []).map(String);
        // /设保底 <池> sr=30 ssr=0 @某人   或   /设保底 <池> 清空 @某人
        const poolW = words.find((w) => !/^(sr|ssr)=/.test(w) && !/^(清空|全部)$/.test(w)) || "";
        const sr = intArg(words.filter((w) => /^sr=/i.test(w)).map((w) => w.slice(3)));
        const ssr = intArg(words.filter((w) => /^ssr=/i.test(w)).map((w) => w.slice(4)));
        const clear = words.some((w) => /^(清空|全部)$/.test(w));
        if (!poolW) {
          const keys = Object.keys((cards.state && cards.state.users && cards.state.users[t.id] && cards.state.users[t.id].pity) || {});
          const hint = keys.length ? `\n${t.id} 现有保底池：${keys.join("、")}` : "";
          return sendText(body, `用法：/设保底 <池> sr=<n> ssr=<n> @某人\n池写法形如 ab:work:ab、ab:char:kanade。传「清空」可重置该池保底。${hint}`, "setpity");
        }
        if (!clear && sr === null && ssr === null) {
          return sendText(body, "请至少指定一项：sr=<n> 或 ssr=<n>，或用「清空」重置。", "setpity");
        }
        const b = guard("cardgame");
        // 关键：没写的那一项必须「不出现」在这个对象里，而不是放 null。
        // CardGame.setPity 用 `patch.sr === undefined` 判断「省略」，
        // 传 null 会走 Number(null)||0 分支把另一项静默清成 0。
        const patch = {};
        if (sr !== null) patch.sr = sr;
        if (ssr !== null) patch.ssr = ssr;
        const r = cards.setPity(t.id, poolW, clear ? { clear: true } : patch);
        if (clear) return sendText(body, `🧹 已清空 ${t.id} 在 ${poolW} 的保底计数。${b ? "\n📦 已备份 cardgame.json" : ""}`, "setpity");
        return sendText(body, `✅ ${t.id} 的 ${poolW} 保底已设为 sr=${r.after.sr} / ssr=${r.after.ssr}（原 sr=${r.before.sr} / ssr=${r.before.ssr}）。${r.limits ? `\n该池阈值 sr=${r.limits.srPity} ssr=${r.limits.ssrPity}，设定值不会超过阈值-1，否则等于白给。` : ""}${b ? "\n📦 已备份 cardgame.json" : ""}`, "setpity");
      },
    },

    设卡数: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setcard");
        if (t.err) return sendText(body, t.err, t.tag);
        const words = (args || []).map(String);
        // 文档格式：<作品> <卡号> <数量>。卡号是 1-4 位数字（001/168/194），数量不限。
        // 确定性规则：非数字词当作品名，第一个数字当卡号，第二个数字当数量。
        const nums = words.filter((w) => /^\d+$/.test(w));
        const packWord = words.find((w) => !/^\d+$/.test(w)) || "";
        if (nums.length < 2) {
          return sendText(body, "用法：/设卡数 <作品> <卡号> <数量> @某人\n例：/设卡数 ab 194 3 @某人\n数量设 0 即删除这张卡。", "setcard");
        }
        const [cardId, countW] = nums;
        const resolved = cards.resolvePool(packWord);
        const packId = resolved?.packId || cards.packOfAlias(packWord)?.packId || null;
        if (!packId) return sendText(body, `找不到卡包「${packWord}」。单卡包时可省略作品名，或写成：/设卡数 ab ${cardId} ${countW} @某人`, "setcard");
        const info = cards.cardLookup(packId, cardId);
        if (!info) return sendText(body, `卡包里没有编号 ${cardId} 这张卡。`, "setcard");
        const b = guard("cardgame");
        const r = cards.setCardCount(t.id, packId, cardId, countW);
        const nm = info.char ? info.char.name : info.character || "";
        return sendText(body, `✅ 已将 ${t.id} 的 ${packId}#${cardId}${nm ? `（${nm}）` : ""} 设为 ${r.after} 张（原 ${r.before} 张）。${r.after === 0 ? "该卡已从收藏中移除。" : ""}${b ? "\n📦 已备份 cardgame.json" : ""}`, "setcard");
      },
    },

    // ===== 游戏与功德 =====
    设金币: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setgold");
        if (t.err) return sendText(body, t.err, t.tag);
        const n = intArg(args);
        if (n === null) return sendText(body, "用法：/设金币 <数量> @某人", "setgold");
        const b = guard("games");
        const r = games.setGold(t.id, n);
        return sendText(body, `✅ 已将 ${t.id} 的金币定为 ${fmtInt(r.after)}（原 ${fmtInt(r.before)}）。${b ? "\n📦 已备份 games.json" : ""}`, "setgold");
      },
    },

    设鱼获: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setfish");
        if (t.err) return sendText(body, t.err, t.tag);
        const words = (args || []).map(String);
        if (!words.length) {
          const names = games.fishNames();
          return sendText(body, `用法：/设鱼获 <鱼名> <数量> @某人，或 /设鱼获 清空 @某人。\n可选鱼名：${names.join("、")}`, "setfish");
        }
        const b = guard("games");
        if (/^(清空|全部)$/.test(words[0])) {
          const r = games.setFish(t.id, null, 0);
          return sendText(body, `🧹 已清空 ${t.id} 的鱼篓（原 ${r.cleared} 种）。${b ? "\n📦 已备份 games.json" : ""}`, "setfish");
        }
        const n = intArg(words);
        if (n === null) return sendText(body, "数量得是数字。", "setfish");
        const name = words.find((w) => !/^-?\d+$/.test(w));
        const valid = games.fishNames();
        if (valid.length && name && !valid.includes(name)) {
          return sendText(body, `鱼名「${name}」不在鱼池里。可选：${valid.join("、")}`, "setfish");
        }
        const r = games.setFish(t.id, name, n);
        return sendText(body, `✅ 已将 ${t.id} 的「${r.fish}」定为 ${fmtInt(r.after)} 条（原 ${fmtInt(r.before)}）。${r.after === 0 ? "已移除。" : ""}${b ? "\n📦 已备份 games.json" : ""}`, "setfish");
      },
    },

    设功德: {
      ownerOnly: true,
      fn: async (body, args) => {
        const t = needTarget(body, sendText, "setmerit");
        if (t.err) return sendText(body, t.err, t.tag);
        const n = intArg(args);
        if (n === null) return sendText(body, "用法：/设功德 <数量> @某人", "setmerit");
        const b = guard("merit");
        const r = setMerit(dataDir, t.id, n);
        return sendText(body, `✅ 已将 ${t.id} 的功德定为 ${fmtInt(r.after)}（原 ${fmtInt(r.before)}）。${b ? "\n📦 已备份 merit.json" : ""}`, "setmerit");
      },
    },

    清冷却: {
      ownerOnly: true,
      fn: async (body) => {
        const t = needTarget(body, sendText, "clearcd");
        if (t.err) return sendText(body, t.err, t.tag);
        const b = guard("games");
        games.clearCooldowns(t.id);
        return sendText(body, `⏱ 已清掉 ${t.id} 的钓鱼与抽签冷却，现在就能钓/抽。${b ? "\n📦 已备份 games.json" : ""}`, "clearcd");
      },
    },

    // ===== 存档维护 =====
    删用户: {
      ownerOnly: true,
      fn: async (body, args) => {
        const words = (args || []).map(String);
        const { id, rest } = resolveTarget(body, args);
        if (!id) return sendText(body, "用法：/删用户 <范围> @某人\n范围：积分 签到 光玉 卡牌 游戏 功德 权限 全部\n建议先 /立即备份。", "deluser");
        const scope = String(rest[0] || "全部");
        const map = { 积分: "checkins", 签到: "checkins", 光玉: "cards", 卡牌: "cards", 收藏: "cards", 游戏: "games", 鱼塘: "games", 功德: "merit", 权限: "perm" };
        const which = scope === "全部" ? "all" : map[scope];
        if (!which) return sendText(body, `不认识的范围「${scope}」。可用：积分/签到、光玉/卡牌、游戏、功德、权限、全部。`, "deluser");
        if (which === "all") {
          // 全删是不可逆的，先强制备份再动手
          const bs = ["checkins", "cardgame", "games", "merit", "permissions"].map((k) => backupNow(p[k])).filter(Boolean);
          const done = [];
          if (checkins.removeUser(id).existed) done.push("积分/签到");
          if (cards.removeUser(id).existed) done.push("光玉/卡牌");
          if (games.removeUser(id).existed) done.push("游戏");
          if (removeMerit(dataDir, id).existed) done.push("功德");
          if (Object.prototype.hasOwnProperty.call(permStore, id)) { delete permStore[id]; savePerms(); done.push("权限"); }
          return sendText(body, `🗑 已抹除 ${id} 的${done.length ? "：" + done.join("、") : "（该用户本来就没有任何数据）"}。\n📦 动手前已备份 ${bs.length} 个文件到 data/backups/。`, "deluser");
        }
        const b = guard(which === "perm" ? "permissions" : which === "cards" ? "cardgame" : which === "games" ? "games" : which === "merit" ? "merit" : "checkins");
        if (which === "perm") {
          if (!Object.prototype.hasOwnProperty.call(permStore, id)) return sendText(body, `${id} 本来就没有 bot 权限。`, "deluser");
          delete permStore[id]; savePerms();
          return sendText(body, `🗑 已撤销 ${id} 的全部 bot 权限。`, "deluser");
        }
        const r = which === "checkins" ? checkins.removeUser(id)
          : which === "cards" ? cards.removeUser(id)
          : which === "games" ? games.removeUser(id)
          : removeMerit(dataDir, id);
        return sendText(body, r.existed ? `🗑 已删除 ${id} 的「${scope}」数据。${b ? "\n📦 已备份" : ""}` : `${id} 本来就没有「${scope}」数据，无需删除。`, "deluser");
      },
    },

    立即备份: {
      ownerOnly: true,
      fn: async (body, args) => {
        // 有人会习惯性 @ 一某人，但这命令作用在「存档」上，带 @ 反而会被当成存档名。
        // 与其报「没找到叫 @xxx 的存档」，不如把 @ 段滤掉再判断。
        const words = (args || []).map(String).filter((w) => !/^@/.test(w));
        const only = words[0];
        // 中文名与文件名都认，README 里写的是中文，别让人对不上
        const alias = { 签到: "checkins", 积分: "checkins", 卡牌: "cardgame", 光玉: "cardgame", 抽卡: "cardgame", 游戏: "games", 功德: "merit", 权限: "permissions" };
        const want = only ? (alias[only] || only.replace(/\.json$/i, "")) : "";
        const keys = Object.entries(p);
        const targets = want ? keys.filter(([k]) => k === want || k.includes(want)) : keys;
        const shown = keys.map(([k]) => ({ checkins: "签到/checkins", cardgame: "卡牌/cardgame", games: "游戏/games", merit: "功德/merit", permissions: "权限/permissions" }[k] || k));
        if (!targets.length) return sendText(body, `没找到叫「${only}」的存档。这条命令作用在存档上，不用 @ 某人。可选：${shown.join("、")}`, "backup");
        const ok = [];
        const skip = [];
        for (const [k, file] of targets) {
          const r = backupNow(file);
          if (r) ok.push(`${k}→${r.name}`);
          else skip.push(k);
        }
        return sendText(body, `📦 已备份 ${ok.length} 个存档到 data/backups/：\n${ok.join("\n") || "（无）"}${skip.length ? `\n\n以下文件尚不存在，跳过：${skip.join("、")}` : ""}\n\n注意：备份限流 5 分钟，但这条指令绕过限流，每次都会立刻落一份。`, "backup");
      },
    },

    备份列表: {
      ownerOnly: true,
      fn: async (body) => {
        const lines = [];
        for (const [k, file] of Object.entries(p)) {
          const bs = listBackups(file);
          lines.push(`${k.replace(".json", "")}：${bs.length ? `${bs.length} 份，最新 ${bs[0].iso.slice(0, 19).replace("T", " ")}` : "暂无备份"}`);
        }
        return sendText(body, `🗂 存档备份情况（每份保留最近 5 代）：\n${lines.join("\n")}\n\n恢复方法：把 data/backups/<文件名>/ 里时间戳最新的一份复制回 data/ 覆盖同名文件，再重启客户端。`, "backuplist");
      },
    },

    数据概览: {
      ownerOnly: true,
      fn: async (body, args) => {
        const only = (args || []).map(String)[0];
        // 权限和功德也可能单独存在，这些号也要能被「数据概览」查到，
        // 否则主人会以为「这人什么都没有」而漏掉残留数据
        const uids = new Set([
          ...checkins.listUsers().map((x) => x.uid),
          ...Object.keys(cards.state?.users || {}),
          ...Object.keys(games.state?.users || {}),
          ...Object.keys(permStore || {}),
          ...Object.keys((loadMerit(dataDir) || {}).users || {}),
        ]);
        const t = only && /^\d{5,11}$/.test(only) ? only : null;
        const list = t ? [t] : [...uids];
        if (!list.length) return sendText(body, "目前没有任何用户数据。", "overview");
        const lines = list.slice(0, 30).map((uid) => {
          const ci = checkins.profile(uid);
          const cd = cards.summaryOf(uid);
          const gm = games.summaryOf(uid);
          const mt = meritOf(dataDir, uid);
          const pm = grantedOf(uid);
          return `${uid}\n  积分 ${ci.points}｜累计 ${ci.earned}（${ci.level} 级，距下级 ${ci.nextNeed}）｜连续 ${ci.streak} 天/共 ${ci.totalDays} 天\n  光玉 ${cd.stones}｜卡 ${cd.distinct} 种 ${cd.copies} 张｜保底池 ${cd.pools}\n  金币 ${gm.gold}｜鱼 ${gm.fishKinds} 种 ${gm.fishTotal} 条｜功德 ${mt.n}\n  权限 ${pm.admin ? "管理员" : pm.perms.length ? pm.perms.join("、") : "无"}`;
        });
        return sendText(body, `📊 数据概览（共 ${list.length} 个用户${list.length > 30 ? "，仅显示前 30" : ""}）：\n\n${lines.join("\n\n")}`, "overview");
      },
    },
  };
}
