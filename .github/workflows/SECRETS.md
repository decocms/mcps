# Required Secrets for MCP Deployment

This document lists all secrets required to deploy MCPs via GitHub Actions.

## Required Secrets

### `DECO_DEPLOY_TOKEN`
- **Used by**: All MCPs
- **Description**: Authentication token for Deco CLI
- **How to obtain**: Generated via Deco CLI or dashboard

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

### MCP: `github` (Cloudflare Workers — `deploy-github.yml`)
Unlike the other MCPs, github deploys directly via `wrangler deploy` in
its own workflow. The GitHub Action only needs Cloudflare credentials:

- **`CLOUDFLARE_API_TOKEN`**: Workers deploy token (create at
  https://dash.cloudflare.com/profile/api-tokens with "Edit Cloudflare
  Workers" template)
- **`CLOUDFLARE_ACCOUNT_ID`**: your Cloudflare account id

Application secrets are stored directly on the worker via
`wrangler secret put` — one-time setup, not passed through Actions.
Bulk upload via `wrangler secret bulk .secrets.json` (gitignored):

```
cd github
bunx wrangler secret bulk .secrets.json
```

Required keys in `.secrets.json`: `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`.

Trigger state persists in the `INSTALLATIONS` Workers KV namespace
(`triggers:*` prefix), so no Mesh/Studio credentials are needed.

Obtain the GitHub values at https://github.com/settings/apps → your app.

### MCP: `google-gmail` (Cloudflare Workers — `deploy-google-gmail.yml`)
Same pattern as github / dropbox: deploys via `wrangler deploy` in its
own workflow, only needs Cloudflare credentials in Actions:

- **`CLOUDFLARE_API_TOKEN`**: Workers deploy token
- **`CLOUDFLARE_ACCOUNT_ID`**: your Cloudflare account id

Worker-side secrets (set once via `wrangler secret put` or bulk upload):

```
cd google-gmail
bunx wrangler secret bulk .secrets.json
```

Required keys in `.secrets.json`:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
  for the project (https://console.cloud.google.com/apis/credentials)
- `GMAIL_PUBSUB_TOPIC` — fully-qualified Pub/Sub topic, e.g.
  `projects/<project>/topics/gmail-push`. The Gmail API publishes
  mailbox-change events here. Grant the system service account
  `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher
  role on this topic.
- `GMAIL_WEBHOOK_SECRET` — random string used as a `?token=` query
  param on the Pub/Sub push subscription URL. Configure the push
  subscription endpoint as
  `https://google-gmail-mcp.decocms.com/webhooks/gmail?token=<secret>`.

State (email → connection mapping plus `triggers:*` subscriptions)
persists in the `EMAIL_MAP` Workers KV namespace bound in
`google-gmail/wrangler.toml`. Create with
`bunx wrangler kv namespace create EMAIL_MAP` and paste the id into
`wrangler.toml`.

#### Google Cloud setup checklist
1. Enable the **Gmail API** in the project.
2. Create the Pub/Sub **topic** (`gmail-push` works) and grant
   `gmail-api-push@system.gserviceaccount.com` the *Pub/Sub Publisher*
   role on it.
3. Create a **push subscription** for that topic with endpoint
   `https://google-gmail-mcp.decocms.com/webhooks/gmail?token=<GMAIL_WEBHOOK_SECRET>`.
4. The OAuth consent screen / authorized redirect URIs must include
   the deco mesh callback the worker uses for Google PKCE.

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
