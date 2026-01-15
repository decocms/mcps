# Google Docs MCP

MCP Server for Google Docs API. Create and edit documents programmatically.

## Features

### Document Management
- **create_document** - Create a new document
- **get_document** - Get document content and metadata

### Content Operations
- **insert_text** - Insert text at position
- **delete_content** - Delete text range
- **replace_text** - Find and replace all
- **append_text** - Append to end

### Formatting
- **format_text** - Apply bold, italic, underline, font size
- **insert_heading** - Insert heading (H1-H6)
- **insert_list** - Create bullet/numbered lists
- **remove_list** - Remove list formatting

### Elements
- **insert_table** - Insert tables
- **insert_image** - Insert images from URL
- **insert_page_break** - Insert page breaks

## Setup

### 1. Enable Google Docs API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Docs API**
3. Configure OAuth 2.0 credentials

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Usage Examples

### Create a document

```json
{
  "tool": "create_document",
  "input": {
    "title": "My Report"
  }
}
```

### Insert text

```json
{
  "tool": "insert_text",
  "input": {
    "documentId": "1abc123xyz",
    "text": "Hello, World!\n",
    "index": 1
  }
}
```

### Add a heading

```json
{
  "tool": "insert_heading",
  "input": {
    "documentId": "1abc123xyz",
    "text": "Introduction",
    "index": 1,
    "level": 1
  }
}
```

### Format text as bold

```json
{
  "tool": "format_text",
  "input": {
    "documentId": "1abc123xyz",
    "startIndex": 1,
    "endIndex": 14,
    "bold": true,
    "fontSize": 14
  }
}
```

### Insert a table

```json
{
  "tool": "insert_table",
  "input": {
    "documentId": "1abc123xyz",
    "rows": 3,
    "columns": 4,
    "index": 50
  }
}
```

## Document Index

- **Index 1** is the beginning of the document
- Each character, including newlines, increments the index
- Use `get_document` to see the current `endIndex`

## License

MIT

