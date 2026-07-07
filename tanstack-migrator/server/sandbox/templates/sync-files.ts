/**
 * A single GitHub Actions workflow that mirrors the CMS content (`.deco/blocks`)
 * from a client's production (Fresh/Deno) repo into our migrated `-tanstack`
 * repo, event-driven.
 *
 * The client repo is git-backed: publishing in the deco admin UI commits
 * `.deco/blocks/*.json` to its `main` (e.g. "Publish N from <site>"). This
 * workflow triggers on those pushes and rsyncs the blocks into the target repo,
 * so the migration always sees fresh CMS state.
 *
 * Modeled 1:1 on the proven `deco-sites/miess-01` workflow
 * (.github/workflows/sync-deco-content.yml). It is the ONLY file we ever add
 * to a client production repo — it edits nothing else. Pushing to the target
 * needs a PAT with write access, stored as a repo secret (default
 * STOREFRONT_SYNC_TOKEN) — a one-time human setup.
 */

export const SYNC_WORKFLOW_PATH = ".github/workflows/sync-deco-content.yml";
export const DEFAULT_SYNC_TOKEN_SECRET = "STOREFRONT_SYNC_TOKEN";

function repoName(full: string): string {
  return full.includes("/") ? full.split("/")[1] : full;
}

/**
 * The mirror workflow YAML. `targetRepo` is the "owner/name" of the -tanstack
 * repo that receives the blocks; `tokenSecret` is the repo-secret name holding
 * a PAT with write access to it.
 */
export function syncWorkflowYaml(input: {
  sourceRepo: string;
  targetRepo: string;
  tokenSecret?: string;
}): string {
  const target = input.targetRepo;
  const source = repoName(input.sourceRepo);
  const secret = input.tokenSecret ?? DEFAULT_SYNC_TOKEN_SECRET;
  return `name: Sync .deco to TanStack Storefront

# Mirrors CMS content committed by the deco admin (.deco/blocks) from this
# production repo into ${target} so the TanStack migration stays in sync.
# Installed by the tanstack-migrator MCP — this is the ONLY file it adds.
# Requires a repo secret \`${secret}\` (PAT with write access to ${target}).

on:
  push:
    branches: [main]
    paths: ['.deco/**']
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source (${source})
        uses: actions/checkout@v4
        with:
          path: source

      - name: Checkout target (${repoName(target)})
        uses: actions/checkout@v4
        with:
          repository: ${target}
          token: \${{ secrets.${secret} }}
          path: target

      - name: Sync .deco/blocks
        run: |
          rsync -av --delete \\
            source/.deco/blocks/ target/.deco/blocks/

      - name: Commit and push if changed
        working-directory: target
        run: |
          git config user.name "deco-sync-bot"
          git config user.email "sync@deco.cx"
          git add .deco/
          git diff --staged --quiet && echo "No changes to sync" && exit 0
          git commit -m "sync: .deco content from ${source}"
          git push
`;
}
