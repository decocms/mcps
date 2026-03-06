export type AgentMode =
  | "passthrough"
  | "smart_tool_selection"
  | "code_execution";

export interface MeshChatConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  modelProviderId: string;
  modelId?: string;
  agentId?: string;
  agentMode?: AgentMode;
  systemPrompt?: string;
  /** Request timeout in milliseconds. Default: 120000 (2 minutes) */
  timeoutMs?: number;
}

export interface MessageMedia {
  type: "image" | "audio";
  /** Base64 encoded data or data URI */
  data: string;
  mimeType: string;
  name?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  media?: MessageMedia[];
}

export type StreamCallback = (
  text: string,
  isComplete: boolean,
) => Promise<void>;

/**
 * Events emitted by the Decopilot UI Message Stream (AI SDK v6).
 *
 * Key types:
 * - text-start / text-delta / text-end: text content
 * - reasoning-start / reasoning-delta / reasoning-end: model reasoning (ignored)
 * - tool-input-start / tool-input-delta / tool-input-available: tool calls
 * - tool-output-available: tool results
 * - tool-call / tool-result: legacy tool events (AI SDK v3/v4)
 * - finish / error: stream lifecycle
 */
export interface StreamEvent {
  type: string;
  id?: string;
  delta?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  input?: unknown;
  result?: unknown;
  output?: unknown;
  error?: string;
  errorText?: string;
  finishReason?: string;
}

export interface WhisperConfig {
  meshUrl: string;
  token: string;
  whisperConnectionId: string;
}

export interface DecopilotMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; url: string; filename: string; mediaType: string }
  >;
}
