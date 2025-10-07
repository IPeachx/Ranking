// src/store.js
// Persistencia del ranking en data/ranking.json
// Nota: El primer parámetro "guild" se acepta pero se ignora,
// así NO tienes que cambiar tus comandos existentes.

import fs from "fs-extra";
import path from "node:path";

// ---------- Rutas de almacenamiento ----------
const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "ranking.json");

// ---------- Límites y helpers ----------
const MAX_POINTS_STEP  = 100000;   // máximo a sumar/restar por comando
const MAX_POINTS_TOTAL = 10000000; // límite absoluto del total por usuario

function toInt(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : def;
}
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// ---------- Utilidades de archivo ----------
async function ensureFile() {
  await fs.ensureDir(DATA_DIR);
  const exists = await fs.pathExists(FILE);
  if (!exists) {
    await fs.writeJson(FILE, { users: {} }, { spaces: 2 });
  }
}

async function readDb() {
  await ensureFile();
  try {
    const data = await fs.readJson(FILE);
    if (!data || typeof data !== "object") return { users: {} };
    if (!data.users || typeof data.users !== "object") data.users = {};
    // Normaliza a enteros
    for (const [uid, v] of Object.entries(data.users)) {
      const p = toInt(v?.points ?? 0, 0);
      data.users[uid] = { points: clamp(p, -MAX_POINTS_TOTAL, MAX_POINTS_TOTAL) };
    }
    return data;
  } catch {
    // Si el archivo se corrompe, lo re-inicializamos
    await fs.writeJson(FILE, { users: {} }, { spaces: 2 });
    return { users: {} };
  }
}

async function writeDb(db) {
  await fs.writeJson(FILE, db, { spaces: 2 });
}

// ---------- API del store ----------
/** Asegura estructura y corrige datos inválidos si existieran. */
export async function initStore() {
  await ensureFile();
  const db = await readDb();
  if (!db.users || typeof db.users !== "object") {
    db.users = {};
    await writeDb(db);
  } else {
    await writeDb(db); // guarda normalizado
  }
}

/** Devuelve todos los usuarios tal cual están guardados. */
export async function getAll(/* guild */ _g) {
  const db = await readDb();
  return Object.entries(db.users).map(([userId, v]) => ({
    userId,
    points: toInt(v?.points ?? 0, 0),
  }));
}

/** Devuelve un array ordenado por puntos (desc). Opcional: limit. */
export async function getSorted(/* guild */ _g, limit = null) {
  const all = await getAll();
  const sorted = all.sort((a, b) => b.points - a.points);
  return limit ? sorted.slice(0, limit) : sorted;
}

/** Suma puntos a un usuario (crea si no existe). */
export async function addPoints(/* guild */ _g, userId, delta) {
  if (!userId) throw new Error("addPoints: falta userId");
  const db  = await readDb();
  const uid = String(userId);

  const inc = toInt(delta, 0);
  if (!Number.isInteger(inc) || Math.abs(inc) > MAX_POINTS_STEP) {
    throw new Error(`Delta fuera de rango o inválido: ${delta}`);
  }

  db.users ||= {};
  const current = toInt(db.users[uid]?.points ?? 0, 0);
  db.users[uid] = {
    points: clamp(current + inc, -MAX_POINTS_TOTAL, MAX_POINTS_TOTAL),
  };

  await writeDb(db);
  return { userId: uid, points: db.users[uid].points };
}

/** Fija puntos exactos a un usuario (crea si no existe). */
export async function setPoints(/* guild */ _g, userId, pts) {
  if (!userId) throw new Error("setPoints: falta userId");
  const db  = await readDb();
  const uid = String(userId);

  const val = toInt(pts, 0);
  if (!Number.isInteger(val) || Math.abs(val) > MAX_POINTS_TOTAL) {
    throw new Error(`Valor de puntos fuera de rango o inválido: ${pts}`);
  }

  db.users ||= {};
  db.users[uid] = { points: val };

  await writeDb(db);
  return { userId: uid, points: db.users[uid].points };
}

/** Elimina a un usuario del ranking. */
export async function removeUser(/* guild */ _g, userId) {
  if (!userId) throw new Error("removeUser: falta userId");
  const db  = await readDb();
  const uid = String(userId);
  if (db.users && uid in db.users) {
    delete db.users[uid];
    await writeDb(db);
  }
  return { ok: true };
}

/** Resetea todos los puntos a 0 o borra el ranking (modo = 'zero'|'wipe'). */
export async function resetAll(/* guild */ _g, mode = "zero") {
  const db = await readDb();
  if (mode === "wipe") {
    db.users = {};
  } else {
    for (const uid of Object.keys(db.users)) {
      db.users[uid] = { points: 0 };
    }
  }
  await writeDb(db);
  return { ok: true };
}

/** Exporta el JSON actual como objeto (útil para respaldos). */
export async function exportJson() {
  return await readDb();
}

// Compat: export default por si lo importas como default
export default {
  initStore,
  getAll,
  getSorted,
  addPoints,
  setPoints,
  removeUser,
  resetAll,
  exportJson,
};
