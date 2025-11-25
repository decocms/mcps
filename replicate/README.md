# Replicate MCP

MCP (Model Context Protocol) para interagir com a API do Replicate, permitindo executar modelos de ML/AI na nuvem.

## Recursos

Este MCP oferece as seguintes ferramentas:

### 🚀 Run Model
Execute predições usando modelos do Replicate. Suporta qualquer modelo disponível na plataforma.

**Exemplo de uso:**
```typescript
{
  model: "stability-ai/sdxl",
  input: {
    prompt: "A beautiful sunset over the ocean",
    width: 1024,
    height: 1024
  },
  wait: true
}
```

### 📊 Get Prediction
Obtenha o status e resultados de uma predição pelo ID.

**Exemplo de uso:**
```typescript
{
  predictionId: "abc123xyz"
}
```

### ❌ Cancel Prediction
Cancele uma predição em execução.

**Exemplo de uso:**
```typescript
{
  predictionId: "abc123xyz"
}
```

### 📋 List Models
Liste modelos disponíveis de um usuário ou organização específica.

**Exemplo de uso:**
```typescript
{
  owner: "stability-ai"
}
```

### 🔍 Get Model
Obtenha informações detalhadas sobre um modelo específico, incluindo schema de entrada/saída.

**Exemplo de uso:**
```typescript
{
  model: "stability-ai/sdxl"
}
```

## Configuração

### Pré-requisitos

1. Conta no Replicate: https://replicate.com
2. API Token: https://replicate.com/account/api-tokens

### Instalação

1. Instale as dependências:
```bash
bun install
```

2. Configure sua API key ao instalar o MCP no Deco Chat

## Desenvolvimento

### Executar localmente

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

## Modelos Populares

Alguns modelos populares que você pode usar:

- **Geração de Imagens:**
  - `stability-ai/sdxl` - Stable Diffusion XL
  - `stability-ai/stable-diffusion` - Stable Diffusion 2.1
  - `lucataco/realistic-vision-v5` - Realistic Vision

- **Geração de Texto:**
  - `meta/llama-2-70b-chat` - Llama 2 70B Chat
  - `mistralai/mixtral-8x7b-instruct-v0.1` - Mixtral 8x7B

- **Geração de Áudio:**
  - `meta/musicgen` - MusicGen
  - `riffusion/riffusion` - Riffusion

- **Processamento de Vídeo:**
  - `stability-ai/stable-video-diffusion` - Stable Video Diffusion

## Documentação

- [Replicate API Docs](https://replicate.com/docs)
- [Modelos Disponíveis](https://replicate.com/explore)
- [Pricing](https://replicate.com/pricing)

## Limites e Custos

O uso do Replicate é baseado em consumo. Cada modelo tem seu próprio custo por execução. Verifique os detalhes de pricing na página do modelo antes de executar.

## Suporte

Para problemas ou dúvidas:
- [Replicate Community](https://discord.gg/replicate)
- [GitHub Issues](https://github.com/replicate/replicate)

