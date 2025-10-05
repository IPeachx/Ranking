import { EmbedBuilder } from "discord.js";

const COLORS = {
  main: 0x5865F2,
  gold: 0xF1C40F,
  silver: 0xBDC3C7,
  bronze: 0xCD7F32
};

export async function buildLeaderboardEmbed(client, guild, entries, page = 1, perPage = 10, overrides = {}) {
  if (overrides.todos) perPage = Math.max(perPage, entries.length); // muestra todo si se pide

  const start = (page - 1) * perPage;
  const slice = entries.slice(start, start + perPage);

  const embed = new EmbedBuilder()
    .setColor(COLORS.main)
    .setTitle("🏆 LEADERBOARD – Staff")
    .setTimestamp(new Date());

  // Miniatura: avatar del TOP 1 si no se provee miniatura manual
  if (!overrides.thumbnail && entries.length > 0) {
    const top1 = entries[0];
    const m = await guild.members.fetch(top1.userId).catch(() => null);
    const pfp = m?.displayAvatarURL({ extension: "png", size: 256 });
    if (pfp) embed.setThumbnail(pfp);
  }

  // TOP 3 destacado
  const medals = ["🥇 ORO", "🥈 PLATA", "🥉 BRONCE"];
  const colors = [COLORS.gold, COLORS.silver, COLORS.bronze];

  for (let i = 0; i < Math.min(3, entries.length); i++) {
    const e = entries[i];
    const member = await guild.members.fetch(e.userId).catch(() => null);
    const name = member?.displayName ?? `User ${e.userId}`;
    embed.addFields({ name: `${medals[i]} — ${name}`, value: `Puntos: **${e.points}**`, inline: true });
    if (i === 0) embed.setColor(colors[0]);
  }

  // Lista 4+
  const rows = slice.map((e, idx) => {
    const rank = start + idx + 1;
    const member = guild.members.cache.get(e.userId);
    const name = member?.displayName ?? `User ${e.userId}`;
    const num = String(rank).padStart(2, " ");
    return `\`${num}\`  **${name}** — ${e.points} pts`;
  });
  embed.addFields({ name: "Lista", value: rows.length ? rows.join("\n") : "_No hay más registros en esta página_" });

  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  embed.setFooter({ text: `Página ${page}/${totalPages} • Total: ${entries.length}` });

  // Overrides desde opciones del comando
  if (overrides.title) embed.setTitle(overrides.title);
  if (overrides.description) embed.setDescription(overrides.description);
  if (overrides.image) embed.setImage(overrides.image);
  if (overrides.thumbnail) embed.setThumbnail(overrides.thumbnail);

  return embed;
}
