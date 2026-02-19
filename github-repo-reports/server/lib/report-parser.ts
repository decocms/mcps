/**
 * Report Parser
 *
 * Parses Markdown files with YAML frontmatter into the Report schema
 * defined by the Reports Binding.
 *
 * File format:
 * ```
 * ---
 * title: "Report Title"
 * category: performance
 * status: warning
 * summary: "One-line summary"
 * source: my-agent
 * tags: [extra-tag]
 * updatedAt: "2025-01-15T10:00:00Z"
 * sections:
 *   - type: metrics
 *     title: "Core Vitals"
 *     items:
 *       - label: LCP
 *         value: 2.5
 *         unit: s
 *         status: passing
 * ---
 *
 * ## Markdown body becomes a section
 * ```
 */

import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Report Binding Types
// ---------------------------------------------------------------------------

export type ReportStatus = "passing" | "warning" | "failing" | "info";
export type ReportLifecycleStatus = "unread" | "read" | "dismissed";

export interface MetricItem {
  label: string;
  value: number | string;
  unit?: string;
  previousValue?: number | string;
  status?: ReportStatus;
}

export interface MarkdownSection {
  type: "markdown";
  content: string;
}

export interface MetricsSection {
  type: "metrics";
  title?: string;
  items: MetricItem[];
}

export interface TableSection {
  type: "table";
  title?: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface CriterionItem {
  label: string;
  description?: string;
}

export interface CriteriaSection {
  type: "criteria";
  title?: string;
  items: CriterionItem[];
}

export interface NoteSection {
  type: "note";
  content: string;
}

export interface RankedListRow {
  position: number;
  delta: number;
  label: string;
  image: string;
  values: (string | number)[];
  note?: string;
}

export interface RankedListSection {
  type: "ranked-list";
  title?: string;
  columns: string[];
  rows: RankedListRow[];
}

export type ReportSection =
  | MarkdownSection
  | MetricsSection
  | TableSection
  | CriteriaSection
  | NoteSection
  | RankedListSection;

export interface ReportSummary {
  id: string;
  title: string;
  category: string;
  status: ReportStatus;
  summary: string;
  updatedAt: string;
  source?: string;
  tags?: string[];
  lifecycleStatus?: ReportLifecycleStatus;
}

export interface Report extends ReportSummary {
  sections: ReportSection[];
}

// ---------------------------------------------------------------------------
// Lifecycle status map (from .reports-status.json)
// ---------------------------------------------------------------------------

export type LifecycleStatusMap = Record<string, ReportLifecycleStatus>;

// ---------------------------------------------------------------------------
// Frontmatter shape (loosely typed for parsing)
// ---------------------------------------------------------------------------

interface ReportFrontmatter {
  title?: string;
  category?: string;
  status?: string;
  summary?: string;
  source?: string;
  tags?: string[];
  updatedAt?: string;
  sections?: ReportSection[];
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set<string>([
  "passing",
  "warning",
  "failing",
  "info",
]);

/**
 * Parse a Markdown string with YAML frontmatter.
 * Returns the parsed frontmatter object and the markdown body.
 */
function parseFrontmatter(raw: string): {
  frontmatter: ReportFrontmatter;
  body: string;
} {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: trimmed };
  }

  // Find the closing `---` (must be on its own line)
  const closingIndex = trimmed.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: trimmed };
  }

  const yamlBlock = trimmed.slice(3, closingIndex).trim();
  const body = trimmed.slice(closingIndex + 4).trim();

  let frontmatter: ReportFrontmatter = {};
  try {
    const parsed: unknown = parseYaml(yamlBlock);
    if (typeof parsed === "object" && parsed !== null) {
      frontmatter = parsed as ReportFrontmatter;
    }
  } catch {
    // If YAML parsing fails, treat the whole file as markdown body
    return { frontmatter: {}, body: trimmed };
  }

  return { frontmatter, body };
}

/**
 * Derive the report ID from its file path relative to the reports directory.
 *
 * Example: `reports/farm/thing.md` with reportsPath `reports`
 *          → ID: `farm/thing`
 */
export function deriveReportId(filePath: string, reportsPath: string): string {
  const normalizedPrefix = reportsPath.endsWith("/")
    ? reportsPath
    : `${reportsPath}/`;

  let relative = filePath;
  if (relative.startsWith(normalizedPrefix)) {
    relative = relative.slice(normalizedPrefix.length);
  }

  // Strip .md extension
  if (relative.endsWith(".md")) {
    relative = relative.slice(0, -3);
  }

  return relative;
}

/**
 * Derive tags from directory nesting.
 *
 * Example: `farm/thing` → ["farm"]
 *          `security/api/audit` → ["security", "api"]
 *          `check` → []
 */
export function deriveTagsFromPath(reportId: string): string[] {
  const parts = reportId.split("/");
  // Everything except the last segment (the filename) is a tag
  return parts.slice(0, -1);
}

/**
 * Derive a human-readable title from a filename.
 *
 * Example: `daily-check` → "Daily Check"
 *          `my_report_2024` → "My Report 2024"
 */
function titleFromFilename(filename: string): string {
  return filename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw Markdown file into a ReportSummary (no sections).
 *
 * Used by REPORTS_LIST where we only need metadata.
 */
export function parseReportSummary(
  raw: string,
  filePath: string,
  reportsPath: string,
  lifecycleStatuses: LifecycleStatusMap,
): ReportSummary {
  const { frontmatter } = parseFrontmatter(raw);
  const id = deriveReportId(filePath, reportsPath);
  const dirTags = deriveTagsFromPath(id);

  // Merge directory tags with frontmatter tags (deduped)
  const frontmatterTags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map(String)
    : [];
  const allTags = [...new Set([...dirTags, ...frontmatterTags])];

  // Derive title from frontmatter or filename
  const filenamePart = id.split("/").pop() ?? id;
  const title = frontmatter.title || titleFromFilename(filenamePart);

  const status: ReportStatus = VALID_STATUSES.has(frontmatter.status ?? "")
    ? (frontmatter.status as ReportStatus)
    : "info";

  return {
    id,
    title,
    category: frontmatter.category || "general",
    status,
    summary: frontmatter.summary || "",
    updatedAt: frontmatter.updatedAt || new Date().toISOString(),
    ...(frontmatter.source ? { source: frontmatter.source } : {}),
    ...(allTags.length > 0 ? { tags: allTags } : {}),
    ...(lifecycleStatuses[id]
      ? { lifecycleStatus: lifecycleStatuses[id] }
      : {}),
  };
}

/**
 * Parse a raw Markdown file into a full Report (with sections).
 *
 * Used by REPORTS_GET where we need the complete report.
 */
export function parseReport(
  raw: string,
  filePath: string,
  reportsPath: string,
  lifecycleStatuses: LifecycleStatusMap,
): Report {
  const { frontmatter, body } = parseFrontmatter(raw);
  const summary = parseReportSummary(
    raw,
    filePath,
    reportsPath,
    lifecycleStatuses,
  );

  // Build sections: frontmatter sections first, then markdown body
  const sections: ReportSection[] = [];

  if (Array.isArray(frontmatter.sections)) {
    for (const section of frontmatter.sections) {
      if (isValidSection(section)) {
        sections.push(section);
      }
    }
  }

  // Append the markdown body as a final markdown section (if non-empty)
  if (body.length > 0) {
    sections.push({ type: "markdown", content: body });
  }

  return {
    ...summary,
    sections,
  };
}

/**
 * Parse the `.reports-status.json` content into a LifecycleStatusMap.
 * Returns an empty map if the content is invalid.
 */
export function parseLifecycleStatuses(raw: string): LifecycleStatusMap {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const result: LifecycleStatusMap = {};
    const validStatuses = new Set(["unread", "read", "dismissed"]);

    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === "string" && validStatuses.has(value)) {
        result[key] = value as ReportLifecycleStatus;
      }
    }

    return result;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function isValidSection(section: unknown): section is ReportSection {
  if (typeof section !== "object" || section === null) return false;

  const s = section as Record<string, unknown>;

  switch (s.type) {
    case "markdown":
      return typeof s.content === "string";
    case "metrics":
      return Array.isArray(s.items);
    case "table":
      return Array.isArray(s.columns) && Array.isArray(s.rows);
    case "criteria":
      return Array.isArray(s.items);
    case "note":
      return typeof s.content === "string";
    case "ranked-list":
      return Array.isArray(s.columns) && Array.isArray(s.rows);
    default:
      return false;
  }
}
