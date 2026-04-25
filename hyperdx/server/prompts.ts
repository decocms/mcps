/**
 * HyperDX MCP Prompts
 *
 * Static prompt resources that explain how to use HyperDX tools effectively.
 * These are exposed as MCP prompts so LLMs can retrieve them on demand.
 *
 * NOTE: For instance-specific knowledge (services, fields, error patterns),
 * use the DISCOVER_DATA tool which generates a tailored agent prompt dynamically.
 */

import { createPrompt } from "@decocms/runtime";

// ============================================================================
// HYPERDX_AGENT_GUIDE  (top-level entry point)
// ============================================================================

export const agentGuidePrompt = createPrompt({
  name: "HYPERDX_AGENT_GUIDE",
  title: "HyperDX Agent — Main Instructions",
  description:
    "Entry-point system prompt for an agent using the HyperDX MCP. Covers what the MCP does, the recommended onboarding flow, time range syntax, tool selection, search essentials, and common pitfalls.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "I am an agent that just connected to the HyperDX MCP. How should I operate?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# HyperDX Agent — Main Instructions

You are an observability agent backed by the **HyperDX MCP**. HyperDX is an OpenTelemetry-native observability platform; this MCP exposes tools to query logs, traces (spans), and metrics, and to create and manage dashboards and alerts.

---

## 1. Start every session with \`DISCOVER_DATA\`

HyperDX instances vary wildly — services, log levels, and field schemas are all instance-specific. Running \`DISCOVER_DATA\` first returns a tailored \`agentPrompt\` that enumerates:

- Active services by event volume
- Actual log levels in use (some instances use \`ok\` instead of \`info\`)
- Top error messages
- Top span operations
- Available dashboards and the fields they query

Pass \`hints\` with domain keywords if the user's context suggests specific fields to look for.

\`\`\`json
{ "hints": "checkout payment cloud.provider rendering" }
\`\`\`

Use the returned \`agentPrompt\` as additional context before answering the user.

---

## 2. Time ranges: pass expressions, not epoch ms

Every time-range tool accepts flexible inputs — **do not compute epoch milliseconds yourself**. The server has the reliable clock; you don't.

| Form | Example | Meaning |
|---|---|---|
| number | \`1777037400000\` | Epoch ms (still supported) |
| ISO 8601 w/ timezone | \`"2026-04-24T14:00:00-03:00"\` | Exact instant |
| \`now\` arithmetic | \`"now"\`, \`"now-1h"\`, \`"now+5m"\` | Relative to server clock |
| shorthand duration | \`"30m"\`, \`"2h"\`, \`"7d"\`, \`"2h30m"\` | N ago |
| date only | \`"2026-04-24"\` | UTC midnight |

**Rule:** When the user names a local wall-clock time ("14:00 GMT-3", "9am EST"), always attach an explicit offset (\`-03:00\`, \`-05:00\`, …). **Naive timestamps are rejected** — the resolver returns an actionable error rather than guessing UTC.

**Worked example.** User: *"at around 14:00 GMT-3 we had a spike of errors, what was it?"*

\`\`\`json
{
  "query": "level:error",
  "startTime": "2026-04-24T13:30:00-03:00",
  "endTime":   "2026-04-24T14:30:00-03:00"
}
\`\`\`

If the phrasing is ambiguous (no timezone, fuzzy "this morning"), call \`RESOLVE_TIME_RANGE\` first to preview the window. **It has no side effects and no API cost — use it liberally.**

\`\`\`json
{ "startTime": "2h", "endTime": "now" }
// → { startTime: ..., endTime: ..., humanReadable: "... → ... (2.0h)" }
\`\`\`

---

## 3. Tool selection cheat sheet

| User goal | Tool |
|---|---|
| First time / map the instance | **DISCOVER_DATA** |
| "Show me recent errors" | SEARCH_LOGS |
| "Show me details + trace context" | GET_LOG_DETAILS |
| "Plot error count over time" | QUERY_CHART_DATA |
| "Latency / slow requests / p95" | QUERY_SPANS |
| "CPU / memory / counters" | QUERY_METRICS |
| "Is service X healthy right now?" | GET_SERVICE_HEALTH |
| "Did this get worse vs last week?" | COMPARE_TIME_RANGES |
| "Preview a time window before querying" | RESOLVE_TIME_RANGE |
| "What dashboards exist?" | LIST_DASHBOARDS / GET_DASHBOARD |
| Create dashboard / alert | CREATE_DASHBOARD / CREATE_ALERT |

---

## 4. Search query syntax (essentials)

The \`where\` and \`query\` parameters use HyperDX search syntax:

\`\`\`
level:error                     — property filter
level:error service:"my-app"    — AND (implicit); quote spaces
service:api OR service:web      — OR
level:error -service:healthcheck — exclude
duration:>1000                  — range (spans slower than 1s)
http.status_code:>=500          — HTTP 5xx
trace_id:*                      — existence check
service:api*                    — prefix wildcard
level:error "connection refused" — full-text phrase
\`\`\`

Retrieve the **\`HYPERDX_SEARCH_SYNTAX\`** prompt for the full grammar (boolean operators, wildcards, ranges, existence checks, all common patterns).

---

## 5. Common pitfalls

1. **\`body\` is overloaded.** It holds **log messages** for logs but **span names** (e.g. "GET", "cache-match") for spans. Always filter by \`level:error\` when you want actual log messages, or by \`duration:>0\` for spans.
2. **Log levels may be non-standard.** Some instances use \`ok\` as the most common level. Never assume — \`DISCOVER_DATA\` reveals what exists.
3. **Default time windows are short.** \`SEARCH_LOGS\` defaults to 15 min. For rare events, extend with \`"startTime": "24h"\` (= 24h ago).
4. **Timezone is mandatory on wall-clock times.** The resolver rejects naive ISO strings to prevent silent UTC guesses.
5. **Learn from dashboards.** Existing dashboards encode battle-tested queries. \`LIST_DASHBOARDS\` + \`GET_DASHBOARD\` show the team's conventions.

---

## 6. Further reading

- **\`HYPERDX_SEARCH_SYNTAX\`** — complete query grammar reference.
- **\`HYPERDX_QUERY_GUIDE\`** — per-tool examples and an extended pitfalls list.

Retrieve either via the standard MCP \`prompts/get\` request when needed.
`,
        },
      },
    ],
  }),
});

// ============================================================================
// HYPERDX_SEARCH_SYNTAX
// ============================================================================

export const searchSyntaxPrompt = createPrompt({
  name: "HYPERDX_SEARCH_SYNTAX",
  title: "HyperDX Search Query Syntax",
  description:
    "Complete reference for writing HyperDX search queries used in the 'where' parameter of all tools.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I write search queries for HyperDX?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# HyperDX Search Query Syntax

The \`where\` parameter in all tools accepts this syntax.

---

## CRITICAL: Understanding the Data Model

**Logs and spans are BOTH stored as "events".** When you query \`dataSource: "events"\`, you get BOTH.
- The \`body\` field contains **log messages** for logs, but **span/operation names** (like "GET", "POST", "cache-match") for spans
- To search only actual log messages, filter by level (e.g., \`level:error\`)
- To search spans specifically, filter with \`duration:>0\` or span-specific fields

## CRITICAL: Log Levels May Be Non-Standard

Some HyperDX instances use OpenTelemetry-style levels instead of standard syslog levels:
- \`ok\` — Successful operation (can be the MOST common level)
- \`log\` — General log output
- \`info\`, \`warn\`, \`error\`, \`debug\` — Standard levels

**Always run DISCOVER_DATA first** to see which levels exist in your instance.

---

## Basic Full-Text Search

\`\`\`
error
payment failed
\`\`\`

- Case-insensitive, whole-word match by default
- \`Error\` matches "Error here" but NOT "Errors here"
- Wildcards: \`*Error*\` matches "AnyError" or "Errors"

---

## Property Filters

\`\`\`
level:error
service:my-app
env:production
\`\`\`

### Multiple filters (AND logic by default):
\`\`\`
level:error service:my-app
level:error service:my-app env:production
\`\`\`

### Quoting values with spaces:
\`\`\`
service:"my service"
message:"connection refused"
\`\`\`

---

## Boolean Operators

\`\`\`
level:error AND service:api
level:error OR level:warn
level:error NOT service:internal
level:error -service:internal
-env:staging
\`\`\`

---

## Range Queries

\`\`\`
duration:>1000          (spans slower than 1 second)
duration:>=500
duration:<100
http.status_code:>=500  (HTTP 5xx errors)
\`\`\`

---

## Existence Checks

\`\`\`
trace_id:*              (has a trace ID)
http.request.url:*      (is an HTTP request)
db.system:*             (is a database call)
\`\`\`

---

## Wildcards

\`\`\`
service:api*            (starts with "api")
*Error*                 (contains "Error" anywhere)
service:*-prod          (ends with "-prod")
\`\`\`

---

## Common Patterns

| Goal | Query |
|------|-------|
| All errors | \`level:error\` |
| Errors in a service | \`level:error service:my-app\` |
| Slow spans | \`duration:>2000\` |
| HTTP 5xx | \`http.status_code:>=500\` |
| Errors excluding noise | \`level:error -service:healthcheck\` |
| Events from a trace | \`trace_id:abc123\` |
| Database queries | \`db.system:*\` |
| Specific error text | \`level:error "connection refused"\` |
`,
        },
      },
    ],
  }),
});

// ============================================================================
// HYPERDX_QUERY_GUIDE
// ============================================================================

export const queryGuidePrompt = createPrompt({
  name: "HYPERDX_QUERY_GUIDE",
  title: "HyperDX Tools Query Guide",
  description:
    "Practical guide on when and how to use each HyperDX MCP tool for common observability tasks.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I use the HyperDX MCP tools effectively?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# HyperDX MCP Tools — Query Guide

## Getting Started

**Always run DISCOVER_DATA first** when working with a new HyperDX instance. It runs parallel queries to map out services, levels, errors, span operations, and dashboards — and generates a tailored system prompt from what it finds.

Pass domain-specific hints to get targeted results:
\`\`\`json
{
  "hints": "cloud.provider rendering loader section vtex shopify"
}
\`\`\`

---

## Time Range Syntax

Every tool's \`startTime\` and \`endTime\` (plus the four \`currentStart\`/\`currentEnd\`/\`priorStart\`/\`priorEnd\` on \`COMPARE_TIME_RANGES\`) accept any of:

- **Epoch milliseconds** (number): \`1777037400000\`
- **ISO 8601 with timezone**: \`"2026-04-24T14:00:00-03:00"\`, \`"2026-04-24T14:00:00Z"\`, \`"2026-04-24T14:00:00.123+05:30"\`
- **\`now\` arithmetic**: \`"now"\`, \`"now-1h"\`, \`"now-30m"\`, \`"now+5m"\`
- **Shorthand duration** (interpreted as "N ago"): \`"30m"\`, \`"2h"\`, \`"7d"\`, \`"2h30m"\`, \`"15s"\`
- **Date only** (UTC midnight): \`"2026-04-24"\`

**Don't compute epoch ms yourself** — pass the expression and let the server resolve it against its reliable clock.

**Naive timestamps without a timezone are rejected.** If the user says a local time, append an explicit offset.

### Worked example: "around 14:00 GMT-3 we had a spike of errors"

1. GMT-3 ≡ offset \`-03:00\`. Convert the local hour into an ISO 8601 string — the server does the epoch math.
2. Pick a ±30 min window around the mentioned instant.
3. Call the query tool:

\`\`\`json
{
  "query": "level:error",
  "startTime": "2026-04-24T13:30:00-03:00",
  "endTime":   "2026-04-24T14:30:00-03:00"
}
\`\`\`

If the phrasing is ambiguous, call \`RESOLVE_TIME_RANGE\` first to preview the exact epoch ms the server resolves the expression to. The tool has no side effects and no API cost.

\`\`\`json
{ "startTime": "2h", "endTime": "now" }
// → { startTime: ..., endTime: ..., humanReadable: "... → ... (2.0h)" }
\`\`\`

---

## Common Pitfalls

1. **body ≠ log message for spans.** The \`body\` field contains span names for spans and log messages for logs. Searching without a level filter returns mostly span names.

2. **Levels may be non-standard.** Some instances use \`ok\` as the most common level. Don't assume standard levels — DISCOVER_DATA reveals what exists.

3. **Default time windows are short.** SEARCH_LOGS defaults to 15 min. For rare events, extend \`startTime\` (e.g. \`"24h"\`).

4. **Always include a timezone for wall‑clock times.** The resolver rejects naive ISO strings to avoid silently guessing UTC.

5. **Learn from dashboards.** Existing dashboards contain battle-tested queries. Use LIST_DASHBOARDS + GET_DASHBOARD to see what fields and filters the team uses.

---

## Tool Selection Guide

| Task | Best Tool |
|------|-----------|
| **First time? What data exists?** | **DISCOVER_DATA** |
| Find recent errors | SEARCH_LOGS |
| Debug specific issue with context | GET_LOG_DETAILS |
| Analyze trends over time | QUERY_CHART_DATA |
| Check request latency / traces | QUERY_SPANS |
| Monitor infrastructure metrics | QUERY_METRICS |
| Triage an incident for a service | GET_SERVICE_HEALTH |
| Compare this period vs last | COMPARE_TIME_RANGES |
| See what dashboards exist | LIST_DASHBOARDS |
| Inspect a dashboard's queries | GET_DASHBOARD |

---

## Tool Examples

### DISCOVER_DATA — Start here
\`\`\`json
{ "hints": "your domain keywords here" }
\`\`\`
Returns services, levels, errors, spans, dashboards, hint results, and a generated \`agentPrompt\`.

### SEARCH_LOGS — Quick error discovery
\`\`\`json
{ "query": "level:error" }
\`\`\`

### GET_LOG_DETAILS — Structured exploration
\`\`\`json
{
  "query": "level:error",
  "groupBy": ["service", "body"],
  "limit": 20
}
\`\`\`

### QUERY_SPANS — Latency analysis
\`\`\`json
{
  "query": "service:my-app",
  "aggFn": "p95",
  "field": "duration"
}
\`\`\`

### GET_SERVICE_HEALTH — Incident triage
\`\`\`json
{ "service": "my-app" }
\`\`\`
Returns 3 series: \`series_0.data\` = error count, \`series_1.data\` = total requests, \`series_2.data\` = p95 latency ms.

### COMPARE_TIME_RANGES — Regression detection
\`\`\`json
{
  "query": "level:error service:my-app",
  "aggFn": "count",
  "currentStart": ..., "currentEnd": ...,
  "priorStart": ..., "priorEnd": ...
}
\`\`\`

### CREATE_DASHBOARD — Grid layout
Typical width: 12 units. Common sizes: 6×2 (half), 12×2 (full), 4×2 (third).
`,
        },
      },
    ],
  }),
});

export const prompts = [agentGuidePrompt, searchSyntaxPrompt, queryGuidePrompt];
