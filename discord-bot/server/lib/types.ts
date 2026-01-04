export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  banner?: string;
  accent_color?: number;
  locale?: string;
  verified?: boolean;
  email?: string;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  icon_hash?: string;
  splash?: string;
  discovery_splash?: string;
  owner?: boolean;
  owner_id: string;
  permissions?: string;
  region?: string;
  afk_channel_id?: string;
  afk_timeout: number;
  widget_enabled?: boolean;
  widget_channel_id?: string;
  verification_level: number;
  default_message_notifications: number;
  explicit_content_filter: number;
  roles: DiscordRole[];
  emojis: DiscordEmoji[];
  features: string[];
  mfa_level: number;
  application_id?: string;
  system_channel_id?: string;
  system_channel_flags: number;
  rules_channel_id?: string;
  max_presences?: number;
  max_members?: number;
  vanity_url_code?: string;
  description?: string;
  banner?: string;
  premium_tier: number;
  premium_subscription_count?: number;
  preferred_locale: string;
  public_updates_channel_id?: string;
  max_video_channel_users?: number;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  welcome_screen?: DiscordWelcomeScreen;
  nsfw_level: number;
  stickers?: DiscordSticker[];
  premium_progress_bar_enabled: boolean;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  position?: number;
  permission_overwrites?: DiscordPermissionOverwrite[];
  name?: string;
  topic?: string;
  nsfw?: boolean;
  last_message_id?: string;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: DiscordUser[];
  icon?: string;
  owner_id?: string;
  application_id?: string;
  parent_id?: string;
  last_pin_timestamp?: string;
  rtc_region?: string;
  video_quality_mode?: number;
  message_count?: number;
  member_count?: number;
  thread_metadata?: DiscordThreadMetadata;
  member?: DiscordThreadMember;
  default_auto_archive_duration?: number;
  permissions?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp?: string;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  mention_channels?: DiscordChannelMention[];
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  reactions?: DiscordReaction[];
  nonce?: string | number;
  pinned: boolean;
  webhook_id?: string;
  type: number;
  activity?: DiscordMessageActivity;
  application?: DiscordApplication;
  application_id?: string;
  message_reference?: DiscordMessageReference;
  flags?: number;
  referenced_message?: DiscordMessage;
  interaction?: DiscordMessageInteraction;
  thread?: DiscordChannel;
  components?: DiscordComponent[];
  sticker_items?: DiscordStickerItem[];
  position?: number;
}

export interface DiscordEmbed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: DiscordEmbedFooter;
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedThumbnail;
  video?: DiscordEmbedVideo;
  provider?: DiscordEmbedProvider;
  author?: DiscordEmbedAuthor;
  fields?: DiscordEmbedField[];
}

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
  proxy_icon_url?: string;
}

export interface DiscordEmbedImage {
  url: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbedThumbnail {
  url: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbedVideo {
  url?: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbedProvider {
  name?: string;
  url?: string;
}

export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
  proxy_icon_url?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  description?: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url: string;
  height?: number;
  width?: number;
  ephemeral?: boolean;
}

export interface DiscordReaction {
  count: number;
  me: boolean;
  emoji: DiscordEmoji;
}

export interface DiscordEmoji {
  id?: string;
  name?: string;
  roles?: string[];
  user?: DiscordUser;
  require_colons?: boolean;
  managed?: boolean;
  animated?: boolean;
  available?: boolean;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string;
  unicode_emoji?: string;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  tags?: DiscordRoleTags;
}

export interface DiscordRoleTags {
  bot_id?: string;
  integration_id?: string;
  premium_subscriber?: null;
}

export interface DiscordPermissionOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

export interface DiscordThreadMetadata {
  archived: boolean;
  auto_archive_duration: number;
  archive_timestamp: string;
  locked: boolean;
  invitable?: boolean;
  create_timestamp?: string;
}

export interface DiscordThreadMember {
  id?: string;
  user_id?: string;
  join_timestamp: string;
  flags: number;
}

export interface DiscordChannelMention {
  id: string;
  guild_id: string;
  type: number;
  name: string;
}

export interface DiscordMessageActivity {
  type: number;
  party_id?: string;
}

export interface DiscordApplication {
  id: string;
  name: string;
  icon?: string | null;
  description: string;
  rpc_origins?: string[];
  bot_public: boolean;
  bot_require_code_grant: boolean;
  terms_of_service_url?: string;
  privacy_policy_url?: string;
  owner?: DiscordUser;
  verify_key: string;
  team?: DiscordTeam | null;
  guild_id?: string;
  primary_sku_id?: string;
  slug?: string;
  cover_image?: string;
  flags?: number;
  tags?: string[];
  install_params?: DiscordInstallParams;
  custom_install_url?: string;
}

export interface DiscordTeam {
  icon?: string | null;
  id: string;
  members: DiscordTeamMember[];
  name: string;
  owner_user_id: string;
}

export interface DiscordTeamMember {
  membership_state: number;
  permissions: string[];
  team_id: string;
  user: DiscordUser;
}

export interface DiscordInstallParams {
  scopes: string[];
  permissions: string;
}

export interface DiscordStageInstance {
  id: string;
  guild_id: string;
  channel_id: string;
  topic: string;
  privacy_level: number;
  discoverable_disabled: boolean;
  guild_scheduled_event_id?: string | null;
}

export type GuildScheduledEventStatus = 1 | 2 | 3 | 4;
export type GuildScheduledEventEntityType = 1 | 2 | 3;

export interface DiscordGuildScheduledEvent {
  id: string;
  guild_id: string;
  channel_id?: string | null;
  creator_id?: string | null;
  name: string;
  description?: string | null;
  scheduled_start_time: string;
  scheduled_end_time?: string | null;
  privacy_level: number;
  status: GuildScheduledEventStatus;
  entity_type: GuildScheduledEventEntityType;
  entity_id?: string | null;
  entity_metadata?: DiscordGuildScheduledEventEntityMetadata | null;
  creator?: DiscordUser;
  user_count?: number;
  image?: string | null;
}

export interface DiscordGuildScheduledEventEntityMetadata {
  location?: string;
}

export interface DiscordPartialEmoji {
  id?: string | null;
  name?: string | null;
  animated?: boolean;
}

export interface DiscordActionRow {
  type: 1;
  components: DiscordMessageComponent[];
}

export interface DiscordButton {
  type: 2;
  style: number;
  label?: string;
  emoji?: DiscordPartialEmoji;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
}

export interface DiscordSelectMenu {
  type: 3 | 5 | 6 | 7 | 8;
  custom_id: string;
  options?: DiscordSelectOption[];
  channel_types?: number[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
}

export interface DiscordSelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: DiscordPartialEmoji;
  default?: boolean;
}

export interface DiscordTextInput {
  type: 4;
  custom_id: string;
  style: number;
  label: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  placeholder?: string;
}

export type DiscordMessageComponent =
  | DiscordActionRow
  | DiscordButton
  | DiscordSelectMenu
  | DiscordTextInput;

export interface DiscordFile {
  filename: string;
  content_type?: string;
  file: Blob | ArrayBuffer | Uint8Array;
}

export interface DiscordMessageAttachment {
  id?: string;
  filename: string;
  description?: string;
  content_type?: string;
  size?: number;
  url?: string;
  proxy_url?: string;
  height?: number | null;
  width?: number | null;
  ephemeral?: boolean;
}

export interface DiscordMessageReference {
  message_id?: string;
  channel_id?: string;
  guild_id?: string;
  fail_if_not_exists?: boolean;
}

export interface DiscordMessageInteraction {
  id: string;
  type: number;
  name: string;
  user: DiscordUser;
  member?: DiscordGuildMember;
}

export interface DiscordGuildMember {
  user?: DiscordUser;
  nick?: string;
  avatar?: string;
  roles: string[];
  joined_at: string;
  premium_since?: string;
  deaf: boolean;
  mute: boolean;
  flags: number;
  pending?: boolean;
  permissions?: string;
  communication_disabled_until?: string;
}

export interface DiscordComponent {
  type: number;
  style?: number;
  label?: string;
  emoji?: DiscordEmoji;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  components?: DiscordComponent[];
}

export interface DiscordStickerItem {
  id: string;
  name: string;
  format_type: number;
}

export interface DiscordSticker {
  id: string;
  pack_id?: string;
  name: string;
  description?: string;
  tags: string;
  asset?: string;
  type: number;
  format_type: number;
  available?: boolean;
  guild_id?: string;
  user?: DiscordUser;
  sort_value?: number;
}

export interface DiscordWelcomeScreen {
  description?: string;
  welcome_channels: DiscordWelcomeScreenChannel[];
}

export interface DiscordWelcomeScreenChannel {
  channel_id: string;
  description: string;
  emoji_id?: string;
  emoji_name?: string;
}

export interface DiscordInvite {
  type?: InviteType;
  code: string;
  guild?: DiscordGuild;
  channel: DiscordChannel | null;
  inviter?: DiscordUser;
  target_type?: InviteTargetType;
  target_user?: DiscordUser;
  target_application?: DiscordApplication;
  approximate_presence_count?: number;
  approximate_member_count?: number;
  expires_at?: string | null;
  stage_instance?: DiscordStageInstance;
  guild_scheduled_event?: DiscordGuildScheduledEvent;
}

export interface DiscordGuildsResponse {
  guilds: DiscordGuild[];
}

export interface EditRoleBody {
  name?: string;
  permissions?: string;
  color?: number;
  hoist?: boolean;
  icon?: string;
  unicode_emoji?: string;
  mentionable?: boolean;
  reason?: string;
}

export type InviteType = 0 | 1 | 2;
export type InviteTargetType = 1 | 2;

export interface AllowedMentions {
  parse?: ("roles" | "users" | "everyone")[];
  roles?: string[];
  users?: string[];
  replied_user?: boolean;
}

export interface MessageReference {
  message_id?: string;
  channel_id?: string;
  guild_id?: string;
  fail_if_not_exists?: boolean;
}

export interface SendMessageBody {
  content?: string;
  nonce?: number | string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
  allowed_mentions?: AllowedMentions;
  message_reference?: MessageReference;
  components?: DiscordMessageComponent[];
  files?: DiscordFile[];
  payload_json?: string;
  attachments?: DiscordMessageAttachment[];
  flags?: number;
  sticker_ids?: string[];
  thread_name?: string;
}

export interface ExecuteWebhookBody {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
  thread_name?: string;
  applied_tags?: string[];
}

export interface EditMessageBody {
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface CreateWebhookBody {
  name: string;
  avatar?: string;
}

export interface CreateThreadBody {
  name: string;
  auto_archive_duration?: number;
  type?: number;
  invitable?: boolean;
  rate_limit_per_user?: number;
  applied_tags?: string[];
  message?: {
    content?: string;
    embeds?: DiscordEmbed[];
  };
}

export interface CreateRoleBody {
  name?: string;
  permissions?: string;
  color?: number;
  hoist?: boolean;
  icon?: string;
  unicode_emoji?: string;
  mentionable?: boolean;
  reason?: string;
}

// ========================================
// Zod Schemas for MCP Tools
// ========================================

import { z } from "zod";

// ========================================
// Message Schemas
// ========================================

export const discordEmbedSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  timestamp: z.string().optional(),
  color: z.number().optional(),
  footer: z
    .object({
      text: z.string(),
      icon_url: z.string().optional(),
    })
    .optional(),
  image: z
    .object({
      url: z.string(),
    })
    .optional(),
  thumbnail: z
    .object({
      url: z.string(),
    })
    .optional(),
  author: z
    .object({
      name: z.string(),
      url: z.string().optional(),
      icon_url: z.string().optional(),
    })
    .optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        inline: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const sendMessageInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord onde enviar a mensagem"),
  content: z
    .string()
    .optional()
    .describe("Conteúdo da mensagem (máximo 2000 caracteres)"),
  tts: z.boolean().optional().describe("Enviar como texto para fala"),
  embeds: z
    .array(discordEmbedSchema)
    .optional()
    .describe("Lista de embeds para incluir na mensagem"),
  replyToMessageId: z
    .string()
    .optional()
    .describe("ID da mensagem para responder"),
  replyMention: z
    .boolean()
    .optional()
    .describe("Se deve mencionar o autor da mensagem original na resposta"),
});

export const sendMessageOutputSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  content: z.string(),
  timestamp: z.string(),
  author: z.object({
    id: z.string(),
    username: z.string(),
    discriminator: z.string(),
  }),
});

export const editMessageInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  messageId: z.string().describe("ID da mensagem a ser editada"),
  content: z.string().optional().describe("Novo conteúdo da mensagem"),
  embeds: z
    .array(discordEmbedSchema)
    .optional()
    .describe("Novos embeds da mensagem"),
});

export const editMessageOutputSchema = sendMessageOutputSchema;

export const deleteMessageInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  messageId: z.string().describe("ID da mensagem a ser deletada"),
});

export const deleteMessageOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const getChannelMessagesInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Número máximo de mensagens a retornar (1-100)"),
  before: z
    .string()
    .optional()
    .describe("ID da mensagem - buscar mensagens antes desta"),
  after: z
    .string()
    .optional()
    .describe("ID da mensagem - buscar mensagens após esta"),
  around: z
    .string()
    .optional()
    .describe("ID da mensagem - buscar mensagens ao redor desta"),
});

export const getChannelMessagesOutputSchema = z.object({
  messages: z.array(sendMessageOutputSchema),
});

export const getMessageInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  messageId: z.string().describe("ID da mensagem"),
});

export const getMessageOutputSchema = sendMessageOutputSchema;

export const addReactionInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  messageId: z.string().describe("ID da mensagem"),
  emoji: z
    .string()
    .describe("Emoji para adicionar (Unicode ou custom emoji ID)"),
});

export const addReactionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const removeReactionInputSchema = addReactionInputSchema;
export const removeReactionOutputSchema = addReactionOutputSchema;

export const getMessageReactionsInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  messageId: z.string().describe("ID da mensagem"),
  emoji: z.string().describe("Emoji para buscar reações"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Número máximo de usuários a retornar"),
  after: z
    .string()
    .optional()
    .describe("ID do usuário - buscar usuários após este"),
});

export const getMessageReactionsOutputSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      discriminator: z.string(),
    }),
  ),
});

export const pinMessageInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  messageId: z.string().describe("ID da mensagem a ser fixada"),
});

export const pinMessageOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const unpinMessageInputSchema = pinMessageInputSchema;
export const unpinMessageOutputSchema = pinMessageOutputSchema;

export const getPinnedMessagesInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
});

export const getPinnedMessagesOutputSchema = z.object({
  messages: z.array(sendMessageOutputSchema),
});

// ========================================
// Channel Schemas
// ========================================

export const createChannelInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  name: z.string().describe("Nome do canal (2-100 caracteres)"),
  type: z
    .number()
    .optional()
    .describe("Tipo do canal (0=Text, 2=Voice, 4=Category, 5=News)"),
  topic: z.string().optional().describe("Tópico do canal"),
  nsfw: z.boolean().optional().describe("Se o canal é NSFW"),
  parentId: z.string().optional().describe("ID da categoria pai"),
  position: z.number().optional().describe("Posição do canal na lista"),
  bitrate: z.number().optional().describe("Taxa de bits do canal de voz"),
  userLimit: z
    .number()
    .optional()
    .describe("Limite de usuários do canal de voz"),
  rateLimitPerUser: z
    .number()
    .optional()
    .describe("Taxa de limite de mensagens por usuário"),
});

export const createChannelOutputSchema = z.object({
  id: z.string(),
  type: z.number(),
  name: z.string().optional(),
  guild_id: z.string().optional(),
});

export const getGuildChannelsInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
});

export const getGuildChannelsOutputSchema = z.object({
  channels: z.array(createChannelOutputSchema),
});

// ========================================
// Guild Schemas
// ========================================

export const listBotGuildsInputSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .describe("Número máximo de servidores a retornar"),
  before: z
    .string()
    .optional()
    .describe("ID do servidor - retornar servidores antes deste"),
  after: z
    .string()
    .optional()
    .describe("ID do servidor - retornar servidores após este"),
  withCounts: z
    .boolean()
    .optional()
    .describe("Se deve incluir contagem aproximada de membros"),
});

export const listBotGuildsOutputSchema = z.object({
  guilds: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string().optional().nullable(),
      owner: z.boolean().optional(),
      permissions: z.string().optional(),
    }),
  ),
});

export const getGuildInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  withCounts: z
    .boolean()
    .optional()
    .describe("Se deve incluir contagem de membros"),
});

export const getGuildOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional().nullable(),
  owner_id: z.string(),
  permissions: z.string().optional(),
  member_count: z.number().optional(),
});

export const getGuildMembersInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe("Número máximo de membros a retornar"),
  after: z
    .string()
    .optional()
    .describe("ID do usuário - buscar membros após este"),
});

export const getGuildMembersOutputSchema = z.object({
  members: z.array(
    z.object({
      user: z
        .object({
          id: z.string(),
          username: z.string(),
          discriminator: z.string(),
        })
        .optional(),
      nick: z.string().optional().nullable(),
      roles: z.array(z.string()),
      joined_at: z.string(),
    }),
  ),
});

export const banMemberInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  userId: z.string().describe("ID do usuário a ser banido"),
  deleteMessageDays: z
    .number()
    .min(0)
    .max(7)
    .optional()
    .describe("Número de dias de mensagens a deletar (0-7)"),
  reason: z.string().optional().describe("Razão do banimento"),
});

export const banMemberOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const getCurrentUserInputSchema = z.object({});

export const getCurrentUserOutputSchema = z.object({
  id: z.string(),
  username: z.string(),
  discriminator: z.string(),
  bot: z.boolean().optional(),
});

export const getUserInputSchema = z.object({
  userId: z.string().describe("ID do usuário"),
});

export const getUserOutputSchema = getCurrentUserOutputSchema;

// ========================================
// Role Schemas
// ========================================

export const createRoleInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  name: z.string().optional().describe("Nome da role"),
  permissions: z.string().optional().describe("Permissões da role (bitfield)"),
  color: z.number().optional().describe("Cor da role (número RGB)"),
  hoist: z
    .boolean()
    .optional()
    .describe("Se a role aparece separadamente na lista de membros"),
  mentionable: z.boolean().optional().describe("Se a role pode ser mencionada"),
});

export const createRoleOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number(),
  hoist: z.boolean(),
  position: z.number(),
  permissions: z.string(),
  managed: z.boolean(),
  mentionable: z.boolean(),
});

export const editRoleInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  roleId: z.string().describe("ID da role a ser editada"),
  name: z.string().optional().describe("Novo nome da role"),
  permissions: z.string().optional().describe("Novas permissões da role"),
  color: z.number().optional().describe("Nova cor da role"),
  hoist: z.boolean().optional().describe("Se a role aparece separadamente"),
  mentionable: z.boolean().optional().describe("Se a role pode ser mencionada"),
});

export const editRoleOutputSchema = createRoleOutputSchema;

export const deleteRoleInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
  roleId: z.string().describe("ID da role a ser deletada"),
  reason: z.string().optional().describe("Razão da exclusão"),
});

export const deleteRoleOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const getGuildRolesInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
});

export const getGuildRolesOutputSchema = z.object({
  roles: z.array(createRoleOutputSchema),
});

// ========================================
// Thread Schemas
// ========================================

export const createThreadInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  name: z.string().describe("Nome da thread"),
  autoArchiveDuration: z
    .number()
    .optional()
    .describe("Duração para arquivamento automático em minutos"),
  type: z.number().optional().describe("Tipo da thread"),
  invitable: z
    .boolean()
    .optional()
    .describe("Se membros podem convidar outros"),
  rateLimitPerUser: z
    .number()
    .optional()
    .describe("Taxa de limite de mensagens por usuário"),
});

export const createThreadOutputSchema = z.object({
  id: z.string(),
  type: z.number(),
  name: z.string().optional(),
  guild_id: z.string().optional(),
});

export const joinThreadInputSchema = z.object({
  channelId: z.string().describe("ID da thread"),
});

export const joinThreadOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const leaveThreadInputSchema = joinThreadInputSchema;
export const leaveThreadOutputSchema = joinThreadOutputSchema;

export const getActiveThreadsInputSchema = z.object({
  guildId: z.string().describe("ID do servidor Discord"),
});

export const getActiveThreadsOutputSchema = z.object({
  threads: z.array(createThreadOutputSchema),
});

export const getArchivedThreadsInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  type: z.enum(["public", "private"]).describe("Tipo de threads arquivadas"),
  before: z
    .string()
    .optional()
    .describe(
      "Timestamp ISO8601 - retornar threads arquivadas antes desta data",
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Número máximo de threads a retornar"),
});

export const getArchivedThreadsOutputSchema = getActiveThreadsOutputSchema;

// ========================================
// Webhook Schemas
// ========================================

export const createWebhookInputSchema = z.object({
  channelId: z.string().describe("ID do canal Discord"),
  name: z.string().describe("Nome do webhook"),
  avatar: z.string().optional().describe("URL ou data URI da imagem do avatar"),
});

export const createWebhookOutputSchema = z.object({
  id: z.string(),
  type: z.number(),
  name: z.string().optional().nullable(),
  token: z.string().optional(),
  channel_id: z.string(),
});

export const executeWebhookInputSchema = z.object({
  webhookId: z.string().describe("ID do webhook"),
  webhookToken: z.string().describe("Token do webhook"),
  content: z.string().optional().describe("Conteúdo da mensagem"),
  username: z.string().optional().describe("Nome de usuário customizado"),
  avatarUrl: z.string().optional().describe("URL do avatar customizado"),
  tts: z.boolean().optional().describe("Se é uma mensagem de texto para fala"),
  embeds: z.array(discordEmbedSchema).optional().describe("Lista de embeds"),
  threadName: z
    .string()
    .optional()
    .describe("Nome da thread a criar (para webhooks de fórum)"),
  wait: z
    .boolean()
    .optional()
    .describe("Se deve aguardar e retornar a mensagem criada"),
  threadId: z
    .string()
    .optional()
    .describe("ID da thread onde enviar a mensagem"),
});

export const executeWebhookOutputSchema = sendMessageOutputSchema;

export const deleteWebhookInputSchema = z.object({
  webhookId: z.string().describe("ID do webhook"),
  webhookToken: z.string().describe("Token do webhook"),
});

export const deleteWebhookOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const listWebhooksInputSchema = z.object({
  channelId: z
    .string()
    .optional()
    .describe("ID do canal Discord (se omitido, requer guildId)"),
  guildId: z
    .string()
    .optional()
    .describe("ID do servidor Discord (se omitido, requer channelId)"),
});

export const listWebhooksOutputSchema = z.object({
  webhooks: z.array(createWebhookOutputSchema),
});

// ========================================
// Discord Interactions (Webhooks)
// ========================================

/**
 * Tipos de interação do Discord
 */
export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

/**
 * Tipos de resposta de interação
 */
export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8,
  MODAL = 9,
}

/**
 * Dados da interação de comando
 */
export interface InteractionDataOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionDataOption[];
  focused?: boolean;
}

export interface InteractionData {
  id: string;
  name: string;
  type: number;
  resolved?: any;
  options?: InteractionDataOption[];
  guild_id?: string;
  target_id?: string;
  custom_id?: string;
  component_type?: number;
  values?: string[];
  components?: DiscordComponent[];
}

/**
 * Estrutura principal da interação recebida do Discord
 */
export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: InteractionType;
  data?: InteractionData;
  guild_id?: string;
  channel_id?: string;
  member?: DiscordGuildMember;
  user?: DiscordUser;
  token: string;
  version: number;
  message?: DiscordMessage;
  locale?: string;
  guild_locale?: string;
  app_permissions?: string;
}

/**
 * Resposta de interação
 */
export interface InteractionResponse {
  type: InteractionResponseType;
  data?: InteractionCallbackData;
}

export interface InteractionCallbackData {
  tts?: boolean;
  content?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions?: AllowedMentions;
  flags?: number;
  components?: DiscordMessageComponent[];
  attachments?: DiscordMessageAttachment[];
}

/**
 * Payload recebido via webhook
 */
export interface WebhookPayload {
  body: string;
  signature: string | null;
  timestamp: string | null;
}
