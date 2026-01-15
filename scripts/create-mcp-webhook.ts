#!/usr/bin/env bun

/**
 * Creates a webhook for a new MCP in the GitHub repository
 * Usage: bun run scripts/create-mcp-webhook.ts <mcp-name>
 *
 * Required environment variables:
 * - GITHUB_TOKEN: GitHub token with admin:repo_hook permission
 * - GITHUB_REPOSITORY: Repository in format "owner/repo"
 * - DECO_WEBHOOK_SECRET: Secret for webhook validation
 */

const mcpName = process.argv[2];

if (!mcpName) {
  console.error("❌ Error: MCP name is required");
  console.error("Usage: bun run scripts/create-mcp-webhook.ts <mcp-name>");
  process.exit(1);
}

const githubToken = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const webhookSecret = process.env.DECO_WEBHOOK_SECRET;

if (!githubToken) {
  console.error("❌ Error: GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

if (!repository) {
  console.error("❌ Error: GITHUB_REPOSITORY environment variable is required");
  process.exit(1);
}

if (!webhookSecret) {
  console.error(
    "❌ Error: DECO_WEBHOOK_SECRET environment variable is required",
  );
  process.exit(1);
}

// Build the webhook URL
const webhookUrl = `https://admin.deco.cx/deco/invoke/deco-sites/admin/actions/github/webhooks/broker.ts?site=${mcpName}&platformName=kubernetes-bun&entrypoint=./dist/server/main.js`;

// GitHub API endpoint
const apiUrl = `https://api.github.com/repos/${repository}/hooks`;

// Check if webhook already exists for this MCP
async function webhookExists(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      console.error(
        `⚠️ Warning: Could not check existing webhooks: ${response.statusText}`,
      );
      return false;
    }

    const hooks = (await response.json()) as Array<{
      config?: { url?: string };
    }>;

    // Check if any webhook has our URL
    return hooks.some((hook) => hook.config?.url?.includes(`site=${mcpName}`));
  } catch (error) {
    console.error(`⚠️ Warning: Error checking existing webhooks:`, error);
    return false;
  }
}

// Create the webhook
async function createWebhook(): Promise<void> {
  console.log(`\n🔧 Creating webhook for MCP: ${mcpName}`);
  console.log(`📍 Webhook URL: ${webhookUrl}`);

  // Check if already exists
  if (await webhookExists()) {
    console.log(`✅ Webhook for ${mcpName} already exists, skipping creation`);
    return;
  }

  const payload = {
    name: "web",
    active: true,
    events: ["push", "pull_request"],
    config: {
      url: webhookUrl,
      content_type: "application/json",
      secret: webhookSecret,
      insecure_ssl: "0",
    },
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}\n${errorBody}`,
      );
    }

    const result = await response.json();
    console.log(`✅ Webhook created successfully!`);
    console.log(`   ID: ${(result as { id: number }).id}`);
    console.log(`   Events: push, pull_request`);
  } catch (error) {
    console.error(`❌ Failed to create webhook for ${mcpName}:`, error);
    process.exit(1);
  }
}

// Main execution
await createWebhook();
