import { createClient, createConfig } from "@hey-api/client-fetch";
import type { Client } from "@hey-api/client-fetch";
import type { VTEXCredentials } from "../types/env.ts";

const REQUEST_TIMEOUT_MS = 30_000;

export interface ResolvedCredentials extends VTEXCredentials {
  /** Where each credential value came from — useful for diagnosing missing config. */
  sources: {
    accountName: "state" | "env" | "missing";
    appKey: "state" | "env" | "missing";
    appToken: "state" | "env" | "missing";
  };
}

function pickSource(
  fromState: string | undefined,
  fromEnv: string | undefined,
): { value: string; source: "state" | "env" | "missing" } {
  if (fromState) return { value: fromState, source: "state" };
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: "", source: "missing" };
}

export function resolveCredentials(
  state: Partial<VTEXCredentials> | undefined,
): ResolvedCredentials {
  const safeState = state ?? {};
  const account = pickSource(
    safeState.accountName,
    process.env.VTEX_ACCOUNT_NAME,
  );
  const key = pickSource(safeState.appKey, process.env.VTEX_APP_KEY);
  const token = pickSource(safeState.appToken, process.env.VTEX_APP_TOKEN);

  if (account.source === "missing") {
    const stateKeys = state ? Object.keys(state) : [];
    console.warn(
      "[VTEX] resolveCredentials: accountName is missing — neither MESH_REQUEST_CONTEXT.state.accountName nor process.env.VTEX_ACCOUNT_NAME is set.",
      JSON.stringify({
        receivedStateType: state === undefined ? "undefined" : typeof state,
        receivedStateKeys: stateKeys,
        receivedStateAccountName: safeState.accountName ?? null,
        envVtexAccountNameSet: Boolean(process.env.VTEX_ACCOUNT_NAME),
      }),
    );
  }

  return {
    accountName: account.value,
    appKey: key.value || undefined,
    appToken: token.value || undefined,
    sources: {
      accountName: account.source,
      appKey: key.source,
      appToken: token.source,
    },
  };
}

export function assertValidCredentials(
  creds: ResolvedCredentials,
  toolId?: string,
): void {
  if (!creds.accountName) {
    const where = toolId ? ` (tool=${toolId})` : "";
    throw new Error(
      `VTEX accountName is missing${where} — set MESH_REQUEST_CONTEXT.state.accountName or VTEX_ACCOUNT_NAME env var. Without it the request URL would be "https://.vtexcommercestable.com.br" and the runtime would reject it with "Was there a typo in the url or port?".`,
    );
  }
}

function buildClient(baseUrl: string, credentials: VTEXCredentials): Client {
  const client = createClient(createConfig({ baseUrl }));

  console.log("[VTEX] buildClient: baseUrl=", baseUrl);

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
      return new Request(request, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
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
