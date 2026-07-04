import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import type { ToolBinder } from "@decocms/runtime";
import { z } from "zod";
import {
  DEFAULT_CF_ACCOUNT_ID,
  DEFAULT_FIX_BATCH_SIZE,
  DEFAULT_GITHUB_ORG,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_MAX_FIX_SESSIONS,
  DEFAULT_MAX_ISSUES_PER_TRIAGE,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_NO_IMPROVE_LIMIT,
  DEFAULT_PARITY_TARGET,
} from "../constants.ts";

/**
 * Contract-based matching for the GitHub binding: the studio filters
 * connections by tool names (see mesh createBindingChecker), so ANY GitHub
 * MCP connection matches regardless of which registry/app_name it was
 * installed under (deco proxy = @deco/github-mcp, community = mcp-github...).
 */
const GITHUB_BINDING_CONTRACT = [
  { name: "get_file_contents", inputSchema: z.object({}).passthrough() },
  {
    name: "create_or_update_file",
    inputSchema: z.object({}).passthrough(),
  },
  {
    name: "create_repository",
    inputSchema: z.object({}).passthrough(),
    opt: true,
  },
  {
    name: "MINT_REPO_TOKEN",
    inputSchema: z.object({}).passthrough(),
    opt: true,
  },
] as const satisfies readonly ToolBinder[];

/**
 * Installation-time configuration. Kept flat so the studio install form
 * renders every field cleanly.
 */
export const StateSchema = z.object({
  GITHUB: BindingOf("@deco/github-mcp", GITHUB_BINDING_CONTRACT)
    .optional()
    .describe(
      "GitHub connection (deco GitHub App or official GitHub MCP) with access to the deco-sites org — used to create the -tanstack repos and push the sync workflow. Required only in live mode (SANDBOX_PROVIDER=decopilot).",
    ),
  OBJECT_STORAGE: BindingOf("@deco/object-storage")
    .optional()
    .describe(
      "Object storage for parity report artifacts (report.html, heatmaps). Optional but required to view reports in the UI.",
    ),
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .describe(
      "Anthropic API key injected into migration sandboxes (Claude Code sessions + parity CLI visual diff).",
    ),
  OPENROUTER_API_KEY: z
    .string()
    .optional()
    .describe("Fallback LLM key for the parity CLI reports."),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .default(DEFAULT_CF_ACCOUNT_ID)
    .describe("Cloudflare account that hosts the migrated workers."),
  CLOUDFLARE_API_TOKEN: z
    .string()
    .optional()
    .describe(
      "Cloudflare API token with Workers Builds permissions — used to create the git-connected project for automatic deploys.",
    ),
  MESH_API_KEY: z
    .string()
    .optional()
    .describe(
      "Durable mesh API key for background work. Leave empty to auto-mint one on install.",
    ),
  GITHUB_ORG: z
    .string()
    .default(DEFAULT_GITHUB_ORG)
    .describe("GitHub org that owns the source and -tanstack repos."),
  GITHUB_INSTALLATION_ID: z
    .number()
    .int()
    .optional()
    .describe(
      "GitHub App installation id used by MINT_REPO_TOKEN for sandbox push tokens.",
    ),
  MAX_CONCURRENT: z
    .number()
    .int()
    .min(1)
    .max(2)
    .default(DEFAULT_MAX_CONCURRENT)
    .describe("How many migrations run at the same time (1-2)."),
  PARITY_TARGET: z
    .number()
    .min(50)
    .max(100)
    .default(DEFAULT_PARITY_TARGET)
    .describe("Default parity score that marks a migration as done."),
  MAX_ITERATIONS: z
    .number()
    .int()
    .min(1)
    .default(DEFAULT_MAX_ITERATIONS)
    .describe("Max fix iterations in the validation loop before needs_human."),
  NO_IMPROVE_LIMIT: z
    .number()
    .int()
    .min(1)
    .default(DEFAULT_NO_IMPROVE_LIMIT)
    .describe(
      "Consecutive iterations without score improvement before needs_human.",
    ),
  MAX_FIX_SESSIONS: z
    .number()
    .int()
    .min(1)
    .default(DEFAULT_MAX_FIX_SESSIONS)
    .describe(
      "Max issue-fixing sessions per site before needs_human (issue-driven loop).",
    ),
  FIX_BATCH_SIZE: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(DEFAULT_FIX_BATCH_SIZE)
    .describe(
      "How many medium/low issues of the same category one fix session takes (critical/high always go alone).",
    ),
  MAX_ISSUES_PER_TRIAGE: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(DEFAULT_MAX_ISSUES_PER_TRIAGE)
    .describe("Cap of GitHub issues created per triage/parity round."),
  SANDBOX_PROVIDER: z
    .enum(["manual", "decopilot"])
    .default("manual")
    .describe(
      "manual = end-to-end simulation (no external effects, for demos); decopilot = live migrations via mesh sandboxes.",
    ),
  SANDBOX_KIND: z
    .enum(["agent-sandbox", "user-desktop", "auto"])
    .default("agent-sandbox")
    .describe(
      "Where the sandbox runs: agent-sandbox = hosted k8s (production default); user-desktop = your machine via the link daemon (local dev); auto = let mesh decide (user-desktop when your link daemon is online).",
    ),
  SESSION_HARNESS: z
    .enum(["claude-code", "decopilot", "codex"])
    .default("claude-code")
    .describe(
      "Coding harness for migration sessions: claude-code needs an Anthropic AI-provider key in the org; decopilot uses the org's default LLM credentials (e.g. OpenRouter).",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;

/** Plain (non-binding) config the background worker needs, parsed from the persisted state. */
export interface MigratorConfig {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  cloudflareAccountId: string;
  cloudflareApiToken?: string;
  githubOrg: string;
  githubInstallationId?: number;
  maxConcurrent: number;
  parityTarget: number;
  maxIterations: number;
  noImproveLimit: number;
  maxFixSessions: number;
  fixBatchSize: number;
  maxIssuesPerTriage: number;
  sandboxProvider: "manual" | "decopilot";
  sandboxKind: "agent-sandbox" | "user-desktop" | "auto";
  sessionHarness: "claude-code" | "decopilot" | "codex";
}

export function parseMigratorConfig(
  state: Record<string, unknown> | null | undefined,
): MigratorConfig {
  const s = (state ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  return {
    anthropicApiKey: str(s.ANTHROPIC_API_KEY),
    openrouterApiKey: str(s.OPENROUTER_API_KEY),
    cloudflareAccountId: str(s.CLOUDFLARE_ACCOUNT_ID) ?? DEFAULT_CF_ACCOUNT_ID,
    cloudflareApiToken: str(s.CLOUDFLARE_API_TOKEN),
    githubOrg: str(s.GITHUB_ORG) ?? DEFAULT_GITHUB_ORG,
    githubInstallationId: num(s.GITHUB_INSTALLATION_ID),
    maxConcurrent: num(s.MAX_CONCURRENT) ?? DEFAULT_MAX_CONCURRENT,
    parityTarget: num(s.PARITY_TARGET) ?? DEFAULT_PARITY_TARGET,
    maxIterations: num(s.MAX_ITERATIONS) ?? DEFAULT_MAX_ITERATIONS,
    noImproveLimit: num(s.NO_IMPROVE_LIMIT) ?? DEFAULT_NO_IMPROVE_LIMIT,
    maxFixSessions: num(s.MAX_FIX_SESSIONS) ?? DEFAULT_MAX_FIX_SESSIONS,
    fixBatchSize: num(s.FIX_BATCH_SIZE) ?? DEFAULT_FIX_BATCH_SIZE,
    maxIssuesPerTriage:
      num(s.MAX_ISSUES_PER_TRIAGE) ?? DEFAULT_MAX_ISSUES_PER_TRIAGE,
    sandboxProvider:
      s.SANDBOX_PROVIDER === "decopilot" ? "decopilot" : "manual",
    sandboxKind:
      s.SANDBOX_KIND === "user-desktop" || s.SANDBOX_KIND === "auto"
        ? s.SANDBOX_KIND
        : "agent-sandbox",
    sessionHarness:
      s.SESSION_HARNESS === "decopilot" || s.SESSION_HARNESS === "codex"
        ? s.SESSION_HARNESS
        : "claude-code",
  };
}
