# Gemini Pro Vision MCP

MCP (Model Context Protocol) for image analysis using Google Gemini Pro Vision.

## 🎯 Features

This MCP offers three main tools for image analysis:

### 1. `analyze_image` - Image Analysis
Analyzes an image and answers questions about it.

**Use cases:**
- Describe image content
- Identify objects, people, places
- Answer questions about the image
- Context and emotion analysis

**Example:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "prompt": "Describe this image in detail",
  "model": "gemini-2.5-flash"
}
```

### 2. `compare_images` - Image Comparison
Compares multiple images and identifies differences or similarities.

**Use cases:**
- Identify changes between design versions
- Compare similar products
- Verify visual consistency
- Detect subtle differences

**Example:**
```json
{
  "imageUrls": [
    "https://example.com/before.jpg",
    "https://example.com/after.jpg"
  ],
  "prompt": "What are the main differences between these images?",
  "model": "gemini-2.5-flash"
}
```

### 3. `extract_text_from_image` - OCR (Text Extraction)
Extracts all visible text from an image.

**Use cases:**
- Digitize documents
- Read signs and notices
- Extract text from screenshots
- Process receipts and invoices

**Example:**
```json
{
  "imageUrl": "https://example.com/document.jpg",
  "language": "english",
  "model": "gemini-2.5-flash"
}
```

## 🚀 How to Use

### For End Users

Just install the MCP from the Deco marketplace and authorize the usage. You'll be charged per operation:
- **$0.05** per image analysis
- **$0.10** per image comparison
- **$0.03** per OCR operation

No API key configuration needed!

### For Developers (Self-Hosting)

#### 1. Clone and Install

```bash
cd gemini-pro-vision
bun install
```

#### 2. Configure API Key

Get a Google Gemini API key at [Google AI Studio](https://aistudio.google.com/apikey)

**Local Development:**

Create a `.dev.vars` file:

```bash
GOOGLE_GENAI_API_KEY=your_api_key_here
```

Then start the development server:

```bash
bun run dev
```

The MCP server will be available at `http://localhost:8000/mcp`

**Production Deploy:**

Configure the secret in Cloudflare Workers:

```bash
# Using wrangler CLI
wrangler secret put GOOGLE_GENAI_API_KEY

# Or using the Cloudflare Dashboard:
# Workers & Pages > Your Worker > Settings > Variables > Add Secret
```

Then deploy:

```bash
bun run deploy
```

**Note:** This MCP uses the same API key as other Google Gemini services (VEO3, etc). You can reuse the same `GOOGLE_GENAI_API_KEY` for all Google AI services.

## 🤖 Available Models

- `gemini-2.5-flash` (default) - Fastest and most cost-effective with excellent vision support
- `gemini-1.5-pro` - Higher quality for complex vision tasks
- `gemini-1.5-flash` - Previous generation fast model
- `gemini-pro-vision` - Legacy model (deprecated)

## 📝 Prompt Examples

### General Analysis
- "Describe this image in detail"
- "What objects do you see in this image?"
- "What is the context of this photo?"

### Specific Analysis
- "Identify all people in this image"
- "What brand is this product?"
- "Does this image contain any text?"

### OCR
- "Extract all text from this image"
- "Read the content of this document"
- "Transcribe the visible text"

### Comparison
- "What are the differences between these images?"
- "Do these two photos show the same person?"
- "How has the design changed between versions?"

## 🔧 Technical Details

- **Runtime**: Cloudflare Workers
- **API**: Google Gemini Vision API
- **Image support**: JPEG, PNG, WebP, GIF
- **Maximum size**: Limited by Gemini API
- **Response**: Text in structured format

## 📚 API Documentation

For more details about the Gemini Vision API, see:
- [Official Gemini documentation](https://ai.google.dev/gemini-api/docs/vision)
- [Vision prompting guide](https://ai.google.dev/gemini-api/docs/vision#prompting-with-images)

## 🤝 Contributing

This MCP is part of the Deco CMS MCPs monorepo. To contribute:

1. Fork the repository
2. Create a branch for your feature
3. Commit your changes
4. Open a Pull Request

## 📄 License

Maintained by the Deco CMS team.

