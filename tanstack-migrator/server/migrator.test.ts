import { describe, expect, test } from "bun:test";
import { trimReportSummary } from "./lib/artifacts.ts";
import { desiredGrants, grantsChanged } from "./lib/api-key.ts";
import { parseRepo, targetRepoFor } from "./lib/github.ts";
import { simulatedParityScore } from "./sandbox/drivers/manual.ts";
import {
  fixIterationPrompt,
  migratePrompt,
  parseResultJson,
} from "./sandbox/templates/prompts.ts";
import {
  syncPackageScriptCommand,
  syncWorkflowYaml,
} from "./sandbox/templates/sync-files.ts";
import type { SiteRow } from "./db/types.ts";

const site = {
  id: "site-1",
  connection_id: "conn-1",
  name: "granadobr",
  source_repo: "deco-sites/granadobr",
  source_branch: "main",
  prod_url: "https://www.granado.com.br",
  target_repo: "deco-sites/granadobr-tanstack",
  status: "validating",
  parity_target: 95,
  max_iterations: 8,
  no_improve_limit: 3,
  iterations_done: 2,
  no_improve_count: 0,
} as unknown as SiteRow;

describe("parseResultJson", () => {
  test("parses the RESULT_JSON line from session output", () => {
    const output = `fiz um monte de coisa...\nRESULT_JSON: {"ok": true, "parityScore": 87.5, "detail": "corrigi o hero"}`;
    expect(parseResultJson(output)).toEqual({
      ok: true,
      parityScore: 87.5,
      detail: "corrigi o hero",
    });
  });

  test("uses the LAST marker when the prompt echoes one", () => {
    const output = `o formato é RESULT_JSON: {"ok": false}\n...trabalho...\nRESULT_JSON: {"ok": true, "parityScore": 96}`;
    expect(parseResultJson(output)?.ok).toBe(true);
    expect(parseResultJson(output)?.parityScore).toBe(96);
  });

  test("returns null without a marker or with broken JSON", () => {
    expect(parseResultJson("no marker here")).toBeNull();
    expect(parseResultJson("RESULT_JSON: {broken")).toBeNull();
  });

  test("ok=false carries the detail as failure reason", () => {
    const parsed = parseResultJson(
      'RESULT_JSON: {"ok": false, "detail": "build quebrado"}',
    );
    expect(parsed).toEqual({
      ok: false,
      parityScore: undefined,
      detail: "build quebrado",
    });
  });
});

describe("prompts", () => {
  test("migratePrompt embeds repos, token and result contract", () => {
    const prompt = migratePrompt({ site, ghToken: "ghs_abc" });
    expect(prompt).toContain("deco-sites/granadobr");
    expect(prompt).toContain("deco-sites/granadobr-tanstack");
    expect(prompt).toContain("x-access-token:ghs_abc");
    expect(prompt).toContain("migrate.ts --source /app/source");
    expect(prompt).toContain("RESULT_JSON");
    expect(prompt).toContain("MIGRATION_REPORT_PROGRESS");
  });

  test("without ghToken uses plain URLs and notes mesh-synced git auth", () => {
    const prompt = migratePrompt({ site });
    expect(prompt).toContain("https://github.com/deco-sites/granadobr.git");
    expect(prompt).not.toContain("x-access-token");
    expect(prompt).toContain("credenciais sincronizadas pelo mesh");
  });

  test("fixIterationPrompt embeds parity command, target and uploads", () => {
    const prompt = fixIterationPrompt({
      site,
      iteration: 3,
      ghToken: "ghs_abc",
      anthropicApiKey: "sk-ant-xxx",
      artifacts: {
        reportHtmlPut: "https://storage/put-html",
        reportJsonPut: "https://storage/put-json",
        heatmapPuts: ["https://storage/put-h0"],
      },
    });
    expect(prompt).toContain(
      "@decocms/parity run --prod https://www.granado.com.br",
    );
    expect(prompt).toContain("--cand http://localhost:3000");
    expect(prompt).toContain("ANTHROPIC_API_KEY=sk-ant-xxx");
    expect(prompt).toContain("score >= 95");
    expect(prompt).toContain("https://storage/put-html");
    expect(prompt).toContain("https://storage/put-h0");
  });
});

describe("trimReportSummary", () => {
  test("keeps verdict, caps topIssues at 10 and perPage at 20", () => {
    const summary = trimReportSummary({
      verdict: { status: "warn", score: 82, critical: 0, high: 2 },
      topIssues: Array.from({ length: 15 }, (_, i) => ({
        severity: "high",
        summary: `issue ${i}`,
        page: "/",
      })),
      visualDiff: {
        parityOk: false,
        results: Array.from({ length: 30 }, (_, i) => ({
          pagePath: `/p${i}`,
          viewport: "mobile",
          pctDiff: i,
          verdict: "diffs",
          sectionsOnlyInProd: ["hero"],
        })),
      },
    });
    expect(summary.verdict?.score).toBe(82);
    expect(summary.parityOk).toBe(false);
    expect(summary.topIssues).toHaveLength(10);
    expect(summary.perPage).toHaveLength(20);
    expect(summary.perPage?.[0]).toMatchObject({
      pagePath: "/p0",
      sectionsOnlyInProd: ["hero"],
    });
  });
});

describe("github helpers", () => {
  test("parseRepo splits owner/repo and rejects garbage", () => {
    expect(parseRepo("deco-sites/granadobr")).toEqual({
      owner: "deco-sites",
      repo: "granadobr",
    });
    expect(() => parseRepo("granadobr")).toThrow();
  });

  test("targetRepoFor appends -tanstack under the configured org", () => {
    expect(targetRepoFor(site, "deco-sites")).toBe(
      "deco-sites/granadobr-tanstack",
    );
  });
});

describe("api key grants", () => {
  test("desiredGrants dedupes and includes self + connection + bindings", () => {
    expect(
      desiredGrants({
        connectionId: "conn-1",
        bindingConnectionIds: ["gh-1", "st-1", "gh-1"],
      }),
    ).toEqual(["self", "conn-1", "gh-1", "st-1"]);
  });

  test("grantsChanged detects new bindings and tolerates supersets", () => {
    expect(grantsChanged(["self", "conn-1"], ["self", "conn-1", "gh-1"])).toBe(
      true,
    );
    expect(grantsChanged(["self", "conn-1", "gh-1"], ["self", "conn-1"])).toBe(
      false,
    );
    expect(grantsChanged(undefined, ["self"])).toBe(true);
  });
});

describe("simulation", () => {
  test("parity score ramps deterministically and caps at 100", () => {
    expect(simulatedParityScore(1)).toBe(73);
    expect(simulatedParityScore(3)).toBe(95);
    expect(simulatedParityScore(10)).toBe(100);
  });
});

describe("sync templates", () => {
  test("workflow yaml references the prod host and the package script", () => {
    const yaml = syncWorkflowYaml({ prodUrl: "https://www.granado.com.br" });
    expect(yaml).toContain('cron: "*/30 * * * *"');
    expect(yaml).toContain("bun run sync:decofile");
    expect(yaml).toContain("sync: .deco/blocks from www.granado.com.br");
  });

  test("package script points the shim at the prod url", () => {
    expect(syncPackageScriptCommand("https://www.granado.com.br")).toBe(
      "bun scripts/sync-decofile.ts --url https://www.granado.com.br",
    );
  });
});
