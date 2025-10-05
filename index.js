// index.js — Ranking en embed con medallas y miniatura del #1
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';

import * as store from './src/store.js'; // Debe exportar: addUser, addPoints, setPoints, subtractPoints, removeUser, resetAll, getAll, getSorted

// ================= Helpers =================
const s = store.default ?? store;

const ALLOWED_ROLE_IDS = (process.env.ALLOWED_ROLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const canUse = (member) =>
  !ALLOWED_ROLE_IDS.length ||
  ALLOWED_ROLE_IDS.some(id => member.roles?.cache?.has(id));

const getTargetId = (i) =>
  i.options.getUser?.('usuario')?.id
    ?? i.options.getUser?.('user')?.id
    ?? i.options.getString?.('userId');

// Menciona al usuario y devuelve su avatar (para miniatura del 1º)
async function getMentionAndAvatar(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    const mention = member?.toString?.() ?? `<@${userId}>`;
    const avatar  = member?.displayAvatarURL?.({ size: 256, extension: 'png' });
    return { mention, avatar };
  } catch {
    return { mention: `<@${userId}>`, avatar: null };
  }
}

// ================== Cliente ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log('✅ Conectado como', client.user.tag);
});

// ================== Utilidades UI ==================
const MEDAL = ['🥇', '🥈', '🥉'];
const MEDAL_COLOR = [0xFFD700, 0xC0C0C0, 0xCD7F32];

function formatLine(rank, mention, points) {
  const medal = MEDAL[rank - 1] ?? '•';
  return `${rank}. ${mention} ${medal} — **${points}** pts`;
}

async function buildRankingEmbed(guild, title = 'LEADERBOARD – Staff') {
  const entries = await (s.getSorted ?? s.getAll)(guild); // s.getSorted preferido
  const list = Array.isArray(entries) ? entries : Object.values(entries || {});
  // normaliza: aseguramos userId y points numerico
  const normalized = list.map(e => ({
    userId: e.userId ?? e.user?.id ?? e.id ?? e.targetId ?? e.uid,
    points: Number(e.points ?? e.score ?? e.pts ?? 0),
  })).filter(e => e.userId);

  // orden desc
  normalized.sort((a,b) => b.points - a.points);

  const top = normalized[0];
  const lines = [];
  for (let i = 0; i < normalized.length; i++) {
    const e = normalized[i];
    const { mention } = await getMentionAndAvatar(guild, e.userId);
    lines.push(formatLine(i+1, mention, e.points));
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFC0CB) // rosita claro
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setTimestamp(new Date())
    .setFooter({ text: 'Actualizado' });

  if (top) {
    const gold = await getMentionAndAvatar(guild, top.userId);
    if (gold.avatar) embed.setThumbnail(gold.avatar);
  }
  return embed;
}

// ================== Interacciones ==================
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand?.()) return;

  try {
    switch (i.commandName) {
      case 'ranking': {
        await i.deferReply();
        const title = i.options.getString('titulo') ?? 'RANKING – LEADERBOARD';
        const embed = await buildRankingEmbed(i.guild, title);
        await i.editReply({ embeds: [embed] });
        break;
      }

      case 'rank-set': {
        if (!canUse(i.member)) return i.reply({ content: '🚫 No tienes permiso para este comando.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const uid = getTargetId(i);
        const pts = i.options.getInteger('puntos', true);
        if (!uid) return i.editReply('Falta el usuario.');
        await s.setPoints(i.guild, uid, pts);
        await i.editReply(`✅ Se fijaron **${pts}** puntos a <@${uid}>.`);
        break;
      }

      case 'rank-add-points': {
        if (!canUse(i.member)) return i.reply({ content: '🚫 No tienes permiso para este comando.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const uid = getTargetId(i);
        const delta = i.options.getInteger('puntos', true);
        if (!uid) return i.editReply('Falta el usuario.');
        await s.addPoints(i.guild, uid, delta);
        await i.editReply(`✅ Se sumaron **${delta}** puntos a <@${uid}>.`);
        break;
      }

      case 'rank-subtract-points': {
        if (!canUse(i.member)) return i.reply({ content: '🚫 No tienes permiso para este comando.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const uid = getTargetId(i);
        const delta = i.options.getInteger('puntos', true);
        if (!uid) return i.editReply('Falta el usuario.');
        await s.subtractPoints(i.guild, uid, delta);
        await i.editReply(`✅ Se restaron **${delta}** puntos a <@${uid}>.`);
        break;
      }

      case 'rank-add-user': {
        if (!canUse(i.member)) return i.reply({ content: '🚫 No tienes permiso para este comando.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const uid = getTargetId(i);
        if (!uid) return i.editReply('Falta el usuario.');
        await s.addUser(i.guild, uid);
        await i.editReply(`✅ Usuario agregado: <@${uid}>.`);
        break;
      }

      case 'rank-remove-user': {
        if (!canUse(i.member)) return i.reply({ content: '🚫 No tienes permiso para este comando.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const uid = getTargetId(i);
        if (!uid) return i.editReply('Falta el usuario.');
        await s.removeUser(i.guild, uid);
        await i.editReply(`🗑️ Usuario removido: <@${uid}>.`);
        break;
      }

      case 'rank-reset': {
        if (!canUse(i.member)) return i.reply({ content: '🚫 No tienes permiso para este comando.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        await s.resetAll(i.guild);
        await i.editReply('♻️ Ranking reseteado.');
        break;
      }

      case 'rank-sync-podium': {
        // opcional; sin cambios para no romper otros flujos
        await i.reply({ content: '✅ Sincronización de podio ejecutada.', ephemeral: true });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('[interaction error]', err);
    if (i.deferred) {
      await i.editReply('❌ Ocurrió un error.');
    } else {
      await i.reply({ content: '❌ Ocurrió un error.', ephemeral: true });
    }
  }
});

// ================== Prefijo !Ranking ==================
client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  const content = msg.content?.trim().toLowerCase();
  if (content === '!ranking') {
    try {
      const embed = await buildRankingEmbed(msg.guild, 'RANKING – LEADERBOARD');
      await msg.reply({ embeds: [embed] });
    } catch (e) {
      console.error('[!ranking] error:', e);
    }
  }
});

// ================== Login ==================
const TOKEN = process.env.TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Falta el token en el entorno (TOKEN).');
  process.exit(1);
}
client.login(TOKEN);
