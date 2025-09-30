// src/canvas.js
import { createCanvas, loadImage } from "@napi-rs/canvas";

/* ========== helpers ========== */
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBG(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#202562");
  g.addColorStop(1, "#5661ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

async function fetchTop3Avatars(guild, entries) {
  const urls = [];
  for (let i = 0; i < 3; i++) {
    const e = entries[i];
    if (!e) { urls.push(null); continue; }
    const m = await guild.members.fetch(e.userId).catch(() => null);
    urls.push(m?.displayAvatarURL({ extension: "png", size: 256 }) ?? null);
  }
  const imgs = [];
  for (const u of urls) {
    if (!u) { imgs.push(null); continue; }
    try { imgs.push(await loadImage(u)); } catch { imgs.push(null); }
  }
  return imgs;
}

/* ========== TOP 3 ========== */
function drawTop3(ctx, entries, names, avatars) {
  // orden visual: PLATA — ORO — BRONCE
  const places = [
    { cx: 140, label: "PLATA", color: "#c0c0c0" },
    { cx: 350, label: "ORO",   color: "#ffd700" },
    { cx: 560, label: "BRONCE",color: "#cd7f32" }
  ];
  const y = 135;
  const R = 48;

  ctx.textAlign = "center";

  for (let i = 0; i < 3; i++) {
    const e = entries[i];
    if (!e) continue;
    const name = names[i] || "User";
    const av = avatars?.[i] ?? null;

    // etiqueta
    ctx.fillStyle = places[i].color;
    ctx.font = "bold 24px Sans-serif";
    ctx.fillText(places[i].label, places[i].cx, y - 65);

    // avatar circular con borde
    ctx.save();
    ctx.beginPath();
    ctx.arc(places[i].cx, y, R, 0, Math.PI * 2);
    ctx.clip();
    if (av) ctx.drawImage(av, places[i].cx - R, y - R, R * 2, R * 2);
    ctx.restore();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(places[i].cx, y, R, 0, Math.PI * 2);
    ctx.stroke();

    // nombre y puntos
    ctx.fillStyle = "#fff";
    ctx.font = "16px Sans-serif";
    ctx.fillText(name, places[i].cx, y + 74);
    ctx.font = "bold 18px Sans-serif";
    ctx.fillText(`${e.points} pts`, places[i].cx, y + 98);
  }
}

/* ========== TABLA ========== */
function drawTable(ctx, entries, names, startY) {
  const x = 40, w = 620;
  const HEADER_H = 52;
  const ROW_H = 38;

  const rows = entries.map((e, idx) => ({
    rank: idx + 1,
    name: names[idx] || "User",
    points: e.points
  }));

  const totalH = HEADER_H + (rows.length * ROW_H);

  // tarjeta
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  roundedRect(ctx, x, startY, w, totalH + 20, 16);
  ctx.fill();

  // encabezado
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("RANK", x + 20, startY + 35);
  ctx.fillText("NAME", x + 90, startY + 35);
  ctx.textAlign = "right";
  ctx.fillText("HIGHEST SCORE", x + w - 22, startY + 35);

  // filas
  let y = startY + HEADER_H;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // franja alterna
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundedRect(ctx, x + 12, y - 24, w - 24, 30, 10);
      ctx.fill();
    }

    // texto
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.font = "16px Sans-serif";
    ctx.fillText(String(r.rank), x + 20, y);
    const shown = r.name.length > 28 ? r.name.slice(0, 28) + "…" : r.name;
    ctx.fillText(shown, x + 90, y);

    ctx.textAlign = "right";
    ctx.font = "bold 16px Sans-serif";
    ctx.fillText(String(r.points), x + w - 22, y);

    y += ROW_H;
  }

  return totalH + 20;
}

/* ========== IMAGEN COMPLETA (toda la lista) ========== */
export async function buildLeaderboardImage(guild, entries, _page = 1, _perPage = 10) {
  // SIEMPRE generamos una sola imagen con TODA la lista
  const fullEntries = entries.slice();
  const totalRows   = fullEntries.length;

  // alturas dinámicas
  const WIDTH = 700;
  const TOP_BLOCK = 220; // top3
  const ROW_H = 38, HEADER_H = 52, TABLE_MARGIN = 40;
  const TABLE_H = HEADER_H + (Math.max(totalRows, 1) * ROW_H) + 20;
  const HEIGHT = TOP_BLOCK + TABLE_MARGIN + TABLE_H + 40;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // fondo + título
  drawBG(ctx, WIDTH, HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 34px Sans-serif";
  ctx.fillText("LEADERBOARD – Staff", WIDTH / 2, 50);

  // nombres
  const names = [];
  for (let i = 0; i < fullEntries.length; i++) {
    const e = fullEntries[i];
    const m = await guild.members.fetch(e.userId).catch(() => null);
    names.push(m?.displayName ?? `User ${e.userId.slice(0, 4)}`);
  }

  // top3 + tabla
  const avatars = await fetchTop3Avatars(guild, fullEntries);
  drawTop3(ctx, fullEntries, names, avatars);

  const tableStartY = 220 + 40;
  drawTable(ctx, fullEntries, names, tableStartY);

  return canvas.toBuffer("image/png");
}
