# Gemini Pro Vision MCP

MCP (Model Context Protocol) para análise de imagens usando o Google Gemini Pro Vision.

## 🎯 Funcionalidades

Este MCP oferece três ferramentas principais para análise de imagens:

### 1. `analyze_image` - Análise de Imagem
Analisa uma imagem e responde perguntas sobre ela.

**Casos de uso:**
- Descrever o conteúdo de uma imagem
- Identificar objetos, pessoas, lugares
- Responder perguntas sobre a imagem
- Análise de contexto e emoções

**Exemplo:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "prompt": "Descreva esta imagem em detalhes",
  "model": "gemini-1.5-pro-vision-latest"
}
```

### 2. `compare_images` - Comparação de Imagens
Compara múltiplas imagens e identifica diferenças ou similaridades.

**Casos de uso:**
- Identificar mudanças entre versões de um design
- Comparar produtos similares
- Verificar consistência visual
- Detectar diferenças sutis

**Exemplo:**
```json
{
  "imageUrls": [
    "https://example.com/before.jpg",
    "https://example.com/after.jpg"
  ],
  "prompt": "Quais são as principais diferenças entre estas imagens?",
  "model": "gemini-1.5-pro-vision-latest"
}
```

### 3. `extract_text_from_image` - OCR (Extração de Texto)
Extrai todo o texto visível de uma imagem.

**Casos de uso:**
- Digitalizar documentos
- Ler placas e avisos
- Extrair texto de screenshots
- Processar recibos e faturas

**Exemplo:**
```json
{
  "imageUrl": "https://example.com/document.jpg",
  "language": "português",
  "model": "gemini-1.5-pro-vision-latest"
}
```

## 🚀 Como Usar

### Instalação

1. Clone o repositório
2. Instale as dependências:
   ```bash
   cd gemini-pro-vision
   bun install
   ```

### Configuração

Você precisará de uma chave da API do Google Gemini:

1. Acesse [Google AI Studio](https://aistudio.google.com/apikey)
2. Crie uma chave de API
3. Configure a chave ao instalar o MCP no Deco

### Desenvolvimento Local

```bash
bun run dev
```

O servidor MCP estará disponível em `http://localhost:8000/mcp`

### Deploy

```bash
bun run deploy
```

## 🤖 Modelos Disponíveis

- `gemini-1.5-pro-vision-latest` (padrão) - Melhor qualidade
- `gemini-1.5-pro` - Versão mais rápida
- `gemini-1.5-flash` - Versão ultra-rápida para casos simples

## 📝 Exemplos de Prompts

### Análise Geral
- "Descreva esta imagem em detalhes"
- "Que objetos você vê nesta imagem?"
- "Qual é o contexto desta foto?"

### Análise Específica
- "Identifique todas as pessoas nesta imagem"
- "Que marca é este produto?"
- "Esta imagem contém algum texto?"

### OCR
- "Extraia todo o texto desta imagem"
- "Leia o conteúdo deste documento"
- "Transcreva o texto visível"

### Comparação
- "Quais são as diferenças entre estas imagens?"
- "Estas duas fotos mostram a mesma pessoa?"
- "Como o design mudou entre as versões?"

## 🔧 Detalhes Técnicos

- **Runtime**: Cloudflare Workers
- **API**: Google Gemini Vision API
- **Suporte de imagens**: JPEG, PNG, WebP, GIF
- **Tamanho máximo**: Limitado pela API do Gemini
- **Resposta**: Texto em formato estruturado

## 📚 Documentação da API

Para mais detalhes sobre a API do Gemini Vision, consulte:
- [Documentação oficial do Gemini](https://ai.google.dev/gemini-api/docs/vision)
- [Guia de prompts para visão](https://ai.google.dev/gemini-api/docs/vision#prompting-with-images)

## 🤝 Contribuindo

Este MCP faz parte do monorepo de MCPs da Deco CMS. Para contribuir:

1. Faça um fork do repositório
2. Crie uma branch para sua feature
3. Faça commit das suas mudanças
4. Abra um Pull Request

## 📄 Licença

Mantido pela equipe Deco CMS.

