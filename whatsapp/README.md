# WhatsApp MCP

A Model Context Protocol (MCP) server for interacting with the WhatsApp Business API. This MCP provides tools for phone number management and handles incoming webhooks by publishing them as CloudEvents to the event bus.

## Features

- 📱 **Phone Number Management** - List, create, and manage phone numbers
- 🔗 **Webhook Handling** - Receive and process WhatsApp webhooks
- 📤 **Event Publishing** - Publish incoming messages to the event bus as CloudEvents
- 🔐 **Verification Flow** - Request and verify phone number codes

## Setup

### 1. Create a Mesh API Key

Before running this MCP locally, you need to create a Mesh API key:

1. Go to the **Mesh Management MCP** in your Deco workspace
2. Create a new API Key with the following permissions:

```json
{
  "self": ["*"]
}
```

3. Copy the generated API key

### 2. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add:

```env
MESH_API_KEY=<your-mesh-api-key-from-step-1>
MESH_BASE_URL=<your-mesh-base-url>
```

## Configuration

When installing this MCP, you'll need to configure the following state parameters:

### Required Configuration

- **`whatsAppBusinessAccountId`** (string) - Your WhatsApp Business Account ID from Meta
- **`whatsAppAccessToken`** (string) - Access token from Meta Business Manager
- **`EVENT_BUS`** (binding) - Reference to the @deco/event-bus binding

## Available Tools

### LIST_PHONE_NUMBERS

List all phone numbers for the business account.

**Input:** None

**Output:** List of phone numbers with their details

### CREATE_PHONE_NUMBER

Creates a new phone number for the business account.

**Input:**
- `countryCode` (string) - Country code (e.g., "1" for US)
- `phoneNumber` (string) - Phone number
- `verifiedName` (string) - Display name for the number

**Output:**
- `id` (string) - The created phone number ID

### REQUEST_CODE_FOR_PHONE_NUMBER

Requests a verification code for a registered phone number.

**Input:**
- `phoneNumberId` (string) - The phone number ID
- `codeMethod` (optional, "SMS" | "VOICE") - Delivery method (default: "SMS")
- `language` (optional, string) - Language code (default: "en_US")

**Output:**
- `success` (boolean) - Whether the request was successful

### VERIFY_CODE_FOR_PHONE_NUMBER

Validates a verification code for a registered phone number.

**Input:**
- `phoneNumberId` (string) - The phone number ID
- `code` (string) - The verification code received

**Output:**
- `success` (boolean) - Whether verification was successful

### REGISTER_PHONE_NUMBER

Registers a phone number for the business account.

**Input:**
- `phoneNumberId` (string) - The phone number ID
- `pin` (string) - 6-digit PIN for two-step verification

**Output:**
- `success` (boolean) - Whether registration was successful

### UPDATE_PHONE_NUMBER_WEBHOOK

Update the webhook configuration for a phone number.

**Input:**
- `phoneNumberId` (string) - The phone number ID
- `webhookUrl` (string) - The webhook URL
- `verifyToken` (string) - Token for webhook verification

## Webhook Setup

This MCP exposes a `/webhook` endpoint for receiving Meta webhooks.

### Development

Run the development server with Deco Link tunnel:

```bash
bun run dev
```

This will start the server and display a public webhook URL that you can configure in Meta.

### Meta App Dashboard Configuration

1. Go to your Meta App Dashboard
2. Navigate to **WhatsApp → Configuration → Webhook**
3. Set the Webhook URL to your server's `/webhook` endpoint
4. Subscribe to the events you want to receive

## Events

When the MCP receives a text message webhook, it publishes an event with:

- **Type:** `waba.text.message`
- **Data:** The full WhatsApp webhook payload

Other MCPs can subscribe to this event type to react to incoming WhatsApp messages.

## Development

```bash
# Install dependencies
bun install

# Run development server with tunnel
bun run dev

# Type check
bun run check
```

## License

MIT
