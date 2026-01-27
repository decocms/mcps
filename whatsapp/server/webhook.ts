import { publishPublicEvent } from "./events";
import {
  deleteSenderConfig,
  readCallbackUrl,
  readSenderConfig,
  saveAuthToken,
} from "./lib/data";
import {
  FIREABLE_EVENT_TYPES,
  LAZY_DEFAULT_PHONE_NUMBER_ID,
  whatsappClient,
} from "./main";
import { getKvStore } from "./lib/kv";
import { WebhookPayload } from "@decocms/mcps-shared/whatsapp";
import { env } from "./env";

const isTextMessage = (payload: WebhookPayload) => {
  return !!payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
};

const getTextMessage = (payload: WebhookPayload) => {
  const from = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  const phoneNumberId =
    payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  const text =
    payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
  if (!from || !phoneNumberId || !text) {
    throw new Error("Invalid message data");
  }
  return { from, phoneNumberId, text };
};

async function handleVerifyCode({
  from,
  phoneNumberId,
  text,
}: {
  from: string;
  phoneNumberId: string;
  text: string;
}) {
  const code = text.split(":")[1];
  const callbackUrl = await readCallbackUrl(code);
  if (!callbackUrl) {
    await whatsappClient.sendTextMessage({
      phoneNumberId,
      to: from,
      message: "Invalid code",
    });
    return;
  }

  // Generate auth token instead of using phone number directly
  const authToken = crypto.randomUUID();
  await saveAuthToken(authToken, from);
  // Properly construct URL with code parameter
  const redirectUrl = new URL(callbackUrl);
  redirectUrl.searchParams.set("code", authToken);

  await whatsappClient.sendCallToActionMessage({
    phoneNumberId,
    to: from,
    url: redirectUrl.toString(),
    text: "Please follow the link bellow to finish your authentication.",
    cta_display_text: "Complete",
    cta_header_image_url:
      "https://assets.decocache.com/decocms/8c4da0ff-9be6-4aa3-ad53-895f87756911/blog1.png",
  });
}

export async function handleVerifiedWebhookPayload(payload: WebhookPayload) {
  if (!isTextMessage(payload)) return;
  const { from, phoneNumberId, text } = getTextMessage(payload);
  if (phoneNumberId !== LAZY_DEFAULT_PHONE_NUMBER_ID) return;
  const messageId = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
  if (!messageId) {
    return;
  }
  const kv = getKvStore();
  if (text.includes("[VERIFY_CODE]")) {
    await deleteSenderConfig(from);
    await kv.delete(`whatsapp:thread:${from}`);
    handleVerifyCode({ from, phoneNumberId, text }).catch((e) => {
      console.error("Error handling verify code", e);
    });
    return;
  }
  const config = await readSenderConfig(from);
  if (!config) {
    const url = new URL(
      `${env.MESH_URL}/store/deco-whatsapp-agent?serverName=deco/whatsapp-agent`,
    ).toString();
    whatsappClient
      .sendCallToActionMessage({
        phoneNumberId,
        to: from,
        url,
        text: `You need to set up this app in Deco's MCP Mesh first.\n\nAfter connecting, you will be redirected back this chat with a message that contains the verification code. Please paste the full message, including the initial tag. Example:\n
\`\`\`
[VERIFY_CODE]:xxxxx-22222-xxxxx-22222
\`\`\``,
        cta_display_text: "Go to Deco Store",
        cta_header_image_url:
          "https://assets.decocache.com/decocms/8c4da0ff-9be6-4aa3-ad53-895f87756911/blog1.png",
      })
      .catch((e) => {
        console.error("Error sending call to action message", e);
      });
    return;
  }

  let threadId = await kv.get<string>(`whatsapp:thread:${from}`);
  if (!threadId || typeof threadId !== "string") {
    threadId = crypto.randomUUID();
    await kv.set(`whatsapp:thread:${from}`, threadId, {
      ex: 60 * 60 * 24, // 1 day
    });
  }

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };

  publishPublicEvent({
    type: FIREABLE_EVENT_TYPES.OPERATOR_GENERATE,
    data: {
      messages: [userMessage],
      threadId,
      userId: config.userId,
    },
    subject: from,
    organizationId: config.organizationId,
  })
    .then(() => {
      whatsappClient.markMessageAsRead({
        phoneNumberId,
        messageId,
        showTypingIndicator: true,
      });
    })
    .catch((e) => {
      console.error("Error publishing event", e);
    });
}
