import { createPrivateTool } from "@decocms/runtime/tools";
import { ListRecordingsRequest, SortOptionsEnum } from "../types/clarity.ts";
import { callClarityApi } from "../lib/clarity.ts";
import { z } from "zod";
import type { Env } from "../main.ts";

export const listSessionRecordings = (env: Env) =>
  createPrivateTool({
    id: "list-session-recordings",
    description:
      "Lists Microsoft Clarity session recordings with metadata including session links, duration, and user interaction timelines. The date filter is required and must be in UTC ISO 8601 format.",
    inputSchema: ListRecordingsRequest,
    outputSchema: z.any().describe("List of session recordings with metadata"),
    execute: async ({ context }) => {
      const {
        filters,
        sortBy = "SessionStart_DESC",
        count = 100,
        token,
      } = context;

      const now = new Date().toISOString();
      const endDateString = filters?.date?.end || now;
      const startDateString = filters?.date?.start || now;

      const endDate = new Date(endDateString);
      const startDate = new Date(startDateString);

      if (!filters?.date?.start) {
        startDate.setDate(endDate.getDate() - 2);
      }

      const result = await callClarityApi(env, "/recordings/sample", {
        method: "POST",
        token,
        body: {
          sortBy: SortOptionsEnum[sortBy as keyof typeof SortOptionsEnum],
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          filters,
          count,
        },
      });

      return result;
    },
  });
