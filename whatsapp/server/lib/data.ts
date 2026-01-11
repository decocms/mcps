import { getKvStore } from "./kv";

export const saveCallbackUrl = async (code: string, callbackUrl: string) => {
  const kv = getKvStore();
  await kv.set(`whatsapp:callback_url:${code}`, callbackUrl, {
    ex: 120,
  });
};

export async function readCallbackUrl(code: string) {
  const kv = getKvStore();
  return await kv.get<string>(`whatsapp:callback_url:${code}`);
}

export interface WhatsAppConnectionConfig {
  organizationId: string;
  callbackUrl: string | null;
  complete: boolean;
}

export async function readSenderConfig(
  sender: string,
): Promise<WhatsAppConnectionConfig | null> {
  const kv = getKvStore();
  const config = await kv.get<WhatsAppConnectionConfig>(
    `whatsapp:config:${sender}`,
  );
  return config ?? null;
}

export async function saveSenderConfig(
  sender: string,
  config: WhatsAppConnectionConfig,
) {
  const kv = getKvStore();
  await kv.set(`whatsapp:config:${sender}`, config);
}
