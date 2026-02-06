import type { Env } from "../types/env.ts";
import { getStrapiApiEndpoint, getStrapiApiToken } from "./env.ts";
import qs from "qs";

export const makeRequest = async (
  env: Env,
  endpoint: string,
  method: string = "GET",
  params?: Record<string, unknown>,
  body?: Record<string, unknown>,
  userAuthorized: boolean = false,
  requestId?: string,
): Promise<{
  success: boolean;
  data: unknown;
  requestId?: string;
  duration: number;
  status: number;
}> => {
  if (
    (method === "POST" || method === "PUT" || method === "DELETE") &&
    !userAuthorized
  ) {
    throw new Error(
      "AUTHORIZATION REQUIRED: POST, PUT, and DELETE operations require explicit user authorization.",
    );
  }

  const apiEndpoint = getStrapiApiEndpoint(env);
  const apiToken = getStrapiApiToken(env);

  let url = `${apiEndpoint}/${endpoint}`;

  if (params) {
    const queryString = qs.stringify(params, {
      encodeValuesOnly: true,
    });
    if (queryString) {
      url = `${url}?${queryString}`;
    }
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  const requestOptions: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT")) {
    requestOptions.body = JSON.stringify(body);
  }

  const startTime = Date.now();

  console.log(`Making REST request to Strapi`, {
    requestId,
    endpoint,
    method,
    hasParams: !!params,
    hasBody: !!body,
    userAuthorized,
    url: url.replace(apiEndpoint, "[REDACTED]"),
  });

  try {
    const response = await fetch(url, requestOptions);
    const duration = Date.now() - startTime;

    console.log(
      requestId || "unknown",
      method,
      endpoint,
      duration,
      response.status,
    );

    let data;
    const contentType = response.headers.get("content-type");

    // Only try to parse JSON if the content type indicates JSON
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      // For non-JSON responses, get the raw text
      data = await response.text();
    }

    return {
      success: response.ok, // Use response.ok to check for 2xx status codes
      data,
      requestId,
      duration,
      status: response.status,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      `REST request to ${endpoint} failed`,
      {
        requestId,
        endpoint,
        method,
        duration,
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      },
      error instanceof Error ? error : undefined,
    );

    throw error;
  }
};

/**
 * Helper to extract data and meta from Strapi API response
 */
export const extractStrapiResponse = (
  responseData: unknown,
): { data: unknown; meta?: unknown } => {
  if (
    typeof responseData === "object" &&
    responseData !== null &&
    ("data" in responseData || "meta" in responseData)
  ) {
    const obj = responseData as { data?: unknown; meta?: unknown };
    return {
      data: obj.data ?? responseData,
      meta: obj.meta,
    };
  }
  return { data: responseData };
};
