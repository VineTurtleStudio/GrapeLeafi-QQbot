// console.js —— 控制台 HTTP 服务与路由表。
// 页面本体在 console/page.js（由 console/page/* 拼接），HTTP 工具在 console/http.js，
// content 合并与 config 读写校验在 console/config-api.js。
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { logger } from "./logger.js";
import { getContent, saveContent, resetContentCache, getVersion } from "./content.js";
import { loadCardsMeta, saveCardsMeta, scanCardsDir, cardImagePath } from "./cards.js";
import { scanLotteryImages, scanDirImages, parseImageDirs } from "./games.js";
import { normalizeAnimeConfig, resolveAnimeImage } from "./builtins/net.js";
import { PAGE } from "./console/page.js";
import { CMD_CATEGORY } from "./brain-registry.js";
import { isLoopbackHost, hostAllowed, authOk, sameOrigin, readBody, sendJson, createAuthLimiter, clientKey, securityHeaders } from "./console/http.js";
import { mergeArrayById, applyDeletions, SECRET_PATHS, setPath, maskSecrets, validateConfig } from "./console/config-api.js";
import { isUnfilled } from "./setup.js";

export function createConsole({ config = {}, fullConfig = null, configPath = null, saveConfig = null, sender, gateway, dataDir, reloadAll, getStatus }) {
  const { enabled = true, host = "127.0.0.1", port = 9632 } = config;
  // ****** 是模板里的「还没填」，不是密码。install.bat 会把 config.example.json
  // 原样复制成 config.json，于是新装的人手里就是 ******——以前这里直接取 config.token，
  // 把它当成真 token，于是 authOk 对每一个请求都要求 ?token=******，
  // 连 GET / 都被挡掉，浏览器打开控制台只有一个 401，控制台就此「用不了」。
  // 正确做法是跟 gateway.accessToken 一样先过 isUnfilled：空/占位符都按「没设」处理。
  // 顺带一提，占位符是 config.example.json 里的公开常量，拿它当密码本来也毫无意义。
  const token = isUnfilled(config.token) ? "" : String(config.token).trim();
  if (!enabled) return { start: async () => {}, stop: async () => {} };
  if (!isLoopbackHost(host) && !token) throw new Error("控制台绑定到非本机地址时必须配置访问 token");

  const servers = [];
  const animeTombstones = new Set();
  const authLimiter = createAuthLimiter();
  let boundPort = port;
  // 用可变引用持有「当前生效的配置」。保存后必须以保存结果为新基准——
  // 否则如果 saveConfig 返回的是新对象（而不是原地修改），下一次保存就会
  // 拿旧配置当基底，把上一次刚保存的改动悄悄冲掉。
  let baseConfig = fullConfig && typeof fullConfig === "object" ? fullConfig : {};

  try {
    const m = PAGE.match(/<script>([\s\S]*?)<\/script>/);
    if (m) new Function(m[1]);
  } catch (err) {
    logger.error(`[console] 内置页面脚本存在语法错误，控制台将无法工作：${err.message}`);
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    try {
      if (!hostAllowed(req, host, boundPort, token)) {
        sendJson(res, 403, { ok: false, error: "host_denied" });
        return;
      }
      // 猜错 token 的来源先锁一小会儿，别让人无限试。
      // 只在真的设了 token 时才有意义（没设 token 时 authOk 恒真，不该拦任何人）。
      if (token) {
        const key = clientKey(req);
        const locked = authLimiter.check(key);
        if (locked > 0) {
          sendJson(res, 429, { ok: false, error: "too_many_attempts" }, { "Retry-After": String(Math.ceil(locked / 1000)) });
          return;
        }
        if (!authOk(req, token)) {
          authLimiter.fail(key);
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        authLimiter.ok(key);
      }
      if (req.method === "POST" && !sameOrigin(req)) {
        sendJson(res, 403, { ok: false, error: "cross_origin_denied" });
        return;
      }
      if (req.method === "GET" && path === "/") {
        res.writeHead(200, securityHeaders({ "Content-Type": "text/html; charset=utf-8" }));
        res.end(PAGE.replace("window.__CONSOLE_TOKEN__ = '';", "window.__CONSOLE_TOKEN__ = " + JSON.stringify(token) + ";"));
        return;
      }
      if (req.method === "GET" && path === "/api/status") {
        sendJson(res, 200, {
          connected: typeof gateway.connected === "boolean" ? gateway.connected : Boolean(gateway.socket),
          stats: sender.stats(),
          uptimeSec: Math.round((Date.now() - (getStatus?.()?.startedAt || Date.now())) / 1000),
          pid: process.pid,
          port: boundPort,
          build: getStatus?.()?.build || "",
        });
        return;
      }
      if (req.method === "GET" && path === "/api/lan") {
        // 手机/局域网访问助手用。刻意不回传 token：页面自己已经持有 token
        // （window.__CONSOLE_TOKEN__），由前端拼 URL；这样即使这个接口被谁读到，
        // 也不会多泄露一份凭证。只给地址和「现在能不能被手机打开」的判断。
        const addrs = [];
        for (const list of Object.values(networkInterfaces())) {
          for (const ni of list || []) {
            if (ni.family !== "IPv4" || ni.internal) continue;
            addrs.push(ni.address);
          }
        }
        sendJson(res, 200, {
          host,
          port: boundPort,
          tokenRequired: Boolean(token),
          // 绑在回环地址上时手机根本连不上（手机访问必须 0.0.0.0），
          // 而绑 0.0.0.0 又强制要求 token——这两个条件是配套的。
          phoneReachable: !isLoopbackHost(host) && Boolean(token),
          addresses: addrs,
        });
        return;
      }
      if (req.method === "POST" && path === "/api/reset") {
        sender.reset?.();
        sendJson(res, 200, { ok: true, stats: sender.stats() });
        return;
      }
      if (req.method === "GET" && path === "/api/content") {
        resetContentCache();
        // cmdCategory 跟着内容一起下发：内置指令的分类只在 brain-registry.js 的
        // CMD_CATEGORY 里定义一份，页面直接读它做分组和跳转。
        // 以前页面拿不到分类表，只能在 BDEFS 里再抄一份 cat 字段，两边迟早会对不上，
        // 结果就是「某条指令没出现在任何分类里」这种没人能一眼看出原因的问题。
        sendJson(res, 200, { content: getContent(dataDir), __v: getVersion(), cmdCategory: CMD_CATEGORY });
        return;
      }
      if (req.method === "POST" && path === "/api/content") {
        const obj = await readBody(req, res);
        const posted = obj && obj.content !== undefined ? obj.content : obj;
        const deleted = Array.isArray(obj?.deleted) ? obj.deleted : [];
        const current = getContent(dataDir);
        const serverAnime = current.anime || {};
        for (const id of [...(Array.isArray(serverAnime.deletedIds) ? serverAnime.deletedIds : []), ...deleted]) {
          if (!String(id).startsWith("anime:")) continue;
          animeTombstones.add(String(id));
          if (animeTombstones.size > 500) animeTombstones.delete(animeTombstones.values().next().value);
        }
        const effectiveDeleted = [...new Set([...animeTombstones, ...deleted])];
        const merged = { ...current, ...posted };
        if (posted && typeof posted === "object" && Object.prototype.hasOwnProperty.call(posted, "anime")) {
          try {
            const postedAnime = posted.anime || {};
            const sources = applyDeletions(
              mergeArrayById(serverAnime.sources, postedAnime.sources, "animeSources"),
              effectiveDeleted,
              "animeSources"
            );
            merged.anime = normalizeAnimeConfig({ ...serverAnime, ...postedAnime, sources, deletedIds: effectiveDeleted });
          } catch (err) {
            sendJson(res, 400, { message: `二次元图片 API 配置无效：${err.message}` });
            return;
          }
        }
        if (typeof merged.settings === "object" && merged.settings) merged.settings = { ...(current.settings || {}), ...(merged.settings) };
        if (typeof merged.builtins === "object" && merged.builtins) merged.builtins = { ...(current.builtins || {}), ...(merged.builtins) };
        merged.presets = { ...(current.presets || {}), ...(posted?.presets || {}) };
        if (typeof merged.presets !== "object" || !merged.presets) merged.presets = {};
        merged.presets.commands = applyDeletions(mergeArrayById(current.presets && current.presets.commands, posted?.presets?.commands, "commands"), deleted, "commands");
        merged.presets.keywords = applyDeletions(mergeArrayById(current.presets && current.presets.keywords, posted?.presets?.keywords, "keywords"), deleted, "keywords");
        merged.schedule = Array.isArray(merged.schedule) ? applyDeletions(mergeArrayById(current.schedule, posted?.schedule, "schedule"), deleted, "schedule") : merged.schedule;
        saveContent(dataDir, merged);
        await reloadAll?.();
        try {
          const rg = merged.settings && merged.settings.riskgate;
          if (rg && sender && typeof sender.setRuntime === "function") {
            const r = sender.setRuntime(rg);
            logger.info(`[console] 风控运行时参数已应用 ${r.applied} 项`);
          }
        } catch (err) {
          logger.error(`[console] 应用风控参数失败: ${err.message}`);
        }
        sendJson(res, 200, { ok: true, __v: getVersion() });
        return;
      }
      if (req.method === "GET" && path === "/api/config") {
        sendJson(res, 200, maskSecrets(baseConfig));
        return;
      }
      if (req.method === "POST" && path === "/api/config") {
        if (!saveConfig) {
          sendJson(res, 400, { message: "当前实例未启用配置写入" });
          return;
        }
        const body = await readBody(req, res);
        const posted = body && body.config !== undefined ? body.config : body;
        if (!posted || typeof posted !== "object" || Array.isArray(posted)) {
          sendJson(res, 400, { message: "配置格式无效：需要是一个对象" });
          return;
        }
        const base = baseConfig;
        // 段内浅合并：页面只提交某一段时，不会把该段的其它字段冲掉
        const merged = { ...base };
        for (const [sec, val] of Object.entries(posted)) {
          const bothObj = val && typeof val === "object" && !Array.isArray(val)
            && base[sec] && typeof base[sec] === "object" && !Array.isArray(base[sec]);
          merged[sec] = bothObj ? { ...base[sec], ...val } : val;
        }
        // 只应用页面显式提交的敏感字段；未提交的一律保留磁盘上的原值
        const secrets = body && body.secrets && typeof body.secrets === "object" ? body.secrets : {};
        for (const [p, v] of Object.entries(secrets)) {
          if (SECRET_PATHS.indexOf(p) < 0) {
            sendJson(res, 400, { message: "不允许通过此接口修改字段：" + p });
            return;
          }
          setPath(merged, p, String(v == null ? "" : v));
        }
        const err = validateConfig(merged);
        if (err) {
          sendJson(res, 400, { message: err });
          return;
        }
        let saved = merged;
        try {
          const r = saveConfig(merged);
          if (r && typeof r === "object") saved = r;
        } catch (e) {
          sendJson(res, 500, { message: "保存配置失败：" + e.message });
          return;
        }
        baseConfig = saved;
        sendJson(res, 200, Object.assign({ ok: true }, maskSecrets(baseConfig)));
        return;
      }
      if (req.method === "POST" && path === "/api/anime/test") {
        const body = await readBody(req, res);
        if (!body || !body.source) {
          sendJson(res, 400, { message: "缺少图片源配置" });
          return;
        }
        let source;
        try {
          source = normalizeAnimeConfig({ sources: [body.source] }).sources[0];
        } catch (err) {
          sendJson(res, 400, { message: err.message });
          return;
        }
        if (!source.sfw) {
          sendJson(res, 400, { message: "测试前请先确认该接口为非18+" });
          return;
        }
        const current = getContent(dataDir);
        const timeoutSec = Number(body.timeoutSec) || Number(current.anime && current.anime.timeoutSec) || 15;
        const startedAt = Date.now();
        try {
          const result = await resolveAnimeImage(source, { timeoutSec });
          sendJson(res, 200, { ok: true, url: result.url, contentType: result.contentType, elapsedMs: Date.now() - startedAt });
        } catch (err) {
          sendJson(res, 502, { message: `接口不可用：${err.message}` });
        }
        return;
      }
      if (req.method === "GET" && path === "/api/logs") {
        const n = Number(url.searchParams.get("n") || 100);
        sendJson(res, 200, logger.lines(n).map((l) => l.text));
        return;
      }
      if (req.method === "GET" && path === "/api/cards") {
        const meta = loadCardsMeta(dataDir);
        sendJson(res, 200, { meta });
        return;
      }
      if (req.method === "POST" && path === "/api/cards") {
        const obj = await readBody(req, res);
        if (!obj || !Array.isArray(obj.meta && obj.meta.packs)) {
          sendJson(res, 400, { ok: false, error: "缺少卡牌库数据（meta.packs）" });
          return;
        }
        try {
          saveCardsMeta(dataDir, obj.meta);
          await reloadAll?.();
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
          return;
        }
        sendJson(res, 200, { ok: true, __v: getVersion() });
        return;
      }
      if (req.method === "GET" && path === "/api/cards/scan") {
        const root = url.searchParams.get("root") || "";
        sendJson(res, 200, scanCardsDir(root));
        return;
      }
      if (req.method === "GET" && path === "/api/cards/asset") {
        const root = url.searchParams.get("root") || "";
        const kind = url.searchParams.get("kind") || "icon";
        const id = String(url.searchParams.get("id") || "");
        if (!root || !id) {
          sendJson(res, 400, { ok: false, error: "缺少 root/id" });
          return;
        }
        let fp = null;
        try { fp = cardImagePath(root, kind, id); } catch (err) { fp = null; }
        if (!fp) { sendJson(res, 404, { ok: false, error: "素材文件不存在" }); return; }
        let buf = null;
        try { buf = readFileSync(fp); } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); return; }
        const ext = String(fp.split(".").pop()).toLowerCase();
        const ct = (ext === "jpg" || ext === "jpeg") ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
        res.writeHead(200, securityHeaders({ "Content-Type": ct }));
        res.end(buf);
        return;
      }
      if (req.method === "GET" && path === "/api/keyword-images") {
        const dirs = parseImageDirs(url.searchParams.get("dir") || "");
        const files = [];
        for (const dir of dirs) files.push(...scanDirImages(dir, { recursive: true }));
        sendJson(res, 200, {
          total: files.length,
          dirs: dirs.map((d) => d.replace(/[\\/]+$/, "") || d),
          sample: files.slice(0, 40).map((f) => {
            const base = dirs.find((d) => f.toLowerCase().startsWith(d.toLowerCase().replace(/[\\/]+$/, "") + "\\") || f.toLowerCase().startsWith(d.toLowerCase().replace(/[\\/]+$/, "") + "/"));
            const rel = base ? f.slice(base.replace(/[\\/]+$/, "").length).replace(/^[\\/]+/, "") : f;
            return rel;
          }),
        });
        return;
      }
      if (req.method === "GET" && path === "/api/lottery") {
        const dir = url.searchParams.get("dir") || "";
        const list = scanLotteryImages(dir).map((i) => ({ name: i.name, level: i.level, norm: i.norm }));
        sendJson(res, 200, list);
        return;
      }
      if (req.method === "POST" && path === "/api/test") {
        const body = await readBody(req, res);
        const type = body.type === "private" ? "private" : "group";
        const targetId = String(body.targetId || "");
        if (!targetId || !body.message) {
          sendJson(res, 400, { ok: false, reason: "missing targetId or message" });
          return;
        }
        const r = await sender.enqueue({ type, targetId, message: body.message, tag: "console-test" });
        sendJson(res, 200, r);
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      if (!err.handled && !res.headersSent && !res.destroyed) sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
    }
  };

  function listenOn(server, p, h) {
    return new Promise((resolve, reject) => {
      const onErr = (e) => {
        server.off("listening", onOk);
        reject(e);
      };
      const onOk = () => {
        server.off("error", onErr);
        resolve();
      };
      server.once("error", onErr);
      server.once("listening", onOk);
      server.listen(p, h);
    });
  }

  return {
    async start() {
      let p = port;
      let bound = false;
      for (let i = 0; i < 10 && !bound; i++) {
        const srv = createServer(handler);
        try {
          await listenOn(srv, p, host);
          p = srv.address()?.port || p;
          servers.push(srv);
          bound = true;
        } catch (err) {
          if (err.code === "EADDRINUSE") {
            logger.warn(`[console] 端口 ${p} 被占用，尝试 ${p + 1}`);
            p++;
            continue;
          }
          throw err;
        }
      }
      if (!bound) throw new Error(`无法绑定控制台端口（${port}~${port + 9} 均被占用）`);
      boundPort = p;
      if (port > 0 && p !== port) {
        logger.warn(`[console] 默认端口 ${port} 被占用，已改用 ${p}。若你不是有意开多个客户端，请关闭旧客户端实例（可用 scripts\\stop.bat）。`);
      }
      if (host === "127.0.0.1") {
        const v6 = createServer(handler);
        try {
          await listenOn(v6, p, "::1");
          servers.push(v6);
        } catch {}
      }
      logger.info(`[console] 管理台已开 http://127.0.0.1:${p}${token ? `（需 token，请用 http://127.0.0.1:${p}/?token=${token} 打开）` : "（未设 token，本机直接打开即可）"}`);
      logger.info("[console] 浏览器打开该地址即可管理预设指令/关键字/AI/定时任务");
    },
    get port() {
      return boundPort;
    },
    async stop() {
      for (const srv of servers) {
        await new Promise((resolve) => srv.close(() => resolve())).catch(() => {});
      }
    },
  };
}