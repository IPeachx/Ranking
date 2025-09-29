# Lollipop Ranking Bot (Staff) — v6

Ranking de Staff con TOP 3 (🥇 ORO / 🥈 PLATA / 🥉 BRONCE), comandos para agregar/quitar/sumar/restar/set/reset/export, **logs en embeds bonitos**, permisos por 2 roles y comando para **imagen estilo leaderboard** usando **@napi-rs/canvas** (ideal para Windows).

## Requisitos
- Node 18+
- En el portal del bot: activar **Server Members Intent** (para nombres/avatares en TOP e imagen).

## Instalación
```bash
npm install
# registra los slash commands (rápido si defines GUILD_ID en .env)
npm run deploy
npm start
```

## Configuración (.env)
```
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...                # opcional, para registrar comandos al instante en 1 server

ALLOWED_ROLE_IDS=ID_ROL_1,ID_ROL_2
LOG_CHANNEL_ID=ID_CANAL_LOGS
```

## Comandos
- `/ranking [pagina] [todos] [titulo] [descripcion] [imagen] [miniatura]`
- `/ranking-image [pagina] [todos]`
- `/rank-add-user @usuario`
- `/rank-remove-user @usuario`
- `/rank-add-points @usuario puntos`
- `/rank-subtract-points @usuario puntos`
- `/rank-set @usuario puntos`
- `/rank-reset`
- `/rank-export`

> Los comandos admin se validan por **ALLOWED_ROLE_IDS** (o quien tenga *Manage Guild*).

## Tips
- Si quieres **todo en una página**, usa `/ranking todos:true`.
- El embed usa el **avatar del TOP 1** como miniatura por defecto.
- La imagen `/ranking-image` requiere **Server Members Intent** y permisos de **Attach Files** y **Embed Links** en el canal.
