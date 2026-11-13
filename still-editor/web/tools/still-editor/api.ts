import type { App } from "@modelcontextprotocol/ext-apps/react";

export interface PieceSummary {
  productId: number;
  name: string;
  alias: string;
  type: "top" | "bottom" | null;
  variantCount: number;
  still: { imageId: number; url: string | null } | null;
}

export interface Version {
  id: string;
  parentId: string | null;
  prompt: string;
  model: string;
  check: { ok: boolean; problems: string[] };
  author: { email: string; name: string | null };
  createdAt: string;
  imageUrl: string;
  /** What the edit started from; absent on versions made before it was kept. */
  base?: "version" | "original" | "store";
  beforeUrl: string | null;
}

export interface Publication {
  id: string;
  kind: "publish" | "restore";
  status: "published" | "rolled-back";
  error?: string;
  before: { imageId: number } | null;
  variants: unknown[];
  author: { email: string; name: string | null };
  at: string;
}

export interface Loaded {
  piece: PieceSummary;
  pair: PieceSummary | null;
  hasSource: boolean;
  versions: Version[];
  publications: Publication[];
  models: string[];
  defaultModel: string;
}

export interface EditStatus {
  status: "running" | "done" | "failed";
  error: string | null;
  version: Version | null;
}

/** Calls one of this app's tools through the host and returns its result. */
export async function callTool<T>(
  app: App,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) {
    const text = result.content
      ?.map((part) => (part.type === "text" ? part.text : ""))
      .join(" ");
    throw new Error(text || `${name} failed`);
  }
  return result.structuredContent as T;
}

const TOKEN_REJECTED = "[wake-admin-token-rejected]";

/** The message to show for a failed call, in the user's language. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(TOKEN_REJECTED)) {
    return "O token da Wake expirou ou foi revogado. Gere um token novo no admin da Wake e atualize o campo apiToken da connection Wake no Studio.";
  }
  if (message.includes("has no openrouter key")) {
    return "A organização não tem chave do OpenRouter. Adicione em Settings → AI providers.";
  }
  return message;
}

const PROBLEMS: Record<string, string> = {
  "background is not the brand's plate": "O fundo não é a placa da marca.",
  "no garment found": "Nenhuma peça encontrada na imagem.",
  "the garment touches the edge of the frame": "A peça encosta na borda.",
  "the garment is too large for the frame": "A peça ficou grande demais.",
  "the garment is off centre": "A peça está fora do centro.",
};

export const describeProblem = (problem: string) =>
  PROBLEMS[problem] ?? problem;

const MODEL_NAMES: Record<string, string> = {
  "openai/gpt-image-2.6-sunburst": "GPT Image 2.6 Sunburst",
  "google/gemini-nano-banana-2.1": "Nano Banana 2.1",
  "google/gemini-3-pro-image": "Gemini 3 Pro Image",
  "bytedance-seed/seedream-5-0-pro": "Seedream 5.0 Pro",
};

export const modelName = (id: string) => MODEL_NAMES[id] ?? id;
