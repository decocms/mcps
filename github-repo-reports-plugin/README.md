# GitHub Repo Reports Plugin for Claude Code

A [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) that adds a `/generate-report` slash command for creating structured Markdown reports with YAML frontmatter.

Reports follow a standardized format designed for repository health monitoring — performance audits, security scans, uptime checks, code quality, and more.

## Installation

### From a plugin marketplace

If the marketplace that includes this plugin is already configured, run inside Claude Code:

```
/plugin install github-repo-reports
```

### Local testing

Clone the repo and point Claude Code at the plugin directory:

```bash
claude --plugin-dir /path/to/github-repo-reports-plugin
```

## Usage

Once installed, you get the `/github-repo-reports:generate-report` slash command:

```
/github-repo-reports:generate-report security audit of npm dependencies
/github-repo-reports:generate-report performance lighthouse for homepage
/github-repo-reports:generate-report quality test coverage summary
```

Claude will analyze the relevant code/data in your repository and produce a `.md` report with:

- **YAML frontmatter** — title, category, status, summary, timestamps, structured sections (metrics, tables)
- **Markdown body** — detailed findings, recommendations, action items

The skill also activates automatically when Claude detects you want to create a report, health check, or audit.

## Report format

Reports are `.md` files with YAML frontmatter:

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
  - type: table
    title: "High Severity Issues"
    columns: [Package, CVE, Severity, Installed, Patched]
    rows:
      - [lodash, CVE-2024-1234, High, 4.17.20, 4.17.21]
---

## Action Required

Run `npm audit fix` to apply automatic patches.
```

### Supported section types

| Type | Description |
|---|---|
| `metrics` | Key-value indicators with optional status, units, and deltas |
| `table` | Tabular data with column headers |
| `markdown` | Free-form GFM content |

### Status values

| Status | When to use |
|---|---|
| `passing` | Everything within acceptable thresholds |
| `warning` | Metrics degraded or approaching thresholds |
| `failing` | Critical issues needing immediate attention |
| `info` | Informational, no pass/fail judgment |

### Categories

`performance` · `security` · `accessibility` · `seo` · `quality` · `uptime` · `compliance` (or define your own)

## Plugin structure

```
github-repo-reports-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── generate-report/
│       ├── SKILL.md          # Slash command instructions
│       └── examples.md       # Complete report examples
└── README.md
```

## License

MIT
