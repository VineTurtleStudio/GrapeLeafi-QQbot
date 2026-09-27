// 生成一份「去个人化」的干净副本，用来分享给别人（像 GitHub 上的项目那样）。
//
// 做法很直接：把该带的（源码、示例配置、说明书、启动脚本）拷到目标目录，
// 该不带的一律不带——你自己的 config.json、运行期数据、整包 NapCat、依赖。
// 拷完再跑一遍 leak-scan 复查，确认产物真的干净。
//
// 用法：
//   node scripts/make-share.mjs                    拷到 ../GrapeLeafi-QQbot-share
//   node scripts/make-share.mjs <目标目录>           指定输出目录
//   node scripts/make-share.mjs <目标目录> --zip     额外打成 zip
//   node scripts/make-share.mjs <目标目录> --force   覆盖已存在的输出目录

import {
  cpSync, rmSync, existsSync, mkdirSync, readdirSync, statSync,
  writeFileSync, copyFileSync,
} from "node:fs";
import { join, resolve, relative, basename, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { scanDir } from "./leak-scan.mjs";
import { buildDataTemplate } from "./data-template.mjs";

/** 素材分类清单：与 client/src/assets-path.js 保持一致 */
const ASSET_CATEGORIES = [
  { dir: "cards", name: "卡牌图库", desc: "每个子目录是一个卡包，内含 Icon / Card / Detail 三种图" },
  { dir: "keyword", name: "关键字自动回复配图", desc: "content.json 的 keywords 里按目录引用" },
  { dir: "lottery", name: "扭蛋 / 抽奖配图", desc: "按稀有度命名会被自动识别" },
  { dir: "birthday", name: "生日提醒配图", desc: "按角色名或系列名匹配" },
  { dir: "ui", name: "界面与立绘", desc: "控制台、签到卡等自绘素材" },
  { dir: "misc", name: "其它", desc: "暂时没归类但要留着的" },
];

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(here, "..");

/** 单个文件不带（无论在哪个目录） */
const SKIP_FILES = new Set(["config.json", ".DS_Store", "Thumbs.db", "desktop.ini"]);

/** 目录名黑名单按整段匹配，避免误伤源码目录 */
const SKIP_DIR_NAMES = new Set([
  ".git", "node_modules", "bot", "data", "cards-assets", "backups", "dist", "build", ".cache", "logs", ".vscode", ".idea",
  // 素材不进分享包：体积大（实测 2GB），而且绝大部分是他人作品，
  // 转发出去等于替别人分发他们的素材。里面只保留 assets/README.md 当说明。
  "assets",
]);

const JUNK_SUFFIX = [".log", ".tmp", ".bak", ".corrupt-", ".tsbuildinfo"];

function isJunk(name) {
  return JUNK_SUFFIX.some((s) => name.includes(s));
}

function shouldSkipFile(name) {
  return SKIP_FILES.has(name) || isJunk(name) || name.endsWith(".swp") || name.endsWith("~");
}

/**
 * 递归拷贝，跳过黑名单。
 * 用 cpSync 逐目录做，这样被跳过的目录连遍历都省了（大头是 bot/ 和 node_modules/）。
 */
function copyClean(srcDir, dstDir, stats) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const name = entry.name;
    const src = join(srcDir, name);
    const dst = join(dstDir, name);

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(name)) { stats.skippedDirs.push(relative(ROOT, src)); continue; }
      copyClean(src, dst, stats);
    } else if (entry.isFile()) {
      if (shouldSkipFile(name)) { stats.skippedFiles.push(relative(ROOT, src)); continue; }
      copyFileSync(src, dst);
      stats.copied++;
    }
  }
}

function parseArgs(argv) {
  const positional = [];
  let zip = false;
  let force = false;
  for (const a of argv) {
    if (a === "--zip") zip = true;
    else if (a === "--force") force = true;
    else positional.push(a);
  }
  return { target: positional[0], zip, force };
}

function dirSizeMB(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        try { total += statSync(p).size; } catch { /* 忽略 */ }
      }
    }
  }
  return (total / 1024 / 1024).toFixed(1);
}

function main() {
  const { target, zip, force } = parseArgs(process.argv.slice(2));
  const out = resolve(target || join(ROOT, "..", `${basename(ROOT)}-share`));

  if (existsSync(out)) {
    if (!force) {
      console.error(`输出目录已存在：${out}`);
      console.error("加 --force 覆盖，或换一个目录名。");
      process.exit(1);
    }
    console.log(`[!] 覆盖已存在的输出目录：${out}`);
    rmSync(out, { recursive: true, force: true });
  }

  console.log(`[make-share] 源目录  ：${ROOT}`);
  console.log(`[make-share] 输出目录：${out}`);
  console.log("");

  const stats = { copied: 0, skippedDirs: [], skippedFiles: [] };
  copyClean(ROOT, out, stats);

  // bot/ 被跳过了，别人要自己下载 NapCat。留一份说明，免得以为项目坏了。
  mkdirSync(join(out, "bot"), { recursive: true });
  const botNote = [
    "本目录不包含 bot/ （NapCat 协议端，约 90MB 的第三方程序）。",
    "",
    "首次使用请在项目根目录双击 install.bat，它会自动下载并安装 NapCat；",
    "或参考 README「安装」一节手动下载。",
    "",
  ].join("\n");
  writeFileSync(join(out, "bot", "PLACE_NAPCAT_HERE.txt"), botNote, "utf8");

  // assets/ 同理：素材不进包，只留分类说明。
  mkdirSync(join(out, "assets"), { recursive: true });
  for (const cat of ASSET_CATEGORIES) mkdirSync(join(out, "assets", cat.dir), { recursive: true });
  const assetsNote = [
    "# 素材目录（本分享包不含任何图片）",
    "",
    "图片素材体积大，且大部分是他人作品（动画截图、官方立绘等），",
    " redistributing 会涉及别人的版权，所以分享包与 GitHub 仓库都不带实际图片。",
    "",
    "代码只依赖「相对本目录的路径」，所以你把自己的素材按下面的分类放进来即可：",
    "",
    ...ASSET_CATEGORIES.map((c) => `- \`${c.dir}/\` — ${c.name}：${c.desc}`),
    "",
    "卡包目录结构（由控制台「抽卡」页扫描，需严格对应）：",
    "",
    "```",
    "assets/cards/<卡包ID>/Icon/001-030/001i.png     缩略图",
    "assets/cards/<卡包ID>/Card/001-030/001.png      大图",
    "assets/cards/<卡包ID>/Detail/001-030/001d.jpg   详情图",
    "```",
    "",
    "编号区间目录不必严格按 30 一段，代码会按实际区间自动匹配（`721-731` 这种尾段也行）。",
    "文件名里的编号支持补零和不补零两种（`001i.png` 与 `1i.png` 都能识别）。",
    "",
    "放好之后在控制台「抽卡」页把「素材根目录」填成 `cards/<卡包ID>`，点「开始扫描」即可。",
    "",
  ].join("\n");
  writeFileSync(join(out, "assets", "README.md"), assetsNote, "utf8");

  // client/data/ 整个被跳过了，但那个目录里混着「你的创作」和「你的玩家数据」两种东西。
  // 直接留空的话，别人装完是个什么都没有的 bot——没有关键字、没有预设指令、没有生日表，
  // 真的只是个外壳。所以这里单独生成一份去个人化的数据模板：
  // 配置全保留（群号清空），玩家数据留空壳，然后严格校验产物里一个号码都不剩。
  console.log("[make-share] 生成去个人化的数据模板：");
  const dataOut = join(out, "client", "data");
  const dataResult = buildDataTemplate(join(ROOT, "client", "data"), dataOut, {
    log: (m) => console.log(`[data]${m}`),
  });
  console.log("");

  console.log(`[make-share] 已拷贝 ${stats.copied} 个文件，另生成 ${dataResult.files.length} 个数据模板；`);
  console.log(`[make-share] 跳过 ${stats.skippedDirs.length} 个目录、${stats.skippedFiles.length} 个文件：`);
  for (const d of stats.skippedDirs) console.log(`  - 目录 ${d}`);
  for (const f of stats.skippedFiles) console.log(`  - 文件 ${f}`);
  console.log("");
  console.log(`[make-share] 副本大小：${dirSizeMB(out)} MB`);

  // 复查产物
  console.log("");
  console.log("[make-share] 复查产物是否干净……");
  const { errors } = scanDir(out);
  if (errors.length) {
    console.error(`[X] 产物仍检出 ${errors.length} 项问题，已删除产物以免误发：`);
    for (const e of errors) console.error(`  - ${e.file}：${e.detail}`);
    rmSync(out, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("[OK] 产物已通过泄漏自检。");

  if (zip) {
    // 不引第三方依赖：用 PowerShell 的 Compress-Archive（Windows 自带）
    const zipPath = `${out}.zip`;
    if (existsSync(zipPath)) rmSync(zipPath, { force: true });
    const ps = `Compress-Archive -Path '${out}\\*' -DestinationPath '${zipPath}' -Force`;
    console.log("");
    console.log("[make-share] 打包 zip……");
    try {
      execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
      console.log(`[OK] 已生成 ${zipPath}`);
    } catch {
      console.error("[!] 打包失败，干净副本仍在上面那个目录里，可自行压缩。");
    }
  }

  console.log("");
  console.log("接下来：");
  console.log(`  1. 打开 ${out} 检查一遍；`);
  console.log("  2. 建议先自己装一遍、确认能跑，再发出去；");
  console.log("  3. 发之前记得把 README 里的项目名/描述改成自己的。");
}

main();
