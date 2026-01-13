/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  n8nWebhookUrl: z.string().describe("URL do webhook N8N para scraping"),
  urlFields: z.object({
    urls: z.array(z.string()).describe("URLs to scrape content from"),
  }),
  redditFields: z.object({
    subreddit: z.string().describe("Subreddit to scrape content from"),
  }),
  linkedinFields: z.object({
    topics: z.array(z.string()).describe("URLs to scrape content from"),
  }),
  twitterFields: z.object({
    topics: z.array(z.string()).describe("Topics to scrape content from"),
  }),
});

type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema> & {
  DECO_CHAT_REQUEST_CONTEXT: {
    state: State;
  };
};
