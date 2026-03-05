import { createClient, createConfig } from "@hey-api/client-fetch";
import type { Client } from "@hey-api/client-fetch";
import type { VTEXCredentials } from "../types/env.ts";

const REQUEST_TIMEOUT_MS = 30_000;

export function resolveCredentials(
  state: Partial<VTEXCredentials>,
): VTEXCredentials {
  return {
    accountName: state.accountName || process.env.VTEX_ACCOUNT_NAME || "",
    appKey: state.appKey || process.env.VTEX_APP_KEY || "",
    appToken: state.appToken || process.env.VTEX_APP_TOKEN || "",
  };
}

function buildClient(baseUrl: string, credentials: VTEXCredentials): Client {
  const client = createClient(createConfig({ baseUrl }));

  client.interceptors.request.use((request) => {
    if (credentials.appKey) {
      request.headers.set("X-VTEX-API-AppKey", credentials.appKey);
    }
    if (credentials.appToken) {
      request.headers.set("X-VTEX-API-AppToken", credentials.appToken);
    }
    if (process.env.DEBUG) {
      console.log("[VTEX] Request:", request.method, request.url);
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

export function createVtexClient(credentials: VTEXCredentials): Client {
  return buildClient(
    `https://${credentials.accountName}.vtexcommercestable.com.br`,
    credentials,
  );
}

export function createVtexIsClient(credentials: VTEXCredentials): Client {
  return buildClient(
    `https://${credentials.accountName}.vtexcommercestable.com.br/api/io/_v/api/intelligent-search`,
    credentials,
  );
}

export function createVtexIsEventsClient(credentials: VTEXCredentials): Client {
  return buildClient(
    `https://${credentials.accountName}.vtexcommercestable.com.br/api/io/_v/api/intelligent-search-events`,
    credentials,
  );
}
