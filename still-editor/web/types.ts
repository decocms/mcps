export type McpStatus =
  | "initializing"
  | "connected"
  | "tool-input"
  | "tool-result"
  | "tool-cancelled"
  | "error";

export interface McpState<TInput = unknown, TResult = unknown> {
  status: McpStatus;
  toolName?: string;
  error?: string;
  toolInput?: TInput;
  toolResult?: TResult;
}

export const INITIAL_STATE: McpState = { status: "initializing" };
