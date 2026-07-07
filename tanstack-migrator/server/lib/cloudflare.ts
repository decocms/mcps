/**
 * Cloudflare Workers Builds — the git connection (repo → Workers Builds) is
 * DASHBOARD-ONLY. Cloudflare provides no API to connect a repo: per the CF docs
 * (workers/ci-cd/builds/api-reference) and workers-sdk#12058, "a connection
 * between your GitHub repository and Cloudflare must be established through the
 * GitHub App installation process in the Cloudflare dashboard before using the
 * API." The Builds API only manages triggers/builds AFTER a dashboard connect
 * (and needs a repo_connection_uuid that only the dashboard hands out).
 *
 * So the deploy_cf phase routes to needs_human with these one-time steps. After
 * the connect, pushes auto-build: PRs get preview deploys, main → prod.
 */

export function manualCfInstructions(input: {
  workerName: string;
  repoFull: string;
}): string {
  return (
    `Cloudflare deploy (one-time, in the dashboard — Workers Builds has no API to connect a repo): ` +
    `Cloudflare → Workers & Pages → Create → Import a repository → ${input.repoFull}. ` +
    `Worker name: ${input.workerName}; production branch: main; build command: "npm run build"; ` +
    `deploy command: "npx wrangler deploy"; root directory: "/"; enable Preview URLs / builds for ` +
    `non-prod branches. After connecting, each PR gets a preview deploy and merging to main goes to ` +
    `prod. Mark the phase as done with SITE_MARK_DONE (or SITE_RETRY) after connecting.`
  );
}
