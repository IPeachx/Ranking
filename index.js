// index.js — leaderboard embed (sin canvas), con tags y thumbnail del oro
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from 'discord.js';

// ---------- Import de store con fallback seguro ----------
import * as store from './src/store.js';

/**
 * Selecciona la función getSorted más razonable desde ./src/store.js
 * Espera un array de objetos con al menos: { userId, points } (ordenado desc).
 * Si no existe getSorted, intenta con getAll y lo ordena aquí.
 */
let getSorted = null;
if (typeof store.getSorted === 'function') {
  getSorted = store.getSorted;
} else if (store.default && typeof store.default.getSorted === 'function') {
  getSorted = store.default.getSorted;
} else if (typeof store.getAll === 'function') {
  getSorted = async (guild) => {
    const raw = await store.getAll(guild);
    const list = Array.isArray(raw) ? raw : Array.from(raw?.values?.() ?? []);
    return list
      .map((e) => ({
        ...e,
        userId:
          e.userId ?? e.id ?? e.user?.id ?? e.user ?? e.targetId ?? e.uid,
        points: Number(e.points ?? e.score ?? e.pts ?? 0),
      }))
      .filter((e) => e.userId)
      .sort((a, b) => b.points - a.points);
  };
} else if (store.default && typeof store.default.getAll === 'function') {
  getSorted = async (guild) => {
    const raw = await store.default.getAll(guild);
    const list = Array.isArray(raw) ? raw : Array.from(raw?.values?.() ?? []);
    return list
      .map((e) => ({
        ...e,
        userId:
          e.userId ?? e.id ?? e.user?.id ?? e.user ?? e.targetId ?? e.uid,
        points: Number(e.points ?? e.score ?? e.pts ?? 0),
      }))
      .filter((e) => e.userId)
      .sort((a, b) => b.points - a.points);
  };
}

if (typeof getSorted !== 'function') {
  console.error('[store] exports:', Object.keys(store));
  throw new Error(
    'No se encontró getSorted ni getAll en src/store.js. Agrega una de las dos funciones.'
  );
}

// ---------- Utils ----------
async function getMemberMentionAndAvatar(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return {
      mention: `<@${m.id}>`,
      avatar: m.displayAvatarURL({ size: 256 }),
    };
  } catch {
    return { mention: `<@${userId}>`, avatar: null };
  }
}

// ---------- Discord Client ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ---------- Registro de comandos ----------
client.on('clientReady', async () => {
  console.log('✅ Conectado como', client.user?.tag);

  const commands = [
    {
      name: 'ranking',
      description: 'Muestra el ranking en un solo embed.',
      options: [
        {
          name: 'pagina',
          description: 'Página (empieza en 1).',
          type: 4, // Integer
          required: false,
        },
        {
          name: 'todos',
          description: 'Incluir a todos los usuarios en una sola lista.',
          type: 5, // Boolean
          required: false,
        },
        {
          name: 'titulo',
          description: 'Título del embed.',
          type: 3, // String
          required: false,
        },
        {
          name: 'descripcion',
          description: 'Texto de descripción encima de la lista.',
          type: 3, // String
          required: false,
        },
        {
          name: 'imagen',
          description: 'Banner grande (URL).',
          type: 3, // String
          required: false,
        },
        {
          name: 'miniatura',
          description: 'Miniatura (URL). Si se omite, usa avatar del oro.',
          type: 3, // String
          required: false,
        },
      ],
    },
    {
      name: 'ranking-image',
      description: 'Alias de /ranking (usa el mismo embed).',
      options: [
        {
          name: 'pagina',
          description: 'Página (empieza en 1).',
          type: 4,
          required: false,
        },
        {
          name: 'todos',
          description: 'Incluir a todos los usuarios en una sola lista.',
          type: 5,
          required: false,
        },
        {
          name: 'titulo',
          description: 'Título del embed.',
          type: 3,
          required: false,
        },
        {
          name: 'descripcion',
          description: 'Texto de descripción encima de la lista.',
          type: 3,
          required: false,
        },
        {
          name: 'imagen',
          description: 'Banner grande (URL).',
          type: 3,
          required: false,
        },
        {
          name: 'miniatura',
          description: 'Miniatura (URL). Si se omite, usa avatar del oro.',
          type: 3,
          required: false,
        },
      ],
    },
  ];

  // Si hay GUILD_ID, registra por guild (más rápido). Si no, global.
  try {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      const guild = await client.guilds.fetch(guildId);
      await guild.commands.set(commands);
      console.log('⚙️  Comandos registrados en guild:', guildId);
    } else {
      await client.application.commands.set(commands);
      console.log('⚙️  Comandos registrados globalmente.');
    }
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }
});

// ---------- Manejador de interacciones ----------
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    switch (i.commandName) {
      case 'ranking':
      case 'ranking-image': {
        await i.deferReply();

        const page = i.options.getInteger('pagina') ?? 1;
        const todos = i.options.getBoolean('todos') ?? false;
        const titulo =
          i.options.getString('titulo') ?? 'LEADERBOARD – Staff';
        const descripcion = i.options.getString('descripcion') ?? null;

        const banner =
          i.options.getString('imagen') ??
          process.env.RANK_BANNER_URL ??
          null;
        const manualThumb = i.options.getString('miniatura') ?? null;

        // Datos
        const all = await getSorted(i.guild); // [{ userId, points }, ...] desc
        const perPage = todos ? all.length : 50;
        const start = Math.max(0, (page - 1) * perPage);
        const slice = all.slice(start, start + perPage);

        if (!slice.length) {
          await i.editReply({
            content: 'No hay datos para esa página.',
          });
          return;
        }

        // Avatar del oro (top global) como thumbnail por defecto
        let goldAvatar = null;
        if (all.length) {
          const goldInfo = await getMemberMentionAndAvatar(
            i.guild,
            all[0].userId
          );
          goldAvatar = goldInfo.avatar;
        }

        // Construye líneas con tag y puntos, con interlineado
        const lines = [];
        for (let idx = 0; idx < slice.length; idx++) {
          const e = slice[idx];
          const { mention } = await getMemberMentionAndAvatar(
            i.guild,
            e.userId
          );
          lines.push(
            `**${start + idx + 1}.** ${mention} — **${e.points}** pts`
          );
        }

        const header = descripcion ? `${descripcion}\n\n` : '';
        let desc = header + lines.join('\n\n');
        while (desc.length > 4096 && lines.length > 0) {
          lines.pop();
          desc =
            header + lines.join('\n\n') + `\n\n*(lista truncada)*`;
        }

        const embed = new EmbedBuilder()
          .setColor(0xff9ad5) // rosita claro
          .setTitle(titulo)
          .setDescription(desc)
          .setTimestamp(new Date());

        if (banner) embed.setImage(banner);
        if (manualThumb || goldAvatar) {
          embed.setThumbnail(manualThumb ?? goldAvatar);
        }

        await i.editReply({ embeds: [embed] });
        break;
      }

      default:
        await i.reply({
          content: 'Comando no reconocido.',
          ephemeral: true,
        });
    }
  } catch (err) {
    console.error('[interaction error]', err);
    try {
      if (i.deferred || i.replied) {
        await i.editReply({ content: '❌ Ocurrió un error.' });
      } else {
        await i.reply({
          content: '❌ Ocurrió un error.',
          ephemeral: true,
        });
      }
    } catch {}
  }
});

// ---------- Login ----------
const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
if (!TOKEN) {
  console.error(
    '❌ Falta DISCORD_TOKEN en variables de entorno (Railway / .env).'
  );
  process.exit(1);
}

client.login(TOKEN);
