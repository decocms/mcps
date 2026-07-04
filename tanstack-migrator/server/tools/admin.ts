/** Debug/ops tools. */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadAllConnections } from "../db/connections.ts";
import { runTickOnce } from "../engine/worker.ts";
import {
  closeIssue,
  commentIssue,
  createIssue,
  createPullRequest,
  getPullRequest,
  listIssues,
  parseRepo,
  updateIssueBody,
} from "../lib/github.ts";
import { buildWorkerCtx } from "../lib/mesh.ts";
import type { Env } from "../types/env.ts";

export const createAdvanceQueueTool = (_env: Env) =>
  createPrivateTool({
    id: "ADVANCE_QUEUE",
    description:
      "Force one worker tick right now (the queue also advances automatically every 30s). Useful for debugging.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      connections: z.number(),
      advanced: z.number(),
    }),
    execute: async () => {
      return await runTickOnce();
    },
  });

/**
 * TEMPORARY (v0.5.0 rollout): empirically validate the GitHub binding's
 * issue/PR tool arg shapes through the exact same path the worker uses.
 * Run against a scratch repo, then remove once a real site has gone through
 * triage → fix → parity with issues flowing.
 */
export const createGithubProbeTool = (_env: Env) =>
  createPrivateTool({
    id: "GITHUB_ISSUE_PROBE",
    description:
      "[debug] Round-trip the GitHub issue wrappers (create → list → update → comment → close) against a scratch repo, via the worker's binding path. Optionally opens a PR head→base.",
    inputSchema: z.object({
      repo: z.string().describe("owner/repo scratch repository"),
      connectionId: z
        .string()
        .optional()
        .describe(
          "Connection row to run through (defaults to the current request's connection)",
        ),
      pr: z
        .object({ head: z.string(), base: z.string().default("main") })
        .optional()
        .describe("Also probe PR create+read with this head/base"),
    }),
    outputSchema: z.object({
      steps: z.array(
        z.object({
          step: z.string(),
          ok: z.boolean(),
          detail: z.string(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const rows = await loadAllConnections();
      if (rows.length === 0) throw new Error("no connection snapshot in DB");
      // GitHub mutations must run under the right tenant, not "most recent"
      const wanted =
        context.connectionId ?? _env.MESH_REQUEST_CONTEXT?.connectionId;
      const row = wanted
        ? rows.find((r) => r.connection_id === wanted)
        : rows.length === 1
          ? rows[0]
          : undefined;
      if (!row) {
        throw new Error(
          `connection não encontrada (${wanted ?? "sem contexto"}) — passe connectionId. Disponíveis: ${rows.map((r) => r.connection_id).join(", ")}`,
        );
      }
      const ctx = buildWorkerCtx(row);
      const ref = parseRepo(context.repo);
      const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
      const record = async <T>(
        step: string,
        fn: () => Promise<T>,
        show?: (r: T) => string,
      ): Promise<T | null> => {
        try {
          const result = await fn();
          steps.push({
            step,
            ok: true,
            detail: show ? show(result) : "ok",
          });
          return result;
        } catch (err) {
          steps.push({
            step,
            ok: false,
            detail: (err instanceof Error ? err.message : String(err)).slice(
              0,
              300,
            ),
          });
          return null;
        }
      };

      const issue = await record(
        "createIssue",
        () =>
          createIssue(ctx, ref, {
            title: `[probe] tanstack-migrator wrapper check`,
            body: "Round-trip probe — safe to delete.\n\n<!-- tsm:probe:0 -->",
            labels: ["tanstack-migrator", "severity:low", "infra"],
          }),
        (i) => `#${i.number}`,
      );
      await record(
        "listIssues(open)",
        () =>
          listIssues(ctx, ref, {
            state: "open",
            labels: ["tanstack-migrator"],
          }),
        (list) =>
          `${list.length} open: [${list.map((i) => i.number).join(",")}]`,
      );
      if (issue) {
        await record("updateIssueBody", () =>
          updateIssueBody(ctx, ref, issue.number, `${issue.body}\n\nupdated ✔`),
        );
        await record("commentIssue", () =>
          commentIssue(ctx, ref, issue.number, "probe comment ✔"),
        );
        await record("closeIssue", () => closeIssue(ctx, ref, issue.number));
        await record("listIssues(closed)", async () => {
          const list = await listIssues(ctx, ref, {
            state: "closed",
            labels: ["tanstack-migrator"],
          });
          if (!list.some((i) => i.number === issue.number)) {
            throw new Error(
              `#${issue.number} NÃO veio na lista closed (${list.length} itens) — wrapper de list/close inconsistente`,
            );
          }
          return `#${issue.number} veio na lista closed`;
        });
      }
      if (context.pr) {
        const pr = await record(
          "createPullRequest",
          () =>
            createPullRequest(ctx, ref, {
              title: "[probe] tanstack-migrator PR check",
              body: "Probe — safe to close.",
              head: context.pr!.head,
              base: context.pr!.base,
            }),
          (p) => `#${p.number} ${p.url ?? ""}`,
        );
        if (pr) {
          await record(
            "getPullRequest",
            () => getPullRequest(ctx, ref, pr.number),
            (p) => `state=${p?.state} merged=${p?.merged}`,
          );
        }
      }
      return { steps };
    },
  });
