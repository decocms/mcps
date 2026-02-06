/**
 * Database Client
 *
 * HTTP client for querying deco_weekly_report table via deco.cms MCP API.
 */

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface DatabaseClient {
  query(sqlQuery: string): Promise<QueryResult>;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Parse SSE (Server-Sent Events) response if needed
 */
function parseSSEResponse(responseText: string): unknown {
  const lines = responseText.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const dataContent = line.substring(6);
      if (dataContent.trim() && dataContent !== "[DONE]") {
        try {
          return JSON.parse(dataContent);
        } catch {
          // Continue to next line if parse fails
        }
      }
    }
  }
  return null;
}

/**
 * Extract result from MCP response
 */
function extractResult(result: unknown): QueryResult {
  if (!result || typeof result !== "object") {
    return { rows: [], rowCount: 0 };
  }

  const res = result as Record<string, unknown>;

  // Try structuredContent first
  const structuredContent = (res.result as Record<string, unknown>)
    ?.structuredContent;
  if (structuredContent && typeof structuredContent === "object") {
    const content = structuredContent as Record<string, unknown>;
    const rows = Array.isArray(content.result) ? content.result : [];
    return { rows, rowCount: rows.length };
  }

  // Try content[0].text
  const contentArray = (res.result as Record<string, unknown>)?.content;
  if (Array.isArray(contentArray) && contentArray[0]?.text) {
    try {
      const parsed = JSON.parse(contentArray[0].text as string);
      const rows = Array.isArray(parsed.result) ? parsed.result : [];
      return { rows, rowCount: rows.length };
    } catch {
      return { rows: [], rowCount: 0 };
    }
  }

  return { rows: [], rowCount: 0 };
}

export class DecoApiClient implements DatabaseClient {
  private apiUrl: string;
  private token: string;

  constructor(apiUrl: string, token: string) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  async query(sqlQuery: string): Promise<QueryResult> {
    const requestBody = {
      method: "tools/call",
      params: {
        name: "DATABASES_RUN_SQL",
        arguments: { sql: sqlQuery },
      },
      jsonrpc: "2.0",
      id: Date.now(),
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json,text/event-stream",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
      }

      const responseText = await response.text();

      // Try to parse as JSON first
      let result: unknown;
      try {
        result = JSON.parse(responseText);
      } catch {
        // If JSON parse fails, try SSE parsing
        result = parseSSEResponse(responseText);
      }

      if (!result) {
        throw new Error("Empty response from API");
      }

      // Check for MCP error
      const res = result as Record<string, unknown>;
      if (res.error) {
        const error = res.error as Record<string, unknown>;
        throw new Error(`MCP Error: ${error.message || "Unknown error"}`);
      }

      return extractResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Database query failed: ${message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query("SELECT 1 as test");
      return true;
    } catch (error) {
      console.error("Database connection test failed:", error);
      return false;
    }
  }

  async close(): Promise<void> {
    // HTTP client doesn't need explicit close
  }
}

/**
 * Create a database client for the deco.cms MCP API.
 */
export function createDatabaseClient(
  apiUrl: string,
  token: string,
): DatabaseClient {
  return new DecoApiClient(apiUrl, token);
}
