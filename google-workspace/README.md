# google-workspace

One OAuth login that exposes the Google productivity stack — **Calendar, Gmail, Drive, Docs, Sheets, Slides, Forms and Meet** — under a single connection. After consenting once, the user gets ~160 tools prefixed `calendar_*`, `gmail_*`, `drive_*`, `docs_*`, `sheets_*`, `slides_*`, `forms_*`, `meet_*`.

See [`TOOLS.md`](./TOOLS.md) for the catalog.

## How it works

Rather than duplicating logic, this MCP composes our existing per-service Google MCPs:

```
google-workspace
├─ google-calendar/tools     → calendar_*
├─ google-gmail/tools        → gmail_*  (basicTools — without webhook triggers)
├─ google-drive/tools        → drive_*
├─ google-docs/tools         → docs_*
├─ google-sheets/tools       → sheets_*
├─ google-slides/tools       → slides_*
├─ google-forms/tools        → forms_*
└─ google-meet/tools         → meet_*
```

`server/lib/prefix-tool.ts` clones each tool factory's output with a service-prefixed id, so collisions across services (e.g. multiple `list_*` tools) are resolved without touching the upstream packages. `createGoogleOAuth({ scopes })` from `@decocms/mcps-shared/google-oauth` runs the standard PKCE flow with the union of scopes from all eight services.

The composition is type-safe: each child MCP's tool factory is invoked with the workspace's `Env`, which is structurally compatible because every Google MCP reads the access token from the same `MESH_REQUEST_CONTEXT.authorization` slot.

## What's intentionally NOT here

- **Chat / People** — Google ships official MCP servers for these (`chatmcp.googleapis.com`, `people.googleapis.com`), but their scopes need extra OAuth-consent-screen verification we haven't completed. They'll come back in a separate `google-workspace-official` MCP that wraps the upstream Google MCPs once verification lands.
- **Send mail** — there is no `gmail_send_message` tool here. Gmail can only create drafts; the user clicks Send themselves. This is the same constraint as the standalone `google-gmail` MCP.

## Built-in prompts

Two flavors, both via the standard `prompts/list` and `prompts/get`.

### Agent guides (no arguments)

Long-form references the agent pulls on demand instead of stuffing every tool description into the system prompt:

- `GOOGLE_WORKSPACE_AGENT_GUIDE` — entry point covering all 8 services, naming, time/timezone rules, destructive actions, pagination.
- `GOOGLE_WORKSPACE_CALENDAR_GUIDE`, `..._GMAIL_GUIDE`, `..._DRIVE_GUIDE`, `..._DOCS_GUIDE`, `..._SHEETS_GUIDE`, `..._SLIDES_GUIDE`, `..._FORMS_GUIDE`, `..._MEET_GUIDE` — per-service cheat sheets, pitfalls, and (where applicable) query syntax.

### User templates (with arguments)

Slash-command-style entries the user picks from the prompt menu in their MCP client:

| Template | Arguments | Does |
|---|---|---|
| `morning_briefing` | — | Calendar + important unread email + recent Drive activity |
| `prep_for_meeting` | `lookahead?` | Attendees, last emails with them, shared docs |
| `whats_on_calendar` | `when?` | Schedule for any free-form window |
| `find_meeting_time` | `attendees`, `duration?`, `when?` | Multi-attendee free/busy; confirms before booking |
| `block_focus_time` | `duration`, `when?`, `title?` | Reserves a private block; confirms before creating |
| `inbox_triage` | `timeframe?` | Classifies unread as Reply/FYI/Action/Noise |
| `draft_reply` | `thread_query`, `instruction` | Finds thread, creates draft (user clicks Send) |
| `find_files` | `query` | NL → Drive structured query |
| `summarize_doc` | `document` | Finds doc by name, exports content, summarizes |
| `new_deck_from_outline` | `title`, `outline` | Creates Slides deck from a bullet outline |
| `create_form` | `title`, `questions` | Creates a Form from a question list |
| `create_meet_for_event` | `event_query` | Creates a Meet space and attaches it to a calendar event |

Source lives in [`server/prompts.ts`](./server/prompts.ts).

## Local dev

```sh
bun install
bun run check
bun run dev   # PORT defaults to 8001
```

For the full OAuth flow you need a Google Cloud OAuth client (Web type) with all the scopes listed in `server/constants.ts` declared on its consent screen, plus the redirect URI of your dev or prod worker.

## Files

- `server/main.ts` — `withRuntime` wiring with `createGoogleOAuth` and the aggregated tool list.
- `server/constants.ts` — union of OAuth scopes across the 8 services.
- `server/tools/index.ts` — imports and prefixes each child MCP's tools.
- `server/lib/prefix-tool.ts` — small helper that clones a tool with a prefixed id.
- `server/prompts.ts` — agent guides + user templates.
