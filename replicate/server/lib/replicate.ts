import Replicate from "replicate";
import type { Env } from "../main";

/**
 * Creates a Replicate client instance with API key from env
 */
export function createReplicateClient(env: Env): Replicate {
  const apiKey = env.state.apiKey;

  if (!apiKey) {
    throw new Error("Replicate API key is required");
  }

  return new Replicate({
    auth: apiKey,
  });
}

/**
 * Type definitions for Replicate API
 */
export interface ReplicatePrediction {
  id: string;
  model: string;
  version: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  urls?: {
    get: string;
    cancel: string;
  };
}

export interface ReplicateModel {
  url: string;
  owner: string;
  name: string;
  description?: string;
  visibility: string;
  github_url?: string;
  paper_url?: string;
  license_url?: string;
  run_count: number;
  cover_image_url?: string;
  default_example?: {
    id: string;
    model: string;
    version: string;
    input: Record<string, unknown>;
    output?: unknown;
  };
  latest_version?: {
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: Record<string, unknown>;
  };
}
