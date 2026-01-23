# LLM Bindings e Suporte a Arquivos Multimídia

Este documento descreve como o Slack MCP integra com a API Decopilot do Mesh para processar mensagens com LLM e suporte a arquivos multimídia (imagens e áudio).

## Visão Geral

O Slack MCP usa a API Decopilot do Mesh para processar mensagens de usuários com modelos de linguagem. A integração suporta:

- ✅ Streaming de respostas em tempo real
- ✅ Anexos de imagem (visão computacional)
- ✅ Anexos de áudio (transcrição e análise)
- ✅ Contexto de conversação
- ✅ Agentes personalizados
- ✅ Múltiplos provedores de LLM (Anthropic, OpenAI, etc.)

## Fluxo de Processamento

### 1. Recebimento de Mensagem

Quando uma mensagem chega do Slack:

```typescript
// EventHandler detecta mensagem com anexos
const media = await processAttachedFiles(files);
```

### 2. Download de Arquivos Multimídia

Arquivos (imagens e áudio) são baixados do Slack e convertidos para base64:

```typescript
// slack-client.ts - processSlackFiles()
const downloaded = await downloadSlackFile(file.url_private, file.mimetype);

return {
  type: isAudio ? "audio" : "image",  // Detecta automaticamente
  data: downloaded.data,              // Base64
  mimeType: downloaded.mimeType,      // audio/mp4, image/png, etc.
  name: file.name,                    // Nome original do arquivo
};
```

**Tipos de arquivo suportados:**
- **Imagens**: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- **Áudio**: `audio/mp4`, `audio/mpeg`, `audio/ogg`, `audio/webm`, `audio/wav`

### 3. Construção do Prompt

Mensagens são convertidas para o formato da API Decopilot:

```typescript
// lib/llm.ts - messagesToPrompt()
const prompt = [
  {
    id: "msg_<timestamp>_<random>",
    role: "user",
    parts: [
      { type: "text", text: "O que tem nesta imagem?" },
      { 
        type: "file",
        url: "data:image/png;base64,iVBORw0KGgo...",
        filename: "image",
        mediaType: "image/png"
      }
    ]
  }
];
```

## Formato de Mensagens

### Estrutura de UIMessage

Cada mensagem segue o formato `UIMessage` do Vercel AI SDK:

```typescript
interface UIMessage {
  id: string;                    // ID único obrigatório
  role: "user" | "assistant" | "system";
  parts: UIMessagePart[];        // Array de partes (texto, arquivos, etc.)
  metadata?: unknown;            // Metadados opcionais
}
```

### Tipos de Parts

#### Texto

```typescript
{
  type: "text",
  text: "Conteúdo da mensagem"
}
```

#### Imagem/Arquivo

```typescript
{
  type: "file",
  url: "data:image/png;base64,<base64_data>",
  filename: "image",
  mediaType: "image/png"
}
```

**IMPORTANTE:** 
- O `type` deve ser `"file"` (não `"image"` ou `"data-url"`)
- O `url` deve ser um data URI completo com o prefixo `data:${mimeType};base64,`
- Inclua `filename` e `mediaType` obrigatoriamente

### Suporte a Áudio

Arquivos de áudio são processados de forma idêntica às imagens:

```typescript
// Exemplo de áudio no prompt
{
  type: "file",
  url: "data:audio/mp4;base64,<base64_data>",
  filename: "audio_message.m4a",
  mediaType: "audio/mp4"
}
```

**Como funciona:**
1. ✅ Usuário envia mensagem de voz ou anexo de áudio no Slack
2. ✅ O bot baixa o arquivo automaticamente via Slack API
3. ✅ Converte para base64 e adiciona ao prompt
4. ✅ O LLM processa o áudio nativamente (transcrição + análise)

**Formatos suportados:**
- `audio/mp4` (`.m4a`)
- `audio/mpeg` (`.mp3`)
- `audio/ogg` (`.ogg`)
- `audio/webm` (`.webm`)
- `audio/wav` (`.wav`)

**Transcrição Automática via Whisper:**
O bot pode usar a binding do **OpenAI Whisper** para transcrever áudios automaticamente antes de enviar para o LLM. Quando configurado:

1. ✅ Usuário envia áudio
2. ✅ Bot baixa o arquivo
3. ✅ **Whisper transcreve** o áudio
4. ✅ Transcrição é adicionada ao prompt como texto
5. ✅ LLM recebe o texto + contexto

**Configuração:**
```typescript
// No Mesh Admin, adicionar binding:
WHISPER: "@deco/whisper"
```

**Vantagens:**
- ✅ Transcrição rápida e precisa (57+ idiomas)
- ✅ Funciona mesmo que Slack não gere transcrição
- ✅ LLM pode processar o texto normalmente
- ✅ Suporta contexto de conversação com áudio

**Sem Whisper:**
Se a binding não estiver configurada e o usuário enviar áudio, o bot responderá com:
```
🎤 Áudio detectado! Para processar arquivos de áudio, é necessário 
ativar a integração Whisper no Mesh.

Entre em contato com o administrador para configurar o Whisper 
e habilitar transcrição automática de áudios.
```

O áudio **não será processado** até que o Whisper seja configurado.

## API Decopilot

### Endpoint

```
POST /api/{organizationId}/decopilot/stream
```

### Request Body

```typescript
{
  messages: UIMessage[],
  model: {
    id: "anthropic/claude-sonnet-4.5",
    connectionId: "conn_xxx"
  },
  agent: {
    id: "vir_xxx" | null
  },
  stream: true,  // Para respostas em streaming
  temperature?: number
}
```

### Headers

```typescript
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <meshToken>",
  "Accept": "application/json, text/event-stream"  // Obrigatório para streaming
}
```

## Streaming de Respostas

### Tipos de Eventos

A API Decopilot retorna eventos Server-Sent Events (SSE):

- `start` - Início do streaming
- `start-step` - Início de um passo
- `text-start` - Início de texto
- `text-delta` - Fragmento de texto
- `text-end` - Fim de texto
- `finish-step` - Fim de um passo
- `finish` - Fim do streaming
- `message-metadata` - Metadados da mensagem

### Processamento

```typescript
// lib/llm.ts - generateLLMResponseWithStreaming()
const reader = response.body
  .pipeThrough(new TextDecoderStream())
  .getReader();

let buffer = "";
let textContent = "";

while (!finished) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += value;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  
  for (const line of lines) {
    const parsed = parseStreamLine(line);
    
    if (parsed?.type === "text-delta") {
      textContent += parsed.delta;
      await onStream(textContent, false);
    } else if (parsed?.type === "finish") {
      finished = true;
      break;
    }
  }
}
```

### Rate Limiting

Para evitar sobrecarga de updates no Slack:

```typescript
const STREAM_UPDATE_INTERVAL = 500; // ms
let lastStreamUpdate = 0;

if (now - lastStreamUpdate > STREAM_UPDATE_INTERVAL) {
  await onStream(textContent, false);
  lastStreamUpdate = now;
}
```

## Contexto de Conversação

### Estrutura

O contexto mantém as últimas mensagens da conversa:

```typescript
// slack/utils/contextBuilder.ts
const messages = await buildLLMMessages(
  channel,
  text,
  ts,
  threadTs,
  images
);
```

### Formato do Contexto

```typescript
[
  {
    id: "msg_xxx",
    role: "user",
    parts: [{ type: "text", text: "<previous_conversation>..." }]
  },
  // ... mensagens anteriores
  {
    id: "msg_xxx",
    role: "user",
    parts: [{ type: "text", text: "<end_previous_conversation>" }]
  },
  {
    id: "msg_xxx",
    role: "user",
    parts: [
      { type: "text", text: "<current_request>Pergunta atual</current_request>" },
      { type: "file", url: "data:image/...", filename: "image", mediaType: "image/png" }
    ]
  }
]
```

## Configuração

### Variáveis de Ambiente

```typescript
{
  meshUrl: "http://localhost:3000",
  organizationId: "org_xxx",
  modelProviderId: "conn_xxx",
  modelId: "anthropic/claude-sonnet-4.5",
  agentId: "vir_xxx",
  meshToken: "Bearer xxx"
}
```

### Inicialização

```typescript
// main.ts
configureLLM(
  config.modelId || DEFAULT_LANGUAGE_MODEL,
  config.systemPrompt
);
```

## Troubleshooting

### Problema: Imagens não são reconhecidas pela LLM

**Solução:** Verifique se o formato está correto:

```typescript
// ✅ CORRETO
{
  type: "file",
  url: "data:image/png;base64,...",
  filename: "image",
  mediaType: "image/png"
}

// ❌ ERRADO
{
  type: "image",          // tipo incorreto
  image: "data:...",      // campo incorreto
  mimeType: "image/png"   // nome de campo incorreto
}
```

### Problema: Erro "must start with 'data-'"

**Causa:** Tipo de part incorreto.

**Solução:** Use `type: "file"` em vez de `"data-url"` ou `"data-image"`.

### Problema: 406 Not Acceptable

**Causa:** Header `Accept` faltando.

**Solução:** Adicione o header:
```typescript
Accept: "application/json, text/event-stream"
```

### Problema: Erro de validação "expected string, received undefined" no campo "id"

**Causa:** Mensagens sem campo `id`.

**Solução:** Gere IDs únicos para cada mensagem:
```typescript
const generateMessageId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `msg_${timestamp}_${random}`;
};
```

## Referências

- [Vercel AI SDK - UIMessage](https://sdk.vercel.ai/docs)
- [Mesh Decopilot API](../admin-sites/apps/mesh/src/api/routes/decopilot/)
- [Slack File Uploads](https://api.slack.com/types/file)

## Exemplo Completo

```typescript
// Enviar mensagem com imagem para LLM
const response = await fetch(
  `${meshUrl}/api/${organizationId}/decopilot/stream`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      messages: [
        {
          id: "msg_1234567890_abc123",
          role: "user",
          parts: [
            { 
              type: "text", 
              text: "Analise esta imagem" 
            },
            {
              type: "file",
              url: "data:image/png;base64,iVBORw0KGgo...",
              filename: "screenshot.png",
              mediaType: "image/png"
            }
          ]
        }
      ],
      model: {
        id: "anthropic/claude-sonnet-4.5",
        connectionId: "conn_xxx"
      },
      agent: {
        id: "vir_xxx"
      },
      stream: true
    })
  }
);

// Processar stream
const reader = response.body
  .pipeThrough(new TextDecoderStream())
  .getReader();

let textContent = "";
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += value;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      
      if (data.type === "text-delta") {
        textContent += data.delta;
        console.log(textContent);
      } else if (data.type === "finish") {
        return textContent;
      }
    }
  }
}
```

## Logs Úteis

Para debug, ative os logs:

```typescript
console.log("[LLM] Calling Decopilot API:", {
  url,
  hasToken: !!token,
  modelId,
  hasAgent: !!agentId,
  stream: true,
  messageCount: messages.length,
  hasImages: messages.some(m => 
    m.parts.some(p => p.type === "file")
  )
});
```

