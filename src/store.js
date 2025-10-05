// src/store.js
import fs from "fs-extra";

const FILE = "data/ranking.json";

// --------------------- helpers de archivo ---------------------
async function ensureBase() {
  await fs.ensureFile(FILE);
  try {
    const raw = await fs.readFile(FILE, "utf8");
    if (!raw.trim()) {
      await fs.writeJson(FILE, { users: {}, updatedAt: Date.now() }, { spaces: 2 });
    }
  } catch {
    await fs.writeJson(FILE, { users: {}, updatedAt: Date.now() }, { spaces: 2 });
  }
}
async function read()  { await ensureBase(); return fs.readJson(FILE); }
async function write(o){ o.updatedAt = Date.now(); await fs.writeJson(FILE, o, { spaces: 2 }); }

// --------------------- API pública del “store” ---------------------
export async function initStore() {
  await ensureBase();
}

export async function getAll() {
  const db = await read();
  return db.users; // objeto { userId: { points, ... } }
}

export async function addUser(userId) {
  const db = await read();
  if (!db.users[userId]) db.users[userId] = { points: 0, createdAt: Date.now() };
  await write(db);
}

export async function removeUser(userId) {
  const db = await read();
  delete db.users[userId];
  await write(db);
}

export async function addPoints(userId, delta) {
  const db = await read();
  if (!db.users[userId]) db.users[userId] = { points: 0, createdAt: Date.now() };
  db.users[userId].points += Number(delta) || 0;
  await write(db);
  return db.users[userId].points;
}

export async function setPoints(userId, value) {
  const db = await read();
  if (!db.users[userId]) db.users[userId] = { points: 0, createdAt: Date.now() };
  db.users[userId].points = Number(value) || 0;
  await write(db);
}

export async function resetAll() {
  await write({ users: {}, updatedAt: Date.now() });
}

/**
 * Devuelve la lista normalizada y ordenada por puntos (desc).
 * Acepta cualquier forma razonable: objeto, array o Map.
 */
export async function getSorted(/* guild */) {
  const raw = await getAll();

  // 1) Normaliza a array
  let list;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw instanceof Map) {
    list = Array.from(raw.values());
  } else if (raw && typeof raw === "object") {
    // raw proviene de db.users: { userId: {points,...} }
    list = Object.entries(raw).map(([userId, v]) => ({ userId, ...v }));
  } else {
    list = [];
  }

  // 2) Asegura userId y points numéricos
  const grabUserId = (e) =>
    e.userId ?? e.id ?? e.user?.id ?? e.user ?? e.targetId ?? e.uid;

  const normalized = list
    .map((e) => ({
      ...e,
      userId: grabUserId(e),
      points: Number(e.points ?? e.score ?? e.pts ?? 0),
    }))
    .filter((e) => !!e.userId);

  // 3) Ordena por puntos (desc)
  normalized.sort((a, b) => b.points - a.points);

  return normalized;
}
