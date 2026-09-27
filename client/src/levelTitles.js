// levelTitles.js —— 葡家等级头衔表。
//
// 为什么单独一个文件：头衔既要画进等级卡（checkinImage.js），
// 又要在控制台里编辑、还要能被群主用指令改，三处共用一份定义。
//
// 规则：每 10 级一档，和 QQ 等级头衔的观感一致。
// 档位只按等级数分，不看积分——积分已经由「葡家等级」进度条体现了，
// 再按积分分一套头衔会跟进度条语义重复。
//
// 想改文案：控制台 → 生日/日常那类设置页里有「葡家头衔」编辑区；
// 群主也可以在群里 @bot 直接改（见 builtins/leveltitle.js）。

// 默认 10 档。min 是这一档的起始等级（闭区间下界），从 1 开始连续递增。
export const DEFAULT_TITLES = [
  { min: 1, text: "葡家娃娃" },
  { min: 11, text: "葡家在编学生" },
  { min: 21, text: "葡家编外奶爸奶妈" },
  { min: 31, text: "葡家编外辅导员" },
  { min: 41, text: "葡家在编奶爸奶妈" },
  { min: 51, text: "葡家在编辅导员" },
  { min: 61, text: "葡家在编守门人" },
  { min: 71, text: "葡家在编守门百夫长" },
  { min: 81, text: "葡家长老会成员" },
  { min: 91, text: "葡家分站站长" },
];

// 归一化：保证是按 min 升序、min 合法、text 非空的数组。
// 控制台和指令都能写脏数据，所以每次用之前都过一遍这里。
export function normalizeTitles(list) {
  if (!Array.isArray(list) || !list.length) return DEFAULT_TITLES.map((t) => ({ ...t }));
  const out = [];
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const min = Math.max(1, Math.floor(Number(t.min)));
    const text = String(t.text == null ? "" : t.text).trim().slice(0, 24);
    if (!min || !text) continue;
    out.push({ min, text });
  }
  if (!out.length) return DEFAULT_TITLES.map((t) => ({ ...t }));
  out.sort((a, b) => a.min - b.min);
  // 同 min 的只留后一个（后写的赢），避免两档争同一段等级
  const dedup = [];
  for (const t of out) {
    if (dedup.length && dedup[dedup.length - 1].min === t.min) dedup[dedup.length - 1] = t;
    else dedup.push(t);
  }
  return dedup;
}

// 取某个等级对应的头衔。低于最低档就返回最低档那档（不返回空，
// 免得卡片上昵称右边突然空一块，看着像出错）。
export function titleForLevel(list, level) {
  const arr = normalizeTitles(list);
  const lv = Math.max(1, Math.floor(Number(level)) || 1);
  let hit = arr[0];
  for (const t of arr) {
    if (lv >= t.min) hit = t;
    else break;
  }
  return hit.text;
}

// 解析某个群该用哪张表：群级覆盖（levelTitlesByGroup）优先，没设过就回落全局。
// 画卡（checkin.js）和改表指令（leveltitle.js）都走这里，保证两边看到同一份。
export function titlesForGroup(content, groupId) {
  const per = content && content.levelTitlesByGroup;
  const key = groupId == null ? "" : String(groupId);
  if (key && per && Array.isArray(per[key]) && per[key].length) {
    return normalizeTitles(per[key]);
  }
  return normalizeTitles((content && content.levelTitles) || DEFAULT_TITLES);
}

// 这一档的下一档起始等级；已经是最高档就返回 null（进度条不再显示"距下一级"）
export function nextTitleAt(list, level) {
  const arr = normalizeTitles(list);
  const lv = Math.max(1, Math.floor(Number(level)) || 1);
  for (const t of arr) {
    if (t.min > lv) return t.min;
  }
  return null;
}
