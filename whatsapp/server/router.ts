import { Hono } from "hono";
import { env } from "./env";
import { saveCallbackUrl } from "./lib/data";
import { handleVerifiedWebhookPayload } from "./webhook";
import {
  handleChallenge,
  handleWebhookPost,
} from "@decocms/mcps-shared/whatsapp";

export const app = new Hono();

app.get("/webhook", (c) => {
  return handleChallenge(c.req.raw);
});

app.post("/webhook", (c) => {
  return handleWebhookPost(c.req.raw, {
    appSecret: env.META_APP_SECRET,
    handleEvent: handleVerifiedWebhookPayload,
  });
});

app.get("/oauth/custom", async (c) => {
  const req = c.req;
  const callbackUrl = new URL(req.url).searchParams.get("callback_url");
  if (!callbackUrl) {
    return c.json({ error: "A callback URL is required" }, 400);
  }

  // Validate callback URL against MESH_URL to prevent open redirect attacks
  // Using origin comparison instead of startsWith to prevent bypass via domains like
  // https://mesh.example.com.attacker.com (which would pass a startsWith check)
  try {
    const callbackUrlParsed = new URL(callbackUrl);
    const meshUrlParsed = new URL(env.MESH_URL);
    const selfUrlParsed = new URL(env.SELF_URL);

    if (
      callbackUrlParsed.origin !== meshUrlParsed.origin &&
      callbackUrlParsed.origin !== selfUrlParsed.origin
    ) {
      return c.json({ error: "Invalid callback URL" }, 400);
    }
  } catch {
    return c.json({ error: "Invalid callback URL" }, 400);
  }

  const randomId = crypto.randomUUID();
  await saveCallbackUrl(randomId, callbackUrl);
  return c.redirect(
    new URL(
      `https://wa.me/${env.PHONE_NUMBER}?text=[VERIFY_CODE]:${randomId}`,
    ).toString(),
  );
});

export default app;
