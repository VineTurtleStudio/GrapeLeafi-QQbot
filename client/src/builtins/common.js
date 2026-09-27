// builtins/common.js —— 各内置模块共享的纯工具（从 brain.js 模块级函数复制，保持原实现）。

export function atUsers(body) {
  return (body.message || [])
    .filter(
      (s) =>
        s.type === "at" &&
        s.data &&
        s.data.qq &&
        !["all", "0"].includes(String(s.data.qq)) &&
        String(s.data.qq) !== String(body.self_id)
    )
    .map((s) => String(s.data.qq));
}

export function resolveTarget(body, args) {
  const ids = atUsers(body);
  if (ids.length) return { id: ids[0], rest: args || [] };
  const list = args || [];
  const idx = list.findIndex((a) => /^\d{5,11}$/.test(a));
  if (idx === -1) return { id: null, rest: list };
  return { id: list[idx], rest: list.filter((_, i) => i !== idx) };
}

export function parseDurationSec(arg) {
  const m = String(arg || "");
  const n = parseFloat(m);
  if (Number.isNaN(n) || n <= 0) return 600;
  if (m.includes("秒")) return Math.round(n);
  if (m.includes("时")) return Math.round(n * 3600);
  if (m.includes("天")) return Math.round(n * 86400);
  if (m.includes("周")) return Math.round(n * 604800);
  return Math.round(n * 60);
}

export function fmtDuration(sec) {
  if (sec % 86400 === 0) return `${sec / 86400}天`;
  if (sec % 3600 === 0) return `${sec / 3600}小时`;
  if (sec % 60 === 0) return `${sec / 60}分钟`;
  return `${sec}秒`;
}