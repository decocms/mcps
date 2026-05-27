# Microsoft Teams MCP

Microsoft Teams integration via the Microsoft Graph API — channel and private
chat messaging, meeting management, and a message-received trigger. Authenticates
with Azure AD delegated OAuth (Authorization Code + PKCE); all actions run on
behalf of the connected Microsoft 365 user.

## Features

- **Channel messaging** — list teams/channels, send & reply, read history &
  threads, edit, react
- **Private chats** — find/search users (by email or name), open 1-on-1 & group
  chats, send & quote-reply, read history
- **Meetings** — create Teams meetings with join links, list, get, update,
  reschedule, cancel, and respond (accept / decline / tentative)
- **OAuth Authentication** — connect your Microsoft 365 account with one click
- **Trigger System** — `teams.message.received` fires when a new message is
  posted in a subscribed channel (Graph change notifications)

## Trigger Events

- `teams.message.received` — a new message was posted in a subscribed channel.
  Manage subscriptions with `SUBSCRIBE_TO_CHANNEL`, `REFRESH_SUBSCRIPTIONS`,
  `LIST_SUBSCRIPTIONS`, `UNSUBSCRIBE_FROM_CHANNEL`. Inspect delivered events
  with `GET_RECENT_EVENTS`.

## Architecture

```
Client → MCP runtime (this Worker) → graph.microsoft.com
Graph change notifications → /teams/notifications/:connectionId → trigger matching
```

State (trigger subscriptions, cached tokens, dedup, event log) is persisted in
a Cloudflare Workers KV namespace because Workers isolates are ephemeral.

> Note: Microsoft Teams APIs require a Microsoft 365 work or school account.
> Personal Microsoft accounts (Outlook/Hotmail) are not supported.

---

## Development

### Prerequisites

An **Azure AD app registration** (multi-tenant) with delegated Microsoft Graph
permissions and admin consent:

- `User.Read`, `User.ReadBasic.All`
- `ChannelMessage.Send`, `ChannelMessage.Read.All`, `ChannelMessage.ReadWrite`
- `Channel.ReadBasic.All`, `Team.ReadBasic.All`
- `Chat.ReadWrite`, `ChatMessage.Send`
- `Calendars.ReadWrite`
- `offline_access`

Register the OAuth redirect URI (`/oauth/callback`) under
Authentication → Web in the app registration.

### Environment Variables

Set as Worker secrets (`wrangler secret put`) or, for local dev, in `.dev.vars`:

```bash
MICROSOFT_TENANT_ID=organizations   # or your specific tenant id
MICROSOFT_CLIENT_ID=<azure-app-client-id>
MICROSOFT_CLIENT_SECRET=<azure-app-client-secret>
```

### Running locally

```bash
bun install
bunx wrangler dev   # local Worker at http://localhost:8787 (KV simulated)
bun run check       # type check
bun run build       # production bundle (wrangler dry-run)
```

Expose the local Worker with a tunnel (e.g. `ngrok http 8787`) and register the
public `/mcp` URL as a custom connection in deco Studio.

### Deploy (Cloudflare Workers)

```bash
bunx wrangler kv namespace create TEAMS_KV   # paste the id into wrangler.toml
bunx wrangler secret put MICROSOFT_TENANT_ID
bunx wrangler secret put MICROSOFT_CLIENT_ID
bunx wrangler secret put MICROSOFT_CLIENT_SECRET
bun run deploy
```
