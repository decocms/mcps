import { Hono } from "hono";
import { env } from "./env";
import { saveCallbackUrl } from "./lib/data";
import { handleChallenge, handleWebhook } from "./webhook";

export const app = new Hono();

app.get("/webhook", (c) => {
  return handleChallenge(c.req.raw);
});

app.post("/webhook", async (c) => {
  await handleWebhook(await c.req.json());
  return c.json({ success: true });
});

app.get("/oauth/custom", async (c) => {
  const req = c.req;
  const callbackUrl = new URL(req.url).searchParams.get("callback_url");
  const randomId = Math.floor(100000 + Math.random() * 900000).toString();
  if (!callbackUrl) {
    return c.json({ error: "A callback URL is required" }, 400);
  }
  await saveCallbackUrl(randomId, callbackUrl);
  return c.redirect(
    new URL(
      `https://wa.me/${env.PHONE_NUMBER}?text=[VERIFY_CODE]:${randomId}`,
    ).toString(),
  );
});

export default app;
