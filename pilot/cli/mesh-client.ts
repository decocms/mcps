/**
 * Mesh Event Bus Client for CLI
 *
 * Handles connection to MCP Mesh and event bus operations:
 * - Publishing user messages
 * - Subscribing to agent responses
 * - Receiving events via SSE
 */

import { EVENT_TYPES, getResponseEventType } from "../server/events.ts";

export interface MeshConfig {
  url: string;
  token: string;
  connectionId?: string;
}

export interface CloudEvent<T = unknown> {
  id: string;
  type: string;
  source: string;
  time?: string;
  data: T;
}

export interface AgentResponse {
  taskId: string;
  source: string;
  chatId?: string;
  text: string;
  imageUrl?: string;
  isFinal: boolean;
}

export interface TaskProgress {
  taskId: string;
  source: string;
  chatId?: string;
  message: string;
  percent?: number;
  step?: string;
}

export type EventHandler = (event: CloudEvent) => void;

/**
 * Client for mesh event bus operations
 */
export class MeshEventClient {
  private config: MeshConfig;
  private eventBusConnectionId: string | null = null;
  private pilotConnectionId: string | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private sseController: AbortController | null = null;
  private chatId: string;

  constructor(config: MeshConfig) {
    this.config = config;
    // Generate a unique chat ID for this session
    this.chatId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Initialize connection to mesh and discover bindings
   */
  async initialize(): Promise<void> {
    console.error("[cli] Connecting to mesh...");

    // Discover event bus binding
    const connections = await this.listConnections();

    // Find event bus (mesh gateway)
    const gateway = connections.find(
      (c) =>
        c.title?.toLowerCase().includes("gateway") || c.id === "mesh-gateway",
    );
    if (gateway) {
      this.eventBusConnectionId = gateway.id;
      console.error(`[cli] Found event bus: ${gateway.title} (${gateway.id})`);
    }

    // Find pilot connection
    const pilot = connections.find(
      (c) => c.title?.toLowerCase().includes("pilot") || c.id.includes("pilot"),
    );
    if (pilot) {
      this.pilotConnectionId = pilot.id;
      console.error(`[cli] Found pilot: ${pilot.title} (${pilot.id})`);
    }

    if (!this.eventBusConnectionId) {
      throw new Error(
        "Could not find event bus connection. Make sure mesh-gateway is configured.",
      );
    }

    console.error(`[cli] Chat ID: ${this.chatId}`);
  }

  /**
   * List all connections in mesh
   */
  private async listConnections(): Promise<
    Array<{ id: string; title: string; tools: unknown[] }>
  > {
    const response = await this.callMcp("tools/list", {});

    // Tools/list returns tools, we need connections/list instead
    // Let's call the gateway's list connections tool
    const gatewayResponse = await fetch(`${this.config.url}/mcp`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "COLLECTION_CONNECTIONS_LIST",
          arguments: {},
        },
      }),
    });

    if (!gatewayResponse.ok) {
      const text = await gatewayResponse.text();
      throw new Error(
        `Failed to list connections: ${gatewayResponse.status} - ${text}`,
      );
    }

    const json = await gatewayResponse.json();
    const result =
      json.result?.structuredContent || json.result?.content?.[0]?.text;

    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        return parsed.items || [];
      } catch {
        return [];
      }
    }

    return result?.items || [];
  }

  /**
   * Subscribe to agent response events
   */
  async subscribe(): Promise<void> {
    if (!this.eventBusConnectionId) {
      throw new Error("Event bus not initialized");
    }

    // Subscribe to CLI-specific responses
    const responseType = getResponseEventType("cli");
    await this.callConnectionTool(
      this.eventBusConnectionId,
      "EVENT_SUBSCRIBE",
      {
        eventType: responseType,
      },
    );
    console.error(`[cli] Subscribed to: ${responseType}`);

    // Also subscribe to progress events
    await this.callConnectionTool(
      this.eventBusConnectionId,
      "EVENT_SUBSCRIBE",
      {
        eventType: EVENT_TYPES.TASK_PROGRESS,
      },
    );
    console.error(`[cli] Subscribed to: ${EVENT_TYPES.TASK_PROGRESS}`);

    // Start polling for events (SSE not available for CLI)
    this.startPolling();
  }

  /**
   * Publish a user message to pilot
   */
  async publishMessage(text: string): Promise<void> {
    if (!this.eventBusConnectionId) {
      throw new Error("Event bus not initialized");
    }

    await this.callConnectionTool(this.eventBusConnectionId, "EVENT_PUBLISH", {
      type: EVENT_TYPES.USER_MESSAGE,
      data: {
        text,
        source: "cli",
        chatId: this.chatId,
        sender: {
          id: "cli-user",
          name: process.env.USER || "CLI User",
        },
      },
    });
  }

  /**
   * Directly call pilot MESSAGE tool (alternative to event bus)
   */
  async callPilotDirectly(text: string): Promise<string | null> {
    if (!this.pilotConnectionId) {
      console.error("[cli] Pilot connection not found, using event bus");
      return null;
    }

    try {
      const result = await this.callConnectionTool(
        this.pilotConnectionId,
        "MESSAGE",
        {
          text,
          source: "cli",
          chatId: this.chatId,
        },
      );

      return (result as { response?: string })?.response || null;
    } catch (error) {
      console.error("[cli] Direct pilot call failed:", error);
      return null;
    }
  }

  /**
   * Register event handler
   */
  on(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Start polling for events
   */
  private startPolling(): void {
    const poll = async () => {
      // For now, just a simple interval - in production would use SSE
      // Events are handled synchronously by pilot's ON_EVENTS
    };

    // Poll every 500ms
    setInterval(poll, 500);
  }

  /**
   * Emit event to handlers
   */
  private emit(event: CloudEvent): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[cli] Event handler error:`, error);
      }
    }
  }

  /**
   * Call MCP method on mesh
   */
  private async callMcp(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(`${this.config.url}/mcp`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP call failed: ${response.status} - ${text}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`MCP error: ${json.error.message}`);
    }

    return json.result;
  }

  /**
   * Call tool on a specific connection
   */
  private async callConnectionTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(`${this.config.url}/mcp/${connectionId}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tool call failed: ${response.status} - ${text}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`Tool error: ${json.error.message}`);
    }

    // Extract result
    const result = json.result;
    if (result?.structuredContent) {
      return result.structuredContent;
    }
    if (result?.content?.[0]?.text) {
      try {
        return JSON.parse(result.content[0].text);
      } catch {
        return result.content[0].text;
      }
    }
    return result;
  }

  /**
   * Get HTTP headers for mesh requests
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.config.token}`,
    };
  }

  /**
   * Get the current chat ID
   */
  getChatId(): string {
    return this.chatId;
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.sseController) {
      this.sseController.abort();
    }
  }
}
