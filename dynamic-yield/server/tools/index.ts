import { collectTools } from "./collect.ts";
import { feedTools } from "./feed.ts";
import { profileTools } from "./profile.ts";
import { serveTools } from "./serve.ts";

export const tools = [
  ...serveTools,
  ...collectTools,
  ...feedTools,
  ...profileTools,
];
