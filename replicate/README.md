# Replicate MCP

MCP (Model Context Protocol) server for interacting with the Replicate API, enabling execution of ML/AI models in the cloud.

## Features

This MCP provides the following tools:

### 🚀 Run Model
Execute predictions using Replicate models. Supports any model available on the platform.

**Usage example:**
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
Get the status and results of a prediction by ID.

**Usage example:**
```typescript
{
  predictionId: "abc123xyz"
}
```

### ❌ Cancel Prediction
Cancel a running prediction.

**Usage example:**
```typescript
{
  predictionId: "abc123xyz"
}
```

### 📋 List Models
List available models from a specific user or organization.

**Usage example:**
```typescript
{
  owner: "stability-ai"
}
```

### 🔍 Get Model
Get detailed information about a specific model, including input/output schema.

**Usage example:**
```typescript
{
  model: "stability-ai/sdxl"
}
```

## Configuration

### Prerequisites

1. Replicate account: https://replicate.com
2. API Token configured in Deco workspace: https://replicate.com/account/api-tokens

### Installation

1. Install dependencies:
```bash
bun install
```

2. This MCP uses **contract-based billing** to meter API usage
3. Upon installation, you authorize the contract that charges per prediction executed
4. The Replicate API key is configured at workspace level (not per installation)

## Development

### Run locally

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

## Popular Models

Some popular models you can use:

- **Image Generation:**
  - `stability-ai/sdxl` - Stable Diffusion XL
  - `stability-ai/stable-diffusion` - Stable Diffusion 2.1
  - `lucataco/realistic-vision-v5` - Realistic Vision

- **Text Generation:**
  - `meta/llama-2-70b-chat` - Llama 2 70B Chat
  - `mistralai/mixtral-8x7b-instruct-v0.1` - Mixtral 8x7B

- **Audio Generation:**
  - `meta/musicgen` - MusicGen
  - `riffusion/riffusion` - Riffusion

- **Video Processing:**
  - `stability-ai/stable-video-diffusion` - Stable Video Diffusion

## Documentation

- [Replicate API Docs](https://replicate.com/docs)
- [Available Models](https://replicate.com/explore)
- [Pricing](https://replicate.com/pricing)

## Limits and Costs

Replicate usage is consumption-based. Each model has its own cost per execution. Check the pricing details on the model page before running.

## Support

For issues or questions:
- [Replicate Community](https://discord.gg/replicate)
- [GitHub Issues](https://github.com/replicate/replicate)

