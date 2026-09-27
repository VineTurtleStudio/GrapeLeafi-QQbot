import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Gateway } from "./gateway.js";
import { Sender } from "./antiRisk.js";
import { createBrain } from "./brain.js";
import { createConsole } from "./console.js";
import { Scheduler } from "./scheduler.js";
import { loadContent, safeAssign, scrubProtoKeysInPlace } from "./content.js";
import { loadConfigWithBootstrap } from "./bootstrap-config.js";
import { ensureGatewayToken, ensureNapCatWebuiToken, unfilledFields, adoptIdentityFromLogin } from "./setup.js";
import { saveJSON } from "./storage.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const configPath = resolve(process.env.BOT_CONFIG || join(__dirname, "..", "config.json"));
const examplePath = join(__dirname, "..", "config.example.json");

// 首次运行没有 config.json 时自动套用模板，让新人「双击就能跑」。
// 逻辑在 bootstrap-config.js 里（单独成文件是为了能写单测：本模块 import 无副作用）。
const loaded = loadConfigWithBootstrap(configPath, examplePath);
if (loaded.fatal) {
  console.error(loaded.fatal);
  process.exit(1);
}
if (loaded.bootstrapped) {
  console.warn("=========================================================");
  for (const w of loaded.warnings) console.warn(` ${w}`);
  console.warn("=========================================================");
} else {
  for (const w of loaded.warnings) console.warn(w);
}
const config = loaded.config;

// 接入 token 的唯一数据源就是本文件。
// 之前它要在 client/config.json 和 bot/napcat/config/onebot11*.json 里各写一遍，
// 两边不一致的表现只是「静默重连」，非常难查。现在自动生成 + 自动同步。
try {
  const r = ensureGatewayToken(config, configPath, {
    log: (m) => console.warn(m),
    saveConfig: () => saveJSON(configPath, config),
  });
  if (r.skipped) console.warn(`[setup] ${r.skipped}`);
} catch (err) {
  console.warn(`[setup] 接入 token 处理失败（${err.message}），不影响启动`);
}

// 管理页 token 也收到同一个文件里。NapCat 自带的默认值是可猜的，
// 而管理页能改配置、看消息；控制台一旦绑 0.0.0.0（手机访问）就是大门敞开。
try {
  const w = ensureNapCatWebuiToken(config, configPath, {
    log: (m) => console.warn(m),
    saveConfig: () => saveJSON(configPath, config),
  });
  if (w.skipped) console.warn(`[setup] ${w.skipped}`);
} catch (err) {
  console.warn(`[setup] 管理页 token 处理失败（${err.message}），不影响启动`);
}

// 首启清单：把「还没填、填了才能用」的项直接列出来，省得新人到处猜
const todo = unfilledFields(config);
if (todo.length) {
  console.warn("---------------------------------------------------------");
  console.warn(" 还有这些没填（也可以直接在控制台「设置」页填）：");
  for (const f of todo) {
    console.warn(`  · ${f.label}（${f.path}）${f.required ? "" : "，可留空自动生成"}：${f.hint}`);
  }
  console.warn("---------------------------------------------------------");
}

// 分享出去的人不该再手动填机器人的自称：谁扫码登录了，这个 bot 就叫什么。
// 首次连上协议端时用 get_login_info 把 nickname 补上。
let identityAdopted = false;
async function adoptIdentityOnce() {
  if (identityAdopted) return;
  identityAdopted = true; // 先置位，避免并发的多次 connect 重复触发
  try {
    const login = await gateway.call("get_login_info", {}, 10000);
    const r = adoptIdentityFromLogin(config, login);
    if (!r.changed) return;
    saveJSON(configPath, config);
    brain.applyBotConfig?.(config.bot);
    logger.info(`[setup] 已用登录的 QQ ${r.adminId} 的昵称补上 ${r.filled.join(" / ")}（${r.nickname}）`);
  } catch (err) {
    identityAdopted = false; // 这次没成，等下次协议端重连再试
    logger.warn(`[setup] 没能自动取到登录信息（${err.message}）；机器人的自称可以在控制台「设置」页改`);
  }
}

const napcatMode = String(config?.bot?.napcat?.mode || "qr").toLowerCase();
if (napcatMode === "password") {
  console.warn("[setup] 登录方式为 password（账号密码）。注意：密码登录会明显提高风控概率，");
  console.warn("        腾讯常返回「需要验证码」或「需要新设备验证」，这两种都必须人工处理，程序无法自动绕过。");
  console.warn("        详见 README「登录方式与风控」。若 password 为空会自动回退到扫码登录。");
}

const startedAt = Date.now();
const BUILD = "2026-09-21a";
const gateway = new Gateway(config.gateway);
const sender = new Sender(gateway, config.antiRisk);
const brain = createBrain({ sender, gateway, config: config.bot, dataDir, startedAt });
const scheduler = config.scheduler?.enabled === false ? null : new Scheduler({
  sender,
  getContent: () => loadContent(dataDir),
  quietHours: config.bot?.quietHours,
  checkEverySec: config.scheduler?.checkEverySec || 20,
  dataDir,
});
try {
  const rg = loadContent(dataDir)?.settings?.riskgate;
  if (rg && Object.keys(rg).length) {
    const r = sender.setRuntime(rg);
    logger.info(`[antiRisk] 已按控制台配置应用风控运行时参数 ${r.applied} 项`);
  }
} catch (err) {
  logger.error(`[antiRisk] 读取风控配置失败: ${err.message}`);
}
const consoleApp = createConsole({
  config: config.console,
  // 完整配置 + 配置文件路径：控制台的「设置」页要能读写 config.json（换主人等）
  fullConfig: config,
  configPath,
  saveConfig: (next) => {
    // 走 storage 的原子写 + 自动备份，避免手滑把配置写坏
    scrubProtoKeysInPlace(next);
    saveJSON(configPath, next);
    // 内存里的引用也要换掉，否则下次读还是旧值
    for (const k of Object.keys(config)) delete config[k];
    // safeAssign：Object.assign 走 [[Set]]，遇到 __proto__ 会替换 config 的原型
    safeAssign(config, next);
    // bot 段热重载：换主人/改昵称/调限流立即生效，不用重启
    brain.applyBotConfig?.(config.bot);
    scheduler?.setQuietHours?.(config.bot?.quietHours);
    scheduler?.setCheckEverySec?.(config.scheduler?.checkEverySec);
    logger.info(`[config] 配置已保存并热重载（主人: ${(config.bot?.adminIds || []).join(", ") || "未设置"}）`);
    return config;
  },
  sender,
  gateway,
  dataDir,
  reloadAll: () => brain.reload(),
  getStatus: () => ({ startedAt, build: BUILD }),
});

gateway.on((body) => {
  if (body.post_type === "meta_event") {
    if (body.meta_event_type === "lifecycle" && body.sub_type === "connect") {
      logger.info("[gateway] 协议端已接入 (OneBot v11 reverse websocket)");
      adoptIdentityOnce().catch(() => {});
    }
    return;
  }
});

gateway.on(brain);

process.on("SIGINT", async () => {
  console.log("\n正在退出…");
  scheduler?.stop();
  await consoleApp.stop().catch(() => {});
  await gateway.stop().catch(() => {});
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  console.error("[main] 未处理的异步错误:", err);
});

senderMonitor();

async function senderMonitor() {
  while (true) {
    await new Promise((r) => setTimeout(r, 30000));
    const s = gateway.socket ? "已连接" : "未连接";
    const stats = sender.stats();
    const mute = Date.now() < stats.softMuteUntil ? `| 软静默ON(${Math.ceil((stats.softMuteUntil - Date.now()) / 1000)}s)` : "";
    logger.info(
      `[status] 协议端:${s} | 已发送:${stats.sent} 丢弃:${stats.dropped} 队列:${stats.queue} 今日:${stats.daily}/${stats.dailyCap} 惩罚倍率:${stats.penalty}${mute}`
    );
  }
}

try {
  await gateway.start();
} catch (err) {
  if (err && err.code === "EADDRINUSE") {
    logger.error(
      `[gateway] 端口 ${config.gateway.port} 已被占用：很可能已有一个客户端实例在运行（旧实例仍在收发消息）。` +
        `请先运行 scripts\\stop.bat 关闭所有客户端，再重新启动。`
    );
    process.exit(1);
  }
  throw err;
}
logger.info(`[gateway] 反向 WS 服务已启动 ws://${config.gateway.host}:${config.gateway.port}${config.gateway.path}`);
scheduler?.start();
try {
  await consoleApp.start();
} catch (err) {
  logger.error(`[console] 管理台启动失败（不影响机器人运行）: ${err.message}`);
}
logger.info(`[main] 就绪（构建 ${BUILD}），等待 NapCat 接入… 双击 start.bat 或运行 scripts\\start-napcat.ps1 并扫码登录`);