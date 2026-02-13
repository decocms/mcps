# Report Examples

## Simple report (metadata + markdown body only)

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

## Report with metrics and tables

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

## Security scan report

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
