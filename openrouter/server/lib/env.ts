import type { AppContext } from "@decocms/runtime/tools";

export const getOpenRouterApiKey = (appCtx: AppContext) => {
  const authorization = appCtx.req?.headers.get("Authorization");
  if (!authorization) {
    throw new Error("Authorization header is required");
  }
  const token = authorization.split(" ")[1];
  return token;
};
