/**
 * Tests for Report Parser
 *
 * Run with: bun test
 */

import { describe, expect, test } from "bun:test";
import {
  deriveReportId,
  deriveTagsFromPath,
  parseLifecycleStatuses,
  parseReport,
  parseReportSummary,
} from "../report-parser.ts";

// ---------------------------------------------------------------------------
// deriveReportId
// ---------------------------------------------------------------------------

describe("deriveReportId", () => {
  test("strips reports path prefix and .md extension", () => {
    expect(deriveReportId("reports/check.md", "reports")).toBe("check");
  });

  test("handles nested paths", () => {
    expect(deriveReportId("reports/farm/thing.md", "reports")).toBe(
      "farm/thing",
    );
  });

  test("handles deeply nested paths", () => {
    expect(deriveReportId("reports/security/api/audit.md", "reports")).toBe(
      "security/api/audit",
    );
  });

  test("handles trailing slash in reports path", () => {
    expect(deriveReportId("reports/check.md", "reports/")).toBe("check");
  });

  test("handles custom reports path", () => {
    expect(deriveReportId("docs/my-reports/check.md", "docs/my-reports")).toBe(
      "check",
    );
  });

  test("handles file without .md extension gracefully", () => {
    expect(deriveReportId("reports/readme.txt", "reports")).toBe("readme.txt");
  });
});

// ---------------------------------------------------------------------------
// deriveTagsFromPath
// ---------------------------------------------------------------------------

describe("deriveTagsFromPath", () => {
  test("returns empty array for top-level report", () => {
    expect(deriveTagsFromPath("check")).toEqual([]);
  });

  test("returns single tag for one-level nesting", () => {
    expect(deriveTagsFromPath("farm/thing")).toEqual(["farm"]);
  });

  test("returns multiple tags for deep nesting", () => {
    expect(deriveTagsFromPath("security/api/audit")).toEqual([
      "security",
      "api",
    ]);
  });

  test("returns three tags for very deep nesting", () => {
    expect(deriveTagsFromPath("a/b/c/report")).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// parseReportSummary
// ---------------------------------------------------------------------------

describe("parseReportSummary", () => {
  const emptyStatuses = {};

  test("parses full frontmatter correctly", () => {
    const raw = `---
title: "Performance Report"
category: performance
status: warning
summary: "3 of 5 metrics below threshold"
source: lighthouse
tags: [homepage, mobile]
updatedAt: "2025-06-15T10:00:00Z"
---

Some body content.
`;

    const result = parseReportSummary(
      raw,
      "reports/check.md",
      "reports",
      emptyStatuses,
    );

    expect(result.id).toBe("check");
    expect(result.title).toBe("Performance Report");
    expect(result.category).toBe("performance");
    expect(result.status).toBe("warning");
    expect(result.summary).toBe("3 of 5 metrics below threshold");
    expect(result.source).toBe("lighthouse");
    expect(result.tags).toEqual(["homepage", "mobile"]);
    expect(result.updatedAt).toBe("2025-06-15T10:00:00Z");
    expect(result.lifecycleStatus).toBeUndefined();
  });

  test("derives title from filename when not in frontmatter", () => {
    const raw = `---
category: quality
status: passing
summary: "All good"
---
`;

    const result = parseReportSummary(
      raw,
      "reports/daily-check.md",
      "reports",
      emptyStatuses,
    );

    expect(result.title).toBe("Daily Check");
  });

  test("derives title from filename with underscores", () => {
    const raw = `---
status: info
summary: "Info report"
---
`;

    const result = parseReportSummary(
      raw,
      "reports/my_report_2024.md",
      "reports",
      emptyStatuses,
    );

    expect(result.title).toBe("My Report 2024");
  });

  test("defaults category to 'general' when not specified", () => {
    const raw = `---
title: Test
status: info
summary: test
---
`;

    const result = parseReportSummary(
      raw,
      "reports/test.md",
      "reports",
      emptyStatuses,
    );

    expect(result.category).toBe("general");
  });

  test("defaults status to 'info' for invalid status", () => {
    const raw = `---
title: Test
status: invalid-status
summary: test
---
`;

    const result = parseReportSummary(
      raw,
      "reports/test.md",
      "reports",
      emptyStatuses,
    );

    expect(result.status).toBe("info");
  });

  test("defaults status to 'info' when missing", () => {
    const raw = `---
title: Test
summary: test
---
`;

    const result = parseReportSummary(
      raw,
      "reports/test.md",
      "reports",
      emptyStatuses,
    );

    expect(result.status).toBe("info");
  });

  test("accepts all valid status values", () => {
    for (const status of ["passing", "warning", "failing", "info"]) {
      const raw = `---
title: Test
status: ${status}
summary: test
---
`;
      const result = parseReportSummary(
        raw,
        "reports/test.md",
        "reports",
        emptyStatuses,
      );
      expect(result.status).toBe(status);
    }
  });

  test("merges directory tags with frontmatter tags (deduped)", () => {
    const raw = `---
title: Audit
tags: [critical, security]
status: failing
summary: Issues found
---
`;

    const result = parseReportSummary(
      raw,
      "reports/security/audit.md",
      "reports",
      emptyStatuses,
    );

    // directory tag "security" comes first, then frontmatter tags; "security" is deduped
    expect(result.tags).toEqual(["security", "critical"]);
  });

  test("directory-only tags when no frontmatter tags", () => {
    const raw = `---
title: Thing
status: info
summary: test
---
`;

    const result = parseReportSummary(
      raw,
      "reports/farm/thing.md",
      "reports",
      emptyStatuses,
    );

    expect(result.tags).toEqual(["farm"]);
  });

  test("no tags property when top-level and no frontmatter tags", () => {
    const raw = `---
title: Root Report
status: info
summary: test
---
`;

    const result = parseReportSummary(
      raw,
      "reports/root-report.md",
      "reports",
      emptyStatuses,
    );

    expect(result.tags).toBeUndefined();
  });

  test("applies lifecycle status from map", () => {
    const raw = `---
title: Test
status: info
summary: test
---
`;

    const statuses = { test: "read" as const };

    const result = parseReportSummary(
      raw,
      "reports/test.md",
      "reports",
      statuses,
    );

    expect(result.lifecycleStatus).toBe("read");
  });

  test("applies lifecycle status for nested report", () => {
    const raw = `---
title: Audit
status: failing
summary: Issues
---
`;

    const statuses = { "security/audit": "dismissed" as const };

    const result = parseReportSummary(
      raw,
      "reports/security/audit.md",
      "reports",
      statuses,
    );

    expect(result.lifecycleStatus).toBe("dismissed");
  });

  test("no lifecycleStatus when not in map", () => {
    const raw = `---
title: Test
status: info
summary: test
---
`;

    const result = parseReportSummary(raw, "reports/test.md", "reports", {
      other: "read",
    });

    expect(result.lifecycleStatus).toBeUndefined();
  });

  test("handles file with no frontmatter", () => {
    const raw = "# Just a markdown file\n\nNo frontmatter here.";

    const result = parseReportSummary(
      raw,
      "reports/plain.md",
      "reports",
      emptyStatuses,
    );

    expect(result.id).toBe("plain");
    expect(result.title).toBe("Plain");
    expect(result.category).toBe("general");
    expect(result.status).toBe("info");
    expect(result.summary).toBe("");
  });

  test("handles empty file", () => {
    const result = parseReportSummary(
      "",
      "reports/empty.md",
      "reports",
      emptyStatuses,
    );

    expect(result.id).toBe("empty");
    expect(result.title).toBe("Empty");
    expect(result.status).toBe("info");
  });

  test("handles frontmatter with no closing delimiter", () => {
    const raw = `---
title: Broken
status: info
This never closes
`;

    const result = parseReportSummary(
      raw,
      "reports/broken.md",
      "reports",
      emptyStatuses,
    );

    // Should treat as no frontmatter
    expect(result.id).toBe("broken");
    expect(result.title).toBe("Broken");
    expect(result.status).toBe("info");
  });

  test("source is omitted when not in frontmatter", () => {
    const raw = `---
title: Test
status: info
summary: test
---
`;

    const result = parseReportSummary(
      raw,
      "reports/test.md",
      "reports",
      emptyStatuses,
    );

    expect(result.source).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseReport (full report with sections)
// ---------------------------------------------------------------------------

describe("parseReport", () => {
  const emptyStatuses = {};

  test("parses markdown body as a section", () => {
    const raw = `---
title: Simple Report
category: quality
status: passing
summary: All good
---

## Overview

Everything looks great today.
`;

    const report = parseReport(
      raw,
      "reports/simple.md",
      "reports",
      emptyStatuses,
    );

    expect(report.id).toBe("simple");
    expect(report.title).toBe("Simple Report");
    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].type).toBe("markdown");
    expect(
      (report.sections[0] as { type: "markdown"; content: string }).content,
    ).toContain("Everything looks great today.");
  });

  test("parses metrics sections from frontmatter", () => {
    const raw = `---
title: Metrics Report
status: warning
summary: Some metrics failing
sections:
  - type: metrics
    title: Core Web Vitals
    items:
      - label: LCP
        value: 2.5
        unit: s
        status: passing
      - label: FID
        value: 300
        unit: ms
        status: failing
---
`;

    const report = parseReport(
      raw,
      "reports/metrics.md",
      "reports",
      emptyStatuses,
    );

    expect(report.sections).toHaveLength(1);

    const section = report.sections[0];
    expect(section.type).toBe("metrics");
    if (section.type === "metrics") {
      expect(section.title).toBe("Core Web Vitals");
      expect(section.items).toHaveLength(2);
      expect(section.items[0].label).toBe("LCP");
      expect(section.items[0].value).toBe(2.5);
      expect(section.items[0].unit).toBe("s");
      expect(section.items[0].status).toBe("passing");
      expect(section.items[1].label).toBe("FID");
      expect(section.items[1].value).toBe(300);
    }
  });

  test("parses table sections from frontmatter", () => {
    const raw = `---
title: Table Report
status: info
summary: Resource breakdown
sections:
  - type: table
    title: Resources
    columns: [Resource, Size, Time]
    rows:
      - [main.js, 150KB, 1.2s]
      - [styles.css, 30KB, 0.3s]
---
`;

    const report = parseReport(
      raw,
      "reports/table.md",
      "reports",
      emptyStatuses,
    );

    expect(report.sections).toHaveLength(1);

    const section = report.sections[0];
    expect(section.type).toBe("table");
    if (section.type === "table") {
      expect(section.title).toBe("Resources");
      expect(section.columns).toEqual(["Resource", "Size", "Time"]);
      expect(section.rows).toHaveLength(2);
      expect(section.rows[0]).toEqual(["main.js", "150KB", "1.2s"]);
    }
  });

  test("combines frontmatter sections with markdown body", () => {
    const raw = `---
title: Combined Report
status: warning
summary: Mixed content
sections:
  - type: metrics
    title: KPIs
    items:
      - label: Score
        value: 85
        unit: "%"
        status: passing
  - type: table
    title: Issues
    columns: [Issue, Severity]
    rows:
      - [Slow API, High]
---

## Detailed Analysis

Here is a longer explanation of the findings.
`;

    const report = parseReport(
      raw,
      "reports/combined.md",
      "reports",
      emptyStatuses,
    );

    expect(report.sections).toHaveLength(3);
    expect(report.sections[0].type).toBe("metrics");
    expect(report.sections[1].type).toBe("table");
    expect(report.sections[2].type).toBe("markdown");
    expect(
      (report.sections[2] as { type: "markdown"; content: string }).content,
    ).toContain("Detailed Analysis");
  });

  test("filters out invalid sections", () => {
    const raw = `---
title: Bad Sections
status: info
summary: test
sections:
  - type: unknown
    data: something
  - type: markdown
    content: "Valid markdown"
  - type: metrics
  - type: table
    columns: [A]
    rows: [[1]]
---
`;

    const report = parseReport(raw, "reports/bad.md", "reports", emptyStatuses);

    // "unknown" type → invalid, "metrics" without items → invalid
    // "markdown" with content → valid, "table" with columns+rows → valid
    expect(report.sections).toHaveLength(2);
    expect(report.sections[0].type).toBe("markdown");
    expect(report.sections[1].type).toBe("table");
  });

  test("returns empty sections for file with no body and no frontmatter sections", () => {
    const raw = `---
title: Metadata Only
status: passing
summary: No content
---
`;

    const report = parseReport(
      raw,
      "reports/metadata-only.md",
      "reports",
      emptyStatuses,
    );

    expect(report.sections).toEqual([]);
  });

  test("preserves report summary fields in full report", () => {
    const raw = `---
title: Full Report
category: security
status: failing
summary: Critical vulnerabilities found
source: security-scanner
tags: [critical]
updatedAt: "2025-06-15T10:00:00Z"
---

Details here.
`;

    const report = parseReport(raw, "reports/security/full.md", "reports", {
      "security/full": "read",
    });

    expect(report.id).toBe("security/full");
    expect(report.title).toBe("Full Report");
    expect(report.category).toBe("security");
    expect(report.status).toBe("failing");
    expect(report.summary).toBe("Critical vulnerabilities found");
    expect(report.source).toBe("security-scanner");
    expect(report.tags).toEqual(["security", "critical"]);
    expect(report.updatedAt).toBe("2025-06-15T10:00:00Z");
    expect(report.lifecycleStatus).toBe("read");
    expect(report.sections).toHaveLength(1);
  });

  test("handles file with no frontmatter (entire content as markdown section)", () => {
    const raw = "# Just Markdown\n\nNo frontmatter at all.";

    const report = parseReport(
      raw,
      "reports/plain.md",
      "reports",
      emptyStatuses,
    );

    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].type).toBe("markdown");
    expect(
      (report.sections[0] as { type: "markdown"; content: string }).content,
    ).toBe("# Just Markdown\n\nNo frontmatter at all.");
  });
});

// ---------------------------------------------------------------------------
// parseLifecycleStatuses
// ---------------------------------------------------------------------------

describe("parseLifecycleStatuses", () => {
  test("parses valid JSON map", () => {
    const raw = JSON.stringify({
      "farm/thing": "read",
      "security/audit": "dismissed",
      check: "unread",
    });

    const result = parseLifecycleStatuses(raw);

    expect(result["farm/thing"]).toBe("read");
    expect(result["security/audit"]).toBe("dismissed");
    expect(result.check).toBe("unread");
  });

  test("ignores invalid status values", () => {
    const raw = JSON.stringify({
      valid: "read",
      invalid: "bogus",
      also_invalid: 123,
      another: "dismissed",
    });

    const result = parseLifecycleStatuses(raw);

    expect(result.valid).toBe("read");
    expect(result.another).toBe("dismissed");
    expect(result.invalid).toBeUndefined();
    expect(result.also_invalid).toBeUndefined();
  });

  test("returns empty map for invalid JSON", () => {
    expect(parseLifecycleStatuses("not json")).toEqual({});
  });

  test("returns empty map for JSON array", () => {
    expect(parseLifecycleStatuses("[1,2,3]")).toEqual({});
  });

  test("returns empty map for JSON string", () => {
    expect(parseLifecycleStatuses('"hello"')).toEqual({});
  });

  test("returns empty map for null JSON", () => {
    expect(parseLifecycleStatuses("null")).toEqual({});
  });

  test("returns empty map for empty string", () => {
    expect(parseLifecycleStatuses("")).toEqual({});
  });

  test("handles empty object", () => {
    expect(parseLifecycleStatuses("{}")).toEqual({});
  });
});
