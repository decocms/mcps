/**
 * Install the .deco sync-mirror workflow into a CLIENT production repo — via a
 * PR, with the strictest possible blast radius: it adds EXACTLY ONE file
 * (`.github/workflows/sync-deco-content.yml`) on a dedicated branch and opens a
 * PR into the client's default branch. It never pushes to the client's main
 * directly and never touches any other file — a human reviews/merges it and
 * adds the token secret.
 *
 * Idempotent: reuses an already-open sync PR and skips the write when the file
 * already matches. Fail-safe: a missing `workflows:write` permission returns a
 * reason instead of throwing, so it can never block a migration.
 */

import {
  createPullRequest,
  ensureBranch,
  findOpenPullRequest,
  getFile,
  putFile,
  type RepoRef,
} from "./github.ts";
import type { WorkerCtx } from "./mesh.ts";
import {
  DEFAULT_SYNC_TOKEN_SECRET,
  SYNC_WORKFLOW_PATH,
  syncWorkflowYaml,
} from "../sandbox/templates/sync-files.ts";

export const SYNC_PR_BRANCH = "chore/deco-sync";

export interface InstallSyncResult {
  installed: boolean;
  path: string;
  prNumber: number | null;
  prUrl: string | null;
  tokenSecret: string;
  /** "opened" | "reused" | "up-to-date" | error message when installed=false */
  reason: string;
}

/**
 * Open (or reuse) a PR on `clientRef` that adds only the sync workflow.
 * `targetRepo` is the -tanstack repo the workflow mirrors into.
 */
export async function installSyncWorkflow(
  ctx: WorkerCtx,
  clientRef: RepoRef,
  input: {
    sourceRepo: string;
    targetRepo: string;
    base?: string;
    headBranch?: string;
    tokenSecret?: string;
  },
): Promise<InstallSyncResult> {
  const base = input.base ?? "main";
  const head = input.headBranch ?? SYNC_PR_BRANCH;
  const tokenSecret = input.tokenSecret ?? DEFAULT_SYNC_TOKEN_SECRET;
  const content = syncWorkflowYaml({
    sourceRepo: input.sourceRepo,
    targetRepo: input.targetRepo,
    tokenSecret,
  });
  const base_result = (
    reason: string,
    extra: Partial<InstallSyncResult> = {},
  ) => ({
    installed: false,
    path: SYNC_WORKFLOW_PATH,
    prNumber: null,
    prUrl: null,
    tokenSecret,
    reason,
    ...extra,
  });

  try {
    // dedicated branch off the client default — never commit to main directly
    await ensureBranch(ctx, clientRef, head, base);
    const outcome = await putFile(ctx, clientRef, {
      path: SYNC_WORKFLOW_PATH,
      content,
      message:
        "ci: mirror .deco to the TanStack storefront (tanstack-migrator)",
      branch: head,
    });

    // reuse an already-open PR for this branch
    const existing = await findOpenPullRequest(ctx, clientRef, head).catch(
      () => null,
    );
    if (existing) {
      return {
        installed: true,
        path: SYNC_WORKFLOW_PATH,
        prNumber: existing.number,
        prUrl: existing.url ?? null,
        tokenSecret,
        reason: "reused",
      };
    }
    // nothing changed and no open PR → already merged/installed, nothing to do
    if (outcome === "unchanged") return base_result("up-to-date");

    const pr = await createPullRequest(ctx, clientRef, {
      title: "ci: mirror .deco to the TanStack storefront",
      body: [
        `Adds \`${SYNC_WORKFLOW_PATH}\` — mirrors \`.deco/blocks\` published here into \`${input.targetRepo}\` on every push, so the TanStack migration stays in sync with the live CMS.`,
        "",
        `**This is the only file this PR adds.** To activate it after merging, add a repo secret \`${tokenSecret}\` — a PAT (or fine-grained token) with **write** access to \`${input.targetRepo}\`.`,
        "",
        "Opened automatically by **tanstack-migrator**.",
      ].join("\n"),
      head,
      base,
    });
    return {
      installed: true,
      path: SYNC_WORKFLOW_PATH,
      prNumber: pr.number,
      prUrl: pr.url ?? null,
      tokenSecret,
      reason: "opened",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return base_result(message);
  }
}

/** Read-only probe: does the client already have the workflow on its default branch? */
export async function syncWorkflowInstalled(
  ctx: WorkerCtx,
  clientRef: RepoRef,
  base = "main",
): Promise<boolean> {
  const file = await getFile(ctx, clientRef, SYNC_WORKFLOW_PATH, base);
  return Boolean(file && file.text.includes("Sync .deco to TanStack"));
}
