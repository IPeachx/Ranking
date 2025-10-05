// index.js — Ranking en embed con medallas y miniatura del #1

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from 'discord.js';

import * as store from './src/store.js';

// ===== Helper: valida que getSorted exista =====
const getSorted =
  store.getSorted ??
  (store.default && store.default.getSorted);

if (typeof getSorted !== 'function') {
  console.error('[store] exports:', Object.keys(store));
  throw new Error(
    'No se encontró la función getSorted en src/store.js (ni como export nombrado ni dentro del default).'
  );
}

// ===== Cliente Discord =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ===== Emojis de medallas (top 3 global) =====
const MEDALS = ['🥇', '🥈', '🥉']; // puedes cambiarlos por emojis del server

// ===== Utilidad: mención y avatar por userId =====
async function getMemberMentionAndAvatar(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return {
      mention: m.toString(),
      avatar: m.displayAvatarURL({ size: 256 }),
    };
  } catch {
    return { mention: `<@${userId}>`, avatar: null };
  }
}

// ===== Interacciones =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    switch (i.commandName) {
      case 'ranking': {
        await i.deferReply();

        // Opciones
        const page = i.options.getInteger('pagina') ?? 1;
        const todos = i.options.getBoolean('todos') ?? false;
        const title =
          i.options.getString('titulo') ?? 'RANKING – LEADERBOARD';
        const extraDesc = i.options.getString('descripcion') ?? null;
        const image = i.options.getString('imagen') ?? null;
        const manualThumb = i.options.getString('miniatura') ?? null;

        // Datos
        const all = await getSorted(i.guild); // [{ userId, points }, ...] (desc)
        const perPage = todos ? all.length : 50;
        const start = Math.max(0, (page - 1) * perPage);
        const pageEntries = all.slice(start, start + perPage);

        if (!pageEntries.length) {
          await i.editReply({
            content: 'No hay datos para esa página.',
          });
          return;
        }

        // Construcción de líneas con medallas del top global
        const lines = [];
        let goldAvatar = null;

        for (let idx = 0; idx < pageEntries.length; idx++) {
          const e = pageEntries[idx];
          const globalIdx = start + idx; // posición real en el ranking
          const medal = MEDALS[globalIdx] ? ` ${MEDALS[globalIdx]}` : '';

          const { mention, avatar } = await getMemberMentionAndAvatar(
            i.guild,
            e.userId
          );
          if (globalIdx === 0) goldAvatar = avatar;

          // línea: posición, mención, medalla (si aplica) y puntos
          lines.push(
            `**${globalIdx + 1}.** ${mention}${medal} — **${e.points}** pts`
          );
        }

        // Embed rosita, con texto y thumbs
        const thumb = manualThumb ?? goldAvatar ?? null;
        const embed = new EmbedBuilder()
          .setColor(0xffa3d7) // rosita claro
          .setTitle(title)
          .setDescription(
            (extraDesc ? `${extraDesc}\n\n` : '') + lines.join('\n')
          )
          .setTimestamp();

        if (thumb) embed.setThumbnail(thumb);
        if (image) embed.setImage(image);

        await i.editReply({ embeds: [embed] });
        break;
      }

      case 'ranking-image': {
        // Si aún tienes registrado este comando, respondemos amable:
        await i.reply({
          content:
            'El ranking ahora se muestra en **embed** con `/ranking`. 💖',
          ephemeral: true,
        });
        break;
      }

      default:
        // Ignorar otros comandos
        break;
    }
  } catch (err) {
    console.error('[interaction error]', err);
    if (i.deferred || i.replied) {
      await i.editReply({ content: '❌ Ocurrió un error.' });
    } else {
      await i.reply({ content: '❌ Ocurrió un error.', ephemeral: true });
    }
  }
});

client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
});

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);
