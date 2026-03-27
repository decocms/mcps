import { createTriggers } from "@decocms/runtime/triggers";
import { StudioKV } from "@decocms/runtime/trigger-storage";
import { z } from "zod";

const storage =
  process.env.MESH_URL && process.env.MESH_API_KEY
    ? new StudioKV({
        url: process.env.MESH_URL,
        apiKey: process.env.MESH_API_KEY,
      })
    : undefined;

export const triggers = createTriggers({
  definitions: [
    {
      type: "github.push",
      description: "Triggered when code is pushed to a repository",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.pull_request.opened",
      description: "Triggered when a pull request is opened",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.pull_request.closed",
      description: "Triggered when a pull request is closed or merged",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.issues.opened",
      description: "Triggered when an issue is opened",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.issues.closed",
      description: "Triggered when an issue is closed",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.issue_comment.created",
      description: "Triggered when a comment is added to an issue or PR",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.pull_request_review.submitted",
      description: "Triggered when a pull request review is submitted",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.workflow_run.completed",
      description: "Triggered when a GitHub Actions workflow run completes",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
  ],
  storage,
});
