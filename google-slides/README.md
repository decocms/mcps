# Google Slides MCP

MCP Server for Google Slides API. Create and edit presentations programmatically.

## Features

### Presentation Management
- **create_presentation** - Create a new presentation
- **get_presentation** - Get presentation details and slides

### Slide Operations
- **add_slide** - Add slides with different layouts
- **delete_slide** - Delete a slide
- **duplicate_slide** - Copy an existing slide
- **move_slide** - Reorder slides

### Elements
- **insert_text** - Add text boxes
- **insert_image** - Add images from URL
- **insert_shape** - Add shapes (rectangle, ellipse, arrow, etc.)
- **insert_table** - Add tables
- **delete_element** - Remove elements
- **replace_text** - Find and replace text

## Setup

### 1. Enable Google Slides API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Slides API**
3. Configure OAuth 2.0 credentials

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Usage Examples

### Create a presentation

```json
{
  "tool": "create_presentation",
  "input": {
    "title": "Q4 Sales Report"
  }
}
```

### Add a title slide

```json
{
  "tool": "add_slide",
  "input": {
    "presentationId": "1abc123xyz",
    "layout": "TITLE"
  }
}
```

### Insert a text box

```json
{
  "tool": "insert_text",
  "input": {
    "presentationId": "1abc123xyz",
    "slideId": "p1",
    "text": "Welcome to the presentation!",
    "x": 100,
    "y": 100,
    "width": 400,
    "height": 50
  }
}
```

### Insert an image

```json
{
  "tool": "insert_image",
  "input": {
    "presentationId": "1abc123xyz",
    "slideId": "p1",
    "imageUrl": "https://example.com/logo.png",
    "x": 50,
    "y": 50,
    "width": 200,
    "height": 100
  }
}
```

## Slide Layouts

| Layout | Description |
|--------|-------------|
| `BLANK` | Empty slide |
| `TITLE` | Title slide |
| `TITLE_AND_BODY` | Title with content area |
| `TITLE_AND_TWO_COLUMNS` | Two-column layout |
| `SECTION_HEADER` | Section divider |
| `TITLE_ONLY` | Title without body |
| `CAPTION_ONLY` | Caption slide |
| `BIG_NUMBER` | Large number display |

## Shape Types

`RECTANGLE`, `ROUND_RECTANGLE`, `ELLIPSE`, `TRIANGLE`, `ARROW_NORTH`, `ARROW_EAST`, `ARROW_SOUTH`, `ARROW_WEST`, `STAR_5`, `HEART`, `CLOUD`, `SPEECH`

## Positioning

All positions and sizes are in **points** (72 points = 1 inch).

Standard slide size: **720 x 540 points** (10" x 7.5")

## License

MIT

