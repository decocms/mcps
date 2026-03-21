/**
 * HyperDX MCP Prompts
 *
 * Static prompt resources that explain how to use HyperDX tools effectively.
 * These are exposed as MCP prompts so LLMs can retrieve them on demand.
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

HyperDX uses a simple but powerful search syntax for filtering logs, spans, and events.
The \`where\` parameter in all tools accepts this syntax.

---

## CRITICAL: Understanding the Data Model

**Logs and spans are BOTH stored as "events".** When you query \`dataSource: "events"\`, you get BOTH.
- The \`body\` field contains **log messages** for logs, but **span/operation names** (like "GET", "POST", "cache-match") for spans.
- To search only actual log messages, filter with \`level:error\`, \`level:warn\`, etc.
- To search spans, filter with \`duration:>0\` or look for span-specific fields like \`http.method\`.

## CRITICAL: Log Levels Are Non-Standard

This system uses OpenTelemetry-style levels, NOT standard syslog levels:
- \`ok\` — Successful operation (this is the MOST COMMON level, ~70% of events)
- \`log\` — General log output (used heavily by deco-chat-api)
- \`info\` — Informational
- \`warn\` — Warning
- \`error\` — Error
- \`debug\` — Debug

**\`ok\` is NOT \`info\`!** If you search \`level:info\` you will miss most events. Use \`level:ok\` for successful spans.

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
service:farmrio
env:production
process.serviceName:deco-chat
\`\`\`

### IMPORTANT: service vs process.serviceName
Both fields exist and often have the same value, but not always. The dashboards use both:
- \`service\` — most common, works for storefront sites
- \`process.serviceName\` — used by deco-chat infra dashboards

### Multiple filters (AND logic by default):
\`\`\`
level:error service:farmrio
level:error service:farmrio env:production
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
http.response.status_code:>=500    (HTTP 5xx errors)
http.response.status_code:>500     (HTTP status > 500)
\`\`\`

---

## Existence Checks

\`\`\`
trace_id:*              (has a trace ID)
tool.id:*               (has a tool ID — filters to tool call spans)
dispatch_namespace:*    (has a dispatch namespace — filters to CF Workers apps)
cloud.provider:*        (has cloud provider info)
http.request.url:*      (is an HTTP request)
\`\`\`

---

## Wildcards

\`\`\`
service:superfrete*     (starts with "superfrete")
*Error*                 (contains "Error" anywhere)
service:*-prod          (ends with "-prod")
\`\`\`

---

## Common Query Patterns for This Instance

| Goal | Query |
|------|-------|
| All errors | \`level:error\` |
| Errors in a storefront | \`level:error service:farmrio\` |
| deco-chat errors | \`level:error process.serviceName:deco-chat\` |
| Slow spans | \`duration:>2000\` |
| HTTP 5xx | \`http.response.status_code:>=500\` |
| VTEX errors | \`level:error vtex\` |
| VTEX 502s | \`vtex level:error 502\` |
| Build errors | \`service:admin level:error\` |
| Tool calls in deco-chat | \`process.serviceName:deco-chat tool.id:*\` |
| CF Workers apps | \`dispatch_namespace:*\` |
| Kubernetes-hosted | \`cloud.provider:kubernetes\` |
| Cache operations | \`span_name:"cache-match"\` |
| Exclude noise | \`level:error -service:healthcheck -"liveness probe"\` |
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

## IMPORTANT: Common Pitfalls

1. **body ≠ log message for spans.** The \`body\` field contains span names (e.g., "GET", "POST", "cache-match") for spans and actual messages for logs. Searching SEARCH_LOGS with \`*\` returns mostly span names, NOT log content.

2. **Levels are non-standard.** The most common level is \`ok\` (successful spans), then \`log\` (deco-chat-api output), then \`info\`, \`warn\`, \`error\`, \`debug\`. Don't assume standard log levels.

3. **service vs process.serviceName.** Both exist. \`service\` is the common one. Some infra tools use \`process.serviceName\`. When in doubt, try both.

4. **Default time windows are short.** SEARCH_LOGS and GET_LOG_DETAILS default to 15 min. QUERY_SPANS and QUERY_METRICS default to 1 hour. For rare events, extend \`startTime\`.

5. **Start with DISCOVER_DATA.** If you don't know what's in this instance, call DISCOVER_DATA first. It runs 6 parallel queries and returns services, levels, errors, spans, cloud providers, and dashboards in one call.

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
| Manage alert thresholds | LIST/GET/CREATE/UPDATE/DELETE_ALERT |

---

## DISCOVER_DATA — Start here

Best for: "What data is in this HyperDX instance?"

\`\`\`json
{}
\`\`\`

Returns services, levels, top errors, top span operations, cloud providers, and dashboards — all in one call. Default lookback is 6 hours.

---

## SEARCH_LOGS — Quick error discovery

Best for: "What errors are happening right now?"

\`\`\`json
{ "query": "level:error" }
\`\`\`

**Warning:** Results are grouped by \`body\`. For spans, body = span name (e.g., "GET"). For actual error messages, always filter \`level:error\` or \`level:warn\`.

---

## GET_LOG_DETAILS — Structured exploration

Best for: "Show me errors with their service, level, and other fields"

\`\`\`json
{
  "query": "level:error",
  "groupBy": ["service", "body"],
  "limit": 20
}
\`\`\`

**Pro tip:** Use \`groupBy: ["service", "level"]\` to see the level distribution per service.

---

## QUERY_SPANS — Latency & trace analysis

\`\`\`json
{
  "query": "service:farmrio",
  "aggFn": "p95",
  "field": "duration"
}
\`\`\`

Default groupBy: \`["span_name", "service"]\`. Use \`duration:>0\` filter to exclude non-span events.

---

## GET_SERVICE_HEALTH — Incident triage

\`\`\`json
{ "service": "deco-chat" }
\`\`\`

Returns 3 series per time bucket:
- \`series_0.data\` = error count
- \`series_1.data\` = total request count
- \`series_2.data\` = p95 latency (ms)

---

## GET_DASHBOARD — Learn from existing queries

The dashboards contain battle-tested queries. Use \`LIST_DASHBOARDS\` then \`GET_DASHBOARD\` to see what fields and filters the team uses. Dashboards like "platform - http", "decocms infra", and "platform - commerce" contain rich query patterns.

---

## CREATE_DASHBOARD — Grid layout

Typical width: 12 units. Common sizes: 6×2 (half-width), 12×2 (full-width), 4×2 (third-width).

---

## CREATE_ALERT

Alert on error spike (search-based):
\`\`\`json
{
  "interval": "5m",
  "threshold": 100,
  "threshold_type": "above",
  "source": "search",
  "savedSearchId": "your-saved-search-id",
  "channel": { "type": "slack", "channelId": "C1234567" }
}
\`\`\`
`,
        },
      },
    ],
  }),
});

// ============================================================================
// HYPERDX_SYSTEM_PROMPT — Expert agent system prompt
// ============================================================================

export const systemPrompt = createPrompt({
  name: "HYPERDX_SYSTEM_PROMPT",
  title: "HyperDX Expert Agent System Prompt",
  description:
    "System prompt for an AI agent that is an expert in querying and analyzing this specific HyperDX instance. Includes data model knowledge, service taxonomy, field reference, and query patterns.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Give me a system prompt for an agent that is an expert in our HyperDX observability data.",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# HyperDX Observability Expert — System Prompt

You are an observability expert with deep knowledge of this HyperDX instance. You help engineers investigate incidents, analyze performance, discover error patterns, and build dashboards.

## Data Model

This HyperDX instance monitors a **Deco.cx platform** — an edge-computing commerce platform running storefronts on Deno Deploy and Kubernetes, with a central "deco-chat" AI orchestration service on Cloudflare Workers.

### Event Types
All data is queried via \`dataSource: "events"\`. Both logs and spans are stored together:
- **Spans** have \`duration > 0\`, a \`span_name\`, and the \`body\` field contains the operation name (e.g., "GET", "POST /mcp", "cache-match")
- **Logs** have messages in the \`body\` field and levels like \`error\`, \`warn\`, \`info\`, \`log\`

### Log Levels (NON-STANDARD)
- \`ok\` — Successful span completion (~70% of all events). This is NOT \`info\`.
- \`log\` — General log output from deco-chat-api
- \`info\` — Informational logs
- \`warn\` — Warnings (rendering issues, deprecated calls)
- \`error\` — Errors (rendering failures, HTTP errors, timeouts)
- \`debug\` — Debug output (rare)

### Service Taxonomy

**Storefront Sites** (customer commerce sites on Deno Deploy / K8s):
\`farmrio\`, \`fila-store\`, \`technos\`, \`teciplast\`, \`als-storefront\`, \`miess-01\`, \`lebiscuit\`, \`casaevideo\`, \`oficina-reserva\`, \`lojabagaggio\`, \`lojastorra-2\`, \`osklenbr\`, \`montecarlo\`, \`granadobr\`, \`zeenow\`, \`homycasa\`, \`ffloresta\`, \`zeedog\`, \`cleanwhey\`, \`maconequiio\`, \`macoteste\`, \`lojaintegradar\`

**Platform Services**:
- \`deco-chat\` / \`deco-chat-api\` — The core AI chat/orchestration platform (Cloudflare Workers). Uses fields: \`tool.id\`, \`actor.name\`, \`actor.method\`, \`mcp.tool.name\`, \`workspace\`
- \`admin\` — Build system and admin API. Uses fields: \`build.step\`, \`site\`, \`deploymentId\`
- \`deco-ai-gateway\` — AI model proxy/gateway

**Cloudflare Workers Apps** (via dispatch_namespace):
\`superfrete-atendimento-*\`, \`billing\`, \`libertas-workflows\`, \`libertas-hunting-prod\`, \`superfrete-workflows\`, \`superfrete-tracking\`, \`admin-cx\`

### Cloud Providers
- \`kubernetes\` — Primary hosting (most storefront traffic)
- \`denodeploy\` — Secondary hosting (some storefronts)

### Key Fields Reference

**Universal fields:** \`service\`, \`process.serviceName\`, \`level\`, \`body\`, \`span_name\`, \`duration\`, \`trace_id\`, \`span_id\`

**HTTP fields:** \`http.request.url\`, \`http.response.status_code\`, \`http.method\`, \`http.host\`, \`http.status_code\`, \`url.path\`, \`url.full\`

**Infrastructure:** \`cloud.provider\`, \`service.instance.id\`, \`process.tag.cloud.provider\`, \`cf.workers_version_metadata.id\`, \`dispatch_namespace\`

**deco-chat specific:** \`tool.id\`, \`tool.resource\`, \`tool.thread\`, \`actor.name\`, \`actor.id\`, \`actor.method\`, \`mcp.tool.name\`, \`workspace\`, \`db.sql.query\`

**Build system:** \`build.step\` (values: \`site_build\`, \`upload_results\`, \`UPLOAD_RESULTS\`), \`process.tag.site.name\`, \`cache_tar_size_mb\`, \`source_tar_size_mb\`

**Commerce:** \`deco.runtime.version\`, \`deco.apps.version\`

**Cache:** \`cache_status\` (values: \`hit\`, \`miss\`, \`stale\`), used with \`span_name:"cache-match"\`

## Existing Dashboards (reference for query patterns)

1. **"Main Dashboard v2.0"** — Overall health: request count, error count, latency, HTTP status codes
2. **"platform - http"** — HTTP latency (P99, AVG), status codes, error counts, cache hit rates, isolate counts
3. **"platform - daily"** — Daily error tracking by service, VTEX timeouts, AbortErrors, build errors, liveness probes
4. **"platform - commerce"** — VTEX/VNDA latency (P95/P99/AVG), error rates by status code (502, 429, 500)
5. **"platform - traffic split"** — Traffic comparison between cloud providers (K8s vs Deno Deploy)
6. **"platform - admin"** — Admin service errors by site, common error patterns
7. **"decocms infra"** — deco-chat request counts, latency per route, tool call duration, AI agent stream latency, DB query latency, trigger usage
8. **"decocms errors"** — deco-chat-api error tracking
9. **"decocms apps"** — Cloudflare Workers dispatch namespace apps: logs, errors, CPU/wall time, workflow execution
10. **"errors - runtime version"** — Errors broken down by Deco runtime and apps version
11. **"errors - admin browser"** — Client-side admin errors by user email
12. **"Loaders Cache"** — Cache hit/miss/stale rates, duration per status, per-service breakdown
13. **"Superfrete"** — Superfrete service errors
14. **"Runtime"** — Outbound HTTP request latency (P99) by destination URL
15. **"Farm Investigation"** — FarmRio-specific: cookie issues, cache behavior

## Common Error Patterns

- **"Balance alert check failed"** — deco-ai-gateway, recurring (billing/quota issue)
- **"rendering: site/sections/..."** — Storefront rendering errors (TypeError, Invalid URL)
- **"loader error AbortError: The signal has been aborted"** — Request timeouts in loaders
- **"error sending request for url: *.myvtex.com/..."** — VTEX API errors (GraphQL validation, 502, 429)
- **"HttpError 402: Unavailable Shop"** — Shopify payment-required errors
- **"HttpError 500: Internal Server Error"** — VTEX intelligent search failures
- **"Error executing step gathering: McpError"** — MCP tool schema validation errors (Zod)
- **"liveness probe failed"** — K8s health check failures

## Query Strategy

1. **Start broad, narrow down.** Use DISCOVER_DATA or \`GET_LOG_DETAILS\` with \`groupBy: ["service", "level"]\` to see the landscape.
2. **Use dashboards as references.** Call GET_DASHBOARD on relevant dashboards to see what query patterns the team uses.
3. **For errors, always filter \`level:error\`.** Without this, you get mostly \`ok\` spans.
4. **For latency, use QUERY_SPANS.** Default p95 on duration grouped by span_name+service gives a great overview.
5. **For deco-chat investigation,** use \`process.serviceName:deco-chat\` and explore \`tool.id\`, \`actor.name\`, \`db.sql.query\` fields.
6. **For commerce/VTEX issues,** search for \`vtex level:error\` and check status codes (502 = upstream failure, 429 = rate limit, 500 = server error).
7. **For build issues,** filter \`service:admin\` and look at \`build.step\`, \`process.tag.site.name\`.
`,
        },
      },
    ],
  }),
});

export const prompts = [searchSyntaxPrompt, queryGuidePrompt, systemPrompt];
