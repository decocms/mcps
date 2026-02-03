/**
 * HTTP Router for Discord MCP
 *
 * Handles incoming webhook requests from Discord (interactions endpoint).
 * Route: /discord/interactions/:connectionId
 */

import { Hono } from "hono";
import {
  verifyDiscordRequest,
  parseSlashCommand,
  createInteractionResponse,
  getUserFromInteraction,
  InteractionType,
  InteractionResponseType,
  type DiscordInteraction,
} from "./webhook.ts";
import { getDiscordConfig } from "./lib/config-cache.ts";
import { ensureBotRunning, isBotRunning } from "./bot-manager.ts";
import { getCurrentEnv } from "./bot-manager.ts";
import { getSupabaseClient } from "./lib/supabase-client.ts";

export const app = new Hono();

/**
 * Health check endpoint
 */
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "discord-mcp" });
});

/**
 * Discord Interactions Endpoint
 * URL: /discord/interactions/:connectionId
 *
 * Handles:
 * - PING (Discord verification challenge)
 * - APPLICATION_COMMAND (slash commands like /start)
 */
app.post("/discord/interactions/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  const rawBody = await c.req.text();

  console.log(`[Webhook] Received interaction for connection: ${connectionId}`);

  // Get connection config to retrieve public key
  const config = await getDiscordConfig(connectionId);
  if (!config) {
    console.error(`[Webhook] No config found for ${connectionId}`);
    return c.json({ error: "Connection not configured" }, 404);
  }

  // Verify Discord signature
  const signature = c.req.header("x-signature-ed25519");
  const timestamp = c.req.header("x-signature-timestamp");

  const { verified, payload } = verifyDiscordRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    config.discordPublicKey,
  );

  if (!verified || !payload) {
    console.error(`[Webhook] Invalid signature for ${connectionId}`);
    return c.json({ error: "Invalid signature" }, 401);
  }

  console.log(
    `[Webhook] Signature verified, type: ${payload.type}, command: ${payload.data?.name}`,
  );

  // Handle PING (verification challenge)
  if (payload.type === InteractionType.PING) {
    console.log(`[Webhook] Responding to PING challenge`);
    return c.json({ type: InteractionResponseType.PONG });
  }

  // Handle APPLICATION_COMMAND (slash commands)
  if (payload.type === InteractionType.APPLICATION_COMMAND) {
    const command = parseSlashCommand(payload);
    if (!command) {
      return c.json(
        createInteractionResponse(
          InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          "❌ Invalid command format",
          true,
        ),
      );
    }

    console.log(`[Webhook] Processing slash command: /${command.command}`);

    // Check if command is registered and enabled in database
    const client = getSupabaseClient();
    if (client) {
      const guildId = payload.guild_id || null;

      const { data: dbCommand } = await client
        .from("discord_slash_commands")
        .select("*")
        .eq("connection_id", connectionId)
        .eq("command_name", command.command)
        .eq("guild_id", guildId)
        .eq("enabled", true)
        .single();

      if (!dbCommand) {
        console.log(
          `[Webhook] Command /${command.command} not found or disabled in database`,
        );
        return c.json(
          createInteractionResponse(
            InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            `❌ Command not registered or disabled: \`/${command.command}\``,
            true,
          ),
        );
      }

      console.log(
        `[Webhook] Command /${command.command} found in database and enabled`,
      );
    }

    // Handle /start command
    if (command.command === "start") {
      return await handleStartCommand(connectionId, payload);
    }

    // Command exists but no handler - inform user
    return c.json(
      createInteractionResponse(
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        `⚠️ Command \`/${command.command}\` is registered but handler not implemented yet.`,
        true,
      ),
    );
  }

  // Unknown interaction type
  return c.json({ error: "Unsupported interaction type" }, 400);
});

/**
 * Handle /start command - Start the Discord bot
 */
async function handleStartCommand(
  connectionId: string,
  interaction: DiscordInteraction,
): Promise<Response> {
  const user = getUserFromInteraction(interaction);

  console.log(
    `[Command] /start called by ${user?.username} (${user?.id}) in connection ${connectionId}`,
  );

  // Defer response (Discord requires response within 3 seconds)
  const deferResponse = createInteractionResponse(
    InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  );

  // Start bot in background
  setTimeout(async () => {
    try {
      const env = getCurrentEnv();
      if (!env) {
        console.error("[Command] No environment available");
        await editInteractionResponse(
          interaction.application_id,
          interaction.token,
          "❌ Bot environment not available. Please configure the bot in Mesh Dashboard first.",
        );
        return;
      }

      // Check if bot is already running
      if (isBotRunning()) {
        await editInteractionResponse(
          interaction.application_id,
          interaction.token,
          "✅ Bot is already running!",
        );
        return;
      }

      // Try to start the bot
      const success = await ensureBotRunning(env);

      if (success) {
        await editInteractionResponse(
          interaction.application_id,
          interaction.token,
          "✅ Bot started successfully! I'm now online and ready to respond.",
        );
      } else {
        await editInteractionResponse(
          interaction.application_id,
          interaction.token,
          "❌ Failed to start bot. Please check configuration and try again.",
        );
      }
    } catch (error) {
      console.error("[Command] Error starting bot:", error);
      await editInteractionResponse(
        interaction.application_id,
        interaction.token,
        `❌ Error starting bot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, 0);

  return new Response(JSON.stringify(deferResponse), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Edit interaction response (follow-up after defer)
 */
async function editInteractionResponse(
  applicationId: string,
  token: string,
  content: string,
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Webhook] Failed to edit interaction response: ${response.status} ${errorText}`,
      );
    }
  } catch (error) {
    console.error(
      "[Webhook] Error editing interaction response:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
