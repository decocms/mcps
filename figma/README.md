# Figma MCP

Design context for coding agents, read through the Figma REST API with each
user's own Figma account (OAuth). Tool names follow
[Figma's official MCP server](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/),
so prompts and skills written for it carry over.

Served at `https://sites-figma-mcp.deco.site/mcp` (kubernetes-bun, see `deploy.json`).

## Tools

| Tool | What it returns |
|---|---|
| `get_design_context` | Screenshot + one line per layer: auto-layout as flexbox CSS, sizes, colors, type, radii, shadows, component props, text, and the comments pinned in the frame. Start here. |
| `get_metadata` | Sparse XML outline (ids, names, types, positions, sizes) of a node or of every page. |
| `get_screenshot` | PNG/JPG render of a node, fitted to ~1600px wide. |
| `download_assets` | SVG/PNG/JPG/PDF exports of layers, and original files behind image fills. |
| `get_variable_defs` | Styles and variables used in a node, with values. Variable names need Enterprise. |
| `get_motion_context` | Prototype interactions: triggers, actions, transition type/duration/easing. |
| `get_figjam` | FigJam board as XML (stickies, shapes, sections, connectors). |
| `get_comments` | Comment threads for a file or a node. |
| `get_libraries` | Libraries a file or node uses (discovered from usage) and what the file publishes. |
| `search_design_system` | Search published components, component sets and styles across those libraries or a team. |
| `get_code_connect_map` | Code mapped to each component used in a node. |
| `add_code_connect_map` | Save component → code links (writes Figma dev resources). |
| `get_code_connect_suggestions` | Components that still lack a mapping. |
| `get_context_for_code_connect` | Props, variants and layers of one component, for mapping it to code. |
| `whoami` | The connected Figma account. |

Prompt: `create_design_system_rules` writes repo rules for implementing Figma designs.

### Not available, by design

The REST API cannot create or edit layers. That needs the Plugin API running
inside an open Figma client. So `use_figma`, `generate_figma_design`,
`create_new_file`, `upload_assets` and `generate_diagram` are not here.
`generate_image` already exists in Studio. Generative plugins, shaders and
Weave are Figma-internal.

Code Connect mappings are stored as **dev resources** (links on the main
component, visible in Dev Mode), because Figma's own Code Connect data is not
readable through the public API.

## Rate limits depend on the connected seat

Figma counts REST calls per user, per seat type. Tier 1 covers file and node
reads and renders, which `get_design_context` uses twice per call.

| Seat | Tier 1 (nodes, renders) | Tier 2 (comments, dev resources) | Tier 3 (components, styles) |
|---|---|---|---|
| View / Collab | **up to 20 per month** | 5/min | 10/min |
| Dev / Full (Pro) | 15/min | 50/min | 100/min |
| Dev / Full (Org) | 20/min | 100/min | 150/min |

Connect with a Dev or Full seat. A 429 error explains which limit was hit.

Figma keeps **one access token per app per user**. Refreshing it logs out
any other connection that uses the same Figma account.

## Setup

1. Create an OAuth app at https://www.figma.com/developers/apps:
   - callback: `https://sites-figma-mcp.deco.site/oauth/callback`
   - scopes: `current_user:read file_content:read file_metadata:read file_comments:read file_dev_resources:read file_dev_resources:write library_content:read library_assets:read team_library_content:read`
   - A private app works for members of the Figma org that owns it. A public
     app goes through Figma review.
2. Provision the site secrets: `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET`,
   `OAUTH_STATE_SECRET` (`openssl rand -hex 32`). The server refuses to start
   without `OAUTH_STATE_SECRET`.
3. In Studio, add the MCP from the store, or create a custom HTTP connection
   to `https://sites-figma-mcp.deco.site/mcp` with no token. Studio runs the OAuth
   flow.

### Until the OAuth app is approved

A public Figma OAuth app only accepts its owner and plan admins while Figma
reviews it. Everyone else connects with a personal access token:

1. Figma → Settings → Security → Personal access tokens. Give it the read
   scopes listed above and the shortest expiry that works for you.
2. In Studio, create a Custom Connection: type **HTTP**, URL
   `https://sites-figma-mcp.deco.site/mcp`, and paste the token (`figd_…`) in the
   **Token** field.

The MCP sends `figd_` tokens as `X-Figma-Token`, so no OAuth is involved.
Remove the store note in `app.json` once Figma approves the app.

## Auth

This MCP is exempt from `withAuth` (see `auth-exemptions.json`). The
`Authorization` header carries the caller's own Figma token, and every tool
forwards it to `api.figma.com`. There is no shared secret and no server-side
credential.

## Development

```bash
cp .env.example .env   # fill in the values
bun run dev
bun test
```
