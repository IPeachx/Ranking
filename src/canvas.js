// src/canvas.js
import pkg from "@napi-rs/canvas";
const { createCanvas, loadImage } = pkg;

/* ==================== Config ==================== */

const W = 700;                     // ancho base
const PAD = 28;                    // padding lateral
const TOP_AREA = 220;              // alto fijo para el podio
const LIST_HDR = 56;               // alto del header de la tabla
const ROW_H = 36;                  // alto por fila
const BOTTOM_PAD = 32;             // margen inferior

// Pila de fuentes segura (nada externo)
const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif";

/* ==================== Helpers ==================== */

function roundedRect(ctx, x, y, w, h, r = 12) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = "…";
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = ((lo + hi) / 2) | 0;
    const t = text.slice(0, mid) + ell;
    if (ctx.measureText(t).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + ell;
}

async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

async function fetchAvatar(guild, userId, size = 256) {
  const m = await fetchMember(guild, userId);
  const url =
    m?.displayAvatarURL({ extension: "png", size }) ??
    "https://cdn.discordapp.com/embed/avatars/0.png";
  try {
    return await loadImage(url);
  } catch {
    // imagen por defecto si algo falla
    return await loadImage("https://cdn.discordapp.com/embed/avatars/0.png");
  }
}

function drawBG(ctx, width, height) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "#1f2a6a");
  g.addColorStop(1, "#5560ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

/* ==================== Dibuja Top 3 ==================== */
/**
 * list: entries ya ordenadas desc por puntos. Se usa list[0..2]
 */
async function drawTop3(ctx, guild, list, width) {
  // orden: ORO centro, PLATA izq, BRONCE der
  const places = [
    { label: "PLATA", color: "#c0c0c0", idx: 1, cx: width / 2 - 160 },
    { label: "ORO", color: "#ffd700", idx: 0, cx: width / 2 },
    { label: "BRONCE", color: "#cd7f32", idx: 2, cx: width / 2 + 160 },
  ];

  ctx.textAlign = "center";

  for (const p of places) {
    const e = list[p.idx];
    const cx = p.cx;
    const topY = 38;

    // etiqueta
    ctx.fillStyle = p.color;
    ctx.font = `800 22px ${FONT_STACK}`;
    ctx.fillText(p.label, cx, topY);

    // avatar
    const r = 52;
    const cy = topY + 62;
    let img = null;
    if (e) img = await fetchAvatar(guild, e.userId, 256);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = "#2a2f6b";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // borde
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // nombre y puntos
    let displayName = "—";
    if (e) {
      const m = await fetchMember(guild, e.userId);
      displayName = m?.displayName ?? `User ${e.userId.slice(0, 4)}`;
    }

    ctx.fillStyle = "#fff";
    ctx.font = `600 18px ${FONT_STACK}`;
    ctx.fillText(displayName, cx, cy + 64);

    ctx.font = `800 20px ${FONT_STACK}`;
    ctx.fillText(e ? `${e.points} pts` : "0 pts", cx, cy + 86);
  }
}

/* ==================== Dibuja la tabla ==================== */

async function drawTable(ctx, guild, entries, page, perPage, listX, listY, listW) {
  // marco y tarjetas
  const HEAD_H = 40;
  const rowsStart = Math.max(0, (page - 1) * perPage);
  const rows = entries.slice(rowsStart, rowsStart + perPage);
  const listH = HEAD_H + rows.length * ROW_H;

  // Tarjeta contenedor (sólido)
  ctx.fillStyle = "rgba(0,0,0,.35)";
  roundedRect(ctx, listX, listY, listW, listH, 18);
  ctx.fill();

  // encabezado sutil
  ctx.fillStyle = "rgba(255,255,255,.12)";
  roundedRect(ctx, listX, listY, listW, HEAD_H, 18);
  ctx.fill();

  // líneas guía (opcional)
  ctx.fillStyle = "rgba(255,255,255,.06)";
  for (let y = listY + 12; y < listY + listH - 12; y += 28) {
    roundedRect(ctx, listX + 18, y, listW - 36, 14, 8);
    ctx.fill();
  }

  // cabeceras
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `800 16px ${FONT_STACK}`;

  const colRankX = listX + 18;
  const colNameX = listX + 86;
  const colPtsX = listX + listW - 120;

  ctx.fillText("RANK", colRankX, listY + 26);
  ctx.fillText("NAME", colNameX, listY + 26);
  ctx.textAlign = "right";
  ctx.fillText("HIGHEST SCORE", listX + listW - 18, listY + 26);

  // filas
  const rowY0 = listY + HEAD_H;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const y = rowY0 + i * ROW_H + ROW_H / 2 + 6; // baseline centrada

    // rank
    ctx.textAlign = "left";
    ctx.fillStyle = "#cfd6ff";
    ctx.font = `800 18px ${FONT_STACK}`;
    ctx.fillText(String(rowsStart + i + 1), colRankX, y);

    // nombre + avatar mini
    const m = await fetchMember(guild, e.userId);
    const nameRaw = m?.displayName ?? `User ${e.userId.slice(0, 4)}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 18px ${FONT_STACK}`;
    const maxName = colPtsX - (colNameX + 36) - 16; // avatar 28 + gap
    const name = ellipsize(ctx, nameRaw, maxName);
    ctx.fillText(name, colNameX + 36, y);

    // mini avatar
    try {
      const av = await fetchAvatar(guild, e.userId, 64);
      const r = 14;
      const ax = colNameX + 14;
      const ay = y - 16;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + r, ay + r, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(av, ax, ay, r * 2, r * 2);
      ctx.restore();

      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      ctx.arc(ax + r, ay + r, r, 0, Math.PI * 2);
      ctx.stroke();
    } catch {}

    // puntos
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 18px ${FONT_STACK}`;
    ctx.fillText(String(e.points), listX + listW - 18, y);
  }
}

/* ==================== API principal ==================== */

export async function buildLeaderboardImage(
  guild,
  entries,
  page = 1,
  perPage = 25
) {
  // seguridad
  const clean = Array.isArray(entries)
    ? entries.map((e) => ({
        userId: String(e.userId),
        points: Number(e.points) || 0,
      }))
    : [];

  // Ordenados desc
  clean.sort((a, b) => b.points - a.points);

  // alto dinámico según filas visibles
  const start = Math.max(0, (page - 1) * perPage);
  const visible = clamp(clean.length - start, 0, perPage);
  const dynamicHeight = Math.max(
    700,
    TOP_AREA + LIST_HDR + visible * ROW_H + BOTTOM_PAD
  );

  const canvas = createCanvas(W, dynamicHeight);
  const ctx = canvas.getContext("2d");

  drawBG(ctx, W, dynamicHeight);

  // Título
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 26px ${FONT_STACK}`;
  ctx.fillText("LEADERBOARD – Staff", PAD, 34);

  // Top 3
  await drawTop3(ctx, guild, clean, W);

  // Tabla
  const listX = PAD;
  const listY = TOP_AREA;
  const listW = W - PAD * 2;
  await drawTable(ctx, guild, clean, page, perPage, listX, listY, listW);

  return canvas.toBuffer("image/png");
}
