# GitHub Actions Workflows

This directory contains the centralized deployment workflows for all MCPs in the monorepo.

## Workflows

### `deploy.yml` - Production Deployment

**Trigger**: Push to `main` branch

**What it does**:
1. Detects which MCP directories have changed
2. Builds and deploys only the changed MCPs to production
3. Uses the `deco deploy` command for each changed MCP

**Example**: If you push changes to `template-with-view/`, only that MCP will be deployed.

### `deploy-preview.yml` - Preview Deployment

**Trigger**: Pull requests to `main` branch

**What it does**:
1. Detects which MCP directories have changed in the PR
2. Builds and deploys preview versions (without promoting)
3. Comments on the PR with preview URLs for each deployed MCP
4. Updates the comment on subsequent commits

**Example**: If your PR modifies `template-with-view/` and `another-mcp/`, both will get preview deployments with their URLs posted in the PR.

## Change Detection

Both workflows use **automatic MCP discovery** powered by a TypeScript script (`scripts/detect-changed-mcps.ts`). The detection process:

1. **Discovers all MCPs**: Scans the repository root for directories containing a `package.json`
2. **Filters out special directories**: Excludes `.git`, `.github`, `node_modules`, `scripts`, `shared`
3. **Detects changes**: Uses `git diff` to find which files changed
4. **Maps to MCPs**: Determines which MCP directories contain the changed files

### How It Works

**Production deployments**: Compares `previous commit → current commit`

**Preview deployments**: Compares `base branch → PR head`

## Adding a New MCP

**No configuration needed!** Just create a new directory with a `package.json` and the workflows will automatically:
- Detect it as an MCP
- Monitor it for changes
- Deploy it when changes occur

Example:
```bash
mkdir my-new-mcp
cd my-new-mcp
# Create your MCP with package.json
```

That's it - the next time you push changes to this directory, it will automatically deploy! 🚀

## Environment Variables

### Required Secrets

- `DECO_DEPLOY_TOKEN` - Authentication token for Deco CLI deployment

Configure this in your GitHub repository settings under **Settings > Secrets and variables > Actions**.

## Matrix Strategy

Both workflows use GitHub Actions matrix strategy to deploy multiple MCPs in parallel. This means if multiple MCPs have changes, they will be deployed simultaneously rather than sequentially, speeding up the overall deployment process.

## Failure Handling

The workflows use `fail-fast: false` in their matrix strategy, which means:
- If one MCP fails to deploy, others will continue
- You'll get individual success/failure notifications for each MCP
- The overall workflow will be marked as failed if any MCP fails

## Deployment Script

Both workflows use the TypeScript deployment script located at `scripts/deploy.ts`. This script:
- Changes to the MCP directory
- Installs dependencies with Bun
- Runs the build script
- Deploys using Deco CLI
- Extracts and outputs preview URLs (for preview deployments)

## Artifacts

The preview deployment workflow creates temporary artifacts containing deployment information (MCP name and preview URL) which are used to construct the PR comment. These artifacts are automatically cleaned up after 1 day.

