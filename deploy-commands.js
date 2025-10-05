import "dotenv/config";
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const commands = [
  new SlashCommandBuilder().setName("ranking")
    .setDescription("Muestra la tabla de ranking")
    .addIntegerOption(o => o.setName("pagina").setDescription("Página").setMinValue(1))
    .addBooleanOption(o => o.setName("todos").setDescription("Mostrar todo en una sola página"))
    .addStringOption(o => o.setName("titulo").setDescription("Título personalizado").setMaxLength(256))
    .addStringOption(o => o.setName("descripcion").setDescription("Descripción personalizada").setMaxLength(2000))
    .addStringOption(o => o.setName("imagen").setDescription("URL de imagen grande (.png/.jpg/.gif)"))
    .addStringOption(o => o.setName("miniatura").setDescription("URL de miniatura (thumbnail)")),

  new SlashCommandBuilder().setName("ranking-image")
    .setDescription("Genera una imagen estilo leaderboard del ranking actual")
    .addIntegerOption(o => o.setName("pagina").setDescription("Página a mostrar").setMinValue(1))
    .addBooleanOption(o => o.setName("todos").setDescription("Incluir a todos en una sola página")),

  new SlashCommandBuilder().setName("rank-add-user")
    .setDescription("Agrega a un usuario al ranking")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true)),

  new SlashCommandBuilder().setName("rank-remove-user")
    .setDescription("Quita a un usuario del ranking")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true)),

  new SlashCommandBuilder().setName("rank-add-points")
    .setDescription("Suma puntos a un usuario")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addIntegerOption(o => o.setName("puntos").setDescription("Cantidad a sumar").setRequired(true)),

  new SlashCommandBuilder().setName("rank-subtract-points")
    .setDescription("Resta puntos a un usuario")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addIntegerOption(o => o.setName("puntos").setDescription("Cantidad a restar").setRequired(true)),

  new SlashCommandBuilder().setName("rank-set")
    .setDescription("Fija puntos exactos")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addIntegerOption(o => o.setName("puntos").setDescription("Nuevo total").setRequired(true)),

  new SlashCommandBuilder().setName("rank-reset")
    .setDescription("Resetea TODO el ranking"),

    new SlashCommandBuilder()
  .setName("rank-sync-podium")
  .setDescription("Recalcula y sincroniza los roles 🥇🥈🥉 del Top 3 (diagnóstico)"),

  new SlashCommandBuilder().setName("rank-export")
    .setDescription("Exporta el ranking como JSON")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.GUILD_ID
  ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
  : Routes.applicationCommands(process.env.CLIENT_ID);

try {
  console.log("🔁 Registrando comandos…");
  await rest.put(route, { body: commands });
  console.log("✅ Comandos listos.");
} catch (e) {
  console.error(e);
}
