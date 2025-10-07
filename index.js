// index.js — Ranking en embed con medallas y miniatura del #1
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from 'discord.js';

// Store (datos y helpers)
import * as store from './src/store.js';
const s = store.default ?? store; // por si exportaste default

// ===== Permisos por roles (IDs en .env: ALLOWED_ROLE_IDS="id1,id2,id3") =====
const ALLOWED_ROLE_IDS = (process.env.ALLOWED_ROLE_IDS || '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);

const canUse = (member) =>
  !ALLOWED_ROLE_IDS.length ||
  ALLOWED_ROLE_IDS.some(id => member?.roles?.cache?.has(id));

// ===== Helpers =====
function getTargetId(i) {
  return i.options.getUser?.('usuario')?.id
      ?? i.options.getUser?.('user')?.id
      ?? i.options.getString?.('userId')
      ?? i.options.getString?.('usuario')
      ?? i.options.getString?.('user');
}

// Valida que getSorted exista
const getSorted = s.getSorted ?? (s.default?.getSorted);
if (typeof getSorted !== 'function') {
  console.error('[store] exports:', Object.keys(s));
  throw new Error('No se encontró la función getSorted en src/store.js');
}

// ===== Bot =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  // inicializa el store si existe el helper
  try { await s.initStore?.(); } catch (e) { console.warn('[store] initStore:', e?.message); }
  console.log('✅ Conectado como', client.user.tag);
});

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  // ===================== ADMIN RANK COMMANDS =====================
  if (i.commandName === 'rank-set') {
    if (!canUse(i.member)) {
      return i.reply({ content: '🚫 No tienes permiso para usar este comando.', ephemeral: true });
    }
    await i.deferReply({ ephemeral: true });
    try {
      const uid  = getTargetId(i);
      const pts  = i.options.getInteger('puntos', true);
      if (!Number.isInteger(pts) || Math.abs(pts) > 100000) {
  return i.editReply({ content: '❌ Valor de puntos inválido (¿pusiste un userID en lugar de puntos?).' });
}
      if (!uid) throw new Error('Falta el usuario.');
      await s.setPoints(i.guildId, uid, pts);
      await i.editReply({ content: `✅ Se fijaron **${pts}** puntos a <@${uid}>.` });
    } catch (err) {
      console.error(err);
      await i.editReply({ content: '❌ Ocurrió un error fijando puntos.' });
    }
    return;
  }

  if (i.commandName === 'rank-add-points') {
    if (!canUse(i.member)) {
      return i.reply({ content: '🚫 No tienes permiso para usar este comando.', ephemeral: true });
    }
    await i.deferReply({ ephemeral: true });
    try {
      const uid   = getTargetId(i);
      const delta = i.options.getInteger('puntos', true);
      if (!Number.isInteger(pts) || Math.abs(pts) > 100000) {
  return i.editReply({ content: '❌ Valor de puntos inválido (¿pusiste un userID en lugar de puntos?).' });
}
      if (!uid) throw new Error('Falta el usuario.');
      await s.addPoints(i.guildId, uid, delta);
      await i.editReply({ content: `✅ Se sumaron **${delta}** puntos a <@${uid}>.` });
    } catch (err) {
      console.error(err);
      await i.editReply({ content: '❌ Ocurrió un error sumando puntos.' });
    }
    return;
  }

  if (i.commandName === 'rank-subtract-points') {
    if (!canUse(i.member)) {
      return i.reply({ content: '🚫 No tienes permiso para usar este comando.', ephemeral: true });
    }
    await i.deferReply({ ephemeral: true });
    try {
      const uid   = getTargetId(i);
      const delta = i.options.getInteger('puntos', true);
      if (!Number.isInteger(pts) || Math.abs(pts) > 100000) {
  return i.editReply({ content: '❌ Valor de puntos inválido (¿pusiste un userID en lugar de puntos?).' });
}
      if (!uid) throw new Error('Falta el usuario.');
      await s.addPoints(i.guildId, uid, -Math.abs(delta));
      await i.editReply({ content: `✅ Se restaron **${Math.abs(delta)}** puntos a <@${uid}>.` });
    } catch (err) {
      console.error(err);
      await i.editReply({ content: '❌ Ocurrió un error restando puntos.' });
    }
    return;
  }

  // ===================== /ranking =====================
  if (i.commandName === 'ranking') {
    await i.deferReply();

    try {
      const titulo = i.options.getString?.('titulo') ?? 'RANKING – LEADERBOARD';
      const descOpt = i.options.getString?.('descripcion') ?? null;

      // Obtiene ranking [{ userId, points }, ...] desc
      const all = await getSorted(i.guildId);

      // Arma líneas con medallas y mención
      const MEDALS = ['🥇', '🥈', '🥉'];
      const lines = [];
      for (let idx = 0; idx < all.length; idx++) {
        const e = all[idx];
        const medal = idx < 3 ? MEDALS[idx] : '–';
        lines.push(`**${idx + 1}.** <@${e.userId}> ${medal} — **${e.points}** pts`);
      }

      // Miniatura: avatar del #1 si existe
      let thumb = null;
      if (all.length) {
        try {
          const m = await i.guild.members.fetch(all[0].userId);
          thumb = m?.displayAvatarURL({ extension: 'png', size: 256 });
        } catch {}
      }

      const embed = new EmbedBuilder()
        .setColor(0xff9bd2) // rosita claro
        .setTitle(titulo)
        .setDescription(lines.join('\n'))
        .setTimestamp(new Date());

      if (descOpt) embed.setFooter({ text: descOpt });
      if (thumb)   embed.setThumbnail(thumb);

      await i.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[ranking] error:', err);
      await i.editReply({ content: '❌ Ocurrió un error.' });
    }
  }
});

// LOGIN
client.login(process.env.TOKEN);
