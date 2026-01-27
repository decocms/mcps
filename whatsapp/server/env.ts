import { z } from "zod";

const envSchema = z.object({
  META_ACCESS_KEY: z.string(),
  META_APP_SECRET: z
    .string()
    .describe("Meta App Secret for webhook signature verification"),
  META_BUSINESS_ACCOUNT_ID: z.string(),
  UPSTASH_REDIS_REST_URL: z.string(),
  UPSTASH_REDIS_REST_TOKEN: z.string(),
  PHONE_NUMBER: z.string(),
  PHONE_NUMBER_ID: z
    .string()
    .describe("The phone number ID to use for the WhatsApp Business Account"),
  SELF_URL: z.string().optional().default("http://localhost:8003"),
  MESH_URL: z.string().optional().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment variables: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
