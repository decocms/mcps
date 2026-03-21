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

## Basic Full-Text Search

Match any event containing a word:
\`\`\`
error
payment failed
\`\`\`

- Search is **case-insensitive**
- Matches by **whole word** by default: \`Error\` matches "Error here" but NOT "Errors here"
- For partial matching, use wildcards: \`*Error*\` matches "AnyError" or "Errors"

---

## Property Filters

Target specific fields using \`property:value\` syntax:
\`\`\`
level:error
service:api
env:production
\`\`\`

### Multiple filters (AND logic by default):
\`\`\`
level:error service:api
level:error service:api env:production
\`\`\`

### Quoting values with spaces:
\`\`\`
service:"my service"
message:"connection refused"
\`\`\`

---

## Boolean Operators

### AND (explicit):
\`\`\`
level:error AND service:api
\`\`\`

### OR:
\`\`\`
level:error OR level:warn
service:api OR service:web
\`\`\`

### NOT / negation:
\`\`\`
level:error NOT service:internal
-service:internal
level:error -env:staging
\`\`\`

---

## Range Queries

Use comparison operators on numeric fields:
\`\`\`
duration:>1000          (spans slower than 1 second)
duration:>=500
duration:<100           (fast spans under 100ms)
status_code:>=500       (HTTP 5xx errors)
status_code:>=400 status_code:<500   (HTTP 4xx only)
\`\`\`

---

## Existence Checks

Check whether a field is present:
\`\`\`
trace_id:*              (has a trace ID)
error.message:*         (has an error message)
\`\`\`

---

## Exact Phrase Matching

Wrap in double quotes for exact phrase:
\`\`\`
"connection refused"
"NullPointerException"
"out of memory"
\`\`\`

---

## Wildcards

\`\`\`
service:api*            (starts with "api": api, api-v2, api-internal)
*Error*                 (contains "Error" anywhere)
service:*-prod          (ends with "-prod")
\`\`\`

---

## Common Query Patterns

| Goal | Query |
|------|-------|
| All errors | \`level:error\` |
| Errors in a service | \`level:error service:checkout\` |
| Slow spans | \`duration:>2000\` |
| HTTP 5xx errors | \`http.status_code:>=500\` |
| Errors excluding noise | \`level:error -service:healthcheck\` |
| Production errors only | \`level:error env:production\` |
| Specific error type | \`"NullPointerException" service:api\` |
| All events from a trace | \`trace_id:abc123\` |
| Database slow queries | \`db.system:* duration:>500\` |
| Failed HTTP calls | \`http.status_code:>=400 service:frontend\` |
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

## Tool Selection Guide

| Task | Best Tool |
|------|-----------|
| Find recent errors | SEARCH_LOGS |
| Debug a specific issue with context | GET_LOG_DETAILS |
| Analyze trends over time | QUERY_CHART_DATA |
| Check request latency / traces | QUERY_SPANS |
| Monitor infrastructure metrics | QUERY_METRICS |
| Triage an incident for a service | GET_SERVICE_HEALTH |
| Compare this week vs last week | COMPARE_TIME_RANGES |
| Manage alert thresholds | LIST/GET/CREATE/UPDATE/DELETE_ALERT |
| Build or update dashboards | LIST/GET/CREATE/UPDATE/DELETE_DASHBOARD |

---

## SEARCH_LOGS — Quick error discovery

Best for: "What errors are happening right now?"

\`\`\`json
{
  "query": "level:error service:api",
  "startTime": 1700000000000,
  "endTime": 1700003600000,
  "limit": 50
}
\`\`\`

Returns distinct log messages grouped by body with occurrence counts.
Default time window: last 15 minutes.

---

## GET_LOG_DETAILS — Structured log exploration

Best for: "Show me errors with their service and trace IDs"

\`\`\`json
{
  "query": "level:error",
  "groupBy": ["body", "service", "trace_id", "level"],
  "limit": 20
}
\`\`\`

Use custom \`groupBy\` to surface any fields you care about.
Useful fields: \`body\`, \`service\`, \`level\`, \`env\`, \`trace_id\`, \`span_id\`, \`userEmail\`, \`host\`.

---

## QUERY_CHART_DATA — Full time series analysis

Best for: Custom multi-series queries, trend analysis, raw API power.

Single series example — error count over time:
\`\`\`json
{
  "startTime": 1700000000000,
  "endTime": 1700003600000,
  "granularity": "5 minute",
  "series": [{
    "dataSource": "events",
    "aggFn": "count",
    "where": "level:error service:api",
    "groupBy": []
  }]
}
\`\`\`

Multi-series example — errors vs warnings:
\`\`\`json
{
  "series": [
    { "dataSource": "events", "aggFn": "count", "where": "level:error", "groupBy": [] },
    { "dataSource": "events", "aggFn": "count", "where": "level:warn", "groupBy": [] }
  ]
}
\`\`\`

Response shape: each item has \`ts_bucket\` (epoch ms), \`series_0.data\`, \`series_1.data\`, \`group\` (array of groupBy values).

---

## QUERY_SPANS — Latency and trace analysis

Best for: "How slow is the checkout service? Which endpoints are slowest?"

\`\`\`json
{
  "query": "service:checkout",
  "aggFn": "p95",
  "field": "duration",
  "groupBy": ["span_name", "service"],
  "granularity": "5 minute"
}
\`\`\`

Aggregation functions for spans:
- \`p50\`, \`p95\`, \`p99\` — latency percentiles
- \`count\` — request throughput
- \`avg\` — average duration
- \`max\` — worst case

---

## QUERY_METRICS — Infrastructure and app metrics

Best for: CPU, memory, request rates, custom business metrics.

**Important**: Always specify \`metricDataType\`:
- \`Gauge\` — point-in-time values (CPU%, memory bytes, queue depth)
- \`Sum\` — cumulative counters (use \`*_rate\` aggFn variants for per-second rates)
- \`Histogram\` — distributions (use \`p50\`/\`p95\`/\`p99\` aggFns)

CPU usage example:
\`\`\`json
{
  "metricName": "system.cpu.utilization",
  "metricDataType": "Gauge",
  "aggFn": "avg",
  "groupBy": ["host"]
}
\`\`\`

HTTP request rate (Sum counter → use sum_rate):
\`\`\`json
{
  "metricName": "http.server.request.count",
  "metricDataType": "Sum",
  "aggFn": "sum_rate",
  "where": "service:api"
}
\`\`\`

---

## GET_SERVICE_HEALTH — Incident triage

Best for: "Is the payment service healthy right now?"

\`\`\`json
{
  "service": "payment",
  "granularity": "1 minute",
  "startTime": 1700000000000,
  "endTime": 1700003600000
}
\`\`\`

Returns 3 parallel series in each data point:
- \`series_0.data\` = error count
- \`series_1.data\` = total request count
- \`series_2.data\` = p95 latency in ms

---

## COMPARE_TIME_RANGES — Regression detection

Best for: "Did error rate increase after today's deploy?"

\`\`\`json
{
  "query": "level:error service:api",
  "aggFn": "count",
  "currentStart": 1700003600000,
  "currentEnd": 1700007200000,
  "priorStart": 1699996400000,
  "priorEnd": 1700000000000
}
\`\`\`

Returns ratio = current / prior. Ratio > 1 means current period has more errors.

---

## CREATE_DASHBOARD — Build monitoring dashboards

Grid layout: typically 12 units wide. Common chart sizes: 6×3 (half-width), 12×3 (full-width), 4×3 (third-width).

\`\`\`json
{
  "name": "API Health",
  "query": "env:production",
  "charts": [
    {
      "name": "Error Rate",
      "x": 0, "y": 0, "w": 6, "h": 3,
      "series": [{
        "dataSource": "events",
        "aggFn": "count",
        "where": "level:error",
        "groupBy": ["service"]
      }]
    },
    {
      "name": "P95 Latency",
      "x": 6, "y": 0, "w": 6, "h": 3,
      "series": [{
        "dataSource": "events",
        "aggFn": "p95",
        "field": "duration",
        "where": "",
        "groupBy": ["service"]
      }]
    }
  ]
}
\`\`\`

---

## CREATE_ALERT — Set up notifications

Alert on error spike (search-based):
\`\`\`json
{
  "interval": "5m",
  "threshold": 100,
  "threshold_type": "above",
  "source": "search",
  "savedSearchId": "your-saved-search-id",
  "channel": { "type": "slack", "channelId": "C1234567" },
  "name": "API Error Spike"
}
\`\`\`

Alert on chart metric (chart-based):
\`\`\`json
{
  "interval": "1m",
  "threshold": 2000,
  "threshold_type": "above",
  "source": "chart",
  "dashboardId": "dash-id",
  "chartId": "chart-id",
  "channel": { "type": "pagerduty", "severity": "critical" },
  "name": "P95 Latency Critical"
}
\`\`\`
`,
        },
      },
    ],
  }),
});

// ============================================================================
// HYPERDX_FIELD_REFERENCE
// ============================================================================

export const fieldReferencePrompt = createPrompt({
  name: "HYPERDX_FIELD_REFERENCE",
  title: "HyperDX Field Reference",
  description:
    "Reference of common field names available in HyperDX logs, spans, and metrics for use in search queries and groupBy.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "What fields are available in HyperDX?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# HyperDX Field Reference

Fields can be used in:
- \`where\` / search queries: \`field:value\`
- \`groupBy\` arrays: \`["field1", "field2"]\`
- \`field\` parameter (for numeric aggregations like avg, p95)

---

## Core Event Fields (logs & spans)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`body\` | string | Log message / span name | \`"payment failed"\` |
| \`level\` | string | Severity level | \`error\`, \`warn\`, \`info\`, \`debug\` |
| \`service\` | string | Service name | \`api\`, \`checkout\`, \`web\` |
| \`env\` | string | Environment | \`production\`, \`staging\`, \`dev\` |
| \`host\` | string | Hostname | \`web-01.prod\` |
| \`timestamp\` | number | Event time (ms) | \`1700000000000\` |
| \`trace_id\` | string | Distributed trace ID | \`abc123def456\` |
| \`span_id\` | string | Individual span ID | \`xyz789\` |
| \`parent_span_id\` | string | Parent span ID | \`pqr456\` |

---

## Span-specific Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`duration\` | number (ms) | Span duration in milliseconds | \`250\` |
| \`span_name\` | string | Operation name | \`"POST /api/orders"\` |
| \`status_code\` | string | OpenTelemetry status | \`"OK"\`, \`"ERROR"\` |
| \`http.method\` | string | HTTP method | \`GET\`, \`POST\` |
| \`http.route\` | string | HTTP route template | \`"/users/:id"\` |
| \`http.url\` | string | Full request URL | |
| \`http.status_code\` | number | HTTP response code | \`200\`, \`500\` |
| \`http.target\` | string | HTTP request path | \`"/api/users"\` |
| \`db.system\` | string | Database type | \`postgresql\`, \`redis\`, \`mongodb\` |
| \`db.statement\` | string | SQL query | \`"SELECT * FROM users"\` |
| \`db.name\` | string | Database name | \`"myapp_production"\` |
| \`rpc.service\` | string | gRPC service name | |
| \`rpc.method\` | string | gRPC method name | |

---

## Kubernetes / Infrastructure Fields

| Field | Type | Description |
|-------|------|-------------|
| \`k8s.namespace\` | string | K8s namespace |
| \`k8s.pod.name\` | string | Pod name |
| \`k8s.node.name\` | string | Node name |
| \`k8s.deployment.name\` | string | Deployment name |
| \`k8s.container.name\` | string | Container name |
| \`cloud.provider\` | string | \`aws\`, \`gcp\`, \`azure\` |
| \`cloud.region\` | string | Cloud region |

---

## Common Custom / Application Fields

These vary by application but are frequently used:

| Field | Description |
|-------|-------------|
| \`userEmail\` | User email address |
| \`userId\` | User identifier |
| \`requestId\` | Request correlation ID |
| \`version\` | Application version |
| \`site\` | Site or tenant identifier |
| \`error.type\` | Exception class name |
| \`error.message\` | Exception message |
| \`error.stack\` | Stack trace |

---

## Metrics Field Conventions (OpenTelemetry)

Common metric names by category:

### System Metrics
\`\`\`
system.cpu.utilization          (Gauge)
system.memory.utilization       (Gauge)
system.memory.usage             (Gauge, bytes)
system.disk.io                  (Sum)
system.network.io               (Sum)
\`\`\`

### HTTP Server Metrics
\`\`\`
http.server.request.duration    (Histogram, ms)
http.server.request.count       (Sum)
http.server.active_requests     (Gauge)
\`\`\`

### JVM Metrics
\`\`\`
process.runtime.jvm.memory.usage        (Gauge)
process.runtime.jvm.gc.duration        (Histogram)
process.runtime.jvm.threads.count      (Gauge)
\`\`\`

### Database Metrics
\`\`\`
db.client.connections.usage     (Gauge)
db.client.connections.count     (Sum)
\`\`\`

---

## Tips for groupBy

- Use \`groupBy: []\` for a single aggregated series (no breakdown)
- Use \`groupBy: ["service"]\` to break down by service
- Use \`groupBy: ["service", "env"]\` for multi-dimensional breakdown
- Consistent groupBy across all series in multi-series queries
- \`groupBy\` values appear in the response as the \`group\` array

---

## Tips for where queries

- Leave \`where: ""\` to query all events
- Combine multiple filters: \`level:error service:api env:production\`
- Use \`-field:value\` to exclude: \`level:error -service:healthcheck\`
- Use \`property:*\` to filter to events that have a field: \`trace_id:*\`
`,
        },
      },
    ],
  }),
});

export const prompts = [
  searchSyntaxPrompt,
  queryGuidePrompt,
  fieldReferencePrompt,
];
