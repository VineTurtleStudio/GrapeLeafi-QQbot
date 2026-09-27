// 素材路径解析：把配置里写的路径变成真实可用的绝对路径。
//
// 为什么需要它：素材目录以前是直接写绝对路径的，换一台机器、换个用户名就得
// 手动改一遍，改漏了表现为「图鉴全空」但没有任何报错，很难查。
// 这里统一规则，让 cards.json 里只写相对 assets/ 的短路径：
//
//   "assetRoot": "cards/ab"           ->  <项目根>/assets/cards/ab
//   "assetRoot": "${assets}/cards/ab" ->  同上，显式写法
//   "assetRoot": "<某个绝对路径>"      ->  原样使用（绝对路径仍然支持，老配置不用改）
//   "assetRoot": "" 或 "******"        ->  空（分享模板里的占位符，等于「还没配」）
//
// 绝对路径一律照旧可用，是为了不破坏别人已有的配置。

import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 项目根目录（client/src/ 往上两级） */
export const PROJECT_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** 所有分类素材的基准目录 */
export const ASSETS_ROOT = join(PROJECT_ROOT, "assets");

/** 配置里表示「还没填」的占位符 */
const PLACEHOLDERS = new Set(["", "******", "********", "null", "undefined", "-"]);

/** 支持的显式前缀，写成这样更直观 */
const TOKENS = ["${assets}", "%assets%", "@assets@"];

/**
 * 解析素材路径。返回 "" 表示未配置。
 * 不抛异常 —— 素材缺失不该让 bot 崩掉，只是图鉴/出图没有图。
 */
export function resolveAssetPath(p) {
  if (p === null || p === undefined) return "";
  let s = String(p).trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return "";

  for (const t of TOKENS) {
    if (s.toLowerCase().startsWith(t.toLowerCase())) {
      const rest = s.slice(t.length).replace(/^[\\/]+/, "");
      return resolve(ASSETS_ROOT, rest || ".");
    }
  }

  // 绝对路径原样保留（兼容旧配置、兼容别人放在项目外的素材库）
  if (isAbsolute(s)) return s;

  // 其余一律相对 assets/ 解析
  return resolve(ASSETS_ROOT, s);
}

/** 供控制台展示用：把绝对路径缩回相对 assets/ 的短路径，避免又写进配置文件 */
export function displayAssetPath(p) {
  const abs = resolveAssetPath(p);
  if (!abs) return "";
  const rel = abs.startsWith(ASSETS_ROOT) ? abs.slice(ASSETS_ROOT.length).replace(/^[\\/]+/, "") : abs;
  return rel;
}

/** 素材分类目录清单：新建分类时照这个加 */
export const ASSET_CATEGORIES = [
  { dir: "cards", name: "卡牌图库", desc: "每个子目录是一个卡包，内含 Icon / Card / Detail 三种图，编号区间分目录" },
  { dir: "keyword", name: "关键字自动回复配图", desc: "content.json 的 keywords 里按目录引用" },
  { dir: "lottery", name: "扭蛋 / 抽奖配图", desc: "按稀有度命名会被自动识别" },
  { dir: "birthday", name: "生日提醒配图", desc: "按角色名或系列名匹配" },
  { dir: "ui", name: "界面与立绘", desc: "控制台、签到卡等自绘素材" },
  { dir: "misc", name: "其它", desc: "暂时没归类但要留着的" },
];
