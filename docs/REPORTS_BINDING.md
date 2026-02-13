# Reports Binding

The **Reports Binding** is a standardized interface that enables MCP servers to expose structured reports (performance audits, security scans, accessibility checks, CI summaries, etc.) as first-class resources. Each report has a **status** (health outcome), a **lifecycle status** (workflow state), and **sections** (rich content blocks).

A connection is detected as reports-compatible when it exposes all **required** tools listed below.

This repository contains one implementation:

| MCP | Backend | Auth |
|---|---|---|
| `github-repo-reports/` | Markdown files with YAML frontmatter in a GitHub repository | GitHub App OAuth (PKCE) |

---

## Binding Tools

### Required

| Tool | Purpose |
|---|---|
| `REPORTS_LIST` | List available reports with optional filters |
| `REPORTS_GET` | Get a single report with full content |

### Optional

| Tool | Purpose |
|---|---|
| `REPORTS_UPDATE_STATUS` | Update the lifecycle status of a report (`unread` / `read` / `dismissed`) |

Optional tools may be omitted. Consumers will skip the corresponding functionality when they are absent.

---

## Schemas

All tool inputs and outputs must be returned as **structured content** (JSON). The MCP SDK `structuredContent` field is used alongside the standard `content` text array.

### Shared Types

#### ReportStatus

Overall health/outcome of the report:

```
"passing" | "warning" | "failing" | "info"
```

#### ReportLifecycleStatus

Workflow state:

```
"unread" | "read" | "dismissed"
```

| Value | Meaning |
|---|---|
| `unread` | New report, not yet viewed. |
| `read` | Report has been viewed. |
| `dismissed` | Report has been archived / marked as done. |

#### MetricItem

```json
{
  "label": "string — metric label (e.g. 'LCP', 'Performance')",
  "value": "number | string — current value",
  "unit?": "string — unit of measurement (e.g. 's', 'ms', 'score')",
  "previousValue?": "number | string — previous value for delta comparison",
  "status?": "ReportStatus — status of this individual metric"
}
```

#### ReportSection (discriminated union on `type`)

**Markdown section**
```json
{
  "type": "markdown",
  "content": "string — markdown content (GFM supported)"
}
```

**Metrics section**
```json
{
  "type": "metrics",
  "title?": "string — section title",
  "items": "MetricItem[] — array of metric items"
}
```

**Table section**
```json
{
  "type": "table",
  "title?": "string — section title",
  "columns": "string[] — column headers",
  "rows": "(string | number | null)[][] — table rows"
}
```

#### ReportSummary

Returned by `REPORTS_LIST`. Contains metadata only (no sections).

```json
{
  "id": "string — unique report identifier",
  "title": "string — report title",
  "category": "string — e.g. 'performance', 'security', 'accessibility'",
  "status": "ReportStatus — overall health outcome",
  "summary": "string — one-line summary of findings",
  "updatedAt": "string — ISO 8601 timestamp",
  "source?": "string — agent or service that generated the report",
  "tags?": "string[] — free-form tags for filtering",
  "lifecycleStatus?": "ReportLifecycleStatus — workflow state (default: 'unread')"
}
```

#### Report (full)

Returned by `REPORTS_GET`. Extends `ReportSummary` with content.

```json
{
  "...ReportSummary fields",
  "sections": "ReportSection[] — ordered content sections"
}
```

---

## Tool Specifications

### `REPORTS_LIST`

Lists available reports with optional filtering.

- **Input**: `{ category?: string, status?: ReportStatus }`
- **Output**: `{ reports: ReportSummary[] }`

Notes:
- Return all reports when no filters are provided.
- Reports with `lifecycleStatus: "dismissed"` are considered archived; everything else is active. Reports with `lifecycleStatus: "unread"` (or no `lifecycleStatus`) are new.
- Order reports by `updatedAt` descending (most recent first) unless the server has a more meaningful ordering.

### `REPORTS_GET`

Retrieves a single report by ID with full sections.

- **Input**: `{ id: string }`
- **Output**: The full `Report` object (see schema above).

Notes:
- Return an MCP error (`isError: true`) if the report ID is not found.
- Sections are rendered in array order — put the most important information first.

### `REPORTS_UPDATE_STATUS` (optional)

Updates the lifecycle status of a report.

- **Input**: `{ reportId: string, lifecycleStatus: ReportLifecycleStatus }`
- **Output**: `{ success: boolean, message?: string }`

Notes:
- Consumers call this automatically when a report is opened (sets `"read"`).
- `"dismissed"` archives the report. Restoring from dismissed sets `"read"`.
- If not implemented, lifecycle tracking is unavailable but the binding remains usable as a read-only viewer.

---

## Binding Detection

A connection is considered reports-compatible when it exposes at minimum:
- `REPORTS_LIST`
- `REPORTS_GET`

Detection checks tool name presence (exact string match). No schema validation is performed at detection time.

---

## Categories

Categories are free-form strings. Common conventions:

| Category | Use case |
|---|---|
| `performance` | Web vitals, bundle size, load times |
| `security` | Vulnerability scans, dependency audits |
| `accessibility` | WCAG compliance, axe-core results |
| `seo` | Meta tags, structured data, crawlability |
| `quality` | Code quality, test coverage, lint results |
| `uptime` | Health checks, availability monitoring |
| `compliance` | License audits, policy checks |

---

## Implementation Details: GitHub Repo Reports (`github-repo-reports/`)

- **Storage**: Markdown files with YAML frontmatter in a configurable GitHub repository directory
- **Auth**: GitHub App OAuth (PKCE) — user selects which repositories to grant access during installation
- **Configuration** (`StateSchema`): `REPO` (owner/repo), `PATH` (default: `reports`), `BRANCH` (default: `reports`)
- **Report IDs**: Relative file path without `.md` extension (e.g., `security/audit` for `reports/security/audit.md`)
- **Tags from directory nesting**: `reports/security/audit.md` automatically receives tag `["security"]`, merged with frontmatter tags
- **Lifecycle persistence**: Stored in `.reports-status.json` committed to the same branch (zero server-side state)
- **Data fetching**: Git Trees API for listing, Git Blobs API for parallel content fetch, Contents API for single-file reads and status file writes
- **Parser**: YAML frontmatter extracted for metadata + structured sections; markdown body appended as a final `markdown` section
- **Dependencies**: `@octokit/rest`, `yaml`, `@decocms/runtime`

### Report File Format

See [`github-repo-reports/REPORT_FORMAT.md`](../github-repo-reports/REPORT_FORMAT.md) for the full file format specification and authoring guide.

---

## Implementation Checklist

1. **Register both required tools** (`REPORTS_LIST`, `REPORTS_GET`) in your MCP server.
2. **Return structured content** — set both `content` (text array) and `structuredContent` (typed JSON) on every tool response.
3. **Use consistent report IDs** — consumers use `id` to navigate between list and detail views.
4. **Provide meaningful sections** — use `markdown` for narrative, `metrics` for KPIs with deltas, and `table` for tabular data. Order them from most to least important.
5. **Support filtering** — handle `category` and `status` filters in `REPORTS_LIST` (return all when omitted).
6. **Set `lifecycleStatus`** — default to `"unread"` for new reports. The field is optional (omitted is treated as `"unread"`).
7. **(Optional) Implement `REPORTS_UPDATE_STATUS`** for full lifecycle workflow support (read tracking, dismiss/restore).
