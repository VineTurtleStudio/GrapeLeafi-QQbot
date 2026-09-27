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

export async function buildHelpImage({ title, subtitle, sections, footer = [] }) {
  const canvasMod = await getCanvas();
  if (!canvasMod) return null;
  const font = pickFont(canvasMod);

  const pad = 40;
  const titleFont = `bold 44px '${font}'`;
  const subFont = `22px '${font}'`;
  const secFont = `bold 27px '${font}'`;
  const cmdFont = `bold 24px '${font}'`;
  const descFont = `22px '${font}'`;
  const footFont = `19px '${font}'`;
  const lineH = 40;
  const secGap = 30;

  const probe = canvasMod.createCanvas(10, 10).getContext("2d");
  const measure = (text, f) => {
    probe.font = f;
    return probe.measureText(text).width;
  };

  let contentW = measure(title, titleFont);
  contentW = Math.max(contentW, measure(subtitle, subFont));
  for (const sec of sections) {
    contentW = Math.max(contentW, measure(sec.title, secFont));
    for (const it of sec.items) {
      const w = measure(it.cmd, cmdFont) + (it.desc ? 18 + measure(it.desc, descFont) : 0);
      contentW = Math.max(contentW, w);
    }
  }
  for (const f of footer) contentW = Math.max(contentW, measure(f, footFont));

  const width = Math.min(Math.max(Math.ceil(contentW) + pad * 2, 620), 1080);
  let height = pad + 56 + 34;
  for (const sec of sections) {
    height += secGap + 38 + sec.items.length * lineH;
  }
  height += footer.length ? 26 + footer.length * 30 : 0;
  height += pad;

  const canvas = canvasMod.createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#10141b";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1a212c";
  roundRect(ctx, 0, 0, width, height, 26);
  ctx.fill();

  let y = pad + 46;
  ctx.fillStyle = "#eef2f8";
  ctx.font = titleFont;
  ctx.fillText(title, pad, y);

  y += 34;
  ctx.fillStyle = "#7f8a9c";
  ctx.font = subFont;
  ctx.fillText(subtitle, pad, y);

  for (const sec of sections) {
    y += secGap;
    ctx.fillStyle = "#4f8cff";
    ctx.font = secFont;
    ctx.fillText(sec.title, pad, y);
    y += 8;
    for (const it of sec.items) {
      y += lineH;
      ctx.font = cmdFont;
      ctx.fillStyle = "#9cc4ff";
      ctx.fillText(it.cmd, pad, y);
      if (it.desc) {
        const cx = pad + measure(it.cmd, cmdFont) + 18;
        ctx.font = descFont;
        ctx.fillStyle = "#aab3c2";
        ctx.fillText(it.desc, cx, y);
      }
    }
  }

  if (footer.length) {
    y += 34;
    ctx.font = footFont;
    ctx.fillStyle = "#69738a";
    for (const f of footer) {
      ctx.fillText(f, pad, y);
      y += 30;
    }
  }

  const buf = canvas.toBuffer("image/png");
  return { buffer: buf, dataUrl: `base64://${buf.toString("base64")}` };
}