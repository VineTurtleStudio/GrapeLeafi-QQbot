import fs from "node:fs";
import { fileURLToPath } from "node:url";

// 相对脚本自身定位 brain.js。之前这里写的是本机绝对路径，
// 结果这行会原样跟着分享包发出去，白送一份「盘符 + 项目目录结构」。
const p = fileURLToPath(new URL("../src/brain.js", import.meta.url));
let s = fs.readFileSync(p, "utf8");
const startMarker = "  async function builtinHot(body) {";
const endMarker = "  async function builtinSetCard(body, args) {";
const si = s.indexOf(startMarker);
const ei = s.indexOf(endMarker, si);
if (si < 0 || ei < 0) throw new Error(`markers: ${si},${ei}`);
const hot = `  async function builtinHot(body) {
    const sources = buildSourceChain();
    let lastErr = null;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      let ctrl;
      try {
        ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(src.url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        const list = src.pick(j);
        if (!Array.isArray(list) || !list.length) throw new Error("数据为空");
        const srcName = String(src.name(j) || "热搜");
        const titles = list.slice(0, 10).map((x) => \`• \${x.title || x.name || ""}\`).filter(Boolean).join("\\n");
        if (!titles) throw new Error("没有条目");
        return sendText(body, \`🔥 \${srcName} Top10：\\n\${titles}\`, "hot");
      } catch (err) {
        lastErr = err;
        if (ctrl) clearTimeout(null);
      }
    }
    return sendText(body, \`热搜拉取失败（\${lastErr ? lastErr.message : "未知"}），稍后再试~\`, "hot");
  }
  function buildSourceChain() {
    return [
      { url: "https://api.bilibili.com/x/web-interface/popular", pick: (j) => ((j || {}).data || {}).list || [], name: () => "哔哩哔哩热门" },
      { url: "https://api.vvhan.com/api/hotlist", pick: (j) => ((j || {}).data || {}).list || [], name: () => "热搜" },
    ];
  }
`;
s = s.slice(0, si) + hot + s.slice(ei);
fs.writeFileSync(p, s, "utf8");
console.log("rewrote builtinHot span");
