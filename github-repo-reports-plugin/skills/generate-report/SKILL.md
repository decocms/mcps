---
name: generate-report
description: Generate a structured Markdown report with YAML frontmatter for repository health monitoring. Use when the user asks to create a report, health check, audit, scan result, or status update for a repository.
argument-hint: "[topic or category] e.g. 'security audit' or 'performance lighthouse'"
---

# Generate Report

You are writing a report as a Markdown file with YAML frontmatter. Follow these instructions exactly.

## File format

Every report is a `.md` file. Metadata goes in YAML frontmatter delimited by `---`. Any markdown content below the frontmatter becomes the report body.

```markdown
---
title: "Report Title"
category: performance
status: warning
summary: "One-line summary of findings"
source: your-agent-name
tags: [extra-tag-1, extra-tag-2]
updatedAt: "2025-06-15T10:00:00Z"
sections:
  - type: metrics
    title: "Section Title"
    items:
      - label: "Metric Name"
        value: 42
        unit: "ms"
        status: passing
---

## Markdown body

Any content below the closing `---` is rendered as a markdown section
after the structured sections declared in frontmatter.
```

## Frontmatter fields

| Field | Required | Type | Description |
|---|---|---|---|
| `title` | **Yes** | `string` | Human-readable report title. |
| `category` | **Yes** | `string` | Category for filtering (e.g., `performance`, `security`, `quality`). See category list below. |
| `status` | **Yes** | `"passing" \| "warning" \| "failing" \| "info"` | Overall health outcome. |
| `summary` | **Yes** | `string` | One-line summary of findings. Keep it concise — this is shown in list views. |
| `updatedAt` | **Yes** | `string` | ISO 8601 timestamp of when the report was generated (`YYYY-MM-DDTHH:mm:ssZ`). |
| `source` | Optional | `string` | Name of the agent or service that generated this report (e.g., `lighthouse`, `security-scanner`). |
| `tags` | Optional | `string[]` | Free-form tags for filtering (e.g., `[homepage, mobile, ci]`). |
| `sections` | Optional | `ReportSection[]` | Structured content sections (metrics, tables, markdown). See section types below. |

Always provide `title`, `category`, `status`, `summary`, and `updatedAt`. Do not leave them empty or omit them.

## File placement and tagging

Place report files inside a `reports/` directory. Subdirectories automatically become tags on the report.

```
reports/
  daily-check.md                        # no directory tags
  security/
    audit.md                            # tagged: ["security"]
    dependency-scan.md                  # tagged: ["security"]
  performance/
    mobile/
      lighthouse.md                     # tagged: ["performance", "mobile"]
```

Directory-derived tags are merged with any `tags` declared in frontmatter, deduplicated.

Choose a filename that is a short, descriptive, kebab-case slug (e.g., `dependency-scan.md`, `homepage-vitals.md`).

## Section types

Sections appear in the order listed in frontmatter. The markdown body (if present) is appended as a final section after all frontmatter sections. Put the most important information first.

### Markdown section

Free-form text rendered as GitHub Flavored Markdown.

```yaml
sections:
  - type: markdown
    content: |
      ## Analysis

      The homepage load time has improved by **15%** since last week.
```

### Metrics section

Key performance indicators with optional deltas and per-metric status.

```yaml
sections:
  - type: metrics
    title: "Core Web Vitals"
    items:
      - label: LCP
        value: 2.5
        unit: s
        previousValue: 3.1
        status: passing
      - label: FID
        value: 300
        unit: ms
        previousValue: 150
        status: failing
```

Each metric item:

| Field | Required | Type | Description |
|---|---|---|---|
| `label` | **Yes** | `string` | Metric name (e.g., "LCP", "Coverage"). |
| `value` | **Yes** | `number \| string` | Current value. |
| `unit` | Optional | `string` | Unit of measurement (e.g., "s", "ms", "%", "score"). |
| `previousValue` | Optional | `number \| string` | Previous value for delta comparison. |
| `status` | Optional | `"passing" \| "warning" \| "failing" \| "info"` | Status of this individual metric. |

### Table section

Tabular data with column headers.

```yaml
sections:
  - type: table
    title: "Dependency Vulnerabilities"
    columns: [Package, Severity, Version, Fixed In]
    rows:
      - [lodash, High, 4.17.20, 4.17.21]
      - [express, Medium, 4.17.1, 4.18.0]
```

## Status reference

| Status | When to use |
|---|---|
| `passing` | Everything is within acceptable thresholds. |
| `warning` | Some metrics are degraded or approaching thresholds. |
| `failing` | Critical issues that need immediate attention. |
| `info` | Informational report with no pass/fail judgment. |

## Category conventions

| Category | Use case |
|---|---|
| `performance` | Web vitals, bundle size, load times. |
| `security` | Vulnerability scans, dependency audits. |
| `accessibility` | WCAG compliance, axe-core results. |
| `seo` | Meta tags, structured data, crawlability. |
| `quality` | Code quality, test coverage, lint results. |
| `uptime` | Health checks, availability monitoring. |
| `compliance` | License audits, policy checks. |

## Git workflow

Reports are stored on a dedicated git branch (typically `reports`).

### Committing a report

```bash
git checkout reports
mkdir -p reports/security
# ... write the file ...
git add reports/
git commit -m "report(security): add dependency vulnerability scan"
git push origin reports
```

### Creating the branch for the first time

```bash
git checkout --orphan reports
git rm -rf .
mkdir reports
# ... create your first report file ...
git add reports/
git commit -m "report: initialize reports branch"
git push -u origin reports
```

## Additional resources

- For complete examples of different report types, see [examples.md](examples.md)

## Your task

Based on the user's request (`$ARGUMENTS`), generate a complete report file following the format above. Analyze the relevant code, data, or context in the repository before writing the report. Make sure the report contains real, accurate data — not placeholder values.
