/**
 * GitHub issues as the migration's durable memory (v0.5.0).
 *
 * Sessions only PROPOSE issues (RESULT_JSON.issues[]) — creation is MCP-side:
 * deterministic, logged, budgeted, and deduped across rounds via an invisible
 * marker comment in the body: <!-- tsm:{siteId}:{titleHash} -->. A re-run of
 * triage or parity updates the existing issue instead of duplicating it.
 */

import { addEvent } from "../db/events.ts";
import { updateSite } from "../db/sites.ts";
import type { ParitySummary, SiteRow } from "../db/types.ts";
import type { IssueDraft } from "../sandbox/templates/prompts.ts";
import {
  closeIssue,
  commentIssue,
  createIssue,
  type GithubIssue,
  issueUpdateLabels,
  listIssues,
  parseRepo,
  updateIssueBody,
} from "./github.ts";
import type { WorkerCtx } from "./mesh.ts";

export const TSM_LABEL = "tanstack-migrator";
export const BLOCKED_LABEL = "tsm:blocked";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

const CATEGORIES = ["build", "runtime", "visual", "content", "infra"] as const;

export function normalizeSeverity(value: string | undefined): Severity {
  const v = (value ?? "").toLowerCase();
  return (SEVERITIES as readonly string[]).includes(v)
    ? (v as Severity)
    : "medium";
}

export function normalizeCategory(value: string | undefined): string {
  const v = (value ?? "").toLowerCase();
  return (CATEGORIES as readonly string[]).includes(v) ? v : "runtime";
}

/** djb2 over the normalized title — stable identity for dedupe across rounds. */
export function titleHash(title: string): string {
  const normalized = title.toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function issueMarker(siteId: string, hash: string): string {
  return `<!-- tsm:${siteId}:${hash} -->`;
}

const MARKER_RE = /<!--\s*tsm:([^:\s]+):([a-z0-9]+)\s*-->/;

export function markerOf(
  body: string,
): { siteId: string; hash: string } | null {
  const match = body.match(MARKER_RE);
  return match ? { siteId: match[1], hash: match[2] } : null;
}

export function severityOf(issue: GithubIssue): Severity {
  const label = issue.labels.find((l) => l.startsWith("severity:"));
  return normalizeSeverity(label?.slice("severity:".length));
}

export function categoryOf(issue: GithubIssue): string {
  const label = issue.labels.find((l) =>
    (CATEGORIES as readonly string[]).includes(l),
  );
  return label ?? "runtime";
}

/** Parity report topIssues → issue drafts, heatmap + full report embedded. */
export function paritySummaryToDrafts(
  summary: ParitySummary,
  embeds?: { reportHtml?: string; heatmaps?: string[] } | null,
): IssueDraft[] {
  return (summary.topIssues ?? []).map((issue, i) => {
    // heatmap↔issue association is by index (upload order) — best-effort
    // visual context, not a guaranteed match with the issue's page
    const heatmap = embeds?.heatmaps?.[i];
    const body = [
      "## Contexto",
      `Paridade prod vs candidato${issue.page ? ` — página \`${issue.page}\`` : ""} (score ${summary.verdict?.score ?? "?"}).`,
      "## Erro",
      issue.summary,
      "## Como reproduzir",
      issue.page
        ? `Compare \`${issue.page}\` na produção e no preview do sandbox.`
        : "Rode a parity CLI (preset ci) e veja o report.",
      "## Dica de fix",
      issue.suggestedFix ?? "Porte a seção equivalente de /app/source.",
      ...(heatmap ? ["## Heatmap", `![heatmap](${heatmap})`] : []),
      ...(embeds?.reportHtml
        ? [
            `[Report completo desta rodada](${embeds.reportHtml}) (expira em 7 dias)`,
          ]
        : []),
    ].join("\n");
    return {
      title: `[parity] ${issue.page ?? "geral"}: ${issue.summary.slice(0, 90)}`,
      body,
      severity: issue.severity,
      category: issue.category ?? "visual",
      page: issue.page,
    };
  });
}

export interface SyncIssuesResult {
  created: number[];
  refreshed: number[];
  skipped: number;
}

/**
 * Persist session-proposed drafts as GitHub issues on the target repo.
 * Existing open issue with the same marker → refresh body + "still present"
 * comment. New → create with [tanstack-migrator, severity:*, category] labels.
 */
export async function syncIssuesFromDrafts(
  ctx: WorkerCtx,
  site: SiteRow,
  drafts: IssueDraft[],
  source: "triage" | "parity",
  cap: number,
): Promise<SyncIssuesResult> {
  if (!site.target_repo || drafts.length === 0) {
    return { created: [], refreshed: [], skipped: drafts.length };
  }
  const ref = parseRepo(site.target_repo);
  const open = await listIssues(ctx, ref, {
    state: "open",
    labels: [TSM_LABEL],
  });
  const byHash = new Map<string, GithubIssue>();
  for (const issue of open) {
    const marker = markerOf(issue.body);
    if (marker && marker.siteId === site.id) byHash.set(marker.hash, issue);
    else byHash.set(titleHash(issue.title), issue); // manual/markerless issues
  }

  const capped = drafts.slice(0, cap);
  const skipped = drafts.length - capped.length;
  if (skipped > 0) {
    await addEvent(
      site.id,
      `${source}: ${drafts.length} issues propostas, criando só as ${cap} mais graves (cap)`,
      "warn",
    );
  }

  const created: number[] = [];
  const refreshed: number[] = [];
  for (const draft of capped) {
    const hash = titleHash(draft.title);
    const severity = normalizeSeverity(draft.severity);
    const category = normalizeCategory(draft.category);
    const body = `${(draft.body ?? "").slice(0, 4000)}\n\n${issueMarker(site.id, hash)}`;

    const existing = byHash.get(hash);
    if (existing) {
      await updateIssueBody(ctx, ref, existing.number, body).catch(() => {});
      // keep priority in sync with the latest round (severity may escalate);
      // preserve the blocked marker so the batch selector still skips it
      const freshLabels = [
        TSM_LABEL,
        `severity:${severity}`,
        category,
        ...(existing.labels.includes(BLOCKED_LABEL) ? [BLOCKED_LABEL] : []),
      ];
      if (
        freshLabels.some((label) => !existing.labels.includes(label)) ||
        existing.labels.some((label) =>
          label.startsWith("severity:") || label === BLOCKED_LABEL
            ? !freshLabels.includes(label)
            : false,
        )
      ) {
        await issueUpdateLabels(ctx, ref, existing.number, freshLabels).catch(
          () => {},
        );
      }
      await commentIssue(
        ctx,
        ref,
        existing.number,
        `Ainda presente na rodada de ${source === "parity" ? `paridade ${site.iterations_done + 1}` : "triagem"} (severity ${severity}).`,
      ).catch(() => {});
      refreshed.push(existing.number);
      continue;
    }

    const issue = await createIssue(ctx, ref, {
      title: draft.title.slice(0, 200),
      body,
      labels: [TSM_LABEL, `severity:${severity}`, category],
    });
    byHash.set(hash, issue);
    created.push(issue.number);
    await addEvent(
      site.id,
      `Issue #${issue.number} criada (${severity}/${category}): ${draft.title.slice(0, 100)}`,
    );
  }
  return { created, refreshed, skipped };
}

/** Refresh the dashboard's issue counters from GitHub (source of truth). */
export async function refreshIssueCounts(
  ctx: WorkerCtx,
  site: SiteRow,
): Promise<{ open: number; closed: number; openIssues: GithubIssue[] }> {
  if (!site.target_repo) return { open: 0, closed: 0, openIssues: [] };
  const ref = parseRepo(site.target_repo);
  const [openIssues, closedIssues] = await Promise.all([
    listIssues(ctx, ref, { state: "open", labels: [TSM_LABEL] }),
    listIssues(ctx, ref, { state: "closed", labels: [TSM_LABEL] }),
  ]);
  await updateSite(site.id, {
    issues_open: openIssues.length,
    issues_closed: closedIssues.length,
    issues_total: openIssues.length + closedIssues.length,
  });
  return {
    open: openIssues.length,
    closed: closedIssues.length,
    openIssues,
  };
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Pick the next fix-session batch by severity: 1 critical/high alone (big
 * blast radius, deserves the whole session), or up to `batchSize` medium/low
 * of the SAME category (cheap fixes that share context). Blocked issues are
 * skipped until everything else drains.
 */
export function selectIssuesForFixSession(
  open: GithubIssue[],
  batchSize: number,
): GithubIssue[] {
  // all-blocked → empty: the phase reroutes to paritying instead of burning
  // fix sessions on issues the agent already said it can't do
  const workable = open.filter((i) => !i.labels.includes(BLOCKED_LABEL));
  if (workable.length === 0) return [];

  const sorted = [...workable].sort(
    (a, b) =>
      SEVERITY_ORDER[severityOf(a)] - SEVERITY_ORDER[severityOf(b)] ||
      a.number - b.number,
  );
  const top = sorted[0];
  const topSeverity = severityOf(top);
  if (topSeverity === "critical" || topSeverity === "high") return [top];

  const category = categoryOf(top);
  return sorted.filter((i) => categoryOf(i) === category).slice(0, batchSize);
}

/** Close issues a fix session resolved (with an audit comment). */
export async function closeResolvedIssues(
  ctx: WorkerCtx,
  site: SiteRow,
  resolved: number[],
  threadId?: string,
): Promise<void> {
  if (!site.target_repo) return;
  const ref = parseRepo(site.target_repo);
  for (const number of resolved) {
    await commentIssue(
      ctx,
      ref,
      number,
      `Resolvida pela sessão de fix do tanstack-migrator${threadId ? ` (thread \`${threadId}\`)` : ""} — commit \`fix(#${number})\` na branch \`${site.work_branch}\`.`,
    ).catch(() => {});
    await closeIssue(ctx, ref, number).catch(() => {});
    await addEvent(site.id, `Issue #${number} fechada (fix pushado)`);
  }
}

/** Label + comment issues the session declared blocked. */
export async function markBlockedIssues(
  ctx: WorkerCtx,
  site: SiteRow,
  blocked: Array<{ number: number; reason?: string }>,
  openIssues: GithubIssue[],
): Promise<void> {
  if (!site.target_repo) return;
  const ref = parseRepo(site.target_repo);
  for (const item of blocked) {
    const issue = openIssues.find((i) => i.number === item.number);
    await commentIssue(
      ctx,
      ref,
      item.number,
      `Bloqueada pela sessão de fix: ${item.reason ?? "sem motivo informado"}`,
    ).catch(() => {});
    await issueUpdateLabels(ctx, ref, item.number, [
      ...(issue?.labels ?? [TSM_LABEL]),
      BLOCKED_LABEL,
    ]).catch(() => {});
    await addEvent(
      site.id,
      `Issue #${item.number} bloqueada: ${item.reason ?? "?"}`,
      "warn",
    );
  }
}
