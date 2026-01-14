/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const SourceTypeEnum = z.enum([
  "Trendsetters",
  "Enterprise",
  "MCP-First Startups",
  "Community",
]);

export type SourceType = z.infer<typeof SourceTypeEnum>;

const AuthoritySchema = z
  .number()
  .min(0)
  .max(1)
  .describe(
    "Source credibility score from 0 to 1. Higher values indicate more trustworthy/influential sources (e.g., 0.9 for official docs, 0.5 for blogs, 0.2 for forums)",
  );

const UrlEntrySchema = z.object({
  url: z.string().describe("URL to scrape"),
  type: SourceTypeEnum.describe("Type/category of this source"),
  authority: AuthoritySchema,
});

const RedditEntrySchema = z.object({
  topic: z.string().describe("Subreddit topic to scrape"),
  type: SourceTypeEnum.describe("Type/category of this source"),
  authority: AuthoritySchema,
});

const LinkedinEntrySchema = z.object({
  profile: z.string().describe("LinkedIn profile to scrape"),
  type: SourceTypeEnum.describe("Type/category of this source"),
  authority: AuthoritySchema,
});

const TwitterEntrySchema = z.object({
  topic: z.string().describe("Twitter topic to scrape"),
  type: SourceTypeEnum.describe("Type/category of this source"),
  authority: AuthoritySchema,
});

export const StateSchema = z.object({
  n8nWebhookUrl: z.string().describe("URL do webhook N8N para scraping"),
  urlFields: z.object({
    urls: z.array(UrlEntrySchema).describe("URLs to scrape content from"),
  }),
  redditFields: z.object({
    RedditTopicsToScrape: z
      .array(RedditEntrySchema)
      .describe("Subreddits topics to scrape content from"),
  }),
  linkedinFields: z.object({
    linkedinProfiles: z
      .array(LinkedinEntrySchema)
      .describe("LinkedIn profiles to scrape content from"),
  }),
  twitterFields: z.object({
    TwitterTopics: z
      .array(TwitterEntrySchema)
      .describe("Twitter topics to scrape content from"),
  }),
});

type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema> & {
  DECO_CHAT_REQUEST_CONTEXT: {
    state: State;
  };
};
