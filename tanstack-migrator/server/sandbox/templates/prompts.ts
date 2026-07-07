/**
 * Prompts for the bounded decopilot sessions that drive a migration inside
 * a mesh sandbox. The session agent has the vm tools (bash/read/write) bound
 * to the site's sandbox, plus the org's MCP tools — including this MCP's
 * MIGRATION_REPORT_PROGRESS for granular progress callbacks.
 *
 * v0.5.0 pipeline: each phase is ONE short session with a narrow contract —
 * the durable memory between sessions lives in GitHub (branch commits +
 * issues), not in the session context.
 *
 * Contract: the FINAL assistant message must contain a single line starting
 * with RESULT_JSON: followed by one JSON object (shape depends on the phase).
 */

import type { SiteRow } from "../../db/types.ts";

export const RESULT_MARKER = "RESULT_JSON:";

/**
 * Cross-migration memory lives in the Studio org-fs (`/app/org` — the same mount
 * the repo's `org` symlink points at) mounted into every sandbox, so these files
 * persist across sandboxes and sites. The agent reads them at session start and
 * appends one-liners when it learns something reusable — turning per-site
 * discovery into shared knowledge. NOT Supabase on purpose: the knowledge
 * belongs to the org's filesystem, reachable by the agent itself.
 *
 *  - framework-notes: SUSPICIONS  ("this looks like a framework bug")
 *  - fixes:           SOLUTIONS   ("this error → this fix worked")
 *  - conventions:     SETUP GOTCHAS of the migration itself
 *  - parity-gotchas:  recurring VISUAL mismatches and how they were resolved
 */
export const MEMORY_DIR = "/app/org/home/.tanstack-migrator";
export const FRAMEWORK_NOTES_PATH = `${MEMORY_DIR}/framework-notes.md`;
export const FIXES_PATH = `${MEMORY_DIR}/fixes.md`;
export const CONVENTIONS_PATH = `${MEMORY_DIR}/conventions.md`;
export const PARITY_GOTCHAS_PATH = `${MEMORY_DIR}/parity-gotchas.md`;

interface MemorySpec {
  path: string;
  /** one-line description of what the file holds */
  holds: string;
  /** how to use what it says (read guidance) */
  read: string;
  /** condition to append a line (omit = read-only for this phase) */
  writeWhen?: string;
  /** the payload after the `timestamp | site` columns */
  entry?: string;
}

/**
 * Render the shared "# Cross-migration memory" section for a phase prompt from
 * a list of file specs. Keeps every phase's memory instructions consistent
 * (same dir, same one-line-append discipline, same dedupe rule).
 */
function memorySection(site: SiteRow, specs: MemorySpec[]): string {
  const blocks = specs.map((s) => {
    const lines = [
      `- **${s.path}** — ${s.holds}`,
      `  READ at the start (\`cat ${s.path} 2>/dev/null\`): ${s.read}`,
    ];
    if (s.writeWhen) {
      lines.push(
        `  APPEND when ${s.writeWhen}: \`mkdir -p ${MEMORY_DIR} && echo "$(date -u +%FT%TZ) | ${site.name} | ${s.entry}" >> ${s.path}\``,
      );
    }
    return lines.join("\n");
  });
  return `# Cross-migration memory (Studio org-fs — persists across sandboxes)
Shared org files already mounted in the sandbox. Rule: ONE-line entries; do NOT duplicate a line that already has an equivalent.
${blocks.join("\n")}`;
}

// Reusable specs (read guidance/write conditions are phase-agnostic).
const FRAMEWORK_NOTES_SPEC: MemorySpec = {
  path: FRAMEWORK_NOTES_PATH,
  holds:
    "SUSPECTED framework-bug errors (@decocms/start / @decocms/apps) seen in previous migrations",
  read: 'if any matches what you found, cite it in the issue body ("already seen in N sites — likely a framework bug")',
  writeWhen:
    "you find a NEW error that looks like a framework bug (stack inside node_modules of @decocms/*, or a pattern not fixable in the site code)",
  entry: "<short error signature> | <file:line or package>",
};
const FIXES_SPEC: MemorySpec = {
  path: FIXES_PATH,
  holds: "fix recipes that ALREADY WORKED on other sites (error → solution)",
  read: "if one of your errors matches a recipe, APPLY IT before investigating from scratch",
};
const CONVENTIONS_SPEC: MemorySpec = {
  path: CONVENTIONS_PATH,
  holds:
    "migration setup conventions/gotchas (predev, `org` symlink, dev port, no rsync available, etc.)",
  read: "check whether any applies to this repo before starting",
};
const PARITY_GOTCHAS_SPEC: MemorySpec = {
  path: PARITY_GOTCHAS_PATH,
  holds: "recurring VISUAL mismatches and how they were resolved",
  read: "useful for visual/content issues and to reach parity faster",
};

export interface ParityArtifactUrls {
  reportHtmlPut?: string;
  reportJsonPut?: string;
  heatmapPuts?: string[];
}

/** Issue proposed by a triage/parity session — the MCP turns it into a GitHub issue. */
export interface IssueDraft {
  title: string;
  body?: string;
  severity?: string;
  category?: string;
  page?: string;
}

export interface SessionResult {
  ok: boolean;
  parityScore?: number;
  detail?: string;
  /** triage: problems to persist as GitHub issues. */
  issues?: IssueDraft[];
  /** fix: GitHub issue numbers the session claims to have resolved (pushed). */
  resolved?: number[];
  /** fix: issues the session could not resolve, with the reason. */
  blocked?: Array<{ number: number; reason?: string }>;
}

/**
 * First balanced {...} object in `text` — brace scanner that respects JSON
 * strings/escapes. A non-greedy regex truncates at the first `}` and breaks
 * any payload with nested objects (issues[], blocked[]).
 */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseResultJson(output: string): SessionResult | null {
  const idx = output.lastIndexOf(RESULT_MARKER);
  if (idx === -1) return null;
  const json = extractBalancedJson(output.slice(idx + RESULT_MARKER.length));
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[])
          .filter(
            (i): i is Record<string, unknown> =>
              !!i &&
              typeof i === "object" &&
              typeof (i as Record<string, unknown>).title === "string",
          )
          .map((i) => ({
            title: String(i.title),
            body: typeof i.body === "string" ? i.body : undefined,
            severity: typeof i.severity === "string" ? i.severity : undefined,
            category: typeof i.category === "string" ? i.category : undefined,
            page: typeof i.page === "string" ? i.page : undefined,
          }))
      : undefined;
    const resolved = Array.isArray(parsed.resolved)
      ? (parsed.resolved as unknown[]).filter(
          (n): n is number => typeof n === "number" && Number.isInteger(n),
        )
      : undefined;
    const blocked = Array.isArray(parsed.blocked)
      ? (parsed.blocked as unknown[])
          .filter(
            (b): b is Record<string, unknown> =>
              !!b &&
              typeof b === "object" &&
              typeof (b as Record<string, unknown>).number === "number",
          )
          .map((b) => ({
            number: b.number as number,
            reason: typeof b.reason === "string" ? b.reason : undefined,
          }))
      : undefined;

    return {
      ok: parsed.ok === true,
      parityScore:
        typeof parsed.parityScore === "number" ? parsed.parityScore : undefined,
      detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
      issues,
      resolved,
      blocked,
    };
  } catch {
    return null;
  }
}

const progressInstruction = (site: SiteRow) =>
  `If the MIGRATION_REPORT_PROGRESS tool (tanstack-migrator MCP) is available, call it after completing relevant steps with {"siteId": "${site.id}", "detail": "<what you just did>"} (and "parityScore" when you have a new score). If it is NOT in your tool set, proceed without reporting — NEVER try to call it blindly. Most important: the RESULT_JSON line at the end of your last message is MANDATORY in every scenario — emit it before any optional step.`;

function repoUrl(full: string | null, ghToken?: string): string {
  if (!full) throw new Error("repo not set");
  return ghToken
    ? `https://x-access-token:${ghToken}@github.com/${full}.git`
    : `https://github.com/${full}.git`;
}

const gitAuthNote = (ghToken?: string) =>
  ghToken
    ? ""
    : "\nNote: the sandbox git is already authenticated (credentials synced by the mesh) — clone and push work with the normal https URLs.";

// The dev server port is determined by the project's script (wrangler uses 5173
// by default when @cloudflare/vite-plugin is configured). NEVER kill the
// existing process managed by the daemon — just detect the real port.
const DEV_PORT = 5173; // fallback; always confirm with DEV_LOG

/**
 * Idempotent "start script" that EVERY session (triage/fix/parity) runs as
 * step 0. The sandbox can arrive in any state — fresh clone post-recreate,
 * sandbox reaped+recreated, or stale generates — so before any work the agent
 * brings the project to a known-good state:
 *   0. /app/source (clone of the original deco.cx) — DISAPPEARS on sandbox
 *      recreate (the clone only ran during migrate); without it fix has
 *      nothing to port from
 *   1. correct branch + pull of the latest push
 *   2. clean deps (node_modules NEVER comes from the branch — it is gitignored)
 *   3. gitignored generates (routeTree.gen.ts, *.gen.* of cms/admin) — without
 *      them the router has no routes and dev serves the "No web page" placeholder
 *   4. dev server up and serving real HTML (starts only if not already serving)
 * This makes each phase self-healing: it does not depend on the sandbox having
 * been recreated correctly in the previous phase.
 */
function ensureReadyPreamble(site: SiteRow, ghToken?: string): string {
  const branch = site.work_branch;
  const sourceUrl = repoUrl(site.source_repo, ghToken);
  return `# Setup (run THIS FIRST, always — brings the project up before anything else)
This block is idempotent and self-healing: run it in full before analyzing/fixing/measuring. Do not skip.
\`\`\`bash
# /app/source = pristine clone of the original deco.cx site (to port components/compare). DISAPPEARS on
# sandbox recreate — re-clones idempotently. NEVER modify it or run migrate on it.
[ -d /app/source/.git ] || git clone --depth 1 -b ${site.source_branch} ${sourceUrl} /app/source 2>/dev/null || true
cd /app/repo && git checkout ${branch} && git pull origin ${branch} 2>/dev/null || true
rm -f org 2>/dev/null || true                          # sandbox mount symlink
[ -d node_modules ] || bun install || npm install       # clean deps (node_modules is gitignored — never comes from the branch)
# gitignored generates: without routeTree.gen.ts the router has no routes → "No web page" placeholder
if [ ! -f src/routeTree.gen.ts ]; then bun run predev 2>/dev/null || npm run predev 2>/dev/null || bun run build 2>/dev/null || npm run build 2>/dev/null || true; fi
# dev server: start only if not already serving (the sandbox daemon may have already started it)
DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log 2>/dev/null | tail -1 | cut -d: -f2 || echo ${DEV_PORT})
curl -sf "http://localhost:$DEV_PORT/" >/dev/null 2>&1 || { nohup bun run dev > /tmp/dev.log 2>&1 & sleep 20; DEV_PORT=$(grep -oE "localhost:[0-9]+" /tmp/dev.log | tail -1 | cut -d: -f2 || echo ${DEV_PORT}); }
\`\`\`
Do NOT kill the dev process managed by the daemon nor force \`--port\`. If after this block \`curl http://localhost:$DEV_PORT/\` STILL returns the "No web page at this URL" placeholder or an empty shell, then the SSR is genuinely broken — investigate \`tail -80 /tmp/dev.log\`.`;
}

/**
 * Phase migrating_script: run the migrate script and push the checkpoint to
 * the work branch. Deliberately does NOT fix the build — that's the fixing
 * loop's job, driven by GitHub issues. Ending at the checkpoint keeps the
 * session far from the turn/window limit that killed the monolithic design.
 */
export function migrateScriptPrompt(input: {
  site: SiteRow;
  ghToken?: string;
}): string {
  const { site, ghToken } = input;
  const sourceUrl = repoUrl(site.source_repo, ghToken);
  const targetUrl = repoUrl(site.target_repo, ghToken);
  const branch = site.work_branch;
  const workerName = (site.target_repo ?? "").split("/").pop() || "site";

  return `You are deco's Fresh→TanStack migration agent. Work inside the sandbox using the vm tools (bash, read, write). Be direct and do not ask for confirmation — run to completion.

# Goal (CLOSED SCOPE)
Run the migration script from ${site.source_repo} (Fresh/Deno) to TanStack Start and push the RAW result to branch ${branch} of ${site.target_repo}. Do NOT fix build/typecheck errors in this session — the problems will be catalogued as issues and resolved in later sessions.

# Golden rule
Never go more than 10 minutes without \`git commit\` + \`git push\` — all progress must survive a session crash.

# Steps
1. If /app/source does not exist yet: \`git clone --depth 1 -b ${site.source_branch} ${sourceUrl} /app/source\` (pristine copy of the original site — NEVER modify it or run the migration script on it).
2. The target repo is ALREADY cloned by the sandbox at /app/repo (origin = ${targetUrl}). Enter it and SYNC with the remote BEFORE anything else (the sandbox clone may be stale — fixes may have been pushed externally; on a re-run this avoids overwriting work): \`cd /app/repo && rm -f org && git fetch origin ${branch} 2>/dev/null && git checkout -B ${branch} FETCH_HEAD 2>/dev/null || git checkout -B ${branch}\` (the \`org -> ../org\` symlink is a sandbox mount — always remove it). IDEMPOTENCY: only copy the original if this is a NEW migration (no MIGRATION_REPORT.md) — on a re-run, copying over it overwrites the migrated result. And NEVER copy \`node_modules\`/build artifacts (vendoring wrong-version deps into the branch breaks dev in the sandbox — the daemon does a clean install). Copy WITHOUT rsync (not present in the image): \`if [ ! -f MIGRATION_REPORT.md ]; then shopt -s dotglob && for f in /app/source/*; do b=$(basename "$f"); case "$b" in .git|node_modules|dist|.wrangler|.vite|.tanstack|.cache) continue;; esac; cp -r "$f" .; done; fi\`.
3. In /app/repo: \`npm install @decocms/start tsx\` and run the migration script IN PLACE (the script TRANSFORMS the directory passed as --source): \`npx tsx node_modules/@decocms/start/scripts/migrate.ts --source /app/repo\`. It runs 7 phases (analyze, scaffold, transform, cleanup, report, verify, bootstrap). If /app/repo already has a MIGRATION_REPORT.md from a previous run, skip this step.
4. CRITICAL for the sandbox preview to render (config PROVEN on sites running in the agentic CMS, e.g. granadobr-tanstack): the sandbox daemon runs \`bun run dev\` = \`vite dev\` DIRECTLY and \`src/setup.ts\` imports \`./server/cms/blocks.gen\` STATICALLY. If any deco gen is missing from the clone, the SSR blows up and \`/\` responds non-HTML → the proxy serves "No web page". Under \`vite dev\` only the **routeTree** is regenerated reliably (tanstackStart plugin). Therefore:
   a. \`package.json\`: \`"dev": "vite dev"\` (WITHOUT \`predev\` — if a \`predev\` script exists, the daemon's \`bun run dev\` triggers the lifecycle and diverges from what works; REMOVE the \`predev\`). Keep \`build\` with the full generates chain + \`vite build\`, and the \`generate:*\` scripts.
   b. Run the generates once: \`npm install @decocms/start tsx && npm run build\` (or the generates chain without the \`vite build\`).
   c. \`.gitignore\`: ignore **only** \`src/routeTree.gen.ts\` and \`.tanstack/\` (tanstackStart regenerates the routeTree). REMOVE any line that ignores \`src/server/cms/*.gen.*\`, \`blocks.gen.*\` or \`src/server/admin/*.gen.*\`.
   d. COMMIT all gens (except the routeTree), with \`git add -f\` if needed: \`src/server/cms/blocks.gen.json\`, \`src/server/cms/blocks.gen.ts\`, \`src/server/cms/sections.gen.ts\`, \`src/server/cms/loaders.gen.ts\`, \`src/server/admin/meta.gen.json\`, \`src/server/invoke.gen.ts\` and \`src/*/manifest.gen.ts\`.
   e. \`wrangler.jsonc\` deploy-ready (CF's Workers Builds uses this): \`"name": "${workerName}"\` (do NOT leave "repo"), \`"account_id": "c95fc4cec7fc52453228d9db170c372c"\` (deco-cx), \`"main": "./src/worker-entry.ts"\`, \`"compatibility_flags": ["nodejs_compat", "no_handle_cross_request_promise_resolution"]\`, \`"workers_dev": true\` and \`"preview_urls": true\` (enables a per-PR preview URL). Same as the working granadobr-tanstack.
5. Final checkpoint. BEFORE the commit, make sure \`node_modules\`/artifacts NEVER go to the branch (a committed node_modules carries wrong-version deps — e.g. a vite different from package.json — and breaks dev in the sandbox): \`grep -qxF 'node_modules/' .gitignore 2>/dev/null || printf '\\nnode_modules/\\ndist/\\n.wrangler/\\n.vite/\\n' >> .gitignore; git rm -r --cached --quiet node_modules dist .wrangler .vite 2>/dev/null || true\` (do NOT remove the deco \`*.gen.*\` nor the \`.tanstack\` already handled in step 4). Then ALSO commit the gens from step 4d and: \`git add -A && git add -f src/server/cms/*.gen.* src/server/admin/*.gen.* src/server/invoke.gen.ts && git commit -m "feat: tanstack migration (script output + committed gens)" && git push -u -f origin ${branch}\` (the branch is managed by the migration — the force is safe).
6. STOP HERE. Do not fix build errors — that is for the next phases.
${gitAuthNote(ghToken)}
${progressInstruction(site)}

${memorySection(site, [
  {
    ...CONVENTIONS_SPEC,
    writeWhen:
      "you discover a NEW setup step not in the Steps above (e.g. an extra script needed to bring dev up, a missing dependency)",
    entry: "<setup convention/gotcha in one line>",
  },
])}

# Result
End your LAST message with a single line in exactly this format:
RESULT_JSON: {"ok": true, "detail": "script ran, checkpoint pushed to branch ${branch}"}
(ok=false with detail explaining the blocker if you cannot finish)`;
}

const ISSUE_BODY_TEMPLATE = `## Context
<affected file(s)/page(s) and what should happen>
## Error
<error message or observed behavior (literal snippet)>
## How to reproduce
<command or URL>
## Fix hint
<direction: which component to port from /app/source, which import to swap, etc.>`;

/**
 * Phase triaging: analyze-only survey of the migrated code. Its issues[]
 * become GitHub issues (created MCP-side, deduped, capped) — the durable
 * backlog that the fixing loop drains.
 */
export function triagePrompt(input: {
  site: SiteRow;
  maxIssues: number;
}): string {
  const { site, maxIssues } = input;

  return `You are the triage agent for the migration ${site.source_repo} → ${site.target_repo} (branch ${site.work_branch}). Work inside the sandbox using the vm tools (bash, read, write). Do not ask for confirmation.

# Goal (ANALYSIS ONLY — DO NOT FIX ANYTHING)
Survey the REAL problems in the migrated code at /app/repo and report them as issues in RESULT_JSON. Each issue must be resolvable WITHOUT any context beyond its own text.

# What "done" means (READ FIRST)
The success criterion for this migration is: **\`npm run build\` passes** (exit 0) + the site responds with HTML + visual parity matches. It is NOT a zeroed \`tsc --noEmit\`. \`npm run build\` runs the codegen (generate:blocks/sections/loaders/schema/invoke) and Vite/esbuild — which does NOT do strict type-checking. \`tsc\` errors that do NOT break \`npm run build\` are **type debt**, not blockers: report them as severity "low", never critical/high.

${ensureReadyPreamble(site)}

# Survey (in this order of priority)
1. **Build (critical gate)**: \`npm run build 2>&1 | tail -60\`. If it FAILS (exit≠0), the error(s) breaking the build are the critical/high issues — focus on them.
2. **Runtime — the site MUST render HTML (prerequisite for parity)**: with dev already up from Setup, \`curl -sL http://localhost:$DEV_PORT/ 2>&1 | head -120\`:
   a. If it returns **"No web page at this URL"** (sandbox placeholder) OR a nearly empty shell (just \`<div id="root"></div>\` with no content) → the **SSR is broken**: dev comes up but \`/\` does not return rendered HTML (severity **high**, category **runtime**). Common cause #1: **node_modules with the wrong version** (if it was committed to the branch, e.g. vite ≠ package.json) — the fix is \`rm -rf node_modules && npm install\` and never committing node_modules. Also investigate \`tail -80 /tmp/dev.log\` for the SSR stack (\`is not a function\`, missing module) and open the file:line.
   a2. If \`/\` RETURNS HTML (200, thousands of bytes) but contains \`Switched to client rendering because the server rendering errored\` → the SSR **degraded to client-render**: the page renders, but with a real SSR bug (severity **medium**, runtime). Grep the stack: \`curl -sL http://localhost:$DEV_PORT/ | grep -o "server rendering errored[^<]*"\` and \`tail -80 /tmp/dev.log\`. MOST common cause: **client-only globals used in the server render** (\`globalThis.location\`, \`window\`, \`document\`) → yields \`Cannot read properties of undefined (reading 'href')\`. Fix: guard with \`typeof window !== "undefined"\` (or move to useEffect). Report with the file:line.
   b. If \`/\` renders but the blocks are empty: \`ls .deco/blocks/ 2>/dev/null | head -20\` — check that the \`__resolveType\` values match the exports of \`src/sections/\` and \`src/apps/\`.
   c. Test routes: home, category, product (URLs in /app/source/routes/).
3. SECONDARY typecheck: \`npx tsc --noEmit 2>&1 | head -60\` — ONLY if the build passed. Group by root cause; these go in as severity "low" (type debt), since they block neither deploy nor parity.
4. Compare with /app/source: sections/components that exist there and were not ported (those ARE relevant — visual/content).

# IMPORTANT RULES
- **NEVER report an issue to edit \`*.gen.ts\` files** (manifest.gen, invoke.gen, meta.gen, etc.) — they are REGENERATED by \`npm run build\`. If a \`*.gen\` import is broken, the issue is "run npm run build/generate", not "edit the file".
- **Suspected framework bug**: if an error seems to come from \`@decocms/start\` or \`@decocms/apps\` (the stack points inside node_modules of those packages, or it is a pattern that cannot be fixed in the site code), prefix the title with \`[framework?]\` and use category **infra** — the MCP catalogs these to detect recurring framework bugs across sites.
- If \`npm run build\` already passes AND the site renders real HTML at \`/\`, most of the work is done — report few issues (only what affects parity/visual).

${memorySection(site, [
  FRAMEWORK_NOTES_SPEC,
  FIXES_SPEC,
  CONVENTIONS_SPEC,
  PARITY_GOTCHAS_SPEC,
])}

# Issue format
- At most ${maxIssues} issues, ordered from most to least severe.
- severity: "critical" (npm run build fails) | "high" (route 500/page does not render) | "medium" (missing section, hydration, broken visual) | "low" (tsc type debt, warning, style).
- category: "build" | "runtime" | "visual" | "content" | "infra".
- body ≤ 1200 characters, following the template:
${ISSUE_BODY_TEMPLATE}

${progressInstruction(site)}

# Result
End your LAST message with a single line in exactly this format (valid JSON, one line):
RESULT_JSON: {"ok": true, "detail": "<summary: N issues, overall state>", "issues": [{"title": "...", "body": "...", "severity": "critical", "category": "build", "page": "/"}]}
(ok=false only if you could not even analyze the repo)`;
}

/**
 * Phase fixing: resolve ONLY the listed issues (bodies inlined — the session
 * has no GitHub access). One commit per issue so progress is auditable.
 */
export function fixIssuesPrompt(input: {
  site: SiteRow;
  issues: Array<{ number: number; title: string; body?: string }>;
  ghToken?: string;
}): string {
  const { site, issues, ghToken } = input;
  const targetUrl = repoUrl(site.target_repo, ghToken);
  const list = issues
    .map(
      (i) =>
        `## Issue #${i.number}: ${i.title}\n${(i.body ?? "(no body)").slice(0, 1500)}`,
    )
    .join("\n\n");

  return `You are the fix agent for the migration ${site.source_repo} → ${site.target_repo} (branch ${site.work_branch}). Work inside the sandbox using the vm tools (bash, read, write). Do not ask for confirmation.

# Goal (CLOSED SCOPE)
Resolve ONLY the issues listed below. Do not refactor anything outside them, do not "take the opportunity to improve" other things.

${ensureReadyPreamble(site, ghToken)}

# Rules
- Branch remote: ${targetUrl} (the Setup above already did checkout + pull).
- Golden rule: NEVER rewrite components — port the original from /app/source with mechanical changes (preact→react imports, class→className, signals→react state). Consult /app/source whenever you need the original behavior.
- **NEVER edit \`*.gen.ts\` files** (manifest.gen, invoke.gen, meta.gen…) — they are regenerated by \`npm run build\`. If an issue points to an error in a \`.gen\`, the fix is to run \`npm run build\` (which runs the codegen) and verify it is gone — do NOT edit the file by hand (it would be overwritten).
- ONE commit PER resolved issue, message \`fix(#<number>): <what you did>\` and push at the end of each one: \`git push origin ${site.work_branch}\`. Never go >10min without commit+push.
- **Validation criterion = \`npm run build\` (exit 0)**, not \`tsc --noEmit\`. The build runs the codegen + Vite/esbuild (which does not do strict type-checking). \`tsc\` errors that do not break the build are acceptable type debt — resolve what the issue asks without fixating on zeroing tsc. For runtime/visual issues, confirm the affected route responds (dev is already up from Setup).
- **The preview MUST render (prerequisite for parity)**: for runtime/SSR issues, the fix is only done when \`curl -sL http://localhost:$DEV_PORT/\` returns genuinely rendered HTML — NOT the "No web page at this URL" placeholder nor an empty shell (\`<div id="root"></div>\` with no content). If a placeholder/shell still shows up, the SSR is still broken: read \`tail -80 /tmp/dev.log\`, find the stack and the file:line, and fix it for real before marking as resolved.
- **Before investigating from scratch, consult the "Cross-migration memory" below** — a known recipe may resolve it instantly, and what you learn here feeds the next sites. If you conclude that an error comes from the framework, mark the issue as blocked with reason \`[framework?]\` in addition to recording it in memory.
- If an issue is impossible, is already resolved (e.g. the build now passes and the error is gone after the codegen), or depends on another, mark it as blocked/resolved with the reason and move on.

${memorySection(site, [
  FRAMEWORK_NOTES_SPEC,
  {
    ...FIXES_SPEC,
    writeWhen:
      "you resolve a runtime/build error and CONFIRM it is gone (build passes / route responds)",
    entry: "<error signature> → <what fixed it: file/import/short patch>",
  },
  {
    ...CONVENTIONS_SPEC,
    writeWhen: "you discover a new setup gotcha during the fix",
    entry: "<convention/gotcha in one line>",
  },
  {
    ...PARITY_GOTCHAS_SPEC,
    writeWhen: "you resolve a visual/content mismatch",
    entry: "<visual mismatch> → <how you resolved it>",
  },
])}

# Known recipes (patterns that ALREADY worked on deco.cx→TanStack migrations)
If the error matches one of these, apply it directly — do not reinvent nor spend the session investigating loader by loader:
- **Section loader uses \`ctx.something\` and throws \`Cannot read properties of undefined\`** (e.g. \`ctx.device\`, \`ctx.invoke\`, \`ctx.salesforce\`, \`ctx.features\`): \`@decocms/start\` invokes the loader as \`(props, req)\` — the 3rd arg \`ctx\` is almost always \`undefined\` (start only composes device/search params; salesforce/features/invoke are NOT always injected). Proven fix: make \`ctx\` OPTIONAL (\`ctx?: AppContext\`) and use optional-chaining on EVERY access, with a fallback: \`ctx?.device\`, \`ctx?.salesforce?.x\`, \`ctx?.features?.y ?? false\`. For device in the component, use the \`useDevice()\` hook from \`@decocms/start/sdk/useDevice\` (not \`ctx.device\`). And do NOT do heavy fetching via \`ctx.invoke\` inside the section loader — the loader should only derive cheap props. (This unblocks the whole home: each loader that throws leaves its section empty → blank page.)
- **\`defaultLoader\`/\`DefaultProps\` not defined** (SEO sections like SeoPDP/SeoPLP): these are deco.cx Fresh conventions that do not exist in start. Proven fix: import \`renderTemplateString\`, \`type SEOSection\`, \`type Props as SeoProps\` from \`@decocms/apps/website/components/Seo\` and do the title/description/canonical normalization INLINE (signature \`(props, req): SeoProps\`, without \`ctx\` or \`defaultLoader\`).
Both have their root cause in the \`@decocms/start\` migrate transform (it does not convert deco.cx's \`ctx.*\`/\`defaultLoader\` API) — record it in \`framework-notes.md\` with the \`[framework?]\` prefix.

# Issues to resolve
${list}

${progressInstruction(site)}

# Result
End your LAST message with a single line in exactly this format (valid JSON, one line):
RESULT_JSON: {"ok": true, "detail": "<summary>", "resolved": [${issues[0]?.number ?? 12}], "blocked": [{"number": 34, "reason": "..."}]}
(resolved = issues with the fix COMMITTED AND PUSHED; ok=false only if you could not work)`;
}

/**
 * Phase paritying: measure-only parity run. The MCP converts the report's
 * topIssues into GitHub issues (deduped against the open backlog).
 */
export function parityOnlyPrompt(input: {
  site: SiteRow;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  artifacts?: ParityArtifactUrls;
}): string {
  const { site, artifacts } = input;
  const parityEnv = [
    input.anthropicApiKey ? `ANTHROPIC_API_KEY=${input.anthropicApiKey}` : "",
    input.openrouterApiKey
      ? `OPENROUTER_API_KEY=${input.openrouterApiKey}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const uploadSteps: string[] = [];
  if (artifacts?.reportHtmlPut) {
    uploadSteps.push(
      `curl -sf -X PUT -H "Content-Type: text/html" --upload-file "$RUN_DIR/report.html" '${artifacts.reportHtmlPut}'`,
    );
  }
  if (artifacts?.reportJsonPut) {
    uploadSteps.push(
      `curl -sf -X PUT -H "Content-Type: application/json" --upload-file "$RUN_DIR/report.json" '${artifacts.reportJsonPut}'`,
    );
  }
  (artifacts?.heatmapPuts ?? []).forEach((url, i) => {
    uploadSteps.push(
      `H=$(ls "$RUN_DIR"/screenshots/heatmap_*.png 2>/dev/null | sed -n '${i + 1}p'); [ -n "$H" ] && curl -sf -X PUT -H "Content-Type: image/png" --upload-file "$H" '${url}' || true`,
    );
  });

  // Parity measures against the real CF worker URL (deploy happens before parity).
  // The sandbox dev server is still useful for console.log debugging — keep it
  // running but do NOT use localhost as the candidate.
  const candUrl =
    site.cf_deploy_url ??
    `https://${(site.target_repo ?? "").split("/").pop()}.deco-cx.workers.dev`;

  return `You are the parity-measurement agent for the migration ${site.source_repo} → ${site.target_repo} (branch ${site.work_branch}). Work inside the sandbox using the vm tools (bash, read, write). Do not ask for confirmation.

# Goal (MEASUREMENT ONLY — DO NOT FIX ANYTHING)
Run the parity CLI comparing production vs candidate (the real Cloudflare Workers URL), upload the artifacts and report the score. The problems become GitHub issues and will be fixed in other sessions.

# Candidate (real URL — NOT localhost)
The candidate is the URL of the already-deployed CF worker: **${candUrl}**
The dev server on localhost stays up for console.log debugging, but the MEASUREMENT is always against the real URL.

# Steps
1. Run the parity CLI (always use @latest): \`cd /app/repo && ${parityEnv} npx -y @decocms/parity@latest run --prod ${site.prod_url} --cand "${candUrl}" --preset ci\`
2. Locate the run directory: \`RUN_DIR=$(ls -td parity-output/runs/*/ | head -1)\` and read $RUN_DIR/report.json.
${uploadSteps.length > 0 ? `3. Upload the artifacts:\n${uploadSteps.map((s) => `   ${s}`).join("\n")}` : "3. (no artifact upload configured)"}
4. Extract verdict.score from report.json and STOP — no fixes in this session.

${progressInstruction(site)}

# Result
End your LAST message with a single line in exactly this format:
RESULT_JSON: {"ok": true, "parityScore": <verdict.score from report.json>, "detail": "<summary of the report>"}
(ok=false only if the parity CLI could not even run)`;
}

/**
 * Phase baselining: capture the production site's Lighthouse / SEO snapshot
 * BEFORE the migration starts. Runs parity with --prod == --cand (same URL)
 * so the visual diff is always 0 % / 100 score, but the report.json contains
 * per-page Lighthouse data (performance, SEO, accessibility) that serves as the
 * "before" baseline for the before/after comparison in the UI.
 * Failure is soft — the phase logs a warning and advances to migrating_script.
 */
export function baselinePrompt(input: {
  site: SiteRow;
  putUrls: { reportJson?: string; reportHtml?: string };
}): string {
  const { site, putUrls } = input;
  const reportJsonPut = putUrls.reportJson
    ? `curl -s -X PUT -H "Content-Type: application/json" --data-binary @"$RUN_DIR/report.json" "${putUrls.reportJson}"`
    : "# (no OBJECT_STORAGE configured — artifact will not be saved)";
  const reportHtmlPut = putUrls.reportHtml
    ? `curl -s -X PUT -H "Content-Type: text/html" --data-binary @"$RUN_DIR/report.html" "${putUrls.reportHtml}"`
    : "";

  return `You are the baseline agent for the migration ${site.source_repo}. Work inside the sandbox using the vm tools (bash, read, write). Do not ask for confirmation.

# Goal (MEASUREMENT ONLY — DO NOT FIX ANYTHING)
Capture a Lighthouse/SEO snapshot of the production site BEFORE any change, using the parity CLI with --prod == --cand (same URL). The visual score will be ~100 %; what matters is the report.json with the per-page metrics.

# Steps
\`\`\`bash
cd /app/repo
[ -d node_modules ] || bun install || npm install

# 1. Run the parity CLI with prod == cand (baseline of the original site)
npx @decocms/parity@latest run \\
  --prod "${site.prod_url}" \\
  --cand "${site.prod_url}" \\
  --preset ci 2>&1 | tee /tmp/baseline-parity.log

# 2. Locate the most recent run directory
RUN_DIR=$(ls -td parity-output/runs/*/ 2>/dev/null | head -1)
echo "RUN_DIR=$RUN_DIR"

# 3. Upload the artifacts (if OBJECT_STORAGE is configured)
if [ -f "$RUN_DIR/report.json" ]; then
  ${reportJsonPut}
fi
${reportHtmlPut ? `if [ -f "$RUN_DIR/report.html" ]; then\n  ${reportHtmlPut}\nfi` : ""}

# 4. Extract verdict.score
cat "$RUN_DIR/report.json" | head -100
\`\`\`

${progressInstruction(site)}

# Result
End your LAST message with a single line in exactly this format:
RESULT_JSON: {"ok": true, "parityScore": <verdict.score from report.json, typically 100>, "detail": "<summary of the captured metrics>"}
(ok=false only if the parity CLI could not even run — do not fail because of bad metrics)`;
}

/**
 * Phase deploying_cf: build the site and deploy to Cloudflare Workers via
 * `wrangler deploy` (direct upload — no dashboard, no git integration).
 * Requires CLOUDFLARE_API_TOKEN injected via the prompt env block.
 * Returns the deployed URL in RESULT_JSON.deployUrl.
 */
export function deployPrompt(input: {
  site: SiteRow;
  cfApiToken: string;
}): string {
  const { site, cfApiToken } = input;
  const workerName = (site.target_repo ?? "").split("/").pop() || "site";

  return `You are the Cloudflare deploy agent for the migration ${site.source_repo} → ${site.target_repo}. Work inside the sandbox using the vm tools (bash, read, write). Do not ask for confirmation.

# Goal
Build the TanStack Start site and deploy it to Cloudflare Workers via \`wrangler deploy\` (direct upload — no dashboard, no git integration). The CF token is already in the environment variable.

# Steps
\`\`\`bash
cd /app/repo
git checkout ${site.work_branch} && git pull origin ${site.work_branch} 2>/dev/null || true
[ -d node_modules ] || bun install || npm install
# build: generate all gens + vite build
npm run build
# deploy: wrangler reads wrangler.jsonc — name + account_id are already configured
export CLOUDFLARE_API_TOKEN=${cfApiToken}
npx wrangler deploy 2>&1 | tee /tmp/wrangler-deploy.log
\`\`\`

After the deploy, read /tmp/wrangler-deploy.log and extract the worker URL (the line with "Deployed" or "https://${workerName}.*.workers.dev"). If the deploy fails, report ok=false with the error.

${progressInstruction(site)}

# Result
End your LAST message with a single line in exactly this format:
RESULT_JSON: {"ok": true, "deployUrl": "https://${workerName}.deco-cx.workers.dev", "detail": "deploy ok"}
(ok=false with detail explaining the error if wrangler deploy fails)`;
}
