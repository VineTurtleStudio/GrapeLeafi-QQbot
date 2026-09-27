// console/http.js —— 控制台 HTTP 层：访问来源判定、token 鉴权、同源检查、请求体读取、JSON 响应。
// 与业务路由无关，单独抽出后可以只测这一层的安全判定，不必拉起整个 server。

export function isLoopbackHost(hostname) {
  const value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return value === "localhost" || value === "::1" || /^127(?:\.\d{1,3}){3}$/.test(value);
}

export function hostAllowed(req, configuredHost, boundPort, token) {
  let parsed;
  try {
    parsed = new URL("http://" + String(req.headers.host || ""));
  } catch {
    return false;
  }
  const hostname = parsed.hostname;
  if (isLoopbackHost(configuredHost)) {
    const port = Number(parsed.port || 80);
    if (port !== Number(boundPort)) return false;
    return isLoopbackHost(hostname);
  }
  return Boolean(token);
}

export function authOk(req, token) {
  if (!token) return true;
  const url = new URL(req.url, "http://x");
  const q = url.searchParams.get("token");
  if (q && q === token) return true;
  return req.headers["x-console-token"] === token;
}

// 控制台页面/接口的通用安全响应头。
// Referrer-Policy: no-referrer 尤其重要：token 可以用 ?token= 传，
// 页面里又有 <img src="/api/cards/asset?token=..."> 这类带 token 的地址，
// 不设 no-referrer 的话，token 会随着 Referer 头发给任何外部地址
// （本页没主动引外链，但浏览器扩展、用户点到别的页都可能带上）。
export function securityHeaders(extra) {
  return Object.assign(
    {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
    extra || {}
  );
}

// token 猜错时的限速。之前 authOk 失败就直接 401，可以无限次暴力猜；
// 控制台一旦绑到 0.0.0.0（手机/局域网访问就必须这么绑）就是暴露在同网段里，
// 没有限速等于把 token 摆在那里被人一个个试。
// 规则：同一来源 IP 在窗口期内失败达到阈值就短暂锁死；成功后立刻清零，
// 所以主人输错一次不会牵连后面输对。
export function createAuthLimiter({ windowMs = 60_000, max = 8, lockMs = 120_000 } = {}) {
  const hits = new Map();
  const prune = (now) => {
    for (const [k, v] of hits) {
      if (v.until && v.until <= now) hits.delete(k);
      else if (!v.until && now - v.first > windowMs) hits.delete(k);
    }
  };
  return {
    // 返回剩余锁死毫秒数；0 表示这次允许通过。
    check(key, now = Date.now()) {
      prune(now);
      const v = hits.get(key);
      if (v && v.until && v.until > now) return v.until - now;
      return 0;
    },
    fail(key, now = Date.now()) {
      const v = hits.get(key);
      if (!v || v.until) hits.set(key, { first: now, count: 1, until: 0 });
      else v.count += 1;
      const cur = hits.get(key);
      if (cur && cur.count >= max) cur.until = now + lockMs;
    },
    ok(key) {
      hits.delete(key);
    },
  };
}

export function clientKey(req) {
  return String(req.socket?.remoteAddress || req.headers["x-forwarded-for"] || "unknown");
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function readBody(req, res, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const stopForLargeBody = () => {
      if (stopped) return;
      stopped = true;
      const err = new Error("请求体过大");
      err.statusCode = 413;
      err.handled = true;
      req.pause();
      if (res && !res.headersSent) sendJson(res, 413, { ok: false, error: "payload_too_large" });
      reject(err);
    };
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      stopForLargeBody();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      if (stopped) return;
      size += chunk.length;
      if (size > maxBytes) {
        chunks.length = 0;
        stopForLargeBody();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (stopped) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, securityHeaders(Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})));
  res.end(body);
}

