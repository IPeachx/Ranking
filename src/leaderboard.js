import { getAll } from "./store.js";

export async function getSorted() {
  const users = await getAll();
  const entries = Object.entries(users).map(([userId, v]) => ({ userId, points: v.points, createdAt: v.createdAt }));
  entries.sort((a, b) => (b.points - a.points) || (a.createdAt - b.createdAt));
  return entries;
}
