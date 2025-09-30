// src/canvas.js
import path from "node:path";
import { existsSync } from "node:fs";
import pkg from "@napi-rs/canvas";
const { createCanvas, loadImage, registerFont } = pkg;

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
function roundedRect(ctx, x, y, w, h, r = 16) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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
async function drawTop3(ctx, guild, list, cx, topY, gapX) {
  // list[0]=oro, [1]=plata, [2]=bronce (ya viene ordenado)
  const places = [
    { label: "PLATA", color: "#c0c0c0", x: cx - gapX, rank: 2, idx: 1 },
    { label: "ORO",   color: "#ffd700", x: cx,        rank: 1, idx: 0 },
    { label: "BRONCE",color: "#cd7f32", x: cx + gapX, rank: 3, idx: 2 },
  ];

  ctx.textAlign = "center";
  for (const p of places) {
    const e = list[p.idx];
    if (!e) continue;

    // título
    ctx.fillStyle = p.color;
    ctx.font = `900 22px ${FONT_STACK}`;
    ctx.fillText(p.label, p.x, topY);

    // avatar circular
    const img = await fetchAvatar(guild, e.userId, 256);
    const r = 44, y = topY + 38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) ctx.drawImage(img, p.x - r, y - r, r * 2, r * 2);
    ctx.restore();
    // borde
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(p.x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // nombre + puntos
    const name = await fetchName(guild, e.userId);
    ctx.fillStyle = "#fff";
    ctx.font = `600 18px ${FONT_STACK}`;
    ctx.fillText(name, p.x, y + 34);
    ctx.font = `900 18px ${FONT_STACK}`;
    ctx.fillText(`${e.points} pts`, p.x, y + 58);
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
  const listX = PAD, listY = TOP_AREA, listW = W - PAD * 2, listH = HEAD_H + rows * ROW_H;
  ctx.globalAlpha = 0.25;
  roundedRect(ctx, listX, listY, listW, listH, 18);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.globalAlpha = 1;

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
