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
  "model": "gemini-1.5-pro-vision-latest"
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
  "model": "gemini-1.5-pro-vision-latest"
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
  "model": "gemini-1.5-pro-vision-latest"
}
```

## 🚀 How to Use

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   cd gemini-pro-vision
   bun install
   ```

### Configuration

You will need a Google Gemini API key:

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Configure the key when installing the MCP in Deco

### Local Development

```bash
bun run dev
```

The MCP server will be available at `http://localhost:8000/mcp`

### Deploy

```bash
bun run deploy
```

## 🤖 Available Models

- `gemini-1.5-pro-vision-latest` (default) - Best quality
- `gemini-1.5-pro` - Faster version
- `gemini-1.5-flash` - Ultra-fast version for simple cases

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

