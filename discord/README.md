# Discord MCP (event-driven)

Pure event-driven Discord MCP. The bot listens to every Discord Gateway
event and emits each one as a Studio trigger. Your agent — running in
Studio — subscribes to the triggers it cares about and calls back into
this MCP via tools to send messages, manage members, respond to
interactions, etc.

This is a from-scratch successor to `discord-read/`. The hybrid LLM logic
that lived inside `discord-read` (`messageHandler.handleDefaultAgent`,
`llm.streamAgentResponse`, channel-context prompts, model resolution) is
**not** here — those concerns belong on the Studio agent.

---

## Architecture

```
┌──────────┐  Gateway WS  ┌────────────────────┐  trigger  ┌────────┐
│ Discord  │─────────────▶│ Discord MCP (this) │──────────▶│ Studio │
└──────────┘              │  - listens         │   POST    │ agent  │
                          │  - publishes       │           └────┬───┘
                          │  - tools (REST)    │                │
                          └────────────────────┘                │
                                  ▲                             │
                                  │   tool call (FOLLOWUP, etc) │
                                  └─────────────────────────────┘
```

- **Multi-tenant:** one Discord.js Client per Mesh `connectionId`.
  Connections sharing a `bot_token` share a single Client (deduped on
  bootstrap) — saves memory and avoids duplicate Gateway connections.
- **K8s pod restarts:** every config is persisted in Supabase
  (`discord2_connections`). On boot, `bootstrapFromSupabase()` loads
  every saved row and calls `ensureBotRunning()` for each unique token.
  No manual "start" tool required — the bot is up before you ask.
- **Health watchdog:** an hourly cron checks `client.isReady()` for every
  instance and restarts dead clients automatically.

---

## Triggers (26 default + 3 opt-in)

See `server/triggers/definitions.ts` for the full catalog with filter
schemas. Categories:

| Category | Triggers |
|---|---|
| Messages | `discord.message.{created,updated,deleted,bulk_deleted}` |
| Reactions | `discord.reaction.{added,removed}` |
| Members | `discord.member.{joined,left,updated,role.added,role.removed}` |
| Threads | `discord.thread.{created,updated,deleted}` |
| Channels | `discord.channel.{created,updated,deleted}` |
| Roles | `discord.role.{created,updated,deleted}` |
| Guild lifecycle | `discord.guild.{joined,left}` |
| **Interactions (NEW)** | `discord.interaction.{button,select,modal_submit,slash_command}` |
| Opt-in | `discord.{presence.updated,typing.started,voice.state.updated}` |

### DM privacy
DMs fire `discord.message.created` with `is_dm: true` and `dm_user_id`
populated. The publisher only notifies the connection that **owns** the
bot which received the DM — no cross-tenant leakage. Filter your trigger
with `is_dm: true` to subscribe to DMs only.

---

## The interaction flow (the new thing)

Discord requires an ACK within 3 seconds of any interaction. A round-trip
to Studio always takes longer, so the MCP **auto-defers** every
interaction within ~50ms, then emits the trigger:

1. User clicks a button (or submits a select/modal).
2. `events.ts:interactionCreate` fires:
   - `await interaction.deferUpdate()` (component) or
     `await interaction.deferReply({ flags: ephemeral })` (slash/modal_submit) — done in <100ms.
   - The token is recorded in `interaction-store.ts` (15-min TTL).
   - The trigger is emitted with the payload below.
3. Studio agent receives the trigger and has up to **15 minutes** to
   call `DISCORD_INTERACTION_FOLLOWUP` with the `interaction_token`.

Interaction trigger payload:

```jsonc
{
  "event": "discord.interaction.button",
  "interaction_id": "...",
  "interaction_token": "...",       // 15-min lifetime
  "application_id": "...",          // pass back to FOLLOWUP
  "expires_at": "2026-05-01T12:15:00.000Z",
  "custom_id": "approve_order_42",  // matches your button's custom_id
  "message_id": "...",
  "channel_id": "...",
  "guild_id": "...",
  "user_id": "...",
  "username": "..."
}
```

### Auto-defer modes (StateSchema.AUTO_DEFER_MODE)

- `"ephemeral"` (default): users see "Bot is thinking..." privately.
- `"visible"`: everyone sees it.
- `"off"`: skip the defer. Only safe if the agent always responds in
  <3s. Use this to enable modals (modals must be the FIRST response).

### Idempotency for shared bot tokens

If two Mesh connections happen to share the same `bot_token`, both will
receive the trigger (they have separate trigger callbacks). Pass
`interaction_id` to `DISCORD_INTERACTION_FOLLOWUP` and the
local interaction-store will dedupe — only the first call gets through;
the second returns `{ success: false, already_responded: true }`.

---

## Tools

| Group | Tools |
|---|---|
| Config | `DISCORD_SAVE_CONFIG`, `DISCORD_GET_CONFIG` (token redacted), `DISCORD_DELETE_CONFIG` |
| Bot | `DISCORD_BOT_STATUS`, `DISCORD_BOT_STOP` |
| Interactions | `DISCORD_INTERACTION_FOLLOWUP`, `DISCORD_INTERACTION_UPDATE`, `DISCORD_INTERACTION_SHOW_MODAL` |
| Messages | `DISCORD_SEND_MESSAGE` (with optional `components`), `EDIT`, `DELETE`, `BULK_DELETE`, `PURGE`, `GET`, `GET_CHANNEL_MESSAGES`, `PIN`, `UNPIN`, `GET_PINNED`, reactions |
| Channels | `LIST`, `GET`, `CREATE`, `EDIT`, `DELETE`, threads (active/archived/join/leave/lock/archive) |
| Guilds/members | `GET_GUILD`, `LIST_BOT_GUILDS`, `LIST_MEMBERS`, `SEARCH`, `GET_USER`, `GET_MEMBER`, `EDIT_MEMBER`, role management, `KICK`/`BAN`/`UNBAN`/`TIMEOUT`/`REMOVE_TIMEOUT`, role CRUD |
| Webhooks | `CREATE`, `LIST`, `EDIT`, `DELETE`, `EXECUTE` (with components) |

`DISCORD_SEND_MESSAGE` accepts `components`: pass Discord's component
JSON shape directly (`[{ type: 1, components: [{ type: 2, label, style,
custom_id }] }]` for a button row). Click events fire
`discord.interaction.button` matching the `custom_id` you set.

Slash commands: not registered by this MCP. Register externally via the
Discord Developer Portal — when the user invokes one, the
`discord.interaction.slash_command` trigger fires (auto-deferred unless
`AUTO_DEFER_MODE='off'`).

---

## Migration from `discord-read`

`discord/` and `discord-read/` are independent — different Supabase
tables (`discord2_*` vs `discord_*`), different MCPs in the registry.
Migrate connection by connection:

1. **In Studio, install the new `discord` MCP** alongside `discord-read`.
2. **Save the same bot token** via `DISCORD_SAVE_CONFIG` on the new
   connection. The MCP will start the bot.
3. **Recreate triggers** on the agent that previously ran inside
   `discord-read`. The agent now subscribes to events and calls back via
   tools instead of having logic inside the MCP.
4. **Verify** the bot responds via the new trigger flow.
5. **Remove** the old connection on `discord-read`.

Both MCPs can run side-by-side during migration. They each have their
own Supabase rows and won't step on each other.

If both connections share the same `bot_token`, you'll see duplicate
events (both bots are running the same Discord client). Either change
the token on one of them, or delete the old `discord-read` connection
once the new one is verified.

---

## Configuration

Required env vars:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

State (set per-connection in the Mesh dashboard):
- `DISCORD_APPLICATION_ID` — required for interaction follow-ups.
- `DISCORD_PUBLIC_KEY` — only if you plan to use HTTP webhook fallback (not active in v1).
- `AUTHORIZED_GUILDS` — CSV of guild IDs; empty = all guilds.
- `AUTO_DEFER_MODE` — `ephemeral` | `visible` | `off`.
- `ENABLE_PRESENCE_EVENTS` / `ENABLE_TYPING_EVENTS` / `ENABLE_VOICE_EVENTS` — opt-ins.

The bot token is passed via the `Authorization: Bearer <token>` header
(captured by Mesh's onChange) or directly via `DISCORD_SAVE_CONFIG`.

---

## SQL migrations

Apply once per Supabase project:

```bash
psql $DATABASE_URL -f migrations/001_discord2_connections.sql
psql $DATABASE_URL -f migrations/002_discord2_trigger_credentials.sql
```

Both tables are protected by RLS (service role only). Bot tokens are
plaintext — never expose `discord2_connections` via an MCP tool.
