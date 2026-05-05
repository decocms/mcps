# Google Workspace — Tool Catalog

162 tools across 8 services, gated behind a single OAuth login.

Tool ids are prefixed with the service name (e.g. `calendar_list_events`, `gmail_search_threads`). The full per-tool metadata lives in each child MCP's source — this catalog is just an at-a-glance count.

| Service | Prefix | Tool count | Source |
|---|---|---|---|
| Calendar | `calendar_*` | 20 | [`google-calendar`](../google-calendar) |
| Gmail | `gmail_*` | 26 | [`google-gmail`](../google-gmail) (basic tools, no webhook triggers) |
| Drive | `drive_*` | 15 | [`google-drive`](../google-drive) |
| Docs | `docs_*` | 13 | [`google-docs`](../google-docs) |
| Sheets | `sheets_*` | 55 | [`google-sheets`](../google-sheets) |
| Slides | `slides_*` | 12 | [`google-slides`](../google-slides) |
| Forms | `forms_*` | 9 | [`google-forms`](../google-forms) |
| Meet | `meet_*` | 12 | [`google-meet`](../google-meet) |

To browse the actual tool list at runtime, hit `POST /mcp` on the deployed worker with a `tools/list` JSON-RPC request (no authentication required for the listing — only `tools/call` needs the bearer token).

For agent-facing usage notes, retrieve the prompt named `GOOGLE_WORKSPACE_AGENT_GUIDE` (entry point) or any of the per-service guides via `prompts/get`.
