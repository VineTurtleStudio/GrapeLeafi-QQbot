// builtins/settings.js —— 开关/设置类内置指令（开启/关闭/生日）与组特征开关工具。
// 依赖注入 { sendText, content, saveContent, dataDir, builtinsView, cmdCategory } 与 birthdays.js；
// 不 import brain、不 import gacha；可 node --check 自证。

import { validateBirthdayDate, todayBirthdaysForGroup, birthdayLines } from "../birthdays.js";

export function settingsCommands({ sendText, content, saveContent, dataDir, builtinsView, cmdCategory }) {
  const groupFeaturesList = () => {
    const cats = new Set(Object.values(cmdCategory).filter((c) => c !== "基础" && c !== "群管理" && c !== "权限"));
    const cmds = [];
    for (const [key, b] of Object.entries(builtinsView())) {
      if (b && !b.adminOnly && !b.ownerOnly && cmdCategory[key] && cmdCategory[key] !== "基础") cmds.push(String(key));
    }
    for (const c of (content.presets?.commands || [])) {
      if (c && c.name) cmds.push(String(c.name));
    }
    return { cats: [...cats], cmds: [...new Set(cmds)] };
  };

  const setGroupFeature = (body, name, on) => {
    const gid = String(body.group_id);
    const st = content.settings || (content.settings = {});
    st.groupEnabled = st.groupEnabled || {};
    const { cats, cmds } = groupFeaturesList();
    let key = null;
    if (name && /^cat[:：]?\s*/.test(name)) key = `cat:${name.replace(/^cat[:：]?\s*/, "")}`;
    else if (cats.includes(name)) key = `cat:${name}`;
    else if (cmds.includes(name)) {
      key = `cmd:${name}`;
    }
    if (!key) return null;
    const list = st.groupEnabled[key] || [];
    const arr = list.map(String).filter((g) => g !== gid);
    if (on) arr.push(gid);
    st.groupEnabled[key] = [...new Set(arr)];
    saveContent(dataDir, content);
    return key;
  };

  const birthdayFn = async (body, args) => {
    const gid = String(body.group_id);
    const bd = content.birthdays;
    const cmd = (args && args[0] ? String(args[0]).toLowerCase() : "");
    const setGroups = (arr) => {
      bd.enabledGroups = [...new Set(arr.map(String).filter(Boolean))];
      saveContent(dataDir, content);
    };
    if (cmd === "开" || cmd === "开启" || cmd === "开通" || cmd === "on") {
      const was = bd.enabledGroups.map(String).includes(gid);
      setGroups([...(bd.enabledGroups || []), gid]);
      setGroupFeature(body, "生日", true);
      return sendText(body, was ? `生日提醒此前已在本群开启啦～（默认零点为角色送上祝福）` : `本群已开启生日提醒🎂 每天零点若有角色生日，葡叶酱会来送祝福；本群自定义生日也同步生效。`, "birthday");
    }
    if (cmd === "关" || cmd === "关闭" || cmd === "取消" || cmd === "off") {
      setGroups((bd.enabledGroups || []).filter((g) => String(g) !== gid));
      setGroupFeature(body, "生日", false);
      return sendText(body, `已关闭本群的生日提醒，之后不再主动推送生日祝福。`, "birthday");
    }
    if (cmd === "添加" || cmd === "加" || cmd === "add") {
      const parts = args.slice(1).filter(Boolean);
      const date = validateBirthdayDate(parts[parts.length - 1] || "");
      const name = parts.slice(0, parts.length - 1).join(" ").trim();
      if (!date || !name) return sendText(body, `用法：/生日 添加 [名字] [MM-DD]，例如「/生日 添加 小叶子 07-23」。该生日仅在本群生效。`, "birthday");
      if (!Array.isArray(bd.items)) bd.items = [];
      const hit = bd.items.find((it) => it && it.name === name && it.date === date && Array.isArray(it.groups) && it.groups.map(String).includes(gid));
      if (hit) return sendText(body, `本群已经有「${name}（${date}）」的生日记录啦，无需重复添加。`, "birthday");
      bd.items.push({ id: `user-${Date.now()}`, name, date, series: "自定义", builtin: false, groups: [gid] });
      saveContent(dataDir, content);
      return sendText(body, `已在本群添加「${name}」的生日（${date}），到生日当天零点半自动送祝福哦～`, "birthday");
    }
    if (cmd === "删除" || cmd === "删" || cmd === "del") {
      const name = args.slice(1).join(" ").trim();
      const items = Array.isArray(bd.items) ? bd.items : [];
      const before = items.length;
      const left = items.filter((it) => !(it && it.name === name && Array.isArray(it.groups) && it.groups.map(String).includes(gid)));
      if (left.length === before) return sendText(body, `本群没有「${name}」的生日记录，无需删除。`, "birthday");
      bd.items = left;
      saveContent(dataDir, content);
      return sendText(body, `已删除本群「${name}」的生日记录。`, "birthday");
    }
    const on = Array.isArray(bd.enabledGroups) && bd.enabledGroups.map(String).includes(gid);
    const persons = todayBirthdaysForGroup(content, gid);
    const head = on ? `本群已开启生日提醒🎂 （/生日 关 可关闭）` : `本群尚未开启生日提醒（发送 /生日 开启 打开，零点半自动送祝福）`;
    if (!persons.length) return sendText(body, `${head}\n今天没有角色过生日。`, "birthday");
    const lines = birthdayLines(persons, bd.notice);
    return sendText(body, `${head}\n${lines.join("\n")}`, "birthday");
  };

  const enableFn = async (body, args) => {
    const name = (args && args[0] ? String(args[0]).toLowerCase() : "");
    if (!name) {
      const { cats, cmds } = groupFeaturesList();
      return sendText(body, `可开启的类型：${cats.join(" / ")}\n可开启的指令：${cmds.join(" / ")}\n用法：/开启 小游戏、/开启 钓鱼（在群内发送即对该群生效）；/关闭 X 可再关掉。`, "feature");
    }
    const key = setGroupFeature(body, args.join(" "), true);
    if (!key) return sendText(body, `没有「${name}」这个类型或指令。发 /开启 查看可选列表。`, "feature");
    return sendText(body, `本群已开启「${name}」${key.startsWith("cat:") ? "（整个类型）" : ""}`, "feature");
  };

  const disableFn = async (body, args) => {
    const name = (args && args[0] ? String(args[0]).toLowerCase() : "");
    if (!name) return sendText(body, `用法：/关闭 小游戏 或 /关闭 钓鱼（关闭后本群不可用）。/开启 可查看可选项。`, "feature");
    const key = setGroupFeature(body, args.join(" "), false);
    if (!key) return sendText(body, `没有「${name}」这个类型或指令。发 /开启 查看可选列表。`, "feature");
    return sendText(body, `本群已关闭「${name}」`, "feature");
  };

  return {
    生日: { fn: birthdayFn },
    开启: { fn: enableFn },
    关闭: { fn: disableFn },
  };
}