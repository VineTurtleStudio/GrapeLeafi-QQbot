// 分享前自检：找出「会跟着项目发出去、但属于你个人」的隐私与密钥。
//
// 为什么需要它：仓库根目录的 .gitignore 只对 git 生效。实际分享往往不是 git push，
// 而是打包 ZIP / 拷文件夹 / 发网盘 —— 那时候 .gitignore 一行都不管，
// config.json（你的 QQ 号 + 接入 token）、client/data/（签到积分生日表等真实用户数据）、
// bot/napcat/config/（按 QQ 号命名的登录态文件）会原封不动一起走。
//
// 这个模块只做「检查」，不做删除。改用 make-share 生成干净副本。
//
// 用法：
//   node scripts/leak-scan.mjs            扫描项目根目录
//   node scripts/leak-scan.mjs <目录>     扫描指定目录（比如 make-share 的产物）

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, extname, sep } from "node:path";

/** 会泄露个人信息的文件/目录，出现在待分享副本里就是错 */
const FORBIDDEN_PATHS = [
  { p: "client/config.json", why: "里面有你的 QQ 号、接入 token、AI key（模板应改名为 config.example.json）" },
  // 只精确到 bot/napcat：分享产物里会放一个 bot/PLACE_NAPCAT_HERE.txt 提示文件，那是安全的
  { p: "bot/napcat", why: "整套 NapCat，其中 config/ 里是按 QQ 号命名的登录态和 token" },
  // 素材：体积大且多为他人作品，只允许 assets/README.md 这样的说明文件
  { p: "assets", why: "图片素材（实测单个卡包就 2GB），多为他人作品，不应随包分发。允许保留 assets/README.md" },
  // client/data：危险的不是目录名，是里面的号码。
  // 所以这里用条件规则——干净的去号模板放行，带号的（也就是你本机那份）判错。
  // 整个一刀切的话，别人装完会是个没有关键字/预设/生日表的空壳 bot。
  {
    p: "client/data",
    why: "运行期数据模板里不该有真实号码（签到/积分/抽卡都是按 QQ 号做键的）",
    okIf: (root, p) => isDataTemplateClean(join(root, p)),
  },
  // 自动恢复点：里面是各个时间点的完整真实存档
  { p: "client/data/backups", why: "自动备份的恢复点，每个都是一份完整的真实玩家数据" },
  { p: "node_modules", why: "依赖可由 npm install 重建，且体积巨大" },
  { p: ".git", why: "仓库历史里往往还留着早期的 config.json" },
];

/** assets/ 下这些文件可以留在分享产物里：说明文件，以及用来占住空目录的 .gitkeep */
const ASSETS_ALLOWED = new Set(["assets/README.md"]);
const isAssetsAllowed = (rel) => ASSETS_ALLOWED.has(rel) || rel.endsWith("/.gitkeep");

/** client/data/ 允许存在的文件名（去个人化模板的固定集合） */
const DATA_TEMPLATE_FILES = new Set([
  "content.json", "cards.json", "checkins.json", "games.json",
  "cardgame.json", "merit.json", "permissions.json",
  ".gitkeep", // 空的占位文件，不含数据
]);

/**
 * 判断一个 client/data 目录是不是「干净的去号模板」。
 *
 * 两个条件都要满足：
 *   1. 文件名都在允许集合里 —— 挡住 .bak 备份和任何临时文件混进来
 *   2. 每个文件都解析得开，且里面没有任何 5~11 位的号码（键名或值）
 *
 * 第 2 条的数字下限比 CONTENT_RULES 的 owner-id（7 位）更低：
 * owner-id 要 7 位是为了不误报源码里的哈希常量，而数据文件里 6 位群号是真实存在的，
 * 宁可错杀。
 */
function isDataTemplateClean(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }
  // 允许 .gitkeep 这类空占位文件，其它任何名字都不行
  for (const n of names) {
    if (!DATA_TEMPLATE_FILES.has(n)) return false;
  }
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    let obj;
    try {
      obj = JSON.parse(readFileSync(join(dir, n), "utf8").replace(/^\uFEFF/, ""));
    } catch {
      return false;
    }
    if (hasNumericId(obj)) return false;
  }
  return true;
}

/** 找遍键名和值，任何孤零零的 5~11 位数字都算 */
function hasNumericId(obj, re = /^\d{5,11}$/) {
  if (Array.isArray(obj)) return obj.some((v) => (typeof v === "string" ? re.test(v.trim()) : hasNumericId(v, re)));
  if (obj && typeof obj === "object") {
    return Object.entries(obj).some(
      ([k, v]) => re.test(k.trim()) || (typeof v === "string" ? re.test(v.trim()) : hasNumericId(v, re)),
    );
  }
  return false;
}

/** 体积大或无用的产物 */
const JUNK_SUFFIX = [".log", ".tmp", ".bak", ".corrupt-", ".tsbuildinfo"];

/** 只对文本文件做内容扫描 */
const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".json", ".ts", ".ps1", ".bat", ".cmd", ".sh",
  ".md", ".txt", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".env", ".gitignore",
]);

/** 已按 FORBIDDEN_PATHS 判为错误、且必然不干净的目录，不再逐文件扫内容，避免第三方代码刷屏 */
const SKIP_CONTENT_DIRS = new Set(["napcat", "node_modules", ".git", "data", "cards-assets", "backups"]);
/**
 * 内容扫描规则。每条命中都尽量做到「零误报」，宁可漏报也不要给出一堆假警报，
 * 否则没人愿意看第二次。
 */
const CONTENT_RULES = [
  {
    id: "hex-secret",
    // 32 位十六进制：MD5 形态的 token / 密钥。config.example.json 里是空串，不会命中。
    re: /\b[0-9a-f]{32}\b/gi,
    why: "疑似密钥/接入 token（32 位十六进制）",
    allow: [],
  },
  {
    id: "windows-abspath",
    // 绝对本机路径会暴露盘符结构和你的目录名。
    // 前面加 (?<![A-Za-z]) 是为了不把 PowerShell 的注册表驱动器当成盘符：
    // "HKLM:\SOFTWARE\..." 里若不排除，会从 "M:\" 开始命中，误报一片；
    // 同样也把 "https://" 里的 "s:/" 挡掉。
    // **正斜杠版本必须一起匹配**：`F:/项目/xxx` 和 `F:\项目\xxx` 是同一条路径，
    // 早先只认反斜杠，于是我自己写死在源码里的素材目录就这么一路混进了分享包，
    // 扫描还报「已通过」。少写一个字符的差别，是这类扫描最典型的失效方式。
    // 分隔符用 {1,2}：JSON 字符串里同一个反斜杠会被转义成两个，
    // 只认单个的话，路径在 JSON 里就只剩个光秃秃的 `D:\` 可匹配，白名单也跟着失效。
    re: /(?<![A-Za-z])[A-Za-z]:[\\/]{1,2}(?:[^\s"'`\\<>|*?]+[\\/]{1,2})*[^\s"'`\\<>|*?]*/g,
    why: "绝对本机路径（会暴露盘符与目录名，请改成占位示例）",
    // 文档里示意「素材可以放在项目外」用的通用占位，不是任何人的真实目录。
    // 白名单是显式的：往里加东西等于声明「这个路径不含隐私」，会被 code review 看到。
    allow: [
      "D:\\Media\\MyCards",
      "D:\\Media\\ab",
      "<某个绝对路径>",
    ],
  },
  {
    id: "file-uri",
    // file:// 后面的路径和上面一样是本机路径，只是换了个写法的马甲。
    re: /file:\/\/[^\s"'`<>|*?]+/g,
    why: "file:// 本机路径（会暴露目录名，请改成占位示例）",
    // 模板字符串拼出来的 file://（路径来自变量，源码里并没有真实目录）不是泄露。
    allow: ["file:///${"],
  },
  {
    id: "unc-path",
    // \\主机\共享：网络位置同样是本机/内网拓扑信息。
    // 主机名后面挂 (?![uU][0-9a-fA-F]{4}) 是必需的：JS/JSON 里的 "\u8bbe" 转义
    // 在文件里长得就是「两个反斜杠 + 一个字母」，不限这一下的话，
    // 控制台页面里每一个中文转义都会报成 UNC 路径（实测一次误报十几条）。
    // 已知取舍：JSON 字符串里被转义成双反斜杠的 UNC 抓不到。宁可漏这一种。
    re: /\\\\[A-Za-z0-9_$](?![uU][0-9a-fA-F]{4})[\w$.-]*(?:\\[\w$ .-]+)+\\/g,
    why: "UNC 网络路径（会暴露内网主机名与共享名）",
    allow: [],
  },
  {
    id: "owner-id",
    // 文档/示例里写出「当前主人是 123456789」——别人 clone 后你就成了别人的主人
    re: /(?<![\d.])\d{7,11}(?![\d.])/g,
    why: "出现 7~11 位数字（很可能是 QQ 号，请改成占位号）",
    // 源码里全是哈希常量（2166136261 之类），只在该行确实在谈「号」时才报警
    lineMustMatch: /qq|uin|admin|owner|主人|白名单|群号|账号|号\b/i,
    allow: [
      // 占位号
      "123456789", "1234567890", "100000000", "12345678",
      "000000000", "111111111", "3945188114",
      // FNV-1a 32 位哈希素数与乘数
      "2166136261", "16777619",
    ],
  },
];

/** 目录遍历，跳过符号链接与常见大目录 */
function walk(root, rel = "", out = [], skipDirs = new Set()) {
  const abs = join(root, rel);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const childRel = rel ? join(rel, e.name) : e.name;
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      walk(root, childRel, out, skipDirs);
    } else if (e.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

function looksLikeJunk(name) {
  return JUNK_SUFFIX.some((s) => name.includes(s));
}

/**
 * 路径归一化：把连续反斜杠压成一个。
 * 白名单里写的是源码/文档里的形态（单反斜杠），而同样的路径写进 JSON 字符串
 * 会被转义成双反斜杠；不归一化就比对，白名单等于只对一半文件生效。
 */
const normPath = (s) => s.replace(/\\+/g, "\\");

/** 用正则找命中，同时跳过白名单里的确切字符串 */
function findHits(text, re, allow) {
  const hits = [];
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  while ((m = rx.exec(text)) !== null) {
    const raw = m[0];
    const n = normPath(raw);
    if (allow.some((a) => n === normPath(a) || n.startsWith(normPath(a)))) continue;
    hits.push(raw);
    if (m.index === rx.lastIndex) rx.lastIndex += 1; // 防止零宽匹配死循环
  }
  return hits;
}

/**
 * 扫描一个目录，返回 { errors, warnings, scanned }。
 * errors 非空说明「现在发出去会泄露」，必须先处理。
 */
export function scanDir(targetDir) {
  const root = resolve(targetDir);
  const errors = [];
  const warnings = [];
  if (!existsSync(root)) {
    return { errors: [{ file: targetDir, rule: "missing", detail: "目录不存在" }], warnings, scanned: 0 };
  }

  // 1) 硬性排除项
  for (const { p, why, okIf } of FORBIDDEN_PATHS) {
    const abs = join(root, p);
    if (!existsSync(abs)) continue;

    // 条件放行：client/data 的去号模板是合法的
    if (okIf) {
      let ok = false;
      try { ok = !!okIf(root, p); } catch { ok = false; }
      if (ok) continue;
    }

    let count = 0;
    try {
      if (statSync(abs).isDirectory()) {
        // assets/ 允许留说明文件，只数真正不该带的
        const all = walk(root, p);
        const bad = p === "assets" ? all.filter((f) => !isAssetsAllowed(f.replace(/\\/g, "/"))) : all;
        count = bad.length;
        if (!count && p === "assets") continue;
        // client/data 判错时要说清是「哪些文件带了号」，而不是只报个数
        if (p === "client/data" && count) {
          const dirty = all.filter((f) => {
            const n = f.split(sep).pop();
            if (!DATA_TEMPLATE_FILES.has(n)) return true;
            try { return hasNumericId(JSON.parse(readFileSync(join(root, f), "utf8"))); } catch { return true; }
          });
          if (dirty.length) {
            const names = dirty.map((f) => f.split(sep).pop());
            const shown = names.slice(0, 6).join("、");
            errors.push({
              file: p,
              rule: "forbidden-path",
              detail: `${why}（带号/多余的文件 ${names.length} 个：${shown}${names.length > 6 ? " 等" : ""}）`,
            });
            continue;
          }
        }
      } else {
        count = 1;
      }
    } catch {
      count = 1;
    }
    errors.push({ file: p, rule: "forbidden-path", detail: `${why}（命中 ${count} 个文件）` });
  }

  // 2) 内容扫描（已判为 forbidden 的目录不再逐文件看，避免第三方代码刷屏）
  const files = walk(root, "", [], SKIP_CONTENT_DIRS);
  for (const rel of files) {
    const name = rel.split(sep).pop();
    if (looksLikeJunk(name)) {
      // 自动备份/损坏隔离文件里是**完整的真实数据**（checkins.json.bak-* 里全是
      // 真实 QQ 和积分）。之前这里只报 warning，于是 .bak 文件能一路混进分享包，
      // 泄漏扫描还显示「已通过」——比不扫更危险。现在一律判错。
      const isBackup = /\.(bak|corrupt)-/.test(name) || name.includes(".bak-");
      (isBackup ? errors : warnings).push({
        file: rel,
        rule: isBackup ? "backup-file" : "junk-file",
        detail: isBackup
          ? "自动备份/损坏隔离文件，里面是完整的真实数据，绝不能分享"
          : "日志/临时文件，没有分享价值",
      });
      continue;
    }
    if (!TEXT_EXT.has(extname(name).toLowerCase())) continue;

    let text;
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (text.includes(" ")) continue; // 二进制残留

    for (const rule of CONTENT_RULES) {
      // 逐行应用，便于用 lineMustMatch 收窄误报
      const lines = text.split(/\r?\n/);
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (rule.lineMustMatch && !rule.lineMustMatch.test(line)) continue;
        const hits = findHits(line, rule.re, rule.allow);
        if (!hits.length) continue;
        errors.push({
          file: rel,
          rule: rule.id,
          line: li + 1,
          detail: `${rule.why}：${[...new Set(hits)].slice(0, 3).join(" / ")}`,
        });
      }
    }
  }

  return { errors, warnings, scanned: files.length };
}

/** CLI */
function main() {
  const target = process.argv[2] || resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const { errors, warnings, scanned } = scanDir(target);

  console.log(`[leak-scan] 扫描 ${scanned} 个文件：${target}`);

  if (warnings.length) {
    console.log("");
    console.log(`[!] ${warnings.length} 项建议清理（不阻塞分享）：`);
    for (const w of warnings.slice(0, 20)) console.log(`  - ${w.file}：${w.detail}`);
    if (warnings.length > 20) console.log(`  ... 另有 ${warnings.length - 20} 项`);
  }

  if (errors.length) {
    console.log("");
    console.log(`[X] ${errors.length} 项会导致个人信息泄露，必须处理后才能分享：`);
    for (const e of errors) console.log(`  - ${e.file}：${e.detail}`);
    console.log("");
    console.log("处理方式：");
    console.log("  1. 直接运行 node scripts/make-share.mjs 生成一份已剔除隐私的干净副本；");
    console.log("  2. 或参考上面每条的 detail 手动排除对应文件。");
    process.exit(1);
  }

  console.log("");
  console.log("[OK] 未发现会泄露的个人信息，可以分享。");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).pop() || "")) {
  main();
}
