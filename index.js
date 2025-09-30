import "dotenv/config";
import {Client, GatewayIntentBits, AttachmentBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType} from "discord.js";
import { initStore, addUser, removeUser, addPoints, setPoints, resetAll } from "./src/store.js";
import { getSorted } from "./src/leaderboard.js";
import { buildLeaderboardEmbed } from "./src/ui.js";
import { buildLeaderboardImage } from "./src/canvas.js";
import fs from "fs-extra";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ---- Config ----
const ALLOWED_ROLE_IDS = (process.env.ALLOWED_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;

const COLORS = {
  add: 0x2ecc71, sub: 0xe74c3c, set: 0xf39c12,
  addUser: 0x3498db, removeUser: 0x9b59b6, reset: 0x95a5a6,
  export: 0x1abc9c
};

function canUse(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (ALLOWED_ROLE_IDS.length === 0) return true;
  return member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
}

async function sendLogEmbed(guild, type, data) {
  try {
    if (!LOG_CHANNEL_ID) return;
    const ch = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch) return;

    const color = COLORS[type] ?? 0xFFC0CB;
    const titleMap = { add: "➕ Add Points", sub: "➖ Subtract Points", set: "✏️ Set Points", addUser: "👤 Add User", removeUser: "🗑️ Remove User", reset: "⚠️ Reset Ranking", export: "📦 Export Ranking" };
    const embed = new EmbedBuilder().setColor(color).setTitle(`🍭 Lollipop | ${titleMap[type] || "Log"}`).setTimestamp(new Date()).setFooter({ text: "Staff Ranking Logs" });

    if (data.targetTag) embed.addFields({ name: "Usuario", value: `${data.targetTag} (${data.targetId})`, inline: true });
    if (data.byTag) embed.addFields({ name: "Por", value: `${data.byTag}`, inline: true });
    if (data.delta != null) embed.addFields({ name: "Cambio", value: `${data.delta > 0 ? "+" : ""}${data.delta} pts`, inline: true });
    if (data.total != null) embed.addFields({ name: "Total actual", value: `**${data.total}** pts`, inline: true });

    const fmt = (arr) => (arr && arr.length ? arr.map((e, i) => `${i + 1}. ${e.name} — **${e.points}**`).join("\n") : "_(vacío)_");
    if (data.beforeTop3) embed.addFields({ name: "Top 3 (antes)", value: fmt(data.beforeTop3) });
    if (data.afterTop3) embed.addFields({ name: "Top 3 (después)", value: fmt(data.afterTop3) });

    await ch.send({ embeds: [embed] });
  } catch (e) { console.error("Log error:", e); }
}

// --- Auto-roles & anuncios de podio ---
const GOLD_ROLE_ID = process.env.GOLD_ROLE_ID || null;
const SILVER_ROLE_ID = process.env.SILVER_ROLE_ID || null;
const BRONZE_ROLE_ID = process.env.BRONZE_ROLE_ID || null;
const ANNOUNCE_CHANNEL_ID = process.env.ANNOUNCE_CHANNEL_ID || null;

const MEDAL_ROLE_IDS = [GOLD_ROLE_ID, SILVER_ROLE_ID, BRONZE_ROLE_ID];
const MEDAL_NAMES = ["ORO", "PLATA", "BRONCE"];
const MEDAL_EMOJI = ["🥇", "🥈", "🥉"];
const MEDAL_COLOR = [0xF1C40F, 0xBDC3C7, 0xCD7F32];

/** Sincroniza los roles Oro/Plata/Bronce con el top3 actual. */
async function syncPodiumRoles(guild, top3) {
  const targets = [top3[0]?.id || null, top3[1]?.id || null, top3[2]?.id || null];
  console.log("[podium] Objetivos:", targets);

  for (let i = 0; i < 3; i++) {
    const roleId = MEDAL_ROLE_IDS[i];
    if (!roleId) { console.warn("[podium] Falta ROLE_ID para", MEDAL_NAMES[i]); continue; }

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(e => {
      console.error(`[podium] No encuentro el rol ${roleId}:`, e.message);
      return null;
    });
    if (!role) continue;

    // Quitar rol a quienes no deban tenerlo
    for (const [memberId, member] of role.members) {
      if (memberId !== targets[i]) {
        try {
          await member.roles.remove(role, "Auto-podium sync");
          console.log(`[podium] - Quitar ${role.name} a ${member.user.tag}`);
        } catch (e) {
          console.error(`[podium] Error quitando ${role.name} a ${member?.user?.tag}:`, e.code, e.message);
        }
      }
    }

    // Dar rol al objetivo
    if (targets[i]) {
      const m = await guild.members.fetch(targets[i]).catch(e => {
        console.error("[podium] No pude fetch del miembro", targets[i], e.message);
        return null;
      });
      if (m && !m.roles.cache.has(role.id)) {
        try {
          await m.roles.add(role, "Auto-podium sync");
          console.log(`[podium] + Dar ${role.name} a ${m.user.tag}`);
        } catch (e) {
          console.error(`[podium] Error dando ${role.name} a ${m?.user?.tag}:`, e.code, e.message);
        }
      }
    }
  }
}

/** Crea diffs de podio entre before y after */
function diffPodium(before, after) {
  const b = new Map(before.map((e, idx) => [e.id, idx]));
  const a = new Map(after.map((e, idx) => [e.id, idx]));
  const events = [];

  for (const [id, posAfter] of a.entries()) {
    const posBefore = b.has(id) ? b.get(id) : null;
    if (posBefore === null) {
      events.push({ type: "enter", id, posAfter });
    } else if (posAfter < posBefore) {
      events.push({ type: "promote", id, from: posBefore, to: posAfter });
    } else if (posAfter > posBefore) {
      events.push({ type: "demote", id, from: posBefore, to: posAfter });
    }
  }
  for (const [id, posBefore] of b.entries()) {
    if (!a.has(id)) events.push({ type: "leave", id, from: posBefore });
  }
  return events;
}

/** Anuncia cambios de podio en el canal configurado */
async function announcePodiumDiff(guild, beforeTop3, afterTop3, triggeredByTag) {
  if (!ANNOUNCE_CHANNEL_ID) return;
  const ch = await guild.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(() => null);
  if (!ch) return;

  const evt = diffPodium(beforeTop3, afterTop3);
  if (!evt.length) return;

  const lines = [];
  for (const e of evt) {
    if (e.type === "enter") {
      const userId = afterTop3[e.posAfter].id;
      lines.push(`${MEDAL_EMOJI[e.posAfter]} <@${userId}> ahora es **${MEDAL_NAMES[e.posAfter]}**`);
    } else if (e.type === "promote") {
      const userId = afterTop3[e.to].id;
      lines.push(`⬆️ <@${userId}> ascendió de **${MEDAL_NAMES[e.from]}** a **${MEDAL_NAMES[e.to]}**`);
    } else if (e.type === "demote") {
      const name = beforeTop3[e.from].name;
      lines.push(`⬇️ ${name} bajó de **${MEDAL_NAMES[e.from]}** a **${MEDAL_NAMES[e.to]}**`);
    } else if (e.type === "leave") {
      const name = beforeTop3[e.from].name;
      lines.push(`⛔ ${name} salió del podio`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFC0CB)
    .setTitle("🏁 Actualización del Podio")
    .setDescription(lines.join("\n"))
    .setFooter({ text: triggeredByTag ? `Acción realizada por ${triggeredByTag}` : undefined })
    .setTimestamp(new Date());

  await ch.send({ embeds: [embed] });
}

async function snapshotTop3(guild, entries) {
  const top = entries.slice(0, 3);
  const out = [];
  for (const e of top) {
    const m = await guild.members.fetch(e.userId).catch(() => null);
    const name = m?.displayName ?? `User ${e.userId.slice(0, 4)}`;
    out.push({ name, points: e.points, id: e.userId });
  }
  return out;
}

client.once("ready", async () => {
  await initStore();
  console.log(`✅ Conectado como ${client.user.tag}`);
  client.user.setActivity("Ranking de Staff 🍭", { type: 0 });
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    switch (i.commandName) {
      case "ranking": {
        await i.deferReply();
        const page = i.options.getInteger("pagina") ?? 1;
        const todos = i.options.getBoolean("todos") ?? false;
        const title = i.options.getString("titulo") ?? null;
        const description = i.options.getString("descripcion") ?? null;
        const image = i.options.getString("imagen") ?? null;
        const thumbnail = i.options.getString("miniatura") ?? null;

        const entries = await getSorted();
        const embed = await buildLeaderboardEmbed(i.client, i.guild, entries, page, 10, {
          todos, title, description, image, thumbnail
        });
        await i.editReply({ embeds: [embed] });
        break;
      }

      // ====== ARREGLADO: SOLO IMAGEN + VALIDACIÓN DE BUFFER ======
      case "ranking-image": {
        await i.deferReply();

        const page  = i.options.getInteger("pagina") ?? 1;
        const todos = i.options.getBoolean("todos") ?? false;

        const entries = await getSorted();
        const per = todos ? Math.max(entries.length, 1) : 10;

        const buffer = await buildLeaderboardImage(i.guild, entries, page, per)
          .catch(err => { console.error("[/ranking-image] buildLeaderboardImage error:", err); return null; });

        console.log("[/ranking-image] buffer bytes:", buffer?.length);

        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 1000) {
          await i.editReply({ content: "❌ No pude generar la imagen del ranking (buffer vacío). Revisa logs en Railway." });
          break;
        }

        const file = new AttachmentBuilder(buffer, { name: "ranking.png" });
        await i.editReply({ files: [file] });
        break;
      }
      // ===========================================================

      case "rank-add-user": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        const beforeTop3 = await snapshotTop3(i.guild, await getSorted());
        const user = i.options.getUser("usuario", true);
        await addUser(user.id);
        await i.reply({ content: `✅ ${user} agregado al ranking.`, ephemeral: true });
        const afterTop3 = await snapshotTop3(i.guild, await getSorted());
        await sendLogEmbed(i.guild, "addUser", { targetTag: user.tag, targetId: user.id, byTag: i.user.tag, beforeTop3, afterTop3 });
        await syncPodiumRoles(i.guild, afterTop3);
        await announcePodiumDiff(i.guild, beforeTop3, afterTop3, i.user.tag);
        break;
      }

      case "rank-remove-user": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        const beforeTop3 = await snapshotTop3(i.guild, await getSorted());
        const user = i.options.getUser("usuario", true);
        await removeUser(user.id);
        await i.reply({ content: `🗑️ ${user} removido del ranking.`, ephemeral: true });
        const afterTop3 = await snapshotTop3(i.guild, await getSorted());
        await sendLogEmbed(i.guild, "removeUser", { targetTag: user.tag, targetId: user.id, byTag: i.user.tag, beforeTop3, afterTop3 });
        await syncPodiumRoles(i.guild, afterTop3);
        await announcePodiumDiff(i.guild, beforeTop3, afterTop3, i.user.tag);
        break;
      }

      case "rank-add-points": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        const beforeTop3 = await snapshotTop3(i.guild, await getSorted());
        const user = i.options.getUser("usuario", true);
        const pts = i.options.getInteger("puntos", true);
        const total = await addPoints(user.id, Math.abs(pts));
        await i.reply({ content: `➕ ${user} ahora tiene **${total}** puntos.`, ephemeral: true });
        const afterTop3 = await snapshotTop3(i.guild, await getSorted());
        await sendLogEmbed(i.guild, "add", { targetTag: user.tag, targetId: user.id, byTag: i.user.tag, delta: Math.abs(pts), total, beforeTop3, afterTop3 });
        await syncPodiumRoles(i.guild, afterTop3);
        await announcePodiumDiff(i.guild, beforeTop3, afterTop3, i.user.tag);
        break;
      }

      case "rank-subtract-points": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        const beforeTop3 = await snapshotTop3(i.guild, await getSorted());
        const user = i.options.getUser("usuario", true);
        const pts = i.options.getInteger("puntos", true);
        const total = await addPoints(user.id, -Math.abs(pts));
        await i.reply({ content: `➖ ${user} ahora tiene **${total}** puntos.`, ephemeral: true });
        const afterTop3 = await snapshotTop3(i.guild, await getSorted());
        await sendLogEmbed(i.guild, "sub", { targetTag: user.tag, targetId: user.id, byTag: i.user.tag, delta: -Math.abs(pts), total, beforeTop3, afterTop3 });
        break;
      }

      case "rank-set": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        const beforeTop3 = await snapshotTop3(i.guild, await getSorted());
        const user = i.options.getUser("usuario", true);
        const pts = i.options.getInteger("puntos", true);
        await setPoints(user.id, pts);
        await i.reply({ content: `✏️ ${user} fijado en **${pts}** puntos.`, ephemeral: true });
        const afterTop3 = await snapshotTop3(i.guild, await getSorted());
        await sendLogEmbed(i.guild, "set", { targetTag: user.tag, targetId: user.id, byTag: i.user.tag, delta: 0, total: pts, beforeTop3, afterTop3 });
        await syncPodiumRoles(i.guild, afterTop3);
        await announcePodiumDiff(i.guild, beforeTop3, afterTop3, i.user.tag);
        break;
      }

      case "rank-reset": {
        if (!canUse(i.member)) {
          return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        }

        // 1) Podio ANTES del reset
        const beforeTop3 = await snapshotTop3(i.guild, await getSorted());

        // 2) Reset del ranking
        await resetAll();

        // 3) Respuesta al moderador
        await i.reply({ content: "⚠️ Ranking reseteado por completo.", ephemeral: true });

        // 4) Después del reset no hay podio
        const afterTop3 = [];

        // 5) Log opcional
        await sendLogEmbed(i.guild, "reset", { byTag: i.user.tag, beforeTop3, afterTop3 });

        // 6) Quitar roles 🥇🥈🥉
        await syncPodiumRoles(i.guild, afterTop3);

        // 7) Anuncio del cambio de podio
        await announcePodiumDiff(i.guild, beforeTop3, afterTop3, i.user.tag);
        break;
      }

      case "rank-export": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso para usar este comando.", ephemeral: true });
        const entries = await getSorted();
        const data = JSON.stringify(entries, null, 2);
        const path = "data/export.json";
        await fs.writeFile(path, data);
        const file = new AttachmentBuilder(path);
        await i.reply({ content: "📦 Exportación lista.", files: [file], ephemeral: true });
        const top3 = await snapshotTop3(i.guild, entries);
        await sendLogEmbed(i.guild, "export", { byTag: i.user.tag, beforeTop3: top3 });
        break;
      }

      case "rank-sync-podium": {
        if (!canUse(i.member)) return i.reply({ content: "⛔ No tienes permiso.", ephemeral: true });
        await i.deferReply({ ephemeral: true });
        console.log("[podium] ENV", { GOLD_ROLE_ID, SILVER_ROLE_ID, BRONZE_ROLE_ID, ANNOUNCE_CHANNEL_ID });
        const entries = await getSorted();
        const top = await snapshotTop3(i.guild, entries);
        console.log("[podium] Top3 actual:", top);
        await syncPodiumRoles(i.guild, top);
        await i.editReply("✅ Roles de podio sincronizados con el Top 3 actual. Revisa la consola.");
        break;
      }
    }

  } catch (err) {
    console.error(err);
    if (i.deferred || i.replied) {
      await i.editReply({ content: "❌ Ocurrió un error." });
    } else {
      await i.reply({ content: "❌ Ocurrió un error.", ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// ========== [RANKING/TICKETS ADDONS] ==========

// Config desde .env
const CLOSED_CATEGORY_ID = process.env.CLOSED_CATEGORY_ID || null;
const SUGAR_ROLE_ID = process.env.SUGAR_ROLE_ID || null;
const TICKET_POINTS = Number(process.env.TICKET_POINTS || 1);
const TICKET_AUDIT_CHANNEL_ID = process.env.TICKET_AUDIT_CHANNEL_ID || null;
const TICKET_APPROVER_ROLE_IDS = (process.env.TICKET_APPROVER_ROLE_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const TICKET_CLAIM_BOT_ID = process.env.TICKET_CLAIM_BOT_ID || null;

// Stores (anti-duplicados y claimers)
import fsExtra from "fs-extra";
try { fsExtra.ensureDirSync("data"); } catch {}
const CLOSED_TRACK = "data/closed-tickets.json";
const CLAIMERS_STORE = "data/ticket-claimers.json";

let processedClosed = new Set();
try {
  const raw = fsExtra.readFileSync(CLOSED_TRACK, "utf8");
  processedClosed = new Set(JSON.parse(raw));
} catch {}

let claimersByChannel = new Map();
try {
  const raw = fsExtra.readFileSync(CLAIMERS_STORE, "utf8");
  claimersByChannel = new Map(Object.entries(JSON.parse(raw)));
} catch {}

function saveProcessedClosed() {
  try { fsExtra.writeFileSync(CLOSED_TRACK, JSON.stringify([...processedClosed], null, 2)); } catch {}
}
function saveClaimers() {
  try { fsExtra.writeFileSync(CLAIMERS_STORE, JSON.stringify(Object.fromEntries(claimersByChannel), null, 2)); } catch {}
}

// Helpers
function hasAnyRole(member, roleIds) {
  if (!member) return false;
  return roleIds.some(r => member.roles.cache.has(r));
}

// Participantes con el rol SUGAR_ROLE_ID que escribieron en el canal
async function collectEligibleByRole(channel) {
  const ids = new Set();
  try {
    // últimos ~300 mensajes
    let before;
    for (let k = 0; k < 3; k++) {
      const msgs = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!msgs || msgs.size === 0) break;
      before = msgs.last()?.id;
      for (const m of msgs.values()) {
        if (!m.author || m.author.bot) continue;
        const mem = await channel.guild.members.fetch(m.author.id).catch(() => null);
        if (mem?.roles.cache.has(SUGAR_ROLE_ID)) ids.add(mem.id);
      }
    }
    // miembros visibles (threads/permisos)
    for (const [uid, mem] of (channel.members || [])) {
      if (mem?.roles?.cache?.has(SUGAR_ROLE_ID)) ids.add(uid);
    }
  } catch {}
  return ids;
}

// Fallback por si no hay cache de claimer
async function tryFindClaimerId(channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    for (const m of msgs.values()) {
      const parts = [m.content || ""];
      for (const e of m.embeds || []) {
        parts.push(e.title || "", e.description || "", e.author?.name || "", e.footer?.text || "");
        for (const f of (e.fields || [])) parts.push(`${f.name}: ${f.value}`);
      }
      const txt = parts.join("\n");
      if (/ticket\s+reclamado\s+por\s+el\s+staff/i.test(txt) || /claimed by|reclamad[oa] por|cerrado por/i.test(txt)) {
        const mm = txt.match(/<@!?(\d{17,20})>/) || txt.match(/\b(\d{17,20})\b/);
        if (mm) return mm[1];
      }
    }
  } catch {}
  return null;
}

// Detector de "Ticket reclamado por el staff @..."
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || !TICKET_CLAIM_BOT_ID) return;
    if (msg.author?.id !== TICKET_CLAIM_BOT_ID) return;

    const parts = [msg.content || ""];
    for (const e of msg.embeds || []) {
      parts.push(e.title || "", e.description || "", e.author?.name || "", e.footer?.text || "");
      for (const f of (e.fields || [])) parts.push(`${f.name}: ${f.value}`);
    }
    const text = parts.join("\n");
    const m =
      text.match(/ticket\s+reclamado\s+por\s+el\s+staff\s+<@!?(\d{17,20})>/i) ||
      text.match(/reclamad[oa]\s+por\s+<@!?(\d{17,20})>/i) ||
      text.match(/claimed\s+by\s+<@!?(\d{17,20})>/i);

    if (m) {
      claimersByChannel.set(msg.channel.id, m[1]);
      saveClaimers();
    }
  } catch (e) {
    console.error("[claim] detector:", e);
  }
});

// Panel Contar/Anular al cerrarse el ticket
client.on("channelUpdate", async (oldCh, newCh) => {
  try {
    if (!newCh || !("type" in newCh)) return;
    const isTextish = [ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread].includes(newCh.type);
    if (!isTextish) return;

    const movedToClosed = CLOSED_CATEGORY_ID && newCh.parentId === CLOSED_CATEGORY_ID && oldCh.parentId !== CLOSED_CATEGORY_ID;
    const renamedClosed = /^closed-\d+/.test(newCh.name) && !/^closed-\d+/.test(oldCh.name);
    if (!movedToClosed && !renamedClosed) return;

    if (processedClosed.has(newCh.id)) return;
    processedClosed.add(newCh.id);
    saveProcessedClosed();

    let claimerId = claimersByChannel.get(newCh.id) || null;
    if (!claimerId) claimerId = await tryFindClaimerId(newCh);

    const emb = new EmbedBuilder()
      .setColor(0xFFC0CB)
      .setTitle("🎫 Ticket cerrado — revisión")
      .setDescription(`Canal: <#${newCh.id}>`)
      .addFields(
        { name: "Reclamado/Cerrado por", value: claimerId ? `<@${claimerId}>` : "No detectado", inline: true },
        { name: "Rol elegible", value: `<@&${SUGAR_ROLE_ID}>`, inline: true },
        { name: "Puntos por usuario", value: `${TICKET_POINTS}`, inline: true }
      )
      .setFooter({ text: `CanalID: ${newCh.id}` })
      .setTimestamp(new Date());

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tclosed:count:${newCh.id}:${claimerId || 0}`).setLabel("Contar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tclosed:deny:${newCh.id}`).setLabel("Anular").setStyle(ButtonStyle.Danger)
    );

    await newCh.send({ embeds: [emb], components: [row] }).catch(() => {});
  } catch (e) {
    console.error("[closed/panel] error:", e);
  }
});

// Botones Contar/Anular
client.on("interactionCreate", async (i) => {
  try {
    if (!i.isButton()) return;
    const parts = i.customId.split(":");
    if (parts[0] !== "tclosed") return;

    // sólo roles aprobadores
    if (!hasAnyRole(i.member, TICKET_APPROVER_ROLE_IDS)) {
      return i.reply({ content: "⛔ No tienes permiso para usar estos botones.", ephemeral: true });
    }

    const action = parts[1];
    const channelId = parts[2];

    const disabledRow = new ActionRowBuilder().addComponents(
      ...i.message.components[0].components.map(c => ButtonBuilder.from(c).setDisabled(true))
    );

    const auditCh = TICKET_AUDIT_CHANNEL_ID
      ? await i.guild.channels.fetch(TICKET_AUDIT_CHANNEL_ID).catch(() => null)
      : null;

    if (action === "deny") {
      processedClosed.add(channelId); saveProcessedClosed();
      await i.update({
        components: [disabledRow],
        embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor(0xFFC0CB).addFields({ name: "⛔ Anulado", value: `Marcado por ${i.user.tag}` })]
      });
      const log = new EmbedBuilder()
        .setColor(0xed4245).setTitle("Ticket anulado")
        .addFields({ name: "Canal", value: `<#${channelId}>`, inline: true }, { name: "Moderador", value: i.user.tag, inline: true })
        .setTimestamp(new Date());
      auditCh?.send({ embeds: [log] });
      return;
    }

    if (action === "count") {
      const claimerId = parts[3] !== "0" ? parts[3] : null;
      const ch = await i.guild.channels.fetch(channelId).catch(() => null);
      if (!ch) return i.reply({ content: "No pude acceder al canal del ticket.", ephemeral: true });

      const eligibles = await collectEligibleByRole(ch);
      if (claimerId) {
        const mem = await i.guild.members.fetch(claimerId).catch(() => null);
        if (mem?.roles.cache.has(SUGAR_ROLE_ID)) eligibles.add(claimerId);
      }
      if (eligibles.size === 0) {
        return i.reply({ content: "ℹ️ No encontré usuarios elegibles (con el rol requerido) en este ticket.", ephemeral: true });
      }

      const beforeTop3 = await snapshotTop3(i.guild, await getSorted());
      const lines = [];
      for (const uid of eligibles) {
        const total = await addPoints(uid, TICKET_POINTS);
        lines.push(`<@${uid}>  **+${TICKET_POINTS}** (total: **${total}**)`);
        await sendLogEmbed(i.guild, "add", { targetTag: `<@${uid}>`, targetId: uid, byTag: `${i.user.tag} (Ticket)`, delta: TICKET_POINTS, total, beforeTop3: null, afterTop3: null });
      }
      const afterTop3 = await snapshotTop3(i.guild, await getSorted());
      await syncPodiumRoles(i.guild, afterTop3);
      await announcePodiumDiff(i.guild, beforeTop3, afterTop3, i.user.tag);

      processedClosed.add(channelId); saveProcessedClosed();

      await i.update({
        components: [disabledRow],
        embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor(0x57f287).addFields({ name: "✅ Contado", value: lines.join("\n") })]
      });

      await i.followUp({ content: `🎫 Se contó el ticket a: ${[...eligibles].map(id => `<@${id}>`).join(", ")}`, ephemeral: true });

      const log = new EmbedBuilder()
        .setColor(0x57f287).setTitle("Ticket contado")
        .addFields(
          { name: "Canal", value: `<#${channelId}>`, inline: true },
          { name: "Moderador", value: i.user.tag, inline: true },
          { name: "Rol elegible", value: `<@&${SUGAR_ROLE_ID}>`, inline: true },
          { name: "Puntos por usuario", value: `${TICKET_POINTS}`, inline: true },
          { name: "Usuarios contados", value: lines.join("\n") }
        )
        .setTimestamp(new Date());
      auditCh?.send({ embeds: [log] });
      return;
    }
  } catch (e) {
    console.error("[closed/buttons] error:", e);
    if (!i.replied && !i.deferred) {
      await i.reply({ content: "❌ Error al procesar.", ephemeral: true });
    }
  }
});

// Prefijo !Ranking (opcional)
const RANK_COOLDOWN = new Map();
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot) return;
    if (!/^!ranking\b/i.test(msg.content.trim())) return;

    const key = msg.channel.id;
    const last = RANK_COOLDOWN.get(key) || 0;
    if (Date.now() - last < 5000) return;
    RANK_COOLDOWN.set(key, Date.now());

    // parseo simple de args (!ranking p=2 todos)
    const args = msg.content.trim().split(/\s+/).slice(1);
    let page = 1, todos = false;
    for (const a of args) {
      if (/^(p=)?\d+$/i.test(a)) page = parseInt(a.replace(/^p=/i, ""), 10);
      if (/^(todos|all)$/i.test(a)) todos = true;
    }

    const entries = await getSorted();
    const per = todos ? Math.max(entries.length, 1) : 10;

    const buffer = await buildLeaderboardImage(msg.guild, entries, page, per)
      .catch(err => { 
        console.error("[!ranking] buildLeaderboardImage error:", err); 
        return null; 
      });

    console.log("[!ranking] buffer bytes:", buffer?.length);

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 1000) {
      await msg.reply("❌ No pude generar la imagen del ranking (buffer vacío). Revisa los logs de Railway.");
      return;
    }

    // ✅ Solo imagen, sin embed (se ve grande como antes)
    const file = new AttachmentBuilder(buffer, { name: "ranking.png" });
    await msg.reply({ files: [file] });

  } catch (e) {
    console.error("[!ranking] error:", e);
  }
});

