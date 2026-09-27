// 本地状态持久化。所有 data/*.json 都经过这里，因此耐久性策略只需在这一处实现。
//
// 采用的方案（对标大公司做本地状态的标准做法）：
//   1. 原子写   —— 先写同目录 .tmp，fsync 后 rename 覆盖。同盘 rename 是原子操作，
//                  读者要么看到旧文件、要么看到新文件，不会看到写了一半的内容。
//   2. 持久化   —— rename 之前 fsync 数据文件，之后 fsync 目录项。
//                  少了这一步，掉电时可能出现「文件名已更新但内容是空的」。
//   3. 滚动备份 —— 覆盖前先备份到 data/backups/<文件名>/<时间戳>.bak，保留最近 N 代。
//                  按时间间隔限流，避免高频保存时把 I/O 全花在备份上。
//   4. 损坏即停 —— 解析失败时把坏文件改名隔离并抛错，绝不静默回退成空数据。
//                  「静默回退」是数据丢失最常见的原因：文件坏了 → 以空状态启动
//                  → 第一次保存把坏文件覆盖掉 → 原始数据永久消失。
//   5. 脏检查   —— 内容与磁盘一致时跳过写入，避免无谓的全量重写（大文件尤其明显）。
//
// 故意不做的事：不写校验和清单。因为这些存档需要人工手改，一改就与清单不符，
// 天天误报等于没报警；损坏检测交给第 4 条的解析校验，足够覆盖真实的截断/损坏场景。
import {
  readFileSync, writeFileSync, renameSync, existsSync, mkdirSync,
  copyFileSync, openSync, fsyncSync, closeSync, readdirSync, unlinkSync, statSync,
} from "node:fs";
import { dirname, join, basename } from "node:path";

/** 环境变量可覆盖，方便部署时调参，也方便测试验证备份行为 */
const envNum = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** 每个文件保留最近多少代备份 */
export const BACKUP_KEEP = envNum(process.env.BOT_BACKUP_KEEP, 5);
/** 同一文件两次备份的最小间隔（毫秒），防止高频保存时反复复制 */
export const BACKUP_INTERVAL_MS = envNum(process.env.BOT_BACKUP_INTERVAL_MS, 5 * 60 * 1000);

const BACKUP_DIRNAME = "backups";
/** filePath -> 上次备份时间戳 */
const lastBackupAt = new Map();

function warn(msg) {
  console.warn(`[storage] ${msg}`);
}

/** fsync 一个已存在的文件，确保数据真正落盘。Windows 上 fsync 需要写权限句柄，故用 "r+" */
function fsyncFile(filePath) {
  let fd;
  try {
    fd = openSync(filePath, "r+");
    fsyncSync(fd);
  } catch (err) {
    warn(`fsync ${filePath} 失败: ${err.message}`);
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* 忽略 */ }
    }
  }
}

/** fsync 目录项，保证 rename 本身落盘。Windows 上打不开目录句柄，属预期情况 */
function fsyncDir(dirPath) {
  let fd;
  try {
    fd = openSync(dirPath, "r");
    fsyncSync(fd);
  } catch {
    // Windows 不支持以这种方式 fsync 目录，跳过
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* 忽略 */ }
    }
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupDirFor(filePath) {
  return join(dirname(filePath), BACKUP_DIRNAME, basename(filePath));
}

/** 只保留最近 BACKUP_KEEP 代，最新的在最后 */
function pruneBackups(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".bak")).sort();
  } catch {
    return;
  }
  const excess = names.length - BACKUP_KEEP;
  for (let i = 0; i < excess; i++) {
    try { unlinkSync(join(dir, names[i])); } catch { /* 忽略 */ }
  }
}

/**
 * 覆盖前滚动备份。按 BACKUP_INTERVAL_MS 限流：备份是周期性动作，不是每次写入都做
 * （content.json 有 3MB，每次写入都复制 5 份是不可接受的 I/O）。
 * 备份失败只告警，不阻断写入——写盘本身有原子性保证，备份只是额外保险。
 */
function maybeBackup(filePath) {
  if (!existsSync(filePath)) return;
  const now = Date.now();
  const last = lastBackupAt.get(filePath);
  if (last !== undefined && now - last < BACKUP_INTERVAL_MS) return;
  try {
    const dir = backupDirFor(filePath);
    mkdirSync(dir, { recursive: true });
    copyFileSync(filePath, join(dir, `${stamp()}.bak`));
    lastBackupAt.set(filePath, now);
    pruneBackups(dir);
  } catch (err) {
    warn(`备份 ${basename(filePath)} 失败: ${err.message}`);
  }
}

export function loadJSON(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch (err) {
    // 隔离坏文件而不是丢数据。改名保留原始内容供人工修复/找回，然后中止启动。
    const quarantine = `${filePath}.corrupt-${stamp()}`;
    try {
      renameSync(filePath, quarantine);
      warn(`已隔离损坏文件 -> ${quarantine}`);
    } catch (qErr) {
      warn(`隔离损坏文件失败（${qErr.message}），原文件仍在 ${filePath}`);
    }
    throw new Error(
      `${basename(filePath)} 解析失败: ${err.message}\n` +
      `  已把损坏文件隔离为: ${quarantine}\n` +
      `  请手动检查并修复该文件；若要恢复到最近状态，可从 ${backupDirFor(filePath)} 下的备份还原。\n` +
      `  （为防止用空数据覆盖原始数据，程序在此中止。）`
    );
  }
}

export function saveJSON(filePath, obj) {
  const text = JSON.stringify(obj, null, 2);

  // 脏检查：内容没变就不写，省掉一次全量写盘（3MB 的 content.json 尤其明显）
  if (existsSync(filePath)) {
    try {
      if (readFileSync(filePath, "utf8").replace(/^\uFEFF/, "") === text) return;
    } catch {
      // 读不出来就当作需要写
    }
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  maybeBackup(filePath);

  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, text, "utf8");
  fsyncFile(tmp);
  renameSync(tmp, filePath);
  fsyncDir(dir);
}

/**
 * 立刻备份某个文件，绕过 BACKUP_INTERVAL_MS 限流。
 * 给主人指令「立即备份」用——改数据之前先落一个恢复点。
 * 返回 null 表示该文件还不存在（没什么可备份的）。
 */
export function backupNow(filePath) {
  if (!existsSync(filePath)) return null;
  const dir = backupDirFor(filePath);
  mkdirSync(dir, { recursive: true });
  const name = `${stamp()}.bak`;
  copyFileSync(filePath, join(dir, name));
  lastBackupAt.set(filePath, Date.now());
  pruneBackups(dir);
  return { name, path: join(dir, name), dir };
}

/**
 * 列出某个文件可用的备份，按时间从新到旧。
 * 给「备份列表」指令用，让人知道能回退到哪几个点。
 */
export function listBackups(filePath) {
  const dir = backupDirFor(filePath);
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".bak")).sort().reverse();
  } catch {
    return [];
  }
  return names.map((name) => {
    let size = 0;
    let mtime = 0;
    try {
      const st = statSync(join(dir, name));
      size = st.size;
      mtime = st.mtimeMs;
    } catch {
      // 列不出来就当 0，不影响其余条目
    }
    return { name, path: join(dir, name), size, mtime, iso: mtime ? new Date(mtime).toISOString() : "" };
  });
}
