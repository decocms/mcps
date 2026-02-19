# Report Format

You are writing a report as a Markdown file with YAML frontmatter. Follow these instructions exactly.

---

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

---

## Frontmatter fields

| Field | Required | Type | Description |
|---|---|---|---|
| `title` | **Yes** | `string` | Human-readable report title. |
| `category` | **Yes** | `string` | Category for filtering (e.g., `performance`, `security`, `quality`). See category list below. |
| `status` | **Yes** | `"passing" \| "warning" \| "failing" \| "info"` | Overall health outcome. See status reference below. |
| `summary` | **Yes** | `string` | One-line summary of findings. Keep it concise -- this is shown in list views. |
| `updatedAt` | **Yes** | `string` | ISO 8601 timestamp of when the report was generated (`YYYY-MM-DDTHH:mm:ssZ`). |
| `source` | Optional | `string` | Name of the agent or service that generated this report (e.g., `lighthouse`, `security-scanner`). |
| `tags` | Optional | `string[]` | Free-form tags for filtering (e.g., `[homepage, mobile, ci]`). |
| `sections` | Optional | `ReportSection[]` | Structured content sections (metrics, tables). See section types below. |

Always provide `title`, `category`, `status`, `summary`, and `updatedAt`. Do not leave them empty or omit them.

---

## File placement and tagging

Place report files inside a reports directory. Subdirectories automatically become tags on the report.

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

---

## Section types

Sections appear in the order listed in frontmatter. The markdown body (if present) is appended as a final section after all frontmatter sections.

Put the most important information first.

### Markdown section

Free-form text rendered as GitHub Flavored Markdown.

```yaml
sections:
  - type: markdown
    content: |
      ## Analysis

      The homepage load time has improved by **15%** since last week.
      See the metrics below for details.
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
      - label: CLS
        value: 0.05
        status: passing
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
      - [axios, Low, 0.21.1, 0.21.2]
```

### Criteria section

A list of criteria/rules applied to the report.

```yaml
sections:
  - type: criteria
    title: "Critérios"
    items:
      - label: "Grade de Tamanhos"
        description: "Priorizar produtos com grade completa e disponível nos tamanhos de maior giro."
      - label: "Estampa Grouping"
        description: "Agrupar produtos por estampa para melhorar a experiência de navegação."
      - label: "Disponibilidade de Estoque"
        description: "Remover produtos sem estoque nas grades principais."
```

Each criterion item:

| Field | Required | Type | Description |
|---|---|---|---|
| `label` | **Yes** | `string` | Short name of the criterion. |
| `description` | Optional | `string` | Longer explanation of the criterion. |

### Note section

A short free-form annotation, typically used to explain decisions or observations.

```yaml
sections:
  - type: note
    content: "We changed the algorithm to consider grade more heavily this run. Also testing estampa grouping for the first time."
```

| Field | Required | Type | Description |
|---|---|---|---|
| `content` | **Yes** | `string` | The note text. |

### Ranked list section

An ordered list of items with position, delta movement, image, and a set of attribute values matching the defined columns. Useful for product rankings, leaderboards, etc.

```yaml
sections:
  - type: ranked-list
    title: "Ordenação"
    columns: [Produto, Sales, Grade]
    rows:
      - position: 1
        delta: 2
        label: "Blusa Tuie Estampada Paisagem Solar"
        image: "https://cdn.example.com/blusa-tuie.jpg"
        values: ["R$8.440", "100%"]
        note: "We changed the algorithm to consider grade more heavily this run."
      - position: 2
        delta: -1
        label: "Blusa Listex Peplum"
        image: "https://cdn.example.com/blusa-listex.jpg"
        values: ["R$6.010", "70%"]
      - position: 3
        delta: -2
        label: "Vestido T-Shirt Big Estampado Paisagem Solar"
        image: "https://cdn.example.com/vestido.jpg"
        values: ["R$6.010", "80%"]
```

Each row:

| Field | Required | Type | Description |
|---|---|---|---|
| `position` | **Yes** | `number` | Current rank position. |
| `delta` | **Yes** | `number` | Change in position (positive = moved up, negative = moved down, 0 = unchanged). |
| `label` | **Yes** | `string` | Item name or title. |
| `image` | **Yes** | `string` | URL of the item image. |
| `values` | **Yes** | `(string \| number)[]` | Values for each column defined in `columns`, in the same order. |
| `note` | Optional | `string` | Inline annotation for this specific item. |

---

## Status reference

| Status | When to use |
|---|---|
| `passing` | Everything is within acceptable thresholds. |
| `warning` | Some metrics are degraded or approaching thresholds. |
| `failing` | Critical issues that need immediate attention. |
| `info` | Informational report with no pass/fail judgment. |

## Category conventions

Use these common categories or define your own:

| Category | Use case |
|---|---|
| `performance` | Web vitals, bundle size, load times. |
| `security` | Vulnerability scans, dependency audits. |
| `accessibility` | WCAG compliance, axe-core results. |
| `seo` | Meta tags, structured data, crawlability. |
| `quality` | Code quality, test coverage, lint results. |
| `uptime` | Health checks, availability monitoring. |
| `compliance` | License audits, policy checks. |

---

## Complete examples

### Simple report (metadata + markdown body only)

```markdown
---
title: "Daily Health Check"
category: uptime
status: passing
summary: "All 12 endpoints responding within SLA"
source: health-monitor
updatedAt: "2025-06-15T08:00:00Z"
---

## Details

All endpoints checked at 08:00 UTC. Average response time: 145ms.
No errors detected in the last 24 hours.
```

### Report with metrics and tables

```markdown
---
title: "Homepage Performance Audit"
category: performance
status: warning
summary: "LCP exceeds 2.5s threshold on mobile"
source: lighthouse
tags: [homepage, mobile]
updatedAt: "2025-06-15T10:30:00Z"
sections:
  - type: metrics
    title: "Core Web Vitals"
    items:
      - label: LCP
        value: 3.2
        unit: s
        previousValue: 2.8
        status: failing
      - label: FID
        value: 45
        unit: ms
        previousValue: 50
        status: passing
      - label: CLS
        value: 0.08
        previousValue: 0.12
        status: passing
  - type: metrics
    title: "Performance Score"
    items:
      - label: Overall
        value: 72
        unit: score
        previousValue: 78
        status: warning
  - type: table
    title: "Largest Resources"
    columns: [Resource, Type, Size, Load Time]
    rows:
      - [hero-image.webp, Image, 450KB, 1.8s]
      - [main.js, Script, 320KB, 1.2s]
      - [vendor.js, Script, 280KB, 0.9s]
      - [fonts.woff2, Font, 85KB, 0.3s]
---

## Recommendations

1. **Optimize hero image** — compress or use a smaller viewport-specific version.
2. **Code-split main.js** — defer non-critical modules to reduce initial parse time.
3. **Preload fonts** — add `<link rel="preload">` to eliminate the font swap delay.
```

### Security scan report

```markdown
---
title: "Dependency Vulnerability Scan"
category: security
status: failing
summary: "3 high-severity vulnerabilities found"
source: security-auditor
tags: [dependencies, npm]
updatedAt: "2025-06-15T06:00:00Z"
sections:
  - type: metrics
    title: "Vulnerability Summary"
    items:
      - label: Critical
        value: 0
        status: passing
      - label: High
        value: 3
        status: failing
      - label: Medium
        value: 7
        status: warning
      - label: Low
        value: 12
        status: info
  - type: table
    title: "High Severity Issues"
    columns: [Package, CVE, Severity, Installed, Patched]
    rows:
      - [lodash, CVE-2024-1234, High, 4.17.20, 4.17.21]
      - [express, CVE-2024-5678, High, 4.17.1, 4.18.2]
      - [jsonwebtoken, CVE-2024-9012, High, 8.5.1, 9.0.0]
---

## Action Required

Run `npm audit fix` to apply automatic patches. The `jsonwebtoken` upgrade
is a major version bump — review the migration guide before upgrading.
```

---

## Git workflow

Reports are stored on a dedicated git branch (typically `reports`).

### Committing a report

```bash
# Switch to the reports branch
git checkout reports

# Create the report file in the appropriate directory
# (use subdirectories for tags)
mkdir -p reports/security
# ... write the file ...

# Commit and push
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

### CI pipeline pattern

```bash
git config user.name "report-bot"
git config user.email "reports@example.com"

git fetch origin reports
git checkout reports

mkdir -p reports/performance
# ... write the report file ...

git add reports/
git commit -m "report(performance): lighthouse CI results"
git push origin reports
```
