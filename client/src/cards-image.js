// cards-image.js —— 卡牌结算图合成：抽卡结果图、图鉴墙、单卡大图。
// 只依赖 @napi-rs/canvas（动态加载，缺依赖时静默返回 null）+ logger，与 gameplay 无关。
import { readFileSync } from "node:fs";
import { logger } from "./logger.js";

let canvasMod = null;
async function getCanvas() {
  if (canvasMod !== null) return canvasMod;
  try {
    canvasMod = await import("@napi-rs/canvas");
  } catch {
    canvasMod = false;
  }
  return canvasMod;
}

const RARE_COLOR = {
  SSR: "#ffd75e",
  SR: "#c678ff",
  R: "#5ea8ff",
  N: "#c8ccd4",
};

async function loadImageSafe(canvas, file) {
  try {
    const buf = readFileSync(file);
    return await canvas.loadImage(buf);
  } catch (err) {
    logger.warn(`[cards] 图片加载失败 ${file}: ${err.message}`);
    return null;
  }
}

const CELL_W = 176;
const CELL_H = 212;
const CELL_GAP = 28;
const IN_PAD = 18;
const HEAD_H = 84;
const BOARD_W = 1060;
const BOARD_H = 560;
const MAX_CELLS = 10;
const CELL_COLS = 5;

export async function buildPullImage({ cards, title = "抽卡" }) {
  const canvas = await getCanvas();
  if (!canvas) return null;
  const font = "Microsoft YaHei";

  const n = Math.min(cards.length, MAX_CELLS);
  const W = BOARD_W;
  const H = BOARD_H;

  const c = canvas.createCanvas(W, H);
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1b2540");
  grad.addColorStop(1, "#0d1220");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eaf0ff";
  ctx.font = `bold 32px '${font}'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, W / 2, 40);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `16px '${font}'`;
  ctx.fillText(`共 ${cards.length} 张`, W / 2, 68);

  const gridW = CELL_COLS * CELL_W + (CELL_COLS - 1) * CELL_GAP;
  const gridH = 2 * CELL_H + CELL_GAP;
  const x0 = Math.round((W - gridW) / 2);
  const y0 = Math.round(HEAD_H + (H - HEAD_H - gridH) / 2);

  for (let i = 0; i < MAX_CELLS; i += 1) {
    const col = i % CELL_COLS;
    const row = Math.floor(i / CELL_COLS);
    const x = x0 + col * (CELL_W + CELL_GAP);
    const y = y0 + row * (CELL_H + CELL_GAP);
    const info = i < n ? cards[i] : null;

    if (!info) {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, CELL_W - 1.5, CELL_H - 1.5);
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4.5, y + 4.5, CELL_W - 9, CELL_H - 9);
      continue;
    }

    ctx.fillStyle = "#0a0f1c";
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, CELL_W - 1.5, CELL_H - 1.5);

    const r = info.rarity || "N";
    const color = RARE_COLOR[r] || RARE_COLOR.N;
    const iw2 = CELL_W - IN_PAD * 2;
    const ih2 = CELL_H - IN_PAD * 2;

    const img = await loadImageSafe(canvas, info.file);
    if (img) {
      const scale = Math.max(iw2 / img.width, ih2 / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = x + IN_PAD + (iw2 - dw) / 2;
      const dy = y + IN_PAD + (ih2 - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#20283c";
      ctx.fillRect(x + IN_PAD, y + IN_PAD, iw2, ih2);
      ctx.fillStyle = "#63708c";
      ctx.font = `15px '${font}'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("(图片缺失)", x + CELL_W / 2, y + CELL_H / 2);
    }

    ctx.fillStyle = color;
    ctx.fillRect(x, y, CELL_W, 5);

    const capH = 42;
    ctx.fillStyle = "rgba(6,10,20,0.82)";
    ctx.fillRect(x, y + CELL_H - capH, CELL_W, capH);
    ctx.fillStyle = "#f2f5ff";
    ctx.font = `bold 17px '${font}'`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(info.charName || info.id, x + 10, y + CELL_H - capH / 2);

    ctx.fillStyle = color;
    ctx.font = `bold 15px '${font}'`;
    ctx.textAlign = "right";
    ctx.fillText(r, x + CELL_W - 10, y + CELL_H - capH / 2);
  }

  ctx.textAlign = "start";
  const buf = c.toBuffer("image/png");
  return { buffer: buf, dataUrl: `base64://${buf.toString("base64")}` };
}

const WALL_CELL_W = 260;
const WALL_CELL_H = 280;
const WALL_GAP = 16;
const WALL_COLS = 5;
const WALL_ROWS = 4;
const WALL_HEAD = 96;

export async function buildCardWallImage({ items = [], title = "图鉴", page = 1, pages = 1, resolveImage } = {}) {
  const canvas = await getCanvas();
  if (!canvas) return null;
  const font = "Microsoft YaHei";
  const W = WALL_COLS * WALL_CELL_W + (WALL_COLS - 1) * WALL_GAP + 48;
  const H = WALL_HEAD + WALL_ROWS * WALL_CELL_H + (WALL_ROWS - 1) * WALL_GAP + 40;
  const c = canvas.createCanvas(W, H);
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#182238");
  grad.addColorStop(1, "#0b101d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#eaf0ff";
  ctx.font = `bold 30px '${font}'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, W / 2, 42);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `17px '${font}'`;
  ctx.fillText(`第 ${page}/${pages} 页 · 本页 ${items.length} 张（更多：/图鉴 <页数>）`, W / 2, 76);
  const x0 = 24;
  const y0 = WALL_HEAD;
  for (let i = 0; i < WALL_COLS * WALL_ROWS; i += 1) {
    const it = items[i];
    if (!it) break;
    const col = i % WALL_COLS;
    const row = Math.floor(i / WALL_COLS);
    const x = x0 + col * (WALL_CELL_W + WALL_GAP);
    const y = y0 + row * (WALL_CELL_H + WALL_GAP);
    ctx.fillStyle = "#0d1322";
    ctx.fillRect(x, y, WALL_CELL_W, WALL_CELL_H);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, WALL_CELL_W - 1.5, WALL_CELL_H - 1.5);
    ctx.fillStyle = RARE_COLOR[it.rarity] || RARE_COLOR.N;
    ctx.fillRect(x, y, WALL_CELL_W, 6);
    const pad = 16;
    const iw = WALL_CELL_W - pad * 2;
    const ih = WALL_CELL_H - 6 - pad - 54;
    const fp = typeof resolveImage === "function" ? resolveImage(it) : null;
    const img = fp ? await loadImageSafe(canvas, fp) : null;
    if (img) {
      const scale = Math.max(iw / img.width, ih / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = x + pad + (iw - dw) / 2;
      const dy = y + 6 + pad + (ih - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#1d2537";
      ctx.fillRect(x + pad, y + 6 + pad, iw, ih);
      ctx.fillStyle = "#5f6c88";
      ctx.font = `15px '${font}'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("(素材缺失)", x + WALL_CELL_W / 2, y + 6 + pad + ih / 2);
    }
    ctx.fillStyle = "rgba(6,10,20,0.82)";
    ctx.fillRect(x, y + WALL_CELL_H - 54, WALL_CELL_W, 54);
    ctx.fillStyle = "#f2f5ff";
    ctx.font = `bold 20px '${font}'`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`#${it.id}`, x + 12, y + WALL_CELL_H - 36);
    ctx.fillStyle = RARE_COLOR[it.rarity] || RARE_COLOR.N;
    ctx.font = `bold 16px '${font}'`;
    ctx.textAlign = "right";
    ctx.fillText(it.rarity + (it.count > 1 ? `×${it.count}` : ""), x + WALL_CELL_W - 12, y + WALL_CELL_H - 36);
    ctx.fillStyle = "#aeb8d0";
    ctx.font = `15px '${font}'`;
    ctx.textAlign = "left";
    ctx.fillText(it.charName || "", x + 12, y + WALL_CELL_H - 14);
  }
  ctx.textAlign = "start";
  const buf2 = c.toBuffer("image/png");
  return { buffer: buf2, dataUrl: `base64://${buf2.toString("base64")}` };
}

export async function buildCardViewImage({ file = null, kindText = "卡面", title = "", caption = "", width = 760 } = {}) {
  const canvas = await getCanvas();
  if (!canvas) return null;
  const font = "Microsoft YaHei";
  const pad = 16;
  const barH = 96;
  const iw = width - pad * 2;
  let ih = Math.round(iw * 1.4);
  const img = file ? await loadImageSafe(canvas, file) : null;
  if (img) {
    ih = Math.round(iw * img.height / Math.max(1, img.width));
    if (ih > 1200) ih = 1200;
  }
  const H = pad + ih + barH + pad;
  const c = canvas.createCanvas(width, H);
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#151d33");
  grad.addColorStop(1, "#0a0f1b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, H);
  if (img) {
    const scale = Math.max(iw / img.width, ih / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = pad + (iw - dw) / 2;
    const dy = pad + (ih - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = "#1d2537";
    ctx.fillRect(pad, pad, iw, ih);
    ctx.fillStyle = "#5f6c88";
    ctx.font = `16px '${font}'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("(素材缺失)", width / 2, pad + ih / 2);
  }
  const by = pad + ih;
  ctx.fillStyle = "rgba(6,10,20,0.85)";
  ctx.fillRect(0, by, width, barH);
  ctx.fillStyle = "#eaf0ff";
  ctx.font = `bold 26px '${font}'`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 18, by + 34);
  ctx.fillStyle = "#aeb8d0";
  ctx.font = `17px '${font}'`;
  ctx.fillText(caption, 18, by + 68);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `15px '${font}'`;
  ctx.textAlign = "right";
  ctx.fillText("／" + kindText, width - 18, by + 64);
  const buf3 = c.toBuffer("image/png");
  return { buffer: buf3, dataUrl: `base64://${buf3.toString("base64")}` };
}
