// src/canvas.js
import { createCanvas, loadImage } from "@napi-rs/canvas";
async function fetchTop3Avatars(guild, entries) {
  const urls = [];
  for (let i = 0; i < 3; i++) {
    const e = entries[i];
    if (!e) { urls.push(null); continue; }
    const m = await guild.members.fetch(e.userId).catch(() => null);
    urls.push(m?.displayAvatarURL({ extension: "png", size: 128 }) ?? null);
  }

  const imgs = [];
  for (const u of urls) {
    if (!u) { imgs.push(null); continue; }
    try { imgs.push(await loadImage(u)); } catch { imgs.push(null); }
  }
  return imgs;
  }


function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGradientBG(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#2a2d7c");
  g.addColorStop(1, "#6d74ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawHeader(ctx, w) {
  ctx.fillStyle = "white";
  ctx.font = "bold 40px Sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LEADERBOARD", w / 2, 60);
}

function drawTop3(ctx, entries, names, avatars) {
  const medals = ["ORO", "PLATA", "BRONCE"];
  const colors = ["#ffd700", "#c0c0c0", "#cd7f32"];
  const positions = [{ cx: 350 }, { cx: 120 }, { cx: 580 }];

  for (let i = 0; i < 3; i++) {
    const e = entries[i]; if (!e) continue;
    const cx = positions[i].cx, cy = 160, R = 50;

    // etiqueta
    ctx.fillStyle = colors[i];
    ctx.font = "bold 22px Sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(medals[i], cx, cy - 70);

    // avatar circular (con aro)
    if (avatars?.[i]) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(avatars[i], cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
      ctx.strokeStyle = "white"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    } else {
      // fallback si no hay avatar
      ctx.fillStyle = "white";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    }

    // nombre + puntos
    ctx.fillStyle = "white";
    ctx.font = "16px Sans-serif";  ctx.fillText(names[i] || "User", cx, cy + 80);
    ctx.font = "bold 20px Sans-serif"; ctx.fillText(`${e.points} pts`, cx, cy + 105);
  }
}

function drawList(ctx, entries, names, page, perPage) {
  const start = (page - 1) * perPage;
  const slice = entries.slice(start, start + perPage);

  const x = 40, y = 300, w = 620;
  const ROW_H = 40;           // alto por fila
  const LIST_HDR = 60;        // encabezado de la tabla
  const h = LIST_HDR + (slice.length * ROW_H);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundedRect(ctx, x, y, w, h, 16);
  ctx.fill();

  ctx.fillStyle = "white";
  ctx.font = "bold 18px Sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("RANK     NAME                         HIGHEST SCORE", x + 20, y + 30);

  let rowY = y + 60;
  ctx.font = "16px Sans-serif";
  const rows = slice.map((e, idx) => {
    const rank = start + idx + 1;
    const name = names[idx + start] || `User`;
    return { rank, name, points: e.points };
  });

  rows.forEach((r, i) => {
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      roundedRect(ctx, x + 10, rowY - 22, w - 20, 34, 10);
      ctx.fill();
    }
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.fillText(String(r.rank).padStart(2, " "), x + 20, rowY);
    ctx.fillText(r.name.length > 25 ? r.name.slice(0, 25) + "…" : r.name, x + 100, rowY);
    ctx.textAlign = "right";
    ctx.fillText(String(r.points), x + w - 20, rowY);
    ctx.textAlign = "left";
    rowY += 40;
  });
}

export async function buildLeaderboardImage(guild, entries, page = 1, perPage = 10) {
  const width = 700;
  const ROW_H = 40;          // alto por fila
  const TOP_AREA = 300;      // header + top3 ocupan ~240px
  const LIST_HDR = 60;       // título de columnas + margen
  const BOTTOM_PAD = 60;     // margen inferior

  const listHeight = LIST_HDR + (perPage * ROW_H);
  const dynamicHeight = Math.max(700, TOP_AREA + listHeight + BOTTOM_PAD);

  const canvas = createCanvas(width, dynamicHeight);
  const ctx = canvas.getContext("2d");

  const names = [];
for (let e of entries.slice(0, page * perPage)) {
  const member = await guild.members.fetch(e.userId).catch(() => null);
  const name = member?.displayName ?? `User ${e.userId.slice(0, 4)}`;
  names.push(name);
}

// Cargar avatares del TOP 3 y pintarlos
const avatars = await fetchTop3Avatars(guild, entries);
drawTop3(ctx, entries, names, avatars);

drawList(ctx, entries, names, page, perPage);

  return canvas.toBuffer("image/png");
}
