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
    `Deploy Cloudflare (1x, no dashboard — o Workers Builds não tem API pra conectar repo): ` +
    `Cloudflare → Workers & Pages → Create → Import a repository → ${input.repoFull}. ` +
    `Worker name: ${input.workerName}; production branch: main; build command: "npm run build"; ` +
    `deploy command: "npx wrangler deploy"; root directory: "/"; habilite Preview URLs / builds de ` +
    `branches non-prod. Depois de conectar, cada PR ganha um preview deploy e o merge em main vai pra ` +
    `prod. Marque a fase como concluída com SITE_MARK_DONE (ou SITE_RETRY) após conectar.`
  );
}
