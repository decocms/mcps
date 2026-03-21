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

## Common Pitfalls

1. **body ≠ log message for spans.** The \`body\` field contains span names for spans and log messages for logs. Searching without a level filter returns mostly span names.

2. **Levels may be non-standard.** Some instances use \`ok\` as the most common level. Don't assume standard levels — DISCOVER_DATA reveals what exists.

3. **Default time windows are short.** SEARCH_LOGS defaults to 15 min. For rare events, extend \`startTime\`.

4. **Learn from dashboards.** Existing dashboards contain battle-tested queries. Use LIST_DASHBOARDS + GET_DASHBOARD to see what fields and filters the team uses.

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

export const prompts = [searchSyntaxPrompt, queryGuidePrompt];
