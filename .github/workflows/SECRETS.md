# Required Secrets for MCP Deployment

This document lists all secrets required to deploy MCPs via GitHub Actions.

## Required Secrets

### `DECO_DEPLOY_TOKEN`
- **Used by**: All MCPs
- **Description**: Authentication token for Deco CLI
- **How to obtain**: Generated via Deco CLI or dashboard

### `DECO_WEBHOOK_SECRET`
- **Used by**: Webhook setup workflow
- **Description**: Secret used to validate webhook payloads from GitHub to Deco
- **How to obtain**: Generate a secure random string (e.g., `openssl rand -hex 32`)
- **Note**: This is the same secret for all MCP webhooks

### `WEBHOOK_ADMIN_TOKEN`
- **Used by**: Webhook setup workflow
- **Description**: GitHub Personal Access Token (PAT) with `admin:repo_hook` permission to create webhooks
- **How to obtain**: 
  1. Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
  2. Generate a new token with **Repository permissions: Webhooks (Read and write)**
  3. Or use a classic token with `admin:repo_hook` scope

## Optional Secrets (per MCP)

### MCP: `sora`
- **`OPENAI_API_KEY`**: OpenAI API key for Sora model
  - Obtain at: https://platform.openai.com/api-keys

### MCP: `veo`
- **`GOOGLE_GENAI_API_KEY`**: Google Generative AI API key for Veo model
  - Obtain at: https://aistudio.google.com/app/apikey
  - ⚠️ **Important**: The code expects `GOOGLE_GENAI_API_KEY`, not `VEO_TOKEN`

### MCP: `nanobanana`
- **`NANOBANANA_API_KEY`**: API key for Nanobanana service (OpenRouter)
  - Obtain at: https://openrouter.ai/keys

### MCP: `openrouter`
- **`OPENROUTER_API_KEY`**: API key used by OpenRouter MCP
  - Obtain at: https://openrouter.ai/keys

### MCP: `pinecone`
- **`PINECONE_TOKEN`**: Pinecone API token
  - Obtain at: https://app.pinecone.io/
- **`PINECONE_INDEX`**: Pinecone index name (if required)

### MCP: `meta-ads`
- **`META_ACCESS_TOKEN`**: Facebook Access Token for Meta Ads API
  - Obtain at: https://developers.facebook.com/tools/explorer/
  - Select your app and generate token with required permissions:
    - `ads_read` - Read ad information
    - `ads_management` - Manage ads
    - `pages_read_engagement` - Read associated pages
    - `business_management` - Access business accounts

## How to Add Secrets on GitHub

1. Go to your repository on GitHub
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add the secret name and value
5. Click **Add secret**

## How Secrets Are Used

GitHub Actions workflows pass all configured secrets as environment variables to the deploy script (`scripts/deploy.ts`). The script automatically detects which variables are defined and passes them to the `deco deploy` command using the `--env` flag.

Each MCP only uses the secrets it needs, so it's safe to configure all secrets even if not all MCPs use them.

## How to Add a New Secret

When you need to add support for a new secret:

1. **Add the secret on GitHub** (as described above)

2. **Update the deploy script** (`scripts/deploy.ts`):
   - Add the variable name to the `envVarsToPass` array (around line 139)
   ```typescript
   const envVarsToPass = [
     "OPENAI_API_KEY",
     "GOOGLE_GENAI_API_KEY",
     "NANOBANANA_API_KEY",
     "YOUR_NEW_SECRET",  // <- Add here
     // ...
   ];
   ```

3. **Update the workflows**:
   - In `.github/workflows/deploy.yml` and `.github/workflows/deploy-preview.yml`
   - Add the variable in the `env:` section of the deploy step
   ```yaml
   env:
     DECO_DEPLOY_TOKEN: ${{ secrets.DECO_DEPLOY_TOKEN }}
     OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
     YOUR_NEW_SECRET: ${{ secrets.YOUR_NEW_SECRET }}  # <- Add here
   ```

⚠️ **Note**: Yes, you still need to edit the workflows, but now it's simpler and centralized. Just add one line in the `env:` section.

## ⚠️ Attention: Rename VEO_TOKEN Secret

If you have a secret called `VEO_TOKEN`, you need to:
1. Create a new secret called `GOOGLE_GENAI_API_KEY` with the same value as `VEO_TOKEN`
2. Delete the `VEO_TOKEN` secret (or keep it if you prefer)

The `veo` MCP expects `GOOGLE_GENAI_API_KEY` in the code.
