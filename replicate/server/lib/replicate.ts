import Replicate from "replicate";
import { assertEnvKey } from "@decocms/mcps-shared/tools/utils/api-client";
import type { Env } from "../main";

/**
 * Creates a Replicate client instance with API key from contract binding
 */
export function createReplicateClient(env: Env): Replicate {
  assertEnvKey(env, "REPLICATE_API_TOKEN");

  return new Replicate({
    auth: env.REPLICATE_API_TOKEN as string,
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
