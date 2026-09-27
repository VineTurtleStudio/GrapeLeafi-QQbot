import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJSON, saveJSON } from "./storage.js";

let cache = null;
let lastPath = null;

export function meritPath(dataDir) {
  return join(dataDir || join(dirname(fileURLToPath(import.meta.url)), "..", "data"), "merit.json");
}

export function loadMerit(dataDir) {
  const p = meritPath(dataDir);
  if (cache && lastPath === p) return cache;
  cache = loadJSON(p, { users: {}, updatedAt: 0 }) || { users: {}, updatedAt: 0 };
  if (!cache.users) cache.users = {};
  lastPath = p;
  return cache;
}

export function resetMeritCache() {
  cache = null;
  lastPath = null;
}

export function addMerit(dataDir, uid, n = 1) {
  const m = loadMerit(dataDir);
  const key = String(uid);
  const u = m.users[key] || { n: 0, hits: 0 };
  u.n = (u.n || 0) + n;
  u.hits = (u.hits || 0) + 1;
  m.users[key] = u;
  m.updatedAt = Date.now();
  saveJSON(meritPath(dataDir), m);
  return u;
}

export function meritTop(dataDir, limit = 10) {
  const m = loadMerit(dataDir);
  return Object.entries(m.users)
    .map(([uid, u]) => ({ uid, n: u.n || 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

/** 主人专用：把某人的功德直接定为 n（addMerit 是加，这个是定值修错） */
export function setMerit(dataDir, uid, n) {
  const m = loadMerit(dataDir);
  const key = String(uid);
  const u = m.users[key] || { n: 0, hits: 0 };
  const before = u.n || 0;
  const target = Math.max(0, Math.trunc(Number(n) || 0));
  u.n = target;
  // hits 是敲木鱼次数，n 被改动后原次数不再有意义，一并对齐避免数据自相矛盾
  u.hits = target;
  m.users[key] = u;
  m.updatedAt = Date.now();
  saveJSON(meritPath(dataDir), m);
  return { ok: true, before, after: target };
}

/** 主人专用：删除某人的功德档案 */
export function removeMerit(dataDir, uid) {
  const m = loadMerit(dataDir);
  const key = String(uid);
  const existed = Object.prototype.hasOwnProperty.call(m.users, key);
  if (existed) {
    delete m.users[key];
    m.updatedAt = Date.now();
    saveJSON(meritPath(dataDir), m);
  }
  return { ok: true, existed };
}

/** 某人功德概况（数据概览用） */
export function meritOf(dataDir, uid) {
  const m = loadMerit(dataDir);
  const u = m.users[String(uid)] || {};
  return { n: u.n || 0, hits: u.hits || 0 };
}