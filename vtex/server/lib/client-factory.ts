import { createClient, createConfig } from "@hey-api/client-fetch";
import type { Client } from "@hey-api/client-fetch";
import type { VTEXCredentials } from "../types/env.ts";

const REQUEST_TIMEOUT_MS = 30_000;

export function createVtexClient(credentials: VTEXCredentials): Client {
  const client = createClient(
    createConfig({
      baseUrl: `https://${credentials.accountName}.vtexcommercestable.com.br`,
    }),
  );

  client.interceptors.request.use((request) => {
    if (credentials.appKey) {
      request.headers.set("X-VTEX-API-AppKey", credentials.appKey);
    }
    if (credentials.appToken) {
      request.headers.set("X-VTEX-API-AppToken", credentials.appToken);
    }
    // Ensure timeout for all requests
    if (!request.signal) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      return new Request(request, { signal: controller.signal });
    }
    return request;
  });

  return client;
}
