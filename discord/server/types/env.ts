import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  CONNECTION: BindingOf("@deco/connection"),

  DISCORD_PUBLIC_KEY: z
    .string()
    .optional()
    .describe(
      "Discord Application Public Key (Developer Portal > General Information). Only required if you intend to use the HTTP webhook fallback for slash commands.",
    ),

  DISCORD_APPLICATION_ID: z
    .string()
    .optional()
    .describe(
      "Discord Application ID (Developer Portal). Required for interaction follow-ups (the agent passes this back when responding to button/select/modal events).",
    ),

  AUTHORIZED_GUILDS: z
    .string()
    .optional()
    .describe(
      "Comma-separated guild IDs allowed to interact with this bot. Empty = all guilds.",
    ),

  AUTO_DEFER_MODE: z
    .enum(["ephemeral", "visible", "off"])
    .default("ephemeral")
    .describe(
      "Default acknowledgement mode for Discord interactions. 'ephemeral' (default): user sees a private 'thinking' indicator while the agent is processing. 'visible': everyone sees it. 'off': skip auto-defer (only safe if your agent always replies in <3s, e.g. for slash commands that show a modal).",
    ),

  ENABLE_PRESENCE_EVENTS: z
    .boolean()
    .default(false)
    .describe(
      "Emit discord.presence.updated triggers. HIGH VOLUME: requires GuildPresences privileged intent and Discord verification when the bot is in 100+ guilds.",
    ),

  ENABLE_TYPING_EVENTS: z
    .boolean()
    .default(false)
    .describe(
      "Emit discord.typing.started triggers. High frequency — only enable if your agent reacts to typing.",
    ),

  ENABLE_VOICE_EVENTS: z
    .boolean()
    .default(false)
    .describe(
      "Emit discord.voice.state.updated triggers (mute/deafen/join/leave voice).",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
