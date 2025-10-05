// src/canvas.js
import pkg from "@napi-rs/canvas";
const { createCanvas, loadImage } = pkg;

/* ================== Config “clásico” ================== */
const WIDTH = 700;
const ROW_H = 40;          // alto por fila
const TOP_AREA = 300;      // header + top3 (~240–300px)
const LIST_HDR = 60;       // encabezado de columnas
const BOTTOM_PAD = 60;     // margen inferior

// Pila de fuentes segura (nada externo)
const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif";

/* ================== Helpers ================== */
function roundedRect(ctx, x, y, w, h, r = 12) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function fetchName(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return m?.displayName ?? `User ${userId.slice(0, 4)}`;
  } catch {
    return `User ${userId.slice(0, 4)}`;
  }
}

async function fetchAvatar(guild, userId, size = 256) {
  try {
    const m = await guild.members.fetch(userId);
    const url = m?.user?.displayAvatarURL?.({
      extension: "png",
      size,
      forceStatic: true,
    });
    if (url) return await loadImage(url);
  } catch {
    /* ignore */
  }
  return null;
}

/* ================== TOP 3 (plata – oro – bronce) ================== */
async function drawTop3(ctx, guild, entries) {
  // Esperamos entries ya ordenado desc por puntos.
  const list = [entries[1], entries[0], entries[2]]; // plata, oro, bronce

  const places = [
    { label: "PLATA", color: "#c0c0c0", cx: WIDTH / 2 - 180, rank: 2, idx: 1 },
    { label: "ORO", color: "#ffd700", cx: WIDTH / 2, rank: 1, idx: 0 },
    { label: "BRONCE", color: "#cd7f32", cx: WIDTH / 2 + 180, rank: 3, idx: 2 },
  ];

  const topY = 40;

  ctx.textAlign = "center";

  for (const p of places) {
    const e = list[p.idx];
    if (!e) continue;

    // Etiqueta (PLATA/ORO/BRONCE)
    ctx.fillStyle = p.color;
    ctx.font = `900 22px ${FONT_STACK}`;
    ctx.fillText(p.label, p.cx, topY);

    // Avatar circular
    const img = await fetchAvatar(guild, e.userId, 256);
    const r = 44;
    const y = topY + 38;

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.cx, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) ctx.drawImage(img, p.cx - r, y - r, r * 2, r * 2);
    ctx.restore();

    // Borde avatar
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(p.cx, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // NAME
const name = await fetchName(guild, e.userId);
ctx.textAlign = "left";
ctx.fillStyle = "#fff";
ctx.font = `600 16px ${FONT_STACK}`;
ctx.fillText(name, listX + 70, y + 26);

// SCORE
ctx.textAlign = "right";
ctx.fillStyle = "#fff";
ctx.font = `800 16px ${FONT_STACK}`;
ctx.fillText(String(e.points), listX + listW - 18, y + 26);
  }
}

/* ================== Tabla (encabezado + filas) ================== */
async function drawList(ctx, guild, entries, page, perPage) {
  const start = Math.max(0, (page - 1) * perPage);
  const rows = entries.slice(start, start + perPage);

  const listX = 40;
  const listY = TOP_AREA;
  const listW = WIDTH - listX * 2;
  const listH = LIST_HDR + rows.length * ROW_H;

  // Tarjeta base
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,.35)";
  roundedRect(ctx, listX, listY, listW, listH, 18);
  ctx.fill();

  // Sutileza encabezado
  ctx.fillStyle = "rgba(255,255,255,.10)";
  roundedRect(ctx, listX, listY, listW, LIST_HDR, 18);
  ctx.fill();

  // Títulos
  ctx.fillStyle = "#dbeafe";
  ctx.font = `700 15px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.fillText("RANK", listX + 18, listY + 38);
  ctx.fillText("NAME", listX + 88, listY + 38);
  ctx.textAlign = "right";
  ctx.fillText("HIGHEST SCORE", listX + listW - 18, listY + 38);

  // Filas
  let y = listY + LIST_HDR;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const rank = start + i + 1;

    // Línea sutil de guía
    ctx.fillStyle = "rgba(255,255,255,.06)";
    roundedRect(ctx, listX + 18, y + 10, listW - 36, 14, 8);
    ctx.fill();

    // RANK
    ctx.textAlign = "left";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `700 16px ${FONT_STACK}`;
    ctx.fillText(String(rank), listX + 18, y + 26);

    // Avatar mini
    const av = await fetchAvatar(guild, e.userId, 64);
    const ax = listX + 48;
    const ay = y + ROW_H / 2;
    const ar = 12;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (av) ctx.drawImage(av, ax - ar, ay - ar, ar * 2, ar * 2);
    ctx.restore();

    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.stroke();

    // NAME
    const name = await fetchName(guild, e.userId);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `600 16px ${FONT_STACK}`;
    ctx.fillText(name, listX + 70, y + 26);

    // SCORE
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = `800 16px ${FONT_STACK}`;
    ctx.fillText(String(e.points), listX + listW - 18, y + 26);

    y += ROW_H;
  }
}

/* ================== Imagen del leaderboard ================== */
export async function buildLeaderboardImage(guild, entries, page = 1, perPage = 10) {
  const listHeight = LIST_HDR + perPage * ROW_H;
  const height = Math.max(700, TOP_AREA + listHeight + BOTTOM_PAD);

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  // Fondo azul suave
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "#b380e2ff");
  g.addColorStop(1, "#e4a4e4ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, height);

  // TOP 3
  await drawTop3(ctx, guild, entries);

  // Tabla
  await drawList(ctx, guild, entries, page, perPage);

  return canvas.toBuffer("image/png");
}

/* ================== Embed textual simple (para /ranking) ================== */
export async function buildLeaderboardEmbed(client, guild, entries, page = 1, perPage = 10, opts = {}) {
  // Hacemos un texto simple con top N, por compatibilidad.
  const start = Math.max(0, (page - 1) * perPage);
  const rows = entries.slice(start, start + perPage);

  const lines = await Promise.all(
    rows.map(async (e, i) => {
      const rank = start + i + 1;
      const name = await fetchName(guild, e.userId);
      return `**${rank}.** ${name} — **${e.points}** pts`;
    })
  );

  const title = opts?.title ?? "RANKING – LEADERBOARD";
  const description =
    (opts?.description ? opts.description + "\n\n" : "") +
    (lines.length ? lines.join("\n") : "_No hay datos_");

  // Construcción mínima con discord.js v14
  const { EmbedBuilder } = await import("discord.js");
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date());

  return embed;
}
