# Whisper MCP

MCP (Model Context Protocol) server para transcrição de áudio usando OpenAI Whisper.

## Visão Geral

Este servidor MCP fornece capacidades de transcrição de áudio usando a API Whisper da OpenAI. Ele suporta múltiplos idiomas, timestamps detalhados, e vários formatos de saída.

## Recursos

- 🎙️ **Transcrição de Áudio** - Converte áudio em texto com alta precisão
- 🌍 **Multi-idioma** - Suporta mais de 90 idiomas ou detecção automática
- ⏱️ **Timestamps** - Timestamps detalhados por palavra ou segmento
- 📝 **Múltiplos Formatos** - JSON, texto, SRT, VTT, ou verbose JSON
- 🔄 **Auto-retry** - Retry automático com backoff exponencial
- 📊 **Logging** - Logging estruturado para debugging

## Formatos de Áudio Suportados

- FLAC
- M4A
- MP3
- MP4
- MPEG
- MPGA
- OGA
- OGG
- WAV
- WEBM

**Limite de tamanho:** 25 MB por arquivo

## Instalação

```bash
cd whisper
bun install
```

## Configuração

### Variáveis de Ambiente

Configure as seguintes variáveis de ambiente:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Desenvolvimento Local

```bash
bun run dev
```

### Build para Produção

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

## Uso

### Tool: TRANSCRIBE_AUDIO

Transcreve um arquivo de áudio em texto.

#### Parâmetros de Entrada

```typescript
{
  audioUrl: string;                          // URL do arquivo de áudio
  language?: string;                         // Código do idioma (ex: 'pt', 'en', 'es')
  prompt?: string;                           // Prompt opcional para guiar a transcrição
  responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
  temperature?: number;                      // Temperatura de amostragem (0-1)
  timestampGranularities?: Array<"word" | "segment">;  // Para timestamps detalhados
}
```

#### Resposta

```typescript
{
  text?: string;                             // Texto transcrito
  language?: string;                         // Idioma detectado
  duration?: number;                         // Duração em segundos
  segments?: Array<{                         // Segmentos com timestamps
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{                            // Palavras individuais com timestamps
    word: string;
    start: number;
    end: number;
  }>;
  error?: boolean;                           // Se a requisição falhou
  finishReason?: string;                     // Motivo de falha
}
```

### Exemplos

#### Transcrição Básica

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/audio.mp3"
});

console.log(result.text);
```

#### Transcrição com Idioma Específico

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/audio-pt.mp3",
  language: "pt"
});
```

#### Transcrição com Timestamps

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/audio.mp3",
  timestampGranularities: ["word", "segment"]
});

// Acesse timestamps por palavra
result.words?.forEach(word => {
  console.log(`${word.word} (${word.start}s - ${word.end}s)`);
});

// Acesse timestamps por segmento
result.segments?.forEach(segment => {
  console.log(`${segment.text} (${segment.start}s - ${segment.end}s)`);
});
```

#### Transcrição com Prompt Contextual

```typescript
const result = await transcribeAudio({
  audioUrl: "https://example.com/technical-talk.mp3",
  prompt: "This is a technical presentation about machine learning and AI.",
  language: "en"
});
```

## Arquitetura

Este projeto segue o padrão DRY (Don't Repeat Yourself) e utiliza código compartilhado:

```
whisper/
├── server/
│   ├── main.ts                    # Entry point do MCP server
│   ├── constants.ts               # Configurações da API
│   └── tools/
│       ├── index.ts               # Exportação das tools
│       ├── whisper.ts             # Tool principal de transcrição
│       └── utils/
│           └── whisper.ts         # Cliente Whisper e utilitários
├── shared/
│   └── deco.gen.ts               # Tipos gerados automaticamente
└── README.md                     # Este arquivo

shared/ (código compartilhado)
└── audio-transcribers/
    ├── base.ts                   # Abstração base para transcritores
    ├── index.ts                  # Exportações
    └── README.md                 # Documentação do módulo compartilhado
```

## Configuração de Contrato

⚠️ **Nota:** Este projeto usa um contrato mock para desenvolvimento. Quando o `WHISPER_CONTRACT` for configurado na plataforma Deco, atualize:

1. `server/main.ts` - Descomente os scopes do contrato
2. `server/tools/whisper.ts` - Remova o mock e use `env.WHISPER_CONTRACT`

## Best Practices

### Detecção de Idioma

- Para melhores resultados, especifique o idioma se souber qual é
- A detecção automática funciona bem, mas pode adicionar latência

### Temperatura

- Use valores baixos (0-0.3) para conteúdo factual/técnico
- Use valores altos (0.7-1.0) para conteúdo criativo

### Timestamps

- Timestamps de palavra aumentam o tempo de processamento
- Use apenas quando necessário para sincronização precisa

### Tamanho de Arquivo

- Arquivos maiores que 25 MB precisam ser divididos
- Considere pré-processar áudio para reduzir tamanho (bitrate menor, sample rate menor)

### Performance

- A API Whisper é assíncrona - não há polling necessário
- Timeout padrão: 5 minutos
- Retry automático: 3 tentativas

## Troubleshooting

### Erro: "Cannot find module '@decocms/mcps-shared/audio-transcribers'"

Execute:
```bash
bun install
```

### Erro: "OPENAI_API_KEY is not set"

Configure a variável de ambiente:
```bash
export OPENAI_API_KEY=your_key_here
```

### Erro: "Failed to fetch audio file"

- Verifique se a URL do áudio é acessível
- Certifique-se de que o formato do áudio é suportado
- Verifique se o arquivo não excede 25 MB

## Desenvolvimento

### Verificar Tipos

```bash
bun run check
```

### Gerar Tipos

```bash
bun run gen
```

### Configurar

```bash
bun run configure
```

## Recursos Adicionais

- [Documentação da API Whisper](https://platform.openai.com/docs/api-reference/audio)
- [MCP Shared README](../shared/audio-transcribers/README.md)
- [Deco Runtime Documentation](https://github.com/decocms/runtime)

## Licença

MIT

