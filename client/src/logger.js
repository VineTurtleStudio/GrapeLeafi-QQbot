const ring = [];
const MAX = 300;

function push(level, args) {
  const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${args.join(" ")}`;
  ring.push({ t: Date.now(), level, text: line });
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  const out = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
  out(line);
}

export const logger = {
  info: (...args) => push("INFO", args),
  warn: (...args) => push("WARN", args),
  error: (...args) => push("ERROR", args),
  lines: (n = 100) => ring.slice(-Math.min(n, ring.length)),
  count: () => ring.length,
};