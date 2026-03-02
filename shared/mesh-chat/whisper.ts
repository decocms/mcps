import { resolveUrl } from "./client.ts";
import type { WhisperConfig } from "./types.ts";

interface WhisperJsonRpcResponse {
  result?: {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: { text?: string };
    text?: string;
  };
  error?: { code: number; message: string };
}

/**
 * Transcribe audio using the Mesh Whisper binding via MCP JSON-RPC.
 * Returns the transcription text, or null if not configured / transcription fails.
 */
export async function transcribeAudio(
  config: WhisperConfig,
  audioUrl: string,
  filename: string,
): Promise<string | null> {
  const { meshUrl, token, whisperConnectionId } = config;

  console.log(`[MeshChat/Whisper] Transcribing audio: ${filename}`);

  try {
    const effectiveMeshUrl = resolveUrl(meshUrl);
    const url = `${effectiveMeshUrl}/mcp/${whisperConnectionId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "TRANSCRIBE_AUDIO",
          arguments: {
            audioUrl,
            responseFormat: "text",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[MeshChat/Whisper] Transcription failed: ${response.status} ${response.statusText}`,
        errorText,
      );
      return null;
    }

    const result = (await response.json()) as WhisperJsonRpcResponse;

    if (result.error) {
      console.error("[MeshChat/Whisper] JSON-RPC error:", result.error.message);
      return null;
    }

    let transcription: string | undefined;

    // Format 1: MCP content array
    if (result.result?.content) {
      transcription = result.result.content.find(
        (c) => c.type === "text",
      )?.text;
    }

    // Format 2: Direct text field (may be JSON-encoded)
    if (!transcription && result.result?.text) {
      const textResult = result.result.text;
      if (typeof textResult === "string" && textResult.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(textResult) as { text?: string };
          transcription = parsed.text ?? textResult;
        } catch {
          transcription = textResult;
        }
      } else {
        transcription = textResult;
      }
    }

    if (transcription) {
      console.log(
        `[MeshChat/Whisper] Transcription successful (${transcription.length} chars)`,
      );
      return transcription.trim();
    }

    console.warn("[MeshChat/Whisper] No transcription in response:", result);
    return null;
  } catch (error) {
    console.error(
      "[MeshChat/Whisper] Transcription error:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
