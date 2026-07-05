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
import { redactSecrets } from "./sandbox/drivers/decopilot.ts";
import {
  CONVENTIONS_PATH,
  FIXES_PATH,
  FRAMEWORK_NOTES_PATH,
  fixIssuesPrompt,
  migrateScriptPrompt,
  PARITY_GOTCHAS_PATH,
  parityOnlyPrompt,
  parseResultJson,
  triagePrompt,
} from "./sandbox/templates/prompts.ts";
import {
  syncPackageScriptCommand,
  syncWorkflowYaml,
} from "./sandbox/templates/sync-files.ts";
import { looksLikeRealSite } from "./lib/preview.ts";
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

  test("migrateScriptPrompt never commits node_modules + is idempotent on re-run", () => {
    const prompt = migrateScriptPrompt({ site, ghToken: "ghs_abc" });
    // never vendor node_modules into the branch (wrong-version deps break dev)
    expect(prompt).toContain("git rm -r --cached");
    expect(prompt).toContain("node_modules");
    // skip the source copy when already migrated (no clobber on re-run)
    expect(prompt).toContain("if [ ! -f MIGRATION_REPORT.md ]");
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

  test("cross-migration memory: fix reads+writes all files, triage reads them", () => {
    const fix = fixIssuesPrompt({
      site,
      issues: [{ number: 12, title: "rota / 500" }],
    });
    // all four org-fs memory files are wired into the fix phase...
    for (const path of [
      FRAMEWORK_NOTES_PATH,
      FIXES_PATH,
      CONVENTIONS_PATH,
      PARITY_GOTCHAS_PATH,
    ]) {
      expect(fix).toContain(path);
    }
    // ...with append instructions (fix is where solutions get recorded)
    expect(fix).toContain(`>> ${FIXES_PATH}`);
    expect(fix).toContain(`>> ${PARITY_GOTCHAS_PATH}`);
    expect(fix).toContain("org-fs do Studio");

    // triage reads the playbook (but doesn't write fixes — analysis only)
    const triage = triagePrompt({ site, maxIssues: 15 });
    expect(triage).toContain(FIXES_PATH);
    expect(triage).not.toContain(`>> ${FIXES_PATH}`);

    // migrate-script records new setup gotchas in conventions
    const migrate = migrateScriptPrompt({ site });
    expect(migrate).toContain(`>> ${CONVENTIONS_PATH}`);
  });

  test("fixIssuesPrompt ships the proven deco.cx→TanStack loader recipes", () => {
    const prompt = fixIssuesPrompt({
      site,
      issues: [{ number: 1, title: "home em branco" }],
    });
    // the ctx-undefined recipe (the empty-page root cause)
    expect(prompt).toContain("ctx?: AppContext");
    expect(prompt).toContain("useDevice()");
    // the SEO defaultLoader recipe
    expect(prompt).toContain("@decocms/apps/website/components/Seo");
    expect(prompt).toContain("defaultLoader");
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
      "@decocms/parity@latest run --prod https://www.granado.com.br",
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

describe("redactSecrets (terminal/command output)", () => {
  test("masks token prefixes, bearer, and git x-access-token", () => {
    expect(
      redactSecrets("clone https://x-access-token:ghs_abc123def@github.com"),
    ).toContain("x-access-token:***@");
    expect(redactSecrets("export FOO=sk-ant-abc123def456")).toContain(
      "sk-ant-***",
    );
    expect(redactSecrets("Authorization: Bearer eyJhbGciOiJI")).toContain(
      "Bearer ***",
    );
  });

  test("masks query-string and JSON key/value secrets in output", () => {
    const qs = redactSecrets("GET /api?access_token=supersecretvalue&x=1");
    expect(qs).not.toContain("supersecretvalue");
    expect(qs).toContain("access_token=***");

    const json = redactSecrets('{"api_key": "supersecretvalue", "ok": true}');
    expect(json).not.toContain("supersecretvalue");
    expect(json).toContain("***");

    const env = redactSecrets("ANTHROPIC_API_KEY=sk-ant-longtokenvalue");
    expect(env).not.toContain("longtokenvalue");
  });

  test("leaves non-secret text untouched", () => {
    expect(redactSecrets("npm run build && vite dev")).toBe(
      "npm run build && vite dev",
    );
  });

  test("does not mask identifiers that merely contain a secret substring", () => {
    // 'monkey' contains 'key', 'tokenizer' starts with 'token', 'keyboard' too —
    // none are delimited secret keys, so they must stay readable in the terminal
    expect(redactSecrets("monkey=5 tokenizer=fast keyboard: qwerty12")).toBe(
      "monkey=5 tokenizer=fast keyboard: qwerty12",
    );
    // but a prefixed real key IS masked
    const masked = redactSecrets("github_token=ghlongsecretvalue");
    expect(masked).not.toContain("ghlongsecretvalue");
    expect(masked).toContain("github_token=***");
  });
});

describe("looksLikeRealSite (preview readiness)", () => {
  test("rejects the sandbox proxy placeholder", () => {
    const placeholder = `<!DOCTYPE html><html><head><title>Preview</title></head><body><div style="padding:2rem"><h1>No web page at this URL</h1><p>The dev server is running but doesn't serve HTML at /.</p></div></body></html>`;
    expect(looksLikeRealSite(placeholder)).toBe(false);
  });

  test("rejects an empty SSR shell even when scripts inflate the size", () => {
    const shell = `<!DOCTYPE html><html><head>${"<script src='/x.js'></script>".repeat(30)}</head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
    expect(shell.length).toBeGreaterThan(800); // would pass a naive size gate
    expect(looksLikeRealSite(shell)).toBe(false);
  });

  test("rejects an empty shell whose only text is a <noscript> fallback", () => {
    const shell = `<html><head><title>App</title></head><body><noscript>You need to enable JavaScript to run this app. Please turn it on and reload the page.</noscript><div id="root"></div></body></html>`;
    expect(looksLikeRealSite(shell)).toBe(false);
  });

  test("accepts a rendered page with visible text", () => {
    const rendered = `<!DOCTYPE html><html><head><title>Granado</title></head><body><div id="root"><header><nav>Início Produtos Contato</nav></header><main><h1>Bem-vindo à Granado</h1><p>Perfumaria e cosméticos desde 1870.</p></main></div></body></html>`;
    expect(looksLikeRealSite(rendered)).toBe(true);
  });

  test("accepts a text-light page that has a real element tree", () => {
    const gallery = `<html><body><div id="root"><section><img/><img/><img/></section><section><img/><img/></section><footer><ul><li></li><li></li></ul></footer></div></body></html>`;
    expect(looksLikeRealSite(gallery)).toBe(true);
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
