// 生成「去个人化的数据模板」，让分享包是个装完就有功能的 bot，而不是空壳。
//
// 为什么需要这个：分享时 `client/data/` 整个被排掉了，但那个目录里
// 混着两种完全不同的东西——
//
//   该分享的（公开素材性数据）：
//     content.json  生日表、事件文案、AI 人设、葡家头衔、二次元图源、内置功能开关
//     cards.json    731 张卡的元数据（作品池、角色池、概率、回收价）
//   绝不能分享的（你的创作 + 你的玩家数据）：
//     presets.keywords / presets.commands  你的预设指令、关键字自动回复
//     schedule                             你的定时提醒文案
//     lottery.dir                          指向你本机某个素材目录的绝对路径
//     checkins.json / games.json / cardgame.json / merit.json / permissions.json
//     —— 全部以真实 QQ 号做键，谁几点签到、攒了多少积分、抽了几张卡都在里面
//
// 之前为了不泄露把整个目录排掉，结果对方装完是个**什么都没有**的 bot：
// 没有生日表、没有头衔、没有图源。那才是真正的「纯外壳」。
//
// 所以这里的分寸是：**功能留下，内容清空**。
//   - 留下：结构、开关、生日表（全是公开作品里的角色生日）、头衔、事件文案、图源、卡池元数据
//   - 清空：预设指令、关键字回复、定时文案——这些是你的创作，接收者自己配
//   - 清空：一切号码、绝对路径、运行期状态
// 然后严格校验一遍产物里一个号码、一个绝对路径都不剩。
//
// 群号要清掉，因为群号本身就是个人信息（能搜到群、能加进去）。
// 但**清空而不是删掉键**，是为了保留「你开了哪些功能」这个信息——
// 别人装完看到的是「生日/互动/联网/文娱 这几类默认关着」，
// 而不是「这些功能不存在」，后者会让人以为功能没做。

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** 判是不是「一个孤零零的数字」——5~11 位，QQ 和群号都落在这个范围 */
const NUMERIC_ID = /^\d{5,11}$/;

/**
 * 判是不是「指向某台机器的绝对路径」。
 * 正斜杠版本（盘符后面跟 `/`）同样要判：早先的规则只认盘符加反斜杠，
 * 结果我自己写死在 content.js 里的素材目录就这么一路混进了分享出去的源码，
 * 靠人眼根本没发现。同一条路径的两种写法，只差一个字符。
 */
const ABS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/;

/** 运行期状态文件：只留结构，不留数据 */
const STATE_FILES = {
  "checkins.json": { __v: 1, users: {} },
  "games.json": { __v: 1, users: {}, fortunes: {} },
  "cardgame.json": { __v: 1, users: {} },
  "merit.json": { __v: 1, users: {} },
  "permissions.json": { __v: 1, grants: {} },
};

const clear = (v) => {
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return {};
  return v;
};

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

/**
 * 把 content.json 变成「功能在、内容空」的模板。
 * 用显式路径清单，不用「搜到数字就删」的启发式——后者会把
 * 关键字回复正文里的数字（比如「100 连抽」）也一起吃掉。
 */
export function scrubContent(content) {
  const c = JSON.parse(JSON.stringify(content));
  const s = c.settings || (c.settings = {});

  for (const k of ["replyGroups", "blockGroups", "quietAllowGroups"]) {
    if (k in s) s[k] = clear(s[k]);
  }
  // 群开关：把群号清空，但**保留键**。
  // 注意语义不是「不限制」而是「这些类别对所有群都关着」——
  // brain.js 的 groupFeaturesEnabled 里 `Array.isArray(e[key])` 为真就直接按名单判，
  // 空数组 = 谁都不在名单里。好在这几个类别本来也都在 settings.defaultOff 里，
  // 用户看到的是同一句提示「「X」在本群还没开启。发 /开启 X 就能用了」，
  // 发一条 /开启 就恢复，不需要额外解释。
  if (s.groupEnabled && typeof s.groupEnabled === "object") {
    for (const k of Object.keys(s.groupEnabled)) s.groupEnabled[k] = [];
  }
  if (s.events && typeof s.events === "object") {
    for (const ev of Object.values(s.events)) {
      if (ev && typeof ev === "object") ev.enabledGroups = [];
    }
  }

  const b = c.birthdays;
  if (b && typeof b === "object") {
    if ("enabledGroups" in b) b.enabledGroups = [];
    if (Array.isArray(b.items)) for (const it of b.items) if (it && "groups" in it) it.groups = [];
    // lastFired 是运行期状态（上次在哪天发过生日提醒），属于你的机器人跑出来的痕迹
    delete b.lastFired;
  }

  // 定时提醒：文案是纯个人创作，整条清空。功能本身留着（接收者能在控制台加自己的）。
  c.schedule = [];

  // 预设指令 / 关键字自动回复：整块清空，键保留——
  // 控制台的「预设指令」「关键字回复」两页要靠这两个数组渲染成空列表。
  c.presets = {
    ...(c.presets && typeof c.presets === "object" ? c.presets : {}),
    commands: [],
    keywords: [],
  };

  // 抽签配图目录：指向你本机的绝对路径，属于隐私，整段丢掉。
  // 注意是「丢掉这个键」而不是留空串：loadContent 用的是顶层展开合并
  // （{...def, ...disk}），删掉键会回落到 DEFAULT_CONTENT.lottery.dir。
  if (c.lottery && typeof c.lottery === "object") delete c.lottery.dir;

  // AI 段：key 一律不留（正常情况下它在 config.json 里，但别赌）
  if (c.ai && typeof c.ai === "object") for (const k of ["apiKey", "key", "token"]) delete c.ai[k];

  // pad 是个 3145728 字符的 'x' 填充串，占了 content.json 的 99% 体积。
  // 全项目没有任何代码读 content.pad（grep 到的 pad 全是同名局部变量），纯属垃圾。
  let droppedPad = 0;
  if (typeof c.pad === "string" && c.pad.length > 1024) {
    droppedPad = c.pad.length;
    delete c.pad;
  }

  return { content: c, droppedPad };
}

/**
 * 找遍所有键名和值，报告任何「孤零零的 5~11 位数字」或「绝对路径」。
 * 比 leak-scan 的 owner-id 规则更严：那个是 7~11 位（避免误报源码里的常量），
 * 这里只针对数据文件，5 位起步（短号段群号是存在的），宁可错杀不可漏放。
 */
export function findResidualIds(obj, path = "", out = []) {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      if (typeof v === "string" && (NUMERIC_ID.test(v.trim()) || ABS_PATH.test(v.trim())))
        out.push(`${path}[${i}] = ${v}`);
      else findResidualIds(v, `${path}[${i}]`, out);
    });
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (NUMERIC_ID.test(k.trim()) || ABS_PATH.test(k.trim())) out.push(`${p}  <键名>`);
      if (typeof v === "string" && (NUMERIC_ID.test(v.trim()) || ABS_PATH.test(v.trim())))
        out.push(`${p} = ${v}`);
      else findResidualIds(v, p, out);
    }
  }
  return out;
}

/**
 * 生成去个人化的数据目录。产物会先写到临时位置、校验通过后才落到 outDataDir。
 *
 * @param {string} realDataDir  真实 client/data
 * @param {string} outDataDir   产物里的 client/data
 * @param {object} opts        { log }
 */
export function buildDataTemplate(realDataDir, outDataDir, { log = () => {} } = {}) {
  mkdirSync(outDataDir, { recursive: true });
  const written = [];
  const stats = { scrubbed: [], emptied: [], droppedPadChars: 0 };

  const put = (name, obj) => {
    writeFileSync(join(outDataDir, name), JSON.stringify(obj, null, 2) + "\n", "utf8");
    written.push(name);
  };

  // --- 配置类：去号后保留 ---
  // 注意 try 只包住「读 + 洗」，写盘放在 try 外面：
  // 洗不干净属于致命错误，绝不能被下面那个 catch 吞成一句「跳过」，
  // 那样会留下一个带关键字的 content.json 混进产物。
  let content = null;
  let droppedPad = 0;
  try {
    const scrubbed = scrubContent(readJSON(join(realDataDir, "content.json")));
    content = scrubbed.content;
    droppedPad = scrubbed.droppedPad;
    const kw = content.presets?.keywords?.length || 0;
    const cmds = content.presets?.commands?.length || 0;
    if (kw || cmds) throw new Error(`预设/关键字没清干净（还剩 ${kw} 条关键字、${cmds} 条预设）`);
    if (content.schedule?.length) throw new Error(`定时文案没清干净（还剩 ${content.schedule.length} 条）`);
  } catch (err) {
    log(`  content.json  跳过（${err.message}）`);
  }
  if (content) {
    stats.droppedPadChars = droppedPad;
    put("content.json", content);
    stats.scrubbed.push("content.json");
    const bd = content.birthdays?.items?.length || 0;
    const src = content.anime?.sources?.length || 0;
    const bio = Object.keys(content.builtins || {}).length;
    log(`  content.json  保留：内置功能 ${bio} 项开关、生日 ${bd} 条、事件文案、葡家头衔、二次元图源 ${src} 个、AI 人设`);
    log(`                清空：预设指令、关键字回复、定时文案、本机绝对路径、所有群号${droppedPad ? `，另丢掉 ${(droppedPad / 1024).toFixed(0)}KB 的 pad 填充垃圾` : ""}`);
  }

  try {
    const cards = readJSON(join(realDataDir, "cards.json"));
    put("cards.json", cards);
    stats.scrubbed.push("cards.json");
    const packs = Array.isArray(cards.packs) ? cards.packs : [];
    const nCards = packs.reduce((n, p) => n + Object.keys(p.cards || {}).length, 0);
    log(`  cards.json    保留：${packs.length} 个卡包、共 ${nCards} 张卡的元数据（牌面/角色/概率/回收价）`);
  } catch (err) {
    log(`  cards.json    跳过（${err.message}）`);
  }

  // --- 运行期状态：留空壳 ---
  for (const [name, empty] of Object.entries(STATE_FILES)) {
    put(name, empty);
    stats.emptied.push(name);
  }
  log(`  空壳 ${stats.emptied.length} 个：${stats.emptied.join("、")}`);

  // --- 校验：一个号码、一个绝对路径都不许剩 ---
  const problems = [];
  for (const name of written) {
    for (const hit of findResidualIds(readJSON(join(outDataDir, name)), name)) problems.push(hit);
  }
  if (problems.length) {
    // 校验不过就把刚写的全撤回：宁可没有数据模板，也不能让带号/带本机路径的版本留在产物里
    for (const name of written) rmSync(join(outDataDir, name), { force: true });
    throw new Error(
      `去个人化没做干净，产物里还剩 ${problems.length} 处号码或本机路径：\n  ` + problems.slice(0, 20).join("\n  "),
    );
  }
  log(`  校验通过：${written.length} 个文件里 0 处号码、0 处本机路径`);

  return { files: written, stats };
}
