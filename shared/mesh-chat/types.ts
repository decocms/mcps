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

export interface StreamEvent {
  type: string;
  delta?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  result?: unknown;
  output?: unknown;
  error?: string;
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
