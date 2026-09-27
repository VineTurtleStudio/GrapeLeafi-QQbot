import { readFileSync } from "node:fs";
import { logger } from "./logger.js";
import { titleForLevel } from "./levelTitles.js";

let mod = null;

async function getCanvas() {
  if (mod !== null) return mod;
  try {
    mod = await import("@napi-rs/canvas");
  } catch {
    mod = false;
  }
  return mod;
}

const FONT_CANDIDATES = ["Microsoft YaHei", "微软雅黑", "SimHei", "Noto Sans CJK SC", "Source Han Sans SC"];

function pickFont(canvasMod) {
  try {
    for (const f of FONT_CANDIDATES) {
      if (canvasMod.GlobalFonts.has(f)) return f;
    }
  } catch {}
  return "sans-serif";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function fetchAvatar(uid, canvasMod) {
  const url = `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uid)}&s=640`;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res || !res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await canvasMod.loadImage(buf);
  } catch (err) {
    logger.warn(`[checkinimg] 头像获取失败 ${uid}: ${err.message}`);
    return null;
  }
}

// 右侧立绘：优先用本地卡面（用户已抽到的卡），读不到就回退渐变，不让整张图挂掉
async function loadSplash(canvasMod, splash) {
  const file = splash && splash.file;
  if (!file) return null;
  try {
    return await canvasMod.loadImage(readFileSync(file));
  } catch (err) {
    logger.warn(`[checkinimg] 立绘读取失败 ${file}: ${err.message}`);
    return null;
  }
}

// 把图裁成「填满目标框」的尺寸（cover），保持比例
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// 按可用宽度自动缩字号：昵称长度不可控（最长 10 个全角字），
// 写死字号的话碰上长名字就会压到右侧立绘上，所以这里收到能放下为止。
function fitFont(ctx, text, maxW, startPx, font, minPx = 11, weight = "bold") {
  let px = startPx;
  ctx.font = `${weight} ${px}px '${font}'`;
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 1;
    ctx.font = `${weight} ${px}px '${font}'`;
  }
  return px;
}

export async function buildCheckinCard({ uid, name = "", points = 0, stones = 0, level = 1, nextNeed = 0, streak = 0, bestStreak = 0, totalDays = 0, gained = 0, already = false, levelUp = false, title = "🍇 葡萄签到", splash = null, titles = null }) {
  const canvasMod = await getCanvas();
  if (!canvasMod) return null;
  const font = pickFont(canvasMod);

  // 版式照着《原神》角色面板来：右侧立绘出血铺满，左侧深色面板放信息，
  // 顶部头像+等级，中间葡家等级进度条，下面双列属性网格，底部 UID。
  const W = 900;
  const H = 500;
  const SPLASH_X = 470;          // 左侧面板宽度，右侧全给立绘
  const PAD = 34;

  const canvas = canvasMod.createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ---- 底层：深色渐变 ----
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#2b3446");
  bgGrad.addColorStop(0.55, "#1c2230");
  bgGrad.addColorStop(1, "#141821");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ---- 右侧立绘（cover 铺满，之后再压一层向左渐隐接回左侧面板）----
  const splashImg = await loadSplash(canvasMod, splash);
  if (splashImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(SPLASH_X, 0, W - SPLASH_X, H);
    ctx.clip();
    drawCover(ctx, splashImg, SPLASH_X, 0, W - SPLASH_X, H);
    ctx.restore();
  } else {
    // 没抽到卡 / 卡面读不到：画个同色系渐变，别留一块死白
    const fb = ctx.createLinearGradient(SPLASH_X, 0, W, H);
    fb.addColorStop(0, "#3d4a63");
    fb.addColorStop(1, "#232a38");
    ctx.fillStyle = fb;
    ctx.fillRect(SPLASH_X, 0, W - SPLASH_X, H);
  }
  // 立绘左缘羽化，和左侧面板衔接
  const fade = ctx.createLinearGradient(SPLASH_X, 0, SPLASH_X + 190, 0);
  fade.addColorStop(0, "rgba(28,34,48,1)");
  fade.addColorStop(1, "rgba(28,34,48,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(SPLASH_X, 0, 190, H);
  // 整体压一层暗，立绘上的文字才看得清
  ctx.fillStyle = "rgba(12,15,21,0.28)";
  ctx.fillRect(0, 0, W, H);

  // ---- 顶部：头像 + 名字 + 等级徽章 ----
  const av = 60;
  const ax = PAD;
  const ay = PAD;
  const avatar = await fetchAvatar(uid, canvasMod);
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, ax, ay, av, av);
  } else {
    ctx.fillStyle = "#4f6ea8";
    ctx.fillRect(ax, ay, av, av);
    ctx.fillStyle = "#eef2f8";
    ctx.font = `bold 30px '${font}'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(name || uid || "?").slice(0, 1), ax + av / 2, ay + av / 2 + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(214,226,245,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
  ctx.stroke();

  const tx = ax + av + 16;
  ctx.fillStyle = "#f2f6fc";
  const nameLine = String(name || `QQ${uid}`).slice(0, 10);
  // 头衔跟在昵称右侧。先按 27px 量昵称，剩下的宽度留给头衔，两段各自缩字号。
  const titleText = titleForLevel(titles, level);
  const nameMax = SPLASH_X - 10 - tx;
  const namePx = fitFont(ctx, nameLine, nameMax * 0.62, 27, font);
  ctx.font = `bold ${namePx}px '${font}'`;
  const nameW = ctx.measureText(nameLine).width;
  ctx.fillText(nameLine, tx, ay + 25);

  // 头衔：金色描边胶囊，贴昵称右侧
  const tGap = 10;
  const tX = tx + nameW + tGap;
  const tMaxW = Math.max(30, SPLASH_X - 12 - tX);
  ctx.font = `13px '${font}'`;
  const tW = Math.min(tMaxW, ctx.measureText(titleText).width + 20);
  const tH = 22;
  const tY = ay + 8;
  roundRect(ctx, tX, tY, tW, tH, 11);
  ctx.fillStyle = "rgba(201,164,90,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(216,183,106,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#eccb8b";
  fitFont(ctx, titleText, tW - 14, 13, font, 9, "normal");
  ctx.textBaseline = "middle";
  ctx.fillText(titleText, tX + (tW - ctx.measureText(titleText).width) / 2, tY + tH / 2 + 1);
  ctx.textBaseline = "alphabetic";

  // 等级徽章：原神那种描边小方块
  const lvW = 74;
  const lvH = 26;
  const lvX = tx;
  const lvY = ay + 36;
  roundRect(ctx, lvX, lvY, lvW, lvH, 4);
  ctx.fillStyle = "rgba(201,164,90,0.18)";
  ctx.fill();
  ctx.strokeStyle = "#d8b76a";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "#eccb8b";
  ctx.font = `bold 17px '${font}'`;
  ctx.fillText(`Lv.${level}`, lvX + 9, lvY + 19);

  // 宝石图标 + 数量
  ctx.fillStyle = "#8fb8e8";
  ctx.font = `16px '${font}'`;
  ctx.fillText("◆", lvX + lvW + 14, lvY + 19);
  ctx.fillStyle = "#dfe8f5";
  ctx.font = `bold 16px '${font}'`;
  ctx.fillText(String(stones), lvX + lvW + 32, lvY + 19);

  // ---- 葡家等级进度条 ----
  const barY = 168;
  const barX = PAD;
  const barW = SPLASH_X - PAD * 2;
  const barH = 10;
  // 本级所需累计积分 = 100 × 当前等级（与 checkins.js 的 levelFloor 差值一致）
  const span = Math.max(1, 100 * Math.max(1, Number(level) || 1));
  const prog = Math.max(0, Math.min(1, 1 - Math.max(0, nextNeed) / span));

  ctx.fillStyle = "#e8eef8";
  ctx.font = `bold 16px '${font}'`;
  ctx.fillText("葡家等级", barX, barY - 12);
  ctx.fillStyle = "#9fb0c9";
  ctx.font = `15px '${font}'`;
  ctx.textAlign = "right";
  ctx.fillText(`距下一级还需 ${Math.max(0, nextNeed)} 积分`, barX + barW, barY - 12);
  ctx.textAlign = "left";

  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.fill();
  if (prog > 0) {
    const pg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    pg.addColorStop(0, "#d8b76a");
    pg.addColorStop(1, "#f0dca4");
    ctx.fillStyle = pg;
    roundRect(ctx, barX, barY, Math.max(barH, barW * prog), barH, barH / 2);
    ctx.fill();
  }

  // ---- 双列属性网格 ----
  // 每一格一行：图标 + 标签在左，数值紧跟在标签右侧（不是另起一行放到下面）
  const cells = [
    { icon: "✦", k: "积分", v: String(points) },
    { icon: "◆", k: "光玉", v: String(stones) },
    { icon: "☾", k: "连续签到", v: `${streak} 天` },
    { icon: "★", k: "累计签到", v: `${totalDays} 天` },
    { icon: "⟡", k: "历史最长", v: `${bestStreak} 天` },
  ];
  const gx = PAD;
  const gy = 222;
  const cw = (SPLASH_X - PAD * 2) / 2;
  const ch = 42;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const col = i % 2;
    const row = (i / 2) | 0;
    const cx = gx + col * cw;
    const cy = gy + row * ch;
    const bw = cw - 12;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    roundRect(ctx, cx, cy, bw, ch - 8, 8);
    ctx.fill();

    // 竖线基线：图标、标签、数值共用一条中线，看起来才是同一行
    const midY = cy + (ch - 8) / 2 + 1;
    ctx.fillStyle = "#d8b76a";
    ctx.font = `14px '${font}'`;
    const iconW = ctx.measureText(c.icon).width;
    ctx.fillText(c.icon, cx + 13, midY);

    ctx.fillStyle = "#93a3bb";
    ctx.font = `14px '${font}'`;
    const kx = cx + 13 + iconW + 9;
    ctx.fillText(c.k, kx, midY);
    const kw = ctx.measureText(c.k).width;

    // 数值紧跟标签右侧，右边留 10px 余量；放不下就缩字号
    const vx = kx + kw + 10;
    ctx.fillStyle = "#eef3fa";
    fitFont(ctx, c.v, cx + bw - 10 - vx, 17, font, 11);
    ctx.fillText(c.v, vx, midY);
  }

  // ---- 底部：状态徽标 + UID ----
  let badge = "";
  let badgeColor = "#8fb8e8";
  if (already) {
    badge = `今日已签到（连续 ${streak} 天，共 ${totalDays} 天）`;
  } else if (gained > 0) {
    badge = levelUp ? `签到成功 +${gained} 积分，升级到 Lv.${level} 🎉` : `签到成功 +${gained} 积分`;
    badgeColor = "#5fd6a0";
  } else {
    badge = "今天还没签到，快来打卡吧";
  }
  ctx.fillStyle = badgeColor;
  const badgePx = fitFont(ctx, badge, SPLASH_X - 12 - PAD, 18, font, 12);
  void badgePx;
  ctx.fillText(badge, PAD, H - 58);

  ctx.fillStyle = "#7b8798";
  ctx.font = `14px '${font}'`;
  ctx.fillText(`UID ${uid}`, PAD, H - 32);
  ctx.textAlign = "right";
  ctx.fillText(title, SPLASH_X - PAD, H - 32);
  ctx.textAlign = "left";

  // 外描边
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 12);
  ctx.stroke();

  const buf = canvas.toBuffer("image/png");
  return { buffer: buf, dataUrl: `base64://${buf.toString("base64")}` };
}

export function profileText(p) {
  const lvUp = p.level && p.beforeLevel != null && p.level > p.beforeLevel ? `，升级到 Lv.${p.level} 🎉` : "";
  const gain = p.gained > 0 ? `，+${p.gained} 积分${lvUp}` : "";
  return `Lv.${p.level}｜积分 ${p.points}｜连续签到 ${p.streak} 天｜累计 ${p.totalDays} 天${gain}`;
}