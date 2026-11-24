# Google Firestore (Firebase) MCP

Read Cloud Firestore databases with the Google account of whoever connects the
MCP. Read-only: nothing here writes or deletes.

Why not Google's own `https://firestore.googleapis.com/mcp`? It lists its tools
without login, but every call needs a Google token, and `accounts.google.com`
has no dynamic client registration, so Studio cannot log in to it. This server
fronts the Firestore REST API with the shared Google OAuth client, like the
other `google-*` MCPs.

## Tools

| Tool | What it does |
|---|---|
| `firestore_list_projects` | Firebase projects the account can access |
| `firestore_list_databases` | Databases of a project (usually `(default)`) |
| `firestore_list_collections` | Root collections, or subcollections of a document |
| `firestore_get_document` | One document by path |
| `firestore_list_documents` | A page of documents of a collection |
| `firestore_query` | Filters, ordering, field selection, limit; collection-group with `allDescendants` |
| `firestore_aggregate` | count / sum / avg over a filtered collection |

Values come back as plain JSON: timestamps as ISO strings, references as
document paths, 64-bit integers that don't fit a double as strings. When
filtering on a timestamp field, pass `valueType: "timestamp"`: a plain string
never matches a timestamp.

## Access

The connected account needs IAM on the project, e.g. **Cloud Datastore Viewer**
(`roles/datastore.viewer`). The OAuth scope (`datastore`) has no read-only
variant; the toolset and IAM are what keep it read-only.

## Setup

Deployed as a Cloudflare Worker (`wrangler.toml`, custom domain
`google-firestore-mcp.decocms.com`) by `.github/workflows/deploy-google-firestore.yml`
on every push to `main` that touches this folder. Worker secrets (see `.env.example`),
set once with `bunx wrangler secret put <NAME>` from this folder:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the shared Google OAuth client.
  Its authorized redirect URIs must include
  `https://google-firestore-mcp.decocms.com/oauth/callback`, and the consent
  screen must list `datastore` and `cloud-platform.read-only`.
- `OAUTH_STATE_SECRET`: required, `openssl rand -hex 32`.
- `EXTRA_ALLOWED_REDIRECT_HOSTS`: optional, for self-hosted Mesh.

```bash
cd google-firestore
bun run dev     # wrangler dev; put the secrets in .dev.vars
bun test        # unit tests for value conversion and query building
bun run check   # tsc
```
