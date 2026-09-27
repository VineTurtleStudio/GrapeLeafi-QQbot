// builtins/perm.js —— 权限授予类内置指令（grant/revoke/perms）。
// 只依赖注入的 { sendText, permStore, savePerms, grantedOf, isAdmin } 与 common 工具；
// 不 import brain、不 import gacha；可 node --check 自证。

import { resolveTarget } from "./common.js";

const PERM_ALIAS = {
  管理员: "admin", 管理: "admin", 全部: "admin", 所有: "admin", admin: "admin",
  禁言: "mute", 解禁: "unmute", 踢出: "kick", 踢人: "kick",
  全体禁言: "banall", 解除全体禁言: "unbanall", 撤回: "recall",
};
const PERM_LABEL = {
  admin: "管理员", mute: "禁言", unmute: "解禁", kick: "踢出",
  banall: "全体禁言", unbanall: "解除全体禁言", recall: "撤回",
};
const PERM_LIST = Object.keys(PERM_LABEL);

function parsePerms(words) {
  const out = [];
  for (const w of (words || []).join(" ").split(/[,\s，、]+/).filter(Boolean)) {
    const k = PERM_ALIAS[w] || (PERM_LIST.includes(w) ? w : null);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

export function permCommands({ sendText, permStore, savePerms, grantedOf, isAdmin }) {
  return {
    grant: {
      fn: async (body, args) => {
        const { id: target, rest } = resolveTarget(body, args);
        if (!target) return sendText(body, "用法：/给予 @某人 管理员 或 /给予 QQ号 禁言,踢出", "grant");
        if (isAdmin(target)) return sendText(body, `${target} 是主人，已拥有全部权限。`, "grant");
        const keys = parsePerms(rest);
        if (!keys.length) {
          return sendText(body, `请指定权限：${PERM_LIST.map((k) => PERM_LABEL[k]).join(" / ")}（可用逗号或空格分隔）`, "grant");
        }
        const entry = permStore[target] || { admin: false, perms: [] };
        if (!Array.isArray(entry.perms)) entry.perms = [];
        for (const k of keys) {
          if (k === "admin") entry.admin = true;
          else if (!entry.perms.includes(k)) entry.perms.push(k);
        }
        permStore[target] = entry;
        savePerms();
        return sendText(body, `已给予 ${target} 的 bot 权限：${keys.map((k) => PERM_LABEL[k]).join("、")}`, "grant");
      },
      ownerOnly: true,
    },
    revoke: {
      fn: async (body, args) => {
        const { id: target, rest } = resolveTarget(body, args);
        if (!target) return sendText(body, "用法：/剥夺 @某人 [权限...]（不填权限则剥夺全部）", "revoke");
        if (isAdmin(target)) return sendText(body, `${target} 是主人，无法在此剥夺（请改 config.json 的 adminIds）。`, "revoke");
        const entry = permStore[target];
        if (!entry) return sendText(body, `${target} 当前没有任何 bot 权限。`, "revoke");
        const keys = parsePerms(rest);
        if (!keys.length) {
          delete permStore[target];
          savePerms();
          return sendText(body, `已剥夺 ${target} 的全部 bot 权限。`, "revoke");
        }
        for (const k of keys) {
          if (k === "admin") entry.admin = false;
          else entry.perms = (entry.perms || []).filter((x) => x !== k);
        }
        if (!entry.admin && !(entry.perms || []).length) delete permStore[target];
        else permStore[target] = entry;
        savePerms();
        return sendText(body, `已剥夺 ${target} 的 bot 权限：${keys.map((k) => PERM_LABEL[k]).join("、")}`, "revoke");
      },
      ownerOnly: true,
    },
    perms: {
      fn: async (body, args) => {
        const { id } = resolveTarget(body, args);
        const uid = id || String(body.user_id);
        const g = grantedOf(uid);
        const list = [];
        if (g.admin) list.push("管理员（全部）");
        for (const k of g.perms) list.push(PERM_LABEL[k] || k);
        const text = isAdmin(uid)
          ? `${uid} 是主人，拥有全部权限。`
          : list.length
          ? `${uid} 的 bot 权限：${list.join("、")}`
          : `${uid} 没有 bot 权限。`;
        return sendText(body, text, "perms");
      },
      ownerOnly: true,
    },
  };
}