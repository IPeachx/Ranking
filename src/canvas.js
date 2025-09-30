// src/canvas.js
import path from "node:path";
import { existsSync } from "node:fs";
import pkg from "@napi-rs/canvas";
const { createCanvas, loadImage, registerFont } = pkg;
// intenta Inter, cae en Arial si no existe
try {
  registerFont('assets/fonts/Inter.ttf', { family: 'Inter' });
} catch {}

/* ---------- fuente segura (no crashea si falta) ---------- */
(function safeFont() {
  try {
    const p = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
    if (existsSync(p)) {
      registerFont(p, { family: "Inter" });
      // console.log("[canvas] Inter.ttf registrada");
    } else {
      // console.warn("[canvas] Inter.ttf no encontrada, usando Arial/sans-serif");
    }
  } catch (e) {
    // console.warn("[canvas] fallo registerFont, usando Arial/sans-serif:", e.message);
  }
})();
const FONT_STACK = "Inter, Arial, Helvetica, sans-serif";

/* -------------------- helpers -------------------- */
function roundedRect(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx, str, x, y, {
  font = "18px Inter, Arial, sans-serif",
  color = "#fff",
  align = "left",
  baseline = "middle",
  shadow = false
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}


function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = ((lo + hi) >> 1) + 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

async function fetchAvatar(guild, userId, size = 256) {
  try {
    const m = await guild.members.fetch(userId).catch(() => null);
    if (!m) return null;
    return await loadImage(m.displayAvatarURL({ extension: "png", size }));
  } catch {
    return null;
  }
}

async function fetchName(guild, userId) {
  try {
    const m = await guild.members.fetch(userId).catch(() => null);
    return m?.displayName ?? `User ${userId.slice(0, 4)}`;
  } catch {
    return `User ${userId.slice(0, 4)}`;
  }
}

/* ------------- TOP 3 (oro centro, plata izquierda, bronce derecha) ------------- */
function drawTable(ctx, entries, width, height, page = 1, perPage = 20) {
  // área de la tabla
  const tableX = 32;
  const tableY = 200;
  const tableW = width - tableX * 2;
  const tableH = height - tableY - 28;

  // fondo de la tabla (oscuro translúcido)
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundedRect(ctx, tableX, tableY, tableW, tableH, 18);
  ctx.fill();
  ctx.restore();

  // CABECERA
  const headerH = 40;
  ctx.save();
  ctx.globalAlpha = 1; // <- IMPRESCINDIBLE: textos visibles
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundedRect(ctx, tableX + 10, tableY + 10, tableW - 20, headerH, 12);
  ctx.fill();

  drawText(ctx, "RANK", tableX + 24, tableY + 10 + headerH / 2, {
    font: "bold 16px Inter, Arial, sans-serif",
    color: "#bcd7ff"
  });
  drawText(ctx, "NAME", tableX + 90, tableY + 10 + headerH / 2, {
    font: "bold 16px Inter, Arial, sans-serif",
    color: "#bcd7ff"
  });
  drawText(ctx, "HIGHEST SCORE", tableX + tableW - 24, tableY + 10 + headerH / 2, {
    font: "bold 16px Inter, Arial, sans-serif",
    color: "#bcd7ff",
    align: "right"
  });
  ctx.restore();

  // FILAS
  const start = (page - 1) * perPage;
  const list  = entries.slice(start, start + perPage);

  const rowH = 40;
  let y = tableY + 10 + headerH + 8;

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const rank = start + i + 1;
    const name = (e.name || `User ${e.userId?.slice(0,4) || ""}`).slice(0, 26);
    const pts  = e.points ?? 0;

    // fondo de la fila
    ctx.save();
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
    roundedRect(ctx, tableX + 10, y, tableW - 20, rowH, 10);
    ctx.fill();
    ctx.restore();

    // contenido
    drawText(ctx, String(rank), tableX + 24, y + rowH / 2, {
      font: "bold 16px Inter, Arial, sans-serif",
      color: "#ffffff"
    });

    drawText(ctx, name, tableX + 90, y + rowH / 2, {
      font: "16px Inter, Arial, sans-serif",
      color: "#e5e7eb"
    });

    drawText(ctx, String(pts), tableX + tableW - 24, y + rowH / 2, {
      font: "bold 16px Inter, Arial, sans-serif",
      color: "#ffffff",
      align: "right"
    });

    y += rowH + 6;
  }
}


/* -------------------- imagen completa -------------------- */
export async function buildLeaderboardImage(guild, entries) {
  // ordenar y asegurar estructura
  const data = [...entries].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const rows = Math.max(data.length, 10);

  // layout
  const W = 720;
  const ROW_H = 44;
  const TOP_AREA = 210;     // títulos + top3
  const HEAD_H = 40;        // encabezado de tabla
  const PAD = 24;
  const H = TOP_AREA + HEAD_H + rows * ROW_H + PAD * 2;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // fondo degradado
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1f266a");
  g.addColorStop(1, "#5863f8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // título principal
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = `900 26px ${FONT_STACK}`;
  ctx.fillText("LEADERBOARD – Staff", PAD, PAD + 10);

  // TOP 3
  await drawTop3(ctx, guild, data, W / 2, PAD + 30, 200);

  // contenedor tabla
const listX = PAD;
const listY = TOP_AREA;
const listW = W - PAD * 2;
const listH = HEAD_H + rows * ROW_H;

// fondo de la tarjeta (opaco local, sin globalAlpha)
ctx.fillStyle = "rgba(0,0,0,.35)";
roundedRect(ctx, listX, listY, listW, listH, 18);
ctx.fill();

// (opcional) encabezado sutil de la tabla
ctx.fillStyle = "rgba(255,255,255,.12)";
roundedRect(ctx, listX, listY, listW, HEAD_H, 18);
ctx.fill();

// (opcional) líneas guía dentro de la tabla
ctx.fillStyle = "rgba(255,255,255,.06)";
for (let y = listY + 12; y < listY + listH - 12; y += 28) {
  roundedRect(ctx, listX + 18, y, listW - 36, 14, 8);
  ctx.fill();
}


  // header
  ctx.fillStyle = "rgba(255,255,255,.1)";
  roundedRect(ctx, listX + 12, listY + 8, listW - 24, HEAD_H - 12, 10);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = `800 16px ${FONT_STACK}`;
  const colRankX = listX + 24;
  const colNameX = listX + 90;
  const colScoreX = listX + listW - 24; // derecha
  ctx.fillText("RANK", colRankX, listY + HEAD_H - 12);
  ctx.fillText("NAME", colNameX, listY + HEAD_H - 12);
  ctx.textAlign = "right";
  ctx.fillText("HIGHEST SCORE", colScoreX, listY + HEAD_H - 12);

  // filas
  const nameMaxW = listW - (colNameX - listX) - 140; // espacio para puntos
  for (let i = 0; i < data.length; i++) {
    const e = data[i];
    const y = listY + HEAD_H + i * ROW_H;

    // zebra
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.03)";
    roundedRect(ctx, listX + 12, y + 6, listW - 24, ROW_H - 10, 10);
    ctx.fill();

    // rank
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `700 15px ${FONT_STACK}`;
    ctx.fillText(String(i + 1), colRankX, y + ROW_H - 14);

    // name
    const displayName = await fetchName(guild, e.userId);
    ctx.font = `600 15px ${FONT_STACK}`;
    const shown = truncate(ctx, displayName, nameMaxW);
    ctx.fillText(shown, colNameX, y + ROW_H - 14);

    // puntos
    ctx.textAlign = "right";
    ctx.font = `800 15px ${FONT_STACK}`;
    ctx.fillText(String(e.points ?? 0), colScoreX, y + ROW_H - 14);
  }

  return canvas.toBuffer("image/png");
}
