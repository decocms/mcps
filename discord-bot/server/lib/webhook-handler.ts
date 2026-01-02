/**
 * Handler para webhooks do Discord
 * Processa interações recebidas via webhook
 */
import type { Env } from "../main.ts";
import {
  type DiscordInteraction,
  InteractionType,
  InteractionResponseType,
  type InteractionResponse,
} from "./types.ts";
import {
  verifyDiscordSignature,
  extractSignatureHeaders,
} from "./verification.ts";
import { DISCORD_API_URL } from "./constants.ts";

/**
 * Handler principal para requisições de webhook do Discord
 */
export async function handleDiscordWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Ler o corpo da requisição (precisa ser string para validação)
  const body = await request.text();

  // 2. Extrair headers de assinatura
  const { signature, timestamp } = extractSignatureHeaders(request);

  // 3. Validar assinatura
  const state = env.DECO_REQUEST_CONTEXT?.state;
  
  // Suporte para dev local e produção
  const publicKey = state?.discordPublicKey || (env as any).DISCORD_PUBLIC_KEY;
  
  if (!publicKey) {
    console.error("Discord Public Key not configured");
    return new Response("Server configuration error", { status: 500 });
  }
  
  const isValid = await verifyDiscordSignature(
    body,
    signature,
    timestamp,
    publicKey
  );

  if (!isValid) {
    console.error("Invalid Discord signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // 4. Parsear a interação
  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch (error) {
    console.error("Failed to parse interaction:", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  // 5. Processar com base no tipo de interação
  return await processInteraction(interaction, env);
}

/**
 * Processa diferentes tipos de interação
 */
async function processInteraction(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  switch (interaction.type) {
    case InteractionType.PING:
      // Discord está validando o endpoint
      return respondToPing();

    case InteractionType.APPLICATION_COMMAND:
      // Comando de aplicação (slash command)
      return await handleApplicationCommand(interaction, env);

    case InteractionType.MESSAGE_COMPONENT:
      // Interação com componente (botão, select menu, etc)
      return await handleMessageComponent(interaction, env);

    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      // Autocomplete de comando
      return await handleAutocomplete(interaction, env);

    case InteractionType.MODAL_SUBMIT:
      // Submissão de modal
      return await handleModalSubmit(interaction, env);

    default:
      console.warn(`Unknown interaction type: ${interaction.type}`);
      return new Response("Unknown interaction type", { status: 400 });
  }
}

/**
 * Responde ao PING do Discord (validação de endpoint)
 */
function respondToPing(): Response {
  const response: InteractionResponse = {
    type: InteractionResponseType.PONG,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Processa comandos de aplicação (slash commands)
 */
async function handleApplicationCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  // Responder imediatamente para evitar timeout (3 segundos)
  const response: InteractionResponse = {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  };

  // Processar comando de forma assíncrona
  // @ts-ignore - waitUntil existe em Cloudflare Workers
  if (env.ctx?.waitUntil) {
    // @ts-ignore
    env.ctx.waitUntil(processCommandAsync(interaction, env));
  } else {
    // Fallback para ambientes sem waitUntil
    processCommandAsync(interaction, env).catch((error) => {
      console.error("Error processing command:", error);
    });
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Processa o comando de forma assíncrona
 */
async function processCommandAsync(
  interaction: DiscordInteraction,
  env: Env
): Promise<void> {
  try {
    const commandName = interaction.data?.name;
    const options = interaction.data?.options || [];

    // Extrair valor do primeiro argumento (se houver)
    const firstOption = options[0];
    const userInput = firstOption?.value?.toString() || "";

    console.log(`Processing command: ${commandName}`, {
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      userId: interaction.member?.user?.id || interaction.user?.id,
      input: userInput,
    });

    // Aqui você pode:
    // 1. Buscar configuração do comando em um KV ou D1
    // 2. Rotear para um agente Deco específico
    // 3. Processar com IA
    // 4. Integrar com outros serviços

    // Por enquanto, vamos responder com uma mensagem simples
    const responseMessage = `Comando **/${commandName}** recebido!\n\n` +
      `📝 Input: ${userInput || "(nenhum)"}\n` +
      `🆔 Guild: ${interaction.guild_id}\n` +
      `📍 Channel: ${interaction.channel_id}`;

    // Enviar resposta via followup
    await sendFollowupMessage(interaction, env, {
      content: responseMessage,
    });
  } catch (error) {
    console.error("Error in processCommandAsync:", error);

    // Enviar mensagem de erro
    await sendFollowupMessage(interaction, env, {
      content: "❌ Ocorreu um erro ao processar o comando.",
    });
  }
}

/**
 * Envia uma mensagem de followup (após resposta inicial)
 */
async function sendFollowupMessage(
  interaction: DiscordInteraction,
  env: Env,
  message: {
    content?: string;
    embeds?: any[];
    components?: any[];
  }
): Promise<void> {
  const url = `${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}`;
  
  // Suporte para dev local e produção
  const state = env.DECO_REQUEST_CONTEXT?.state;
  const botToken = state?.botToken || (env as any).DISCORD_BOT_TOKEN;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send followup message:", response.status, errorText);
    throw new Error(`Failed to send followup: ${response.status}`);
  }
}

/**
 * Processa interações com componentes (botões, select menus)
 */
async function handleMessageComponent(
  interaction: DiscordInteraction,
  _env: Env
): Promise<Response> {
  // Responder ao componente
  const response: InteractionResponse = {
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      content: `Você clicou no componente: ${interaction.data?.custom_id}`,
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Processa autocomplete de comandos
 */
async function handleAutocomplete(
  _interaction: DiscordInteraction,
  _env: Env
): Promise<Response> {
  // Retornar opções de autocomplete
  const response: InteractionResponse = {
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      // @ts-ignore - choices não está em InteractionCallbackData mas é válido
      choices: [
        { name: "Opção 1", value: "opcao1" },
        { name: "Opção 2", value: "opcao2" },
      ],
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Processa submissão de modals
 */
async function handleModalSubmit(
  _interaction: DiscordInteraction,
  _env: Env
): Promise<Response> {
  // Processar dados do modal
  const response: InteractionResponse = {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Modal recebido com sucesso!",
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Edita a resposta original de uma interação
 */
export async function editOriginalResponse(
  interaction: DiscordInteraction,
  env: Env,
  message: {
    content?: string;
    embeds?: any[];
    components?: any[];
  }
): Promise<void> {
  const url = `${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  
  // Suporte para dev local e produção
  const state = env.DECO_REQUEST_CONTEXT?.state;
  const botToken = state?.botToken || (env as any).DISCORD_BOT_TOKEN;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to edit original response:", response.status, errorText);
    throw new Error(`Failed to edit response: ${response.status}`);
  }
}

