# mcps

First-party MCPs maintained by the decocms team.

## Getting Started

After cloning the repository, install dependencies:

```bash
bun install
```

This will automatically set up git hooks that run formatting and linting checks before each commit.

To manually set up the git hooks later, run:

```bash
bun run prepare
```

## Creating a New MCP

Use the `new.ts` script to quickly scaffold a new MCP:

```bash
bun run new <name> [options]
```

### Options

- `-d, --description` - Description for package.json
- `-h, --help` - Show help message

### Examples

**Create a new MCP:**

```bash
bun run new weather-api
```

**Create with custom description:**

```bash
bun run new weather-api --description "Weather forecast API"
```

### After Creating

```bash
cd your-mcp-name
bun install
bun run dev
```

That's it! The deployment workflows will automatically detect your new MCP - no manual configuration needed.

## Deployment

This monorepo uses centralized GitHub Actions workflows with **automatic MCP discovery**.

### How It Works

- **Automatic MCP Discovery**: The workflows automatically find all directories with a `package.json` (excluding special folders like `scripts`, `shared`, etc.)
- **Smart Change Detection**: Uses git diff to detect which MCPs have changed in each commit or PR
- **Selective Deployment**: Only MCPs with actual changes are built and deployed
- **Parallel Execution**: Multiple changed MCPs deploy simultaneously using GitHub's matrix strategy

### Workflows

- `.github/workflows/deploy.yml` - Production deployment on push to main
- `.github/workflows/deploy-preview.yml` - Preview deployment on pull requests

### What Gets Deployed?

**Production (push to main)**:

- Compares current commit with previous commit
- Deploys all MCPs that have file changes

**Preview (pull requests)**:

- Compares PR branch with base branch (main)
- Deploys all MCPs that have changes in the PR
- Posts preview URLs as a comment on the PR

### Manual Deployment

You can also deploy MCPs manually using the deployment script:

```bash
# Deploy to production
bun run scripts/deploy.ts your-mcp-name

# Deploy preview
bun run scripts/deploy.ts your-mcp-name --preview
```

### Requirements

Each MCP directory must have:

- A `package.json` with a `build` script
- Build output in `dist/server` directory (or as configured for Deco)

Repository requirements:

- `DECO_DEPLOY_TOKEN` secret configured in GitHub repository settings

### Adding a New MCP

Just create a new directory with a `package.json` - that's it! The workflows will automatically:

1. Detect it as an MCP
2. Monitor it for changes
3. Deploy it when changes are pushed

No manual workflow configuration needed!
