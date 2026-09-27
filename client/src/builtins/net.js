import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const ANIME_MODES = new Set(["auto", "json", "text", "image"]);
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_IMAGE_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_REDIRECTS = 5;
const DNS_TIMEOUT_MS = 5000;
const BLOCKED_NETWORKS = { ipv4: new BlockList(), ipv6: new BlockList() };

for (const [network, prefix, family] of [
  ["0.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"],
  ["192.0.2.0", 24, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["198.51.100.0", 24, "ipv4"],
  ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"],
  ["240.0.0.0", 4, "ipv4"],
  ["::", 128, "ipv6"],
  ["::", 96, "ipv6"],
  ["::1", 128, "ipv6"],
  ["::ffff:0:0", 96, "ipv6"],
  ["64:ff9b::", 96, "ipv6"],
  ["64:ff9b:1::", 48, "ipv6"],
  ["100::", 64, "ipv6"],
  ["2001::", 23, "ipv6"],
  ["2001:2::", 48, "ipv6"],
  ["2001:db8::", 32, "ipv6"],
  ["2002::", 16, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"],
  ["ff00::", 8, "ipv6"],
]) {
  BLOCKED_NETWORKS[family].addSubnet(network, prefix, family);
}

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".home.arpa"];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const REQUEST_HEADERS = {
  Accept: "image/avif,image/webp,image/apng,image/*,application/json,text/plain,*/*;q=0.8",
  "Accept-Encoding": "identity",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
};

function isBlockedAddress(address) {
  const family = isIP(address);
  if (!family) return true;
  return BLOCKED_NETWORKS[family === 4 ? "ipv4" : "ipv6"].check(address, family === 4 ? "ipv4" : "ipv6");
}

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function parseHttpUrl(value, base) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || raw.length > 4096) throw new Error("URL 为空或过长");
  let url;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw new Error("URL 格式不正确");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("只允许 HTTP/HTTPS URL");
  if (url.username || url.password) throw new Error("URL 不能包含用户名或密码");
  if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
    throw new Error("只允许使用 80/443 端口");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error("不允许访问本机或内网地址");
  }
  const family = isIP(host);
  if (family && isBlockedAddress(host)) throw new Error("不允许访问本机、保留或内网地址");
  return url;
}

async function resolvePublicTarget(value, base, signal) {
  const url = parseHttpUrl(value, base);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const literalFamily = isIP(host);
  if (literalFamily) return { url, address: host, family: literalFamily, addresses: [{ address: host, family: literalFamily }] };

  const query = lookup(host, { all: true, verbatim: true });
  const addresses = await new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const onAbort = () => finish(reject, new Error("接口请求已取消"));
    const finish = (fn, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn(result);
    };
    timer = setTimeout(() => finish(reject, new Error("API 域名解析超时")), DNS_TIMEOUT_MS);
    query.then(
      (items) => finish(resolve, items),
      () => finish(reject, new Error("API 域名解析失败"))
    );
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
  if (!addresses.length) throw new Error("API 域名没有可用地址");
  for (const item of addresses) {
    if (isBlockedAddress(item.address)) throw new Error("API 域名解析到了本机、保留或内网地址");
  }
  const ordered = [...addresses].sort((a, b) => Number(b.family === 4) - Number(a.family === 4));
  const selected = ordered[0];
  return { url, address: selected.address, family: selected.family, addresses: ordered };
}

function requestOnce(target, signal) {
  const send = target.url.protocol === "https:" ? httpsRequest : httpRequest;
  const options = {
    method: "GET",
    agent: false,
    signal,
    headers: { ...REQUEST_HEADERS },
  };
  if (!isIP(target.url.hostname.replace(/^\[|\]$/g, ""))) {
    options.autoSelectFamily = true;
    options.autoSelectFamilyAttemptTimeout = 250;
    options.lookup = (hostname, lookupOptions, callback) => {
      if (lookupOptions?.all) callback(null, target.addresses);
      else callback(null, target.address, target.family);
    };
  }
  return new Promise((resolve, reject) => {
    const request = send(target.url, options, (response) => resolve({ request, response, url: target.url }));
    request.once("error", reject);
    request.end();
  });
}

async function requestPublic(rawUrl, signal) {
  let target = await resolvePublicTarget(rawUrl, undefined, signal);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const result = await requestOnce(target, signal);
    if (!REDIRECT_STATUSES.has(result.response.statusCode)) return result;
    const locationHeader = result.response.headers.location;
    const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
    result.response.destroy();
    if (!location) throw new Error(`HTTP ${result.response.statusCode} 缺少重定向地址`);
    if (redirects === MAX_REDIRECTS) throw new Error("接口重定向次数过多");
    target = await resolvePublicTarget(location, result.url, signal);
  }
  throw new Error("接口重定向次数过多");
}

function responseHeader(response, name) {
  return String(response.headers[name] || "").split(";")[0].trim().toLowerCase();
}

async function readLimitedBody(response, maxBytes) {
  const declared = Number(response.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.destroy();
    throw new Error("接口响应过大");
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response) {
      size += chunk.length;
      if (size > maxBytes) {
        response.destroy();
        throw new Error("接口响应过大");
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (err) {
    response.destroy();
    throw err;
  }
  return Buffer.concat(chunks, size);
}

function valueAtPath(value, path) {
  const parts = String(path || "").match(/[^.[\]]+/g) || [];
  let current = value;
  for (const part of parts) {
    if (current == null) return null;
    current = /^\d+$/.test(part) ? current[Number(part)] : current[part];
  }
  return current;
}

function findImageUrl(value, base, depth = 0) {
  if (depth > 8 || value == null) return null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!/^(?:https?:)?\/\//i.test(raw)) return null;
    try {
      return parseHttpUrl(raw, base).toString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item, base, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const keys = Object.keys(value);
  const preferred = /^(?:img|image|imgurl|imageurl|pic|photo|cover|thumb|original|url|src|file)$/i;
  keys.sort((a, b) => Number(preferred.test(b)) - Number(preferred.test(a)));
  for (const nextKey of keys) {
    const found = findImageUrl(value[nextKey], base, depth + 1);
    if (found) return found;
  }
  return null;
}

let canvasModule;

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return "";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp" && /avif|avis/i.test(buffer.subarray(8, 32).toString("latin1"))) return "image/avif";
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString("ascii") === "BM") return "image/bmp";
  return "";
}

function jpegDimensions(buffer) {
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2) break;
    if (startOfFrame.has(marker) && offset + 7 <= buffer.length) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(buffer) {
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    return {
      width: 1 + (((buffer[21] | ((buffer[22] & 0x3f) << 8)) >>> 0)),
      height: 1 + (((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10)) >>> 0),
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

export function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(12, 16).toString("ascii") === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return webpDimensions(buffer);
  }
  if (buffer.length >= 26 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return jpegDimensions(buffer);
  }
  if (buffer.length >= 26 && buffer.subarray(0, 2).toString("ascii") === "BM") {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) };
  }
  if (buffer.length >= 32 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const marker = Buffer.from("ispe");
    const index = buffer.indexOf(marker, 8);
    if (index >= 4 && index + 12 <= buffer.length) return { width: buffer.readUInt32BE(index + 4), height: buffer.readUInt32BE(index + 8) };
  }
  return null;
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new Error("接口请求已取消");
}

async function prepareImageBuffer(buffer, signal) {
  assertNotAborted(signal);
  let contentType = detectImageType(buffer);
  if (!contentType) throw new Error("响应不是受支持的图片格式");
  const dimensions = imageDimensions(buffer);
  if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error("无法安全读取图片尺寸");
  }
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) throw new Error("图片分辨率过大");
  if (canvasModule === undefined) {
    try {
      canvasModule = await import("@napi-rs/canvas");
    } catch {
      canvasModule = false;
    }
  }
  assertNotAborted(signal);
  if (!canvasModule) throw new Error("图片解码组件不可用");
  let image;
  try {
    image = await canvasModule.loadImage(buffer);
  } catch (err) {
    throw new Error(`图片无法解码：${err.message}`);
  }
  assertNotAborted(signal);
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) {
    throw new Error("图片尺寸无效");
  }
  if (image.width * image.height > MAX_IMAGE_PIXELS || image.width !== dimensions.width || image.height !== dimensions.height) {
    throw new Error("图片尺寸校验失败");
  }
  let output = buffer;
  if (buffer.length > 2 * 1024 * 1024 || image.width > 2560 || image.height > 2560) {
    const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = canvasModule.createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    assertNotAborted(signal);
    output = canvas.toBuffer("image/jpeg", 82);
    contentType = "image/jpeg";
  }
  assertNotAborted(signal);
  if (output.length > MAX_IMAGE_BYTES) throw new Error("压缩后的图片仍然过大");
  return { contentType, body: output };
}

async function fetchImage(rawUrl, signal) {
  const { response, url } = await requestPublic(rawUrl, signal);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    let detail = "";
    try {
      detail = (await readLimitedBody(response, 2048)).toString("utf8").replace(/\s+/g, " ").trim().slice(0, 120);
    } catch {}
    throw new Error(`HTTP ${response.statusCode}${detail ? `: ${detail}` : ""}`);
  }
  const body = await readLimitedBody(response, MAX_IMAGE_DOWNLOAD_BYTES);
  const image = await prepareImageBuffer(body, signal);
  return { url: url.toString(), contentType: image.contentType, file: `base64://${image.body.toString("base64")}` };
}

function textImageUrl(text, base) {
  const match = String(text || "").match(/(?:https?:)?\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return parseHttpUrl(match[0].replace(/[)\]}]+$/, ""), base).toString();
}

function randomId() {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeAnimeSource(value) {
  if (!value || typeof value !== "object") throw new Error("图片源必须是对象");
  const parsed = parseHttpUrl(value.url);
  const rawId = cleanText(value.id, 80).replace(/[^a-z0-9._-]/gi, "-").replace(/^-+|-+$/g, "");
  const mode = ANIME_MODES.has(String(value.mode || "auto")) ? String(value.mode || "auto") : "auto";
  return {
    id: rawId || randomId(),
    name: cleanText(value.name, 40) || parsed.hostname,
    url: parsed.toString(),
    mode,
    imageField: cleanText(value.imageField, 100),
    enabled: value.enabled !== false,
    sfw: value.sfw === true,
    note: cleanText(value.note, 200),
  };
}

export function normalizeAnimeConfig(value) {
  const config = value && typeof value === "object" ? value : {};
  if (!Array.isArray(config.sources)) throw new Error("anime.sources 必须是数组");
  if (config.sources.length > 30) throw new Error("最多只能添加 30 个图片 API");
  const ids = new Set();
  const urls = new Set();
  const sources = config.sources.map((source) => {
    const normalized = normalizeAnimeSource(source);
    if (ids.has(normalized.id)) throw new Error(`图片源 ID 重复：${normalized.id}`);
    if (urls.has(normalized.url)) throw new Error(`图片源 URL 重复：${normalized.name}`);
    ids.add(normalized.id);
    urls.add(normalized.url);
    return normalized;
  });
  const timeout = Number(config.timeoutSec);
  const deletedIds = [...new Set((Array.isArray(config.deletedIds) ? config.deletedIds : [])
    .map((value) => cleanText(value, 200))
    .filter((value) => value.startsWith("anime:")))]
    .slice(0, 500);
  return {
    timeoutSec: Number.isFinite(timeout) ? Math.min(30, Math.max(3, Math.round(timeout))) : 15,
    deletedIds,
    sources,
  };
}

export async function resolveAnimeImage(rawSource, options = {}) {
  const source = normalizeAnimeSource(rawSource);
  const explicitMs = Number(options.timeoutMs);
  const seconds = Number(options.timeoutSec);
  const requestedMs = Number.isFinite(explicitMs) && explicitMs > 0
    ? explicitMs
    : (Number.isFinite(seconds) && seconds > 0 ? seconds : 15) * 1000;
  const timeoutMs = Math.min(30000, Math.max(1000, requestedMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = options.signal;
  if (external?.aborted) controller.abort();
  else external?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const { response, url } = await requestPublic(source.url, controller.signal);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      let detail = "";
      try {
        detail = (await readLimitedBody(response, 2048)).toString("utf8").replace(/\s+/g, " ").trim().slice(0, 120);
      } catch {}
      throw new Error(`HTTP ${response.statusCode}${detail ? `: ${detail}` : ""}`);
    }
    const declaredType = responseHeader(response, "content-type");
    if (declaredType === "image/svg+xml") {
      response.destroy();
      throw new Error("不允许使用 SVG 图片");
    }
    const endpoint = url.toString();
    let text = "";
    if (source.mode === "auto" || source.mode === "image") {
      const body = await readLimitedBody(response, MAX_IMAGE_DOWNLOAD_BYTES);
      const detectedType = detectImageType(body);
      if (detectedType) {
        const image = await prepareImageBuffer(body, controller.signal);
        return {
          url: endpoint,
          sourceName: source.name,
          contentType: image.contentType,
          file: `base64://${image.body.toString("base64")}`,
        };
      }
      if (source.mode === "image" || declaredType.startsWith("image/")) throw new Error("接口返回的内容不是有效图片");
      if (body.length > MAX_METADATA_BYTES) throw new Error("接口响应过大");
      text = body.toString("utf8");
    } else {
      text = (await readLimitedBody(response, MAX_METADATA_BYTES)).toString("utf8");
    }

    let payload = null;
    if (source.mode === "json" || declaredType.includes("json") || /^[\s]*[\[{]/.test(text)) {
      try {
        payload = JSON.parse(text);
      } catch (err) {
        if (source.mode === "json") throw new Error(`JSON 格式错误：${err.message}`);
      }
    }
    if (payload != null) {
      const selected = source.imageField ? valueAtPath(payload, source.imageField) : payload;
      const found = findImageUrl(selected, endpoint);
      if (found) {
        const image = await fetchImage(found, controller.signal);
        return { ...image, sourceName: source.name };
      }
    }
    if (source.mode === "json") throw new Error("JSON 中没有找到图片 URL，请检查图片字段");
    const found = textImageUrl(text, endpoint);
    if (found) {
      const image = await fetchImage(found, controller.signal);
      return { ...image, sourceName: source.name };
    }
    throw new Error("接口响应中没有找到图片 URL");
  } catch (err) {
    if (controller.signal.aborted) throw new Error(external?.aborted ? "接口请求已取消" : "接口请求超时");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function netCommands({ sendText, sendMsg, textSeg, getContent, logger }) {
  function buildSourceChain() {
    return [
      { url: "https://api.bilibili.com/x/web-interface/popular", pick: (j) => ((j || {}).data || {}).list || [], name: () => "哔哩哔哩热门" },
      { url: "https://api.vvhan.com/api/hotlist", pick: (j) => ((j || {}).data || {}).list || [], name: (j) => ((j || {}).data || {}).name || "热搜" },
    ];
  }

  return {
    天气: {
      fn: async (body, args) => {
        const city = (args && args.join(" ").trim()) || "北京";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { signal: controller.signal });
          if (!response.ok) throw new Error("HTTP " + response.status);
          const json = await response.json();
          const current = json.current_condition && json.current_condition[0];
          if (!current) throw new Error("数据为空");
          const area = (json.nearest_area && json.nearest_area[0] && json.nearest_area[0].areaName && json.nearest_area[0].areaName[0] && json.nearest_area[0].areaName[0].value) || city;
          const condition = current.weatherDesc && current.weatherDesc[0] ? current.weatherDesc[0].value : "—";
          return sendText(body, `🌤 ${area}：${condition}｜温度 ${current.temp_C}℃｜体感 ${current.FeelsLikeC}℃｜湿度 ${current.humidity}%｜风 ${current.windspeedKmph}km/h`, "weather");
        } catch (err) {
          return sendText(body, `天气暂时查不到（${err.message}），换个城市或稍后再试~`, "weather");
        } finally {
          clearTimeout(timer);
        }
      },
    },
    热搜: {
      fn: async (body) => {
        let lastError = null;
        for (const source of buildSourceChain()) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch(source.url, { signal: controller.signal });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const json = await response.json();
            const list = source.pick(json);
            if (!list.length) throw new Error("数据为空");
            const sourceName = String(source.name(json) || "热搜");
            const titles = list.slice(0, 10).map((item) => `• ${item.title || item.name || ""}`).filter(Boolean).join("\n");
            if (!titles) throw new Error("没有条目");
            return sendText(body, `🔥 ${sourceName} Top10：\n${titles}`, "hot");
          } catch (err) {
            lastError = err;
          } finally {
            clearTimeout(timer);
          }
        }
        return sendText(body, `热搜拉取失败（${lastError ? lastError.message : "未知"}），稍后再试~`, "hot");
      },
    },
    随机二次元: {
      fn: async (body) => {
        let config;
        try {
          config = normalizeAnimeConfig(getContent?.()?.anime || {});
        } catch (err) {
          logger.error(`[anime] 图片源配置无效: ${err.message}`);
          config = { timeoutSec: 15, sources: [] };
        }
        const sources = shuffled(config.sources.filter((source) => source.enabled && source.sfw));
        if (!sources.length) {
          return sendText(body, "还没有已启用且确认非18+的二次元图片 API，请到控制台「二次元图片」页面添加。", "anime");
        }
        const deadlineAt = Date.now() + Math.min(30000, Math.max(10000, config.timeoutSec * 3000));
        for (const source of sources) {
          const remaining = deadlineAt - Date.now();
          if (remaining <= 0) {
            logger.warn("[anime] 已达到本次命令的总超时时间");
            break;
          }
          try {
            const result = await resolveAnimeImage(source, { timeoutMs: Math.min(config.timeoutSec * 1000, remaining), signal: AbortSignal.timeout(remaining) });
            const sent = await sendMsg(
              body,
              [textSeg(`随机二次元图片来啦～\n来源：${source.name}\n`), { type: "image", data: { file: result.file } }],
              "anime",
              deadlineAt
            );
            if (sent && sent.ok === false) throw new Error(sent.error || "图片发送失败");
            logger.info(`[anime] 使用图片源「${source.name}」`);
            return sent;
          } catch (err) {
            logger.warn(`[anime] 图片源「${source.name}」失败: ${err.message}`);
          }
        }
        return sendText(body, "所有二次元图片源都暂时不可用了，请稍后再试～", "anime");
      },
    },
  };
}
