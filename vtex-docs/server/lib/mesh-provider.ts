import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";

const ORGANIZATION_ID = process.env.MESH_ORGANIZATION_ID ?? "";
const CONNECTION_ID = process.env.MESH_CONNECTION_ID ?? "";

export const mesh = createOpenAICompatible({
  name: "mesh",
  apiKey: process.env.MESH_API_KEY ?? "",
  baseURL: `https://mesh-admin.decocms.com/api/${ORGANIZATION_ID}/v1`,
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export const chatModel = (modelId: string = "openai/gpt-4o-mini") =>
  mesh.chatModel(`${CONNECTION_ID}:${modelId}`);

export const embeddingModel = (modelId: string = "text-embedding-3-large") =>
  openai.textEmbeddingModel(modelId);
