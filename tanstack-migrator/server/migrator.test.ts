import { describe, expect, test } from "bun:test";
import { trimReportSummary } from "./lib/artifacts.ts";
import { desiredGrants, grantsChanged } from "./lib/api-key.ts";
import { parseRepo, targetRepoFor } from "./lib/github.ts";
import type { GithubIssue } from "./lib/github.ts";
import {
  issueMarker,
  markerOf,
  paritySummaryToDrafts,
  selectIssuesForFixSession,
  titleHash,
} from "./lib/issues.ts";
import { simulatedParityScore } from "./sandbox/drivers/manual.ts";
import {
  fixIssuesPrompt,
  migrateScriptPrompt,
  parityOnlyPrompt,
  parseResultJson,
  triagePrompt,
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
  status: "fixing",
  parity_target: 95,
  max_iterations: 8,
  no_improve_limit: 3,
  iterations_done: 2,
  no_improve_count: 0,
  work_branch: "migration/tanstack",
  issues_open: 3,
  issues_closed: 1,
  fix_sessions_done: 1,
  max_fix_sessions: 20,
} as unknown as SiteRow;

describe("parseResultJson", () => {
  test("parses the RESULT_JSON line from session output", () => {
    const output = `fiz um monte de coisa...\nRESULT_JSON: {"ok": true, "parityScore": 87.5, "detail": "corrigi o hero"}`;
    expect(parseResultJson(output)).toMatchObject({
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
    expect(parsed?.ok).toBe(false);
    expect(parsed?.detail).toBe("build quebrado");
  });

  test("NESTED payloads survive (the old non-greedy regex truncated them)", () => {
    const output = `triagem feita.\nRESULT_JSON: {"ok": true, "detail": "3 issues", "issues": [{"title": "build: imports preact", "body": "## Erro\\ntsc explode {aqui}", "severity": "critical", "category": "build"}, {"title": "rota / 500", "severity": "high", "category": "runtime", "page": "/"}]}`;
    const parsed = parseResultJson(output);
    expect(parsed?.ok).toBe(true);
    expect(parsed?.issues).toHaveLength(2);
    expect(parsed?.issues?.[0]).toMatchObject({
      title: "build: imports preact",
      severity: "critical",
    });
    expect(parsed?.issues?.[0]?.body).toContain("{aqui}");
    expect(parsed?.issues?.[1]?.page).toBe("/");
  });

  test("fix payload: resolved + blocked with nested objects", () => {
    const parsed = parseResultJson(
      'RESULT_JSON: {"ok": true, "resolved": [12, 15], "blocked": [{"number": 14, "reason": "depende da #12"}]}',
    );
    expect(parsed?.resolved).toEqual([12, 15]);
    expect(parsed?.blocked).toEqual([{ number: 14, reason: "depende da #12" }]);
  });

  test("braces inside strings don't break the scanner", () => {
    const parsed = parseResultJson(
      'RESULT_JSON: {"ok": true, "detail": "corrigi o { que sobrou } no jsx"}',
    );
    expect(parsed?.ok).toBe(true);
    expect(parsed?.detail).toBe("corrigi o { que sobrou } no jsx");
  });

  test("malformed issue entries are filtered, valid ones kept", () => {
    const parsed = parseResultJson(
      'RESULT_JSON: {"ok": true, "issues": [{"title": "ok"}, {"noTitle": true}, "string"], "resolved": [1, "x", 2.5, 3]}',
    );
    expect(parsed?.issues).toHaveLength(1);
    expect(parsed?.resolved).toEqual([1, 3]);
  });
});

describe("prompts", () => {
  test("migrateScriptPrompt: work branch, checkpoint, NO build fixing", () => {
    const prompt = migrateScriptPrompt({ site, ghToken: "ghs_abc" });
    expect(prompt).toContain("deco-sites/granadobr");
    expect(prompt).toContain("x-access-token:ghs_abc");
    expect(prompt).toContain("git checkout -B migration/tanstack");
    expect(prompt).toContain("migrate.ts --source /app/repo");
    expect(prompt).toContain("push -u -f origin migration/tanstack");
    expect(prompt).toContain("NÃO corrija erros de build");
    expect(prompt).toContain("PARE AQUI");
    expect(prompt).toContain("RESULT_JSON");
  });

  test("migrateScriptPrompt without ghToken notes mesh-synced git auth", () => {
    const prompt = migrateScriptPrompt({ site });
    expect(prompt).toContain("https://github.com/deco-sites/granadobr.git");
    expect(prompt).not.toContain("x-access-token");
    expect(prompt).toContain("credenciais sincronizadas pelo mesh");
  });

  test("triagePrompt: analyze-only with capped issue list contract", () => {
    const prompt = triagePrompt({ site, maxIssues: 15 });
    expect(prompt).toContain("SOMENTE ANÁLISE");
    expect(prompt).toContain("No máximo 15 issues");
    expect(prompt).toContain("tsc --noEmit");
    expect(prompt).toContain('"issues": [');
    expect(prompt).toContain("git checkout migration/tanstack");
  });

  test("fixIssuesPrompt inlines the batch and demands per-issue commits", () => {
    const prompt = fixIssuesPrompt({
      site,
      issues: [
        { number: 12, title: "build: imports preact", body: "## Erro\n..." },
        { number: 14, title: "rota / 500" },
      ],
      ghToken: "ghs_abc",
    });
    expect(prompt).toContain("Issue #12: build: imports preact");
    expect(prompt).toContain("Issue #14: rota / 500");
    expect(prompt).toContain("fix(#<número>)");
    expect(prompt).toContain("SOMENTE as issues listadas");
    expect(prompt).toContain('"resolved": [12]');
  });

  test("parityOnlyPrompt: measure-only with uploads", () => {
    const prompt = parityOnlyPrompt({
      site,
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
    expect(prompt).toContain("ANTHROPIC_API_KEY=sk-ant-xxx");
    expect(prompt).toContain("SOMENTE MEDIÇÃO");
    expect(prompt).toContain("https://storage/put-h0");
    expect(prompt).toContain("nenhuma correção nesta sessão");
  });
});

describe("issues lib", () => {
  test("titleHash is stable and normalizes whitespace/case", () => {
    expect(titleHash("Build:  Imports preact")).toBe(
      titleHash("build: imports PREACT"),
    );
    expect(titleHash("a")).not.toBe(titleHash("b"));
  });

  test("markerOf round-trips issueMarker", () => {
    const marker = issueMarker("site-1", titleHash("rota / 500"));
    expect(markerOf(`corpo da issue\n\n${marker}`)).toEqual({
      siteId: "site-1",
      hash: titleHash("rota / 500"),
    });
    expect(markerOf("sem marker")).toBeNull();
  });

  const issue = (
    number: number,
    labels: string[],
    title = `issue ${number}`,
  ): GithubIssue => ({ number, title, body: "", state: "open", labels });

  test("selectIssuesForFixSession: critical/high go alone", () => {
    const open = [
      issue(3, ["tanstack-migrator", "severity:medium", "visual"]),
      issue(1, ["tanstack-migrator", "severity:critical", "build"]),
      issue(2, ["tanstack-migrator", "severity:high", "runtime"]),
    ];
    const batch = selectIssuesForFixSession(open, 3);
    expect(batch.map((i) => i.number)).toEqual([1]);
  });

  test("selectIssuesForFixSession: medium/low batch by category", () => {
    const open = [
      issue(5, ["tanstack-migrator", "severity:medium", "visual"]),
      issue(6, ["tanstack-migrator", "severity:low", "visual"]),
      issue(7, ["tanstack-migrator", "severity:medium", "runtime"]),
      issue(8, ["tanstack-migrator", "severity:medium", "visual"]),
    ];
    const batch = selectIssuesForFixSession(open, 3);
    expect(batch.map((i) => i.number)).toEqual([5, 8, 6]);
  });

  test("selectIssuesForFixSession: blocked issues are skipped; all-blocked → empty", () => {
    const open = [
      issue(5, ["tanstack-migrator", "severity:critical", "tsm:blocked"]),
      issue(6, ["tanstack-migrator", "severity:medium", "visual"]),
    ];
    expect(selectIssuesForFixSession(open, 3).map((i) => i.number)).toEqual([
      6,
    ]);
    expect(
      selectIssuesForFixSession(
        [issue(5, ["tanstack-migrator", "tsm:blocked"])],
        3,
      ),
    ).toEqual([]);
  });

  test("paritySummaryToDrafts embeds heatmap + report link", () => {
    const drafts = paritySummaryToDrafts(
      {
        verdict: { status: "warn", score: 82 },
        topIssues: [
          {
            severity: "high",
            category: "visual",
            page: "/",
            summary: "Hero divergente",
            suggestedFix: "porte o HeroBanner",
          },
        ],
      },
      {
        reportHtml: "https://storage/report.html",
        heatmaps: ["https://storage/h0.png"],
      },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toContain("[parity] /");
    expect(drafts[0].body).toContain("![heatmap](https://storage/h0.png)");
    expect(drafts[0].body).toContain("https://storage/report.html");
    expect(drafts[0].body).toContain("porte o HeroBanner");
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
