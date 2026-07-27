/**
 * GET_CHECK_RUN — fetch a single check run in full, including its `output`
 * (title / summary / text markdown).
 *
 * The proxied upstream `pull_request_read(get_check_runs)` returns a minimal
 * shape without `output`, so the PR panel can list checks but can't show a
 * check's step-by-step results. This first-party tool fills that gap by reading
 * the check run directly from the REST API with the caller's own token.
 *
 * `createPrivateTool` ensures the caller is authenticated; the read is scoped by
 * the caller's token (needs checks:read).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { getCheckRun } from "../lib/check-run.ts";
import type { Env } from "../types/env.ts";

export function createGetCheckRunTool() {
  return createPrivateTool({
    id: "GET_CHECK_RUN",
    description:
      "Fetch a single check run in full — including its output (title, summary, " +
      "and text markdown) — by numeric id. Complements pull_request_read " +
      "get_check_runs, whose minimal shape omits output, so a check's " +
      "step-by-step results can be shown inline. Requires checks:read on the " +
      "caller's token.",
    inputSchema: z.object({
      owner: z
        .string()
        .describe('Repository owner/login, e.g. "acme" (NOT "owner/repo").'),
      repo: z
        .string()
        .describe('The repository NAME only, e.g. "web" (NOT "acme/web").'),
      checkRunId: z
        .number()
        .int()
        .describe("Numeric check run id, as returned by get_check_runs."),
    }),
    outputSchema: z.object({
      id: z.number(),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
      htmlUrl: z.string().nullable(),
      detailsUrl: z.string().nullable(),
      output: z.object({
        title: z.string().nullable(),
        summary: z.string().nullable(),
        text: z.string().nullable(),
      }),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as unknown as Env;
      const token = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
      return await getCheckRun({
        token,
        owner: context.owner,
        repo: context.repo,
        checkRunId: context.checkRunId,
      });
    },
  });
}
