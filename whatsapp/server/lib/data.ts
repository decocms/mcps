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
  userId: string;
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

export async function deleteSenderConfig(sender: string) {
  const kv = getKvStore();
  await kv.delete(`whatsapp:config:${sender}`);
}

// Auth token (short-lived, for OAuth completion) - 5 min TTL
export async function saveAuthToken(token: string, phone: string) {
  const kv = getKvStore();
  await kv.set(`whatsapp:auth_token:${token}`, phone, { ex: 300 });
}

export async function readAndDeleteAuthToken(
  token: string,
): Promise<string | null> {
  const kv = getKvStore();
  const phone = await kv.get<string>(`whatsapp:auth_token:${token}`);
  if (phone) await kv.delete(`whatsapp:auth_token:${token}`);
  return phone;
}

export async function saveAccessToken(token: string, phone: string) {
  const kv = getKvStore();
  await kv.set(`whatsapp:access_token:${token}`, phone);
}

export async function readPhoneFromAccessToken(
  token: string,
): Promise<string | null> {
  const kv = getKvStore();
  return await kv.get<string>(`whatsapp:access_token:${token}`);
}
