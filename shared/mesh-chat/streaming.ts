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
 * When the model uses tools (multi-step agent), intermediate text between
 * tool calls is discarded — only the final text (after the last tool cycle)
 * is kept and streamed to the caller.
 *
 * Returns the full text accumulated during streaming.
 */
async function processLines(
  lines: string[],
  state: {
    textContent: string;
    toolCallCount: number;
    finished: boolean;
    hasActiveToolCycle: boolean;
  },
  onStream?: StreamCallback,
): Promise<void> {
  for (const line of lines) {
    if (state.finished) break;

    const parsed = parseStreamLine(line);
    if (!parsed) continue;

    const { type } = parsed;

    if (type === "text-delta" && parsed.delta) {
      state.textContent += parsed.delta;
      if (!state.hasActiveToolCycle && onStream) {
        await onStream(state.textContent, false);
      }
    } else if (type === "text" && parsed.text) {
      state.textContent += parsed.text;
      if (!state.hasActiveToolCycle && onStream) {
        await onStream(state.textContent, false);
      }
    } else if (type === "tool-call") {
      state.toolCallCount++;
      state.hasActiveToolCycle = true;
      state.textContent = "";
      console.log(
        `[MeshChat] Tool call #${state.toolCallCount}: ${parsed.toolName ?? "unknown"}`,
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
        `[MeshChat] Stream finished. Text length: ${state.textContent.length}, tools used: ${state.toolCallCount}`,
      );
      state.finished = true;
      break;
    }
  }
}

export async function processStreamWithCallback(
  body: ReadableStream<Uint8Array>,
  onStream: StreamCallback,
): Promise<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  const state = {
    textContent: "",
    toolCallCount: 0,
    finished: false,
    hasActiveToolCycle: false,
  };

  try {
    while (!state.finished) {
      const { done, value } = await reader.read();

      // Flush any remaining buffer content on stream end
      if (done) {
        if (buffer) {
          await processLines([buffer], state, onStream);
          buffer = "";
        }
        break;
      }

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      await processLines(lines, state, onStream);
    }
  } finally {
    reader.releaseLock();
  }

  const finalText =
    state.textContent || "Desculpe, não consegui gerar uma resposta.";
  await onStream(finalText, true);

  if (!state.textContent && state.toolCallCount > 0) {
    console.warn(
      `[MeshChat] ${state.toolCallCount} tool(s) called but no text response received`,
    );
  }

  return finalText;
}

/**
 * Collect the full text from an SSE stream without a callback.
 * Useful for non-streaming use cases where the API still returns SSE.
 *
 * Intermediate text generated between tool calls is discarded —
 * only the final text (after the last tool cycle) is returned.
 */
export async function collectFullStreamText(
  body: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let textContent = "";
  let buffer = "";
  let finished = false;

  const toolCalls: Array<{ id: string; name: string; result?: unknown }> = [];

  const processLine = (line: string): void => {
    if (!line.startsWith("data:")) return;

    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") return;

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
        toolCalls.push({ id: event.toolCallId, name: event.toolName });
        textContent = "";
      } else if (event.type === "tool-result" && event.toolCallId) {
        const tc = toolCalls.find((t) => t.id === event.toolCallId);
        if (tc) tc.result = event.result ?? event.output;
      } else if (event.type === "finish") {
        finished = true;
      }
    } catch {
      // Ignore parse errors on individual lines
    }
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();

      // Flush remaining buffer on stream end
      if (done) {
        if (buffer) processLine(buffer);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
        if (finished) break;
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
