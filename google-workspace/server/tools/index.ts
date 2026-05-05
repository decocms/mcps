/**
 * Aggregates tool factories for every Google service we proxy. Each backend
 * MCP's tools/list snapshot lives in ./generated/<service>.json — re-run
 * `bun run generate-tools` to refresh.
 *
 * Some Google MCP backends (notably chat) return duplicate tool entries from
 * tools/list. Dedupe by prefixed name to keep the runtime registration sane.
 */

import { TOOL_SNAPSHOTS } from "../constants.ts";
import { wrapBackendTool } from "../lib/wrap-tool.ts";

const seen = new Set<string>();
export const tools = Object.entries(TOOL_SNAPSHOTS).flatMap(([service, snap]) =>
  snap.tools
    .filter((def) => {
      const id = `${service}_${def.name}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((def) => wrapBackendTool(service as keyof typeof TOOL_SNAPSHOTS, def)),
);
