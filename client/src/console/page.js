// console/page.js —— 把 page/ 下的字符串分片按顺序拼成完整页面。
// 为什么要拆：控制台前端原本是 console.js 里一个 1600+ 行的模板字符串，
// 既没法单独维护，也没法对某一块做语法检查。拆成片段后在这里按序拼接，
// 无需构建步骤，运行时行为不变。
// 注意：新增分片时文件名必须是 NN-xxx.js 这种带两位数字前缀的，靠文件名排序决定拼接顺序。
// console-page.test.mjs 会校验「拼接结果与拆分前一致」，但**只在显式设置 PAGE_STRICT=1 时才比对旧基线**：
// 我们是主动在改页面，默认只跑结构校验，改完基线本来就该变。
// console-page.test.mjs 还会强制「单个分片不超过 500 行」，所以 03 放不下时就新开一片（比如 08）。
import shell from "./page/01-shell.js";
import ph from "./page/02-ph.js";
import tabsContent from "./page/03-tabs-content.js";
import tabsSettings from "./page/04-tabs-settings.js";
import tabsRiskAi from "./page/05-tabs-risk-ai.js";
import tabsCards from "./page/06-tabs-cards.js";
import tabsMisc from "./page/08-tabs-misc.js";
import tabsBuiltins from "./page/07-tabs-builtins.js";

export const PAGE_PARTS = [shell, ph, tabsContent, tabsSettings, tabsRiskAi, tabsCards, tabsBuiltins, tabsMisc];

export const PAGE = PAGE_PARTS.join("");
