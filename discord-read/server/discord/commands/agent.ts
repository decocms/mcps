/**
 * Agent Slash Commands
 *
 * Slash commands for managing AI agent configurations.
 * These commands are registered with Discord.
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import {
  listAgentConfigs,
  createAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  getAgentConfig,
  upsertAgentPermission,
  deleteAgentPermission,
  getAgentPermissions,
} from "../../../shared/db.ts";

/**
 * Agent command definition
 */
export const agentCommand = new SlashCommandBuilder()
  .setName("agent")
  .setDescription("Gerenciar agentes de IA")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // Subcomando: list
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("Listar todos os agentes configurados"),
  )

  // Subcomando: create
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Criar um novo agente")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Nome do agente").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("command")
          .setDescription("Comando para invocar (ex: issues)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("agent_id")
          .setDescription("ID do binding do agente no MCP")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("model")
          .setDescription("Modelo a usar (ex: claude-3.5-sonnet)"),
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("Descrição do agente"),
      )
      .addStringOption((opt) =>
        opt.setName("system_prompt").setDescription("Prompt de sistema"),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("context")
          .setDescription("Número de mensagens de contexto (0-50)")
          .setMinValue(0)
          .setMaxValue(50),
      ),
  )

  // Subcomando: edit
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("Editar um agente existente")
      .addStringOption((opt) =>
        opt
          .setName("command")
          .setDescription("Comando do agente")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Novo nome do agente"),
      )
      .addStringOption((opt) =>
        opt.setName("model").setDescription("Novo modelo"),
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("Nova descrição"),
      )
      .addStringOption((opt) =>
        opt.setName("system_prompt").setDescription("Novo prompt de sistema"),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("context")
          .setDescription("Número de mensagens de contexto (0-50)")
          .setMinValue(0)
          .setMaxValue(50),
      )
      .addBooleanOption((opt) =>
        opt.setName("enabled").setDescription("Habilitar/desabilitar agente"),
      ),
  )

  // Subcomando: delete
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Deletar um agente")
      .addStringOption((opt) =>
        opt
          .setName("command")
          .setDescription("Comando do agente")
          .setRequired(true),
      ),
  )

  // Subcomando: permission
  .addSubcommand((sub) =>
    sub
      .setName("permission")
      .setDescription("Gerenciar permissões de um agente")
      .addStringOption((opt) =>
        opt
          .setName("command")
          .setDescription("Comando do agente")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("action")
          .setDescription("Ação a realizar")
          .setRequired(true)
          .addChoices(
            { name: "list", value: "list" },
            { name: "allow-user", value: "allow-user" },
            { name: "deny-user", value: "deny-user" },
            { name: "allow-role", value: "allow-role" },
            { name: "deny-role", value: "deny-role" },
            { name: "allow-everyone", value: "allow-everyone" },
            { name: "deny-everyone", value: "deny-everyone" },
            { name: "remove", value: "remove" },
          ),
      )
      .addUserOption((opt) =>
        opt.setName("user").setDescription("Usuário (para allow/deny-user)"),
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("Cargo (para allow/deny-role)"),
      ),
  );

/**
 * Handle agent command execution
 */
export async function handleAgentCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "Este comando só pode ser usado em um servidor.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "list":
      await handleList(interaction);
      break;
    case "create":
      await handleCreate(interaction);
      break;
    case "edit":
      await handleEdit(interaction);
      break;
    case "delete":
      await handleDelete(interaction);
      break;
    case "permission":
      await handlePermission(interaction);
      break;
  }
}

/**
 * List all agents
 */
async function handleList(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const agents = await listAgentConfigs(interaction.guild!.id);

  if (agents.length === 0) {
    await interaction.reply({
      content: "Nenhum agente configurado neste servidor.",
      ephemeral: true,
    });
    return;
  }

  const lines = agents.map((a) => {
    const status = a.enabled ? "✅" : "❌";
    return `${status} **!${a.command}** - ${a.name}${a.description ? `: ${a.description}` : ""}`;
  });

  await interaction.reply({
    content: `**Agentes configurados:**\n${lines.join("\n")}`,
    ephemeral: true,
  });
}

/**
 * Create a new agent
 */
async function handleCreate(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const name = interaction.options.getString("name", true);
  const command = interaction.options.getString("command", true);
  const agentId = interaction.options.getString("agent_id", true);
  const model = interaction.options.getString("model");
  const description = interaction.options.getString("description");
  const systemPrompt = interaction.options.getString("system_prompt");
  const context = interaction.options.getInteger("context") ?? 5;

  // Check if command already exists
  const existing = await getAgentConfig(interaction.guild!.id, command);
  if (existing) {
    await interaction.reply({
      content: `Já existe um agente com o comando **!${command}**`,
      ephemeral: true,
    });
    return;
  }

  const agent = await createAgentConfig({
    guild_id: interaction.guild!.id,
    name,
    command: command.toLowerCase(),
    description,
    agent_binding_id: agentId,
    model_id: model,
    system_prompt: systemPrompt,
    context_messages: context,
    enabled: true,
    created_by: interaction.user.id,
  });

  await interaction.reply({
    content: `✅ Agente **${name}** criado! Use **!${agent.command}** para invocar.`,
    ephemeral: true,
  });
}

/**
 * Edit an existing agent
 */
async function handleEdit(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = interaction.options.getString("command", true);

  const agent = await getAgentConfig(interaction.guild!.id, command);
  if (!agent) {
    await interaction.reply({
      content: `Agente **!${command}** não encontrado.`,
      ephemeral: true,
    });
    return;
  }

  const updates: Record<string, unknown> = {};

  const name = interaction.options.getString("name");
  if (name) updates.name = name;

  const model = interaction.options.getString("model");
  if (model) updates.model_id = model;

  const description = interaction.options.getString("description");
  if (description !== null) updates.description = description;

  const systemPrompt = interaction.options.getString("system_prompt");
  if (systemPrompt !== null) updates.system_prompt = systemPrompt;

  const context = interaction.options.getInteger("context");
  if (context !== null) updates.context_messages = context;

  const enabled = interaction.options.getBoolean("enabled");
  if (enabled !== null) updates.enabled = enabled;

  if (Object.keys(updates).length === 0) {
    await interaction.reply({
      content: "Nenhuma alteração fornecida.",
      ephemeral: true,
    });
    return;
  }

  await updateAgentConfig(agent.id!, updates);

  await interaction.reply({
    content: `✅ Agente **!${command}** atualizado.`,
    ephemeral: true,
  });
}

/**
 * Delete an agent
 */
async function handleDelete(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = interaction.options.getString("command", true);

  const agent = await getAgentConfig(interaction.guild!.id, command);
  if (!agent) {
    await interaction.reply({
      content: `Agente **!${command}** não encontrado.`,
      ephemeral: true,
    });
    return;
  }

  await deleteAgentConfig(agent.id!);

  await interaction.reply({
    content: `🗑️ Agente **!${command}** deletado.`,
    ephemeral: true,
  });
}

/**
 * Manage agent permissions
 */
async function handlePermission(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = interaction.options.getString("command", true);
  const action = interaction.options.getString("action", true);

  const agent = await getAgentConfig(interaction.guild!.id, command);
  if (!agent) {
    await interaction.reply({
      content: `Agente **!${command}** não encontrado.`,
      ephemeral: true,
    });
    return;
  }

  switch (action) {
    case "list": {
      const permissions = await getAgentPermissions(agent.id!);
      if (permissions.length === 0) {
        await interaction.reply({
          content: `Nenhuma permissão configurada para **!${command}**.\nPor padrão, apenas o dono do servidor pode usar.`,
          ephemeral: true,
        });
        return;
      }

      const lines = permissions.map((p) => {
        const icon = p.allowed ? "✅" : "❌";
        const target =
          p.type === "everyone"
            ? "@everyone"
            : p.type === "user"
              ? `<@${p.target_id}>`
              : `<@&${p.target_id}>`;
        return `${icon} ${target}`;
      });

      await interaction.reply({
        content: `**Permissões para !${command}:**\n${lines.join("\n")}`,
        ephemeral: true,
      });
      break;
    }

    case "allow-user":
    case "deny-user": {
      const user = interaction.options.getUser("user");
      if (!user) {
        await interaction.reply({
          content: "Por favor, especifique um usuário.",
          ephemeral: true,
        });
        return;
      }

      await upsertAgentPermission({
        agent_config_id: agent.id!,
        type: "user",
        target_id: user.id,
        allowed: action === "allow-user",
        created_by: interaction.user.id,
      });

      await interaction.reply({
        content: `${action === "allow-user" ? "✅" : "❌"} Permissão ${action === "allow-user" ? "concedida" : "negada"} para <@${user.id}> em **!${command}**`,
        ephemeral: true,
      });
      break;
    }

    case "allow-role":
    case "deny-role": {
      const role = interaction.options.getRole("role");
      if (!role) {
        await interaction.reply({
          content: "Por favor, especifique um cargo.",
          ephemeral: true,
        });
        return;
      }

      await upsertAgentPermission({
        agent_config_id: agent.id!,
        type: "role",
        target_id: role.id,
        allowed: action === "allow-role",
        created_by: interaction.user.id,
      });

      await interaction.reply({
        content: `${action === "allow-role" ? "✅" : "❌"} Permissão ${action === "allow-role" ? "concedida" : "negada"} para <@&${role.id}> em **!${command}**`,
        ephemeral: true,
      });
      break;
    }

    case "allow-everyone":
    case "deny-everyone": {
      await upsertAgentPermission({
        agent_config_id: agent.id!,
        type: "everyone",
        target_id: null,
        allowed: action === "allow-everyone",
        created_by: interaction.user.id,
      });

      await interaction.reply({
        content: `${action === "allow-everyone" ? "✅" : "❌"} Permissão ${action === "allow-everyone" ? "concedida" : "negada"} para @everyone em **!${command}**`,
        ephemeral: true,
      });
      break;
    }

    case "remove": {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");

      if (user) {
        await deleteAgentPermission(agent.id!, "user", user.id);
        await interaction.reply({
          content: `🗑️ Permissão removida de <@${user.id}> em **!${command}**`,
          ephemeral: true,
        });
      } else if (role) {
        await deleteAgentPermission(agent.id!, "role", role.id);
        await interaction.reply({
          content: `🗑️ Permissão removida de <@&${role.id}> em **!${command}**`,
          ephemeral: true,
        });
      } else {
        await deleteAgentPermission(agent.id!, "everyone", null);
        await interaction.reply({
          content: `🗑️ Permissão @everyone removida de **!${command}**`,
          ephemeral: true,
        });
      }
      break;
    }
  }
}
