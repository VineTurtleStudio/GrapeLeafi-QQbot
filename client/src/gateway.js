import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { logger } from "./logger.js";

export class Gateway {
  constructor({ host, port, path, accessToken }) {
    this.host = host;
    this.port = port;
    this.path = path;
    this.accessToken = accessToken;
    this.pending = new Map();
    this.handlers = new Set();
    this.sockets = new Set();
    this.socket = null;
    this.httpServer = null;
    this.wss = null;
  }

  get connected() {
    return [...this.sockets].some((s) => s.readyState === 1);
  }

  #activeSocket() {
    let latest = null;
    for (const s of this.sockets) {
      if (s.readyState === 1) latest = s;
    }
    return latest;
  }

  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  off(fn) {
    this.handlers.delete(fn);
  }

  async start() {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ server: this.httpServer, path: this.path, maxPayload: 32 * 1024 * 1024 });
    this.wss.on("connection", (socket, req) => this.#handleConnection(socket, req));
    // ws 会把 httpServer 的 error 原样转发到 wss 上再 emit 一次。
    // 而它注册监听的时间早于下面那个 reject，所以端口被占用时，
    // wss 先 emit 'error' 而此刻还没人监听 → Node 直接抛未捕获异常，
    // main.js 里那段友好的「端口已被占用」提示根本没机会跑到，
    // 打印出来的只有一坨 stack trace，而且进程在控制台启动之前就死了
    // （控制台在 gateway 之后才 start），于是「控制台也打不开」是这个 bug 的连锁反应。
    // 这里先把 wss 的 error 吃掉，让错误走下面 httpServer 的 reject 正常返回给调用方。
    this.wss.on("error", () => {});
    try {
      await new Promise((resolve, reject) => {
        this.httpServer.once("error", reject);
        this.httpServer.listen(this.port, this.host, () => {
          this.httpServer.off("error", reject);
          resolve();
        });
      });
    } catch (err) {
      // 听失败就把半成品收干净，别留下一个悬着的 wss 引用。
      this.wss = null;
      this.httpServer = null;
      throw err;
    }
  }

  async stop() {
    for (const timer of this.pending.values()) clearTimeout(timer.timer);
    this.pending.clear();
    if (!this.wss || !this.httpServer) return;
    for (const client of this.wss.clients) client.close();
    await new Promise((resolve) => this.wss.close(() => resolve()));
    await new Promise((resolve) => this.httpServer.close(() => resolve()));
  }

  #handleConnection(socket, req) {
    if (this.accessToken) {
      const header = req.headers["authorization"] || "";
      const token = header.replace(/^Bearer\s+/i, "");
      if (token !== this.accessToken) {
        // 这里以前一声不吭就 close(1008)。后果是：NapCat 用旧 token 连上来被拒，
        // 控制台只显示「未连接」，日志里却什么都没有——「没配」和「token 不对」
        // 长得一模一样，只能靠猜。现在把两边各打一半，但绝不回显 token 本身。
        logger.warn(
          `[gateway] 拒绝了一条反向 WS 连接：token 不匹配（来自 ${req.socket?.remoteAddress || "?"}）。` +
            `多半是另一个项目目录的 NapCat 正连着同一个端口，或 NapCat 配置里的 token 与本目录 client/config.json 不一致；` +
            `把那个 NapCat 关掉，或让它用本目录 client/config.json 的 gateway.accessToken。`
        );
        socket.close(1008, "unauthorized");
        return;
      }
    }
    logger.info(`[gateway] 协议端已连上 (${req.socket?.remoteAddress || "?"})`);
    this.sockets.add(socket);
    this.socket = socket;
    socket.on("message", (raw) => this.#dispatch(raw));
    socket.on("close", () => {
      const wasCurrent = this.socket === socket;
      this.sockets.delete(socket);
      if (wasCurrent) this.socket = this.#activeSocket();
      logger.warn(`[gateway] 协议端已断开${wasCurrent && this.socket ? "，已切换到另一个连接" : ""}，现在发不出消息`);
    });
    socket.on("error", () => {});
  }

  #dispatch(raw) {
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }
    if (payload.echo != null) {
      const waiter = this.pending.get(String(payload.echo));
      if (waiter) {
        this.pending.delete(String(payload.echo));
        clearTimeout(waiter.timer);
        if (payload.retcode === 0 || payload.status === "ok") {
          waiter.resolve(payload.data ?? null);
        } else {
          waiter.reject(new Error(`${payload.status ?? "failed"}:${payload.retcode ?? -1}`));
        }
      }
      return;
    }
    for (const fn of this.handlers) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[gateway] handler error:", err);
      }
    }
  }

  call(action, params = {}, timeoutMs = 20000) {
    const socket = this.#activeSocket();
    if (!socket) {
      return Promise.reject(new Error("gateway: not connected"));
    }
    const echo = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error(`gateway: action ${action} timeout`));
      }, timeoutMs);
      this.pending.set(echo, { resolve, reject, timer });
      socket.send(JSON.stringify({ action, params, echo }), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(echo);
          reject(err);
        }
      });
    });
  }
}