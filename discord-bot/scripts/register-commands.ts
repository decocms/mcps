/**
 * Script para registrar comandos slash no Discord
 * 
 * Uso:
 *   bun run scripts/register-commands.ts
 * 
 * Requisitos:
 *   - Defina as variáveis de ambiente:
 *     - DISCORD_APP_ID: ID da aplicação Discord
 *     - DISCORD_BOT_TOKEN: Token do bot
 *     - DISCORD_GUILD_ID (opcional): ID do servidor para comandos de teste
 */

const DISCORD_API_URL = "https://discord.com/api/v10";

// ========================================
// Configuração dos Comandos
// ========================================

const commands = [
  {
    name: "deco",
    description: "Interagir com agente Deco via Discord",
    options: [
      {
        name: "message",
        description: "Mensagem para enviar ao agente",
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: "ping",
    description: "Verificar se o bot está online",
  },
  {
    name: "help",
    description: "Mostrar ajuda sobre comandos disponíveis",
  },
];

// ========================================
// Funções de Registro
// ========================================

async function registerGlobalCommands(
  appId: string,
  botToken: string
): Promise<void> {
  console.log("📝 Registrando comandos globais...");
  console.log(`Total: ${commands.length} comandos`);

  const url = `${DISCORD_API_URL}/applications/${appId}/commands`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Falha ao registrar comandos: ${response.status} - ${error}`
      );
    }

    const result = await response.json();
    console.log("✅ Comandos globais registrados com sucesso!");
    console.log(`Registrados ${result.length} comandos`);

    result.forEach((cmd: any) => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

    console.log(
      "\n⚠️  Nota: Comandos globais podem demorar até 1 hora para propagar."
    );
  } catch (error) {
    console.error("❌ Erro ao registrar comandos globais:", error);
    throw error;
  }
}

async function registerGuildCommands(
  appId: string,
  botToken: string,
  guildId: string
): Promise<void> {
  console.log(`📝 Registrando comandos no servidor ${guildId}...`);
  console.log(`Total: ${commands.length} comandos`);

  const url =
    `${DISCORD_API_URL}/applications/${appId}/guilds/${guildId}/commands`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Falha ao registrar comandos: ${response.status} - ${error}`
      );
    }

    const result = await response.json();
    console.log("✅ Comandos do servidor registrados com sucesso!");
    console.log(`Registrados ${result.length} comandos`);

    result.forEach((cmd: any) => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

    console.log("\n✅ Comandos devem estar disponíveis imediatamente!");
  } catch (error) {
    console.error("❌ Erro ao registrar comandos do servidor:", error);
    throw error;
  }
}

async function listCommands(
  appId: string,
  botToken: string,
  guildId?: string
): Promise<void> {
  const scope = guildId ? `servidor ${guildId}` : "globais";
  console.log(`📋 Listando comandos ${scope}...`);

  const url = guildId
    ? `${DISCORD_API_URL}/applications/${appId}/guilds/${guildId}/commands`
    : `${DISCORD_API_URL}/applications/${appId}/commands`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bot ${botToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Falha ao listar comandos: ${response.status} - ${error}`);
    }

    const result = await response.json();

    if (result.length === 0) {
      console.log(`ℹ️  Nenhum comando ${scope} encontrado.`);
      return;
    }

    console.log(`\nComandos ${scope} (${result.length}):`);
    result.forEach((cmd: any) => {
      console.log(`\n  📌 /${cmd.name}`);
      console.log(`     ID: ${cmd.id}`);
      console.log(`     Descrição: ${cmd.description}`);
      if (cmd.options && cmd.options.length > 0) {
        console.log(`     Opções:`);
        cmd.options.forEach((opt: any) => {
          const required = opt.required ? " (obrigatório)" : "";
          console.log(`       - ${opt.name}: ${opt.description}${required}`);
        });
      }
    });
  } catch (error) {
    console.error("❌ Erro ao listar comandos:", error);
    throw error;
  }
}

async function deleteAllCommands(
  appId: string,
  botToken: string,
  guildId?: string
): Promise<void> {
  const scope = guildId ? `servidor ${guildId}` : "globais";
  console.log(`🗑️  Deletando todos os comandos ${scope}...`);

  const url = guildId
    ? `${DISCORD_API_URL}/applications/${appId}/guilds/${guildId}/commands`
    : `${DISCORD_API_URL}/applications/${appId}/commands`;

  try {
    // Primeiro, listar comandos existentes
    const listResponse = await fetch(url, {
      headers: {
        "Authorization": `Bot ${botToken}`,
      },
    });

    if (!listResponse.ok) {
      throw new Error(`Falha ao listar comandos: ${listResponse.status}`);
    }

    const existingCommands = await listResponse.json();

    if (existingCommands.length === 0) {
      console.log(`ℹ️  Nenhum comando ${scope} para deletar.`);
      return;
    }

    console.log(`Encontrados ${existingCommands.length} comandos para deletar`);

    // Deletar todos de uma vez enviando array vazio
    const deleteResponse = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([]),
    });

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text();
      throw new Error(`Falha ao deletar comandos: ${deleteResponse.status} - ${error}`);
    }

    console.log(`✅ Todos os comandos ${scope} foram deletados!`);
  } catch (error) {
    console.error("❌ Erro ao deletar comandos:", error);
    throw error;
  }
}

// ========================================
// CLI
// ========================================

async function main() {
  const appId = process.env.DISCORD_APP_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!appId || !botToken) {
    console.error("❌ Erro: Variáveis de ambiente não configuradas!");
    console.error("\nDefina as seguintes variáveis:");
    console.error("  - DISCORD_APP_ID: ID da aplicação Discord");
    console.error("  - DISCORD_BOT_TOKEN: Token do bot");
    console.error(
      "  - DISCORD_GUILD_ID (opcional): ID do servidor para comandos de teste"
    );
    console.error("\nExemplo:");
    console.error(
      "  DISCORD_APP_ID=123456 DISCORD_BOT_TOKEN=abc123 bun run scripts/register-commands.ts"
    );
    process.exit(1);
  }

  const action = process.argv[2] || "register";

  console.log("🤖 Discord Bot - Gerenciador de Comandos\n");

  try {
    switch (action) {
      case "register":
      case "reg":
        if (guildId) {
          console.log("🎯 Modo: Registrar comandos no servidor (instantâneo)");
          await registerGuildCommands(appId, botToken, guildId);
        } else {
          console.log("🌍 Modo: Registrar comandos globais (demora até 1h)");
          await registerGlobalCommands(appId, botToken);
        }
        break;

      case "list":
      case "ls":
        await listCommands(appId, botToken, guildId);
        break;

      case "delete":
      case "del":
        await deleteAllCommands(appId, botToken, guildId);
        break;

      case "help":
      case "--help":
      case "-h":
        console.log("Uso: bun run scripts/register-commands.ts [ação]\n");
        console.log("Ações disponíveis:");
        console.log("  register, reg    Registrar comandos (padrão)");
        console.log("  list, ls         Listar comandos existentes");
        console.log("  delete, del      Deletar todos os comandos");
        console.log("  help             Mostrar esta ajuda");
        console.log("\nVariáveis de ambiente:");
        console.log("  DISCORD_APP_ID       ID da aplicação (obrigatório)");
        console.log("  DISCORD_BOT_TOKEN    Token do bot (obrigatório)");
        console.log("  DISCORD_GUILD_ID     ID do servidor (opcional)");
        console.log("\nExemplos:");
        console.log("  # Registrar globalmente");
        console.log("  DISCORD_APP_ID=123 DISCORD_BOT_TOKEN=abc bun run scripts/register-commands.ts");
        console.log("\n  # Registrar em servidor específico");
        console.log("  DISCORD_APP_ID=123 DISCORD_BOT_TOKEN=abc DISCORD_GUILD_ID=456 bun run scripts/register-commands.ts");
        console.log("\n  # Listar comandos");
        console.log("  DISCORD_APP_ID=123 DISCORD_BOT_TOKEN=abc bun run scripts/register-commands.ts list");
        break;

      default:
        console.error(`❌ Ação desconhecida: ${action}`);
        console.error("Use 'help' para ver as ações disponíveis.");
        process.exit(1);
    }

    console.log("\n✨ Concluído!");
  } catch (error) {
    console.error("\n💥 Erro fatal:", error);
    process.exit(1);
  }
}

// Executar apenas se for o arquivo principal
if (import.meta.main) {
  main();
}

