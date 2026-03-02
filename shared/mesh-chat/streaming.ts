import type { StreamCallback, StreamEvent } from "./types.ts";

/**
 * Parse a single SSE line into a StreamEvent.
 * Returns null for empty lines, SSE metadata lines (event:, id:, retry:)
 * and the terminal [DONE] sentinel.
 */
export function parseStreamLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("event:")) return null;
  if (trimmed.startsWith("id:")) return null;
  if (trimmed.startsWith("retry:")) return null;

  let payload = trimmed;
  if (payload.startsWith("data:")) {
    payload = payload.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") return null;
  }

  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    return null;
  }
}

/**
 * Process an SSE stream, invoking the callback on each text delta.
 * The callback receives accumulated text and a boolean indicating completion.
 *
 * Returns the full text accumulated during streaming.
 */
export async function processStreamWithCallback(
  body: ReadableStream<Uint8Array>,
  onStream: StreamCallback,
): Promise<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  let textContent = "";
  let finished = false;
  let toolCallCount = 0;

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseStreamLine(line);
        if (!parsed) continue;

        const { type } = parsed;

        if (type === "text-delta" && parsed.delta) {
          textContent += parsed.delta;
          await onStream(textContent, false);
        } else if (type === "text" && parsed.text) {
          textContent += parsed.text;
          await onStream(textContent, false);
        } else if (type === "tool-call") {
          toolCallCount++;
          console.log(
            `[MeshChat] Tool call #${toolCallCount}: ${parsed.toolName ?? "unknown"}`,
          );
        } else if (type === "tool-result") {
          console.log(
            `[MeshChat] Tool result for ${parsed.toolCallId ?? "unknown"}: ${JSON.stringify(
              parsed.result ?? parsed.output,
            ).slice(0, 200)}`,
          );
        } else if (type === "error") {
          throw new Error(
            `LLM stream error: ${parsed.error ?? JSON.stringify(parsed)}`,
          );
        } else if (type === "finish") {
          console.log(
            `[MeshChat] Stream finished. Text length: ${textContent.length}, tools used: ${toolCallCount}`,
          );
          finished = true;
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalText = textContent || "Desculpe, não consegui gerar uma resposta.";
  await onStream(finalText, true);

  if (!textContent && toolCallCount > 0) {
    console.warn(
      `[MeshChat] ${toolCallCount} tool(s) called but no text response received`,
    );
  }

  return finalText;
}

/**
 * Collect the full text from an SSE stream without a callback.
 * Useful for non-streaming use cases where the API still returns SSE.
 */
export async function collectFullStreamText(
  body: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let textContent = "";
  let buffer = "";

  const toolCalls: Array<{ id: string; name: string; result?: unknown }> = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data) as StreamEvent;

          if (event.type === "text-delta" && event.delta) {
            textContent += event.delta;
          } else if (event.type === "text" && event.text) {
            textContent += event.text;
          } else if (
            event.type === "tool-call" &&
            event.toolCallId &&
            event.toolName
          ) {
            console.log(`[MeshChat] Tool call: ${event.toolName}`);
            toolCalls.push({
              id: event.toolCallId,
              name: event.toolName,
            });
          } else if (event.type === "tool-result" && event.toolCallId) {
            const tc = toolCalls.find((t) => t.id === event.toolCallId);
            if (tc) {
              tc.result = event.result ?? event.output;
            }
          } else if (event.type === "finish") {
            break;
          }
        } catch {
          // Ignore parse errors on individual lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (toolCalls.length > 0) {
    console.log(
      `[MeshChat] ${toolCalls.length} tool(s) used during generation`,
    );
  }

  return textContent;
}
