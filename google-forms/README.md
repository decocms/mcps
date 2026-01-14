# Google Forms MCP

MCP Server for Google Forms API. Create forms, add questions, and collect responses.

## Features

### Form Management
- **create_form** - Create a new form
- **get_form** - Get form details and questions
- **update_form** - Update title/description
- **get_responder_url** - Get the form URL

### Questions
- **add_question** - Add questions (text, paragraph, radio, checkbox, dropdown, scale, date, time)
- **update_question** - Update question text/required
- **delete_question** - Delete a question

### Responses
- **list_responses** - List all form responses
- **get_response** - Get a specific response

## Setup

### 1. Enable Google Forms API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Forms API**
3. Configure OAuth 2.0 credentials

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Usage Examples

### Create a form

```json
{
  "tool": "create_form",
  "input": {
    "title": "Customer Feedback Survey"
  }
}
```

### Add a multiple choice question

```json
{
  "tool": "add_question",
  "input": {
    "formId": "1abc123xyz",
    "title": "How satisfied are you with our service?",
    "type": "radio",
    "choices": ["Very satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very dissatisfied"],
    "required": true
  }
}
```

### Add a text question

```json
{
  "tool": "add_question",
  "input": {
    "formId": "1abc123xyz",
    "title": "What is your name?",
    "type": "text",
    "required": true
  }
}
```

### Add a scale question

```json
{
  "tool": "add_question",
  "input": {
    "formId": "1abc123xyz",
    "title": "Rate your experience",
    "type": "scale",
    "low": 1,
    "high": 10,
    "lowLabel": "Poor",
    "highLabel": "Excellent"
  }
}
```

### Get all responses

```json
{
  "tool": "list_responses",
  "input": {
    "formId": "1abc123xyz"
  }
}
```

## Question Types

| Type | Description |
|------|-------------|
| `text` | Short text answer |
| `paragraph` | Long text answer |
| `radio` | Single choice |
| `checkbox` | Multiple choice |
| `dropdown` | Dropdown selection |
| `scale` | Linear scale |
| `date` | Date picker |
| `time` | Time picker |

## License

MIT

