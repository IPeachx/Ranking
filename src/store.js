import fs from "fs-extra";
const FILE = "data/ranking.json";

export async function initStore() {
  await fs.ensureFile(FILE);
  try {
    const raw = await fs.readFile(FILE, "utf8");
    if (!raw.trim()) await fs.writeJson(FILE, { users: {}, updatedAt: Date.now() }, { spaces: 2 });
  } catch {
    await fs.writeJson(FILE, { users: {}, updatedAt: Date.now() }, { spaces: 2 });
  }
}

async function read() { return await fs.readJson(FILE); }
async function write(obj) {
  obj.updatedAt = Date.now();
  await fs.writeJson(FILE, obj, { spaces: 2 });
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
  db.users[userId].points += delta;
  await write(db);
  return db.users[userId].points;
}

export async function setPoints(userId, value) {
  const db = await read();
  if (!db.users[userId]) db.users[userId] = { points: 0, createdAt: Date.now() };
  db.users[userId].points = value;
  await write(db);
}

export async function resetAll() {
  await write({ users: {}, updatedAt: Date.now() });
}

export async function getAll() {
  const db = await read();
  return db.users;
}
