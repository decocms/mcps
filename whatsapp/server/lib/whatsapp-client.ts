import { env } from "../env";

const BASE_URL = "https://graph.facebook.com/v23.0";

export interface WhatsAppConfig {
  accessToken: string;
  businessAccountId: string;
}

export class WhatsAppAPIClient {
  private config: WhatsAppConfig;
  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private url(path: string): string {
    return `${BASE_URL}${path}`;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(this.url(path), {
      headers: this.headers,
    });
    return response.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json() as Promise<T>;
  }

  async postWithParams<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(this.url(path));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });
    return response.json() as Promise<T>;
  }

  // Phone Numbers
  listPhoneNumbers() {
    return this.get<{ data: unknown[] }>(
      `/${this.config.businessAccountId}/phone_numbers`,
    );
  }

  createPhoneNumber(params: {
    countryCode: string;
    phoneNumber: string;
    verifiedName: string;
  }) {
    return this.post<{ id: string }>(
      `/${this.config.businessAccountId}/phone_numbers`,
      {
        cc: params.countryCode,
        phone_number: params.phoneNumber,
        verified_name: params.verifiedName,
      },
    );
  }

  updateWebhook(
    phoneNumberId: string,
    params: { webhookUrl: string; verifyToken: string },
  ) {
    return this.post(`/${phoneNumberId}`, {
      webhook_configuration: {
        override_callback_uri: params.webhookUrl,
        verify_token: params.verifyToken,
      },
    });
  }

  // Verification
  requestCode(
    phoneNumberId: string,
    params: { codeMethod?: string; language?: string } = {},
  ) {
    return this.postWithParams<{ success: boolean }>(
      `/${phoneNumberId}/request_code`,
      {
        code_method: params.codeMethod ?? "SMS",
        language: params.language ?? "en_US",
      },
    );
  }

  verifyCode(phoneNumberId: string, code: string) {
    return this.postWithParams<{ success: boolean }>(
      `/${phoneNumberId}/verify_code`,
      { code },
    );
  }

  registerPhoneNumber(phoneNumberId: string, pin: string) {
    return this.post<{ success: boolean }>(`/${phoneNumberId}/register`, {
      pin,
      messaging_product: "whatsapp",
    });
  }

  updatePhoneNumberProfile({
    phoneNumberId,
    about,
    address,
    email,
    websites,
    profile_picture_handle,
    vertical,
  }: {
    phoneNumberId: string;
    about?: string;
    address?: string;
    email?: string;
    websites?: string[];
    profile_picture_handle?: string;
    vertical?:
      | "ALCOHOL"
      | "APPAREL"
      | "AUTO"
      | "BEAUTY"
      | "EDU"
      | "ENTERTAIN"
      | "EVENT_PLAN"
      | "FINANCE"
      | "GOVT"
      | "GROCERY"
      | "HEALTH"
      | "HOTEL"
      | "NONPROFIT"
      | "ONLINE_GAMBLING"
      | "OTC_DRUGS"
      | "OTHER"
      | "PHYSICAL_GAMBLING"
      | "PROF_SERVICES"
      | "RESTAURANT"
      | "RETAIL"
      | "TRAVEL";
  }) {
    return this.post<{ success: boolean }>(
      `/${phoneNumberId}/whatsapp_business_profile`,
      {
        about,
        address,
        email,
        websites,
        profile_picture_handle,
        vertical,
        messaging_product: "whatsapp",
      },
    );
  }

  // Messages
  sendTextMessage({
    phoneNumberId,
    to,
    message,
  }: {
    phoneNumberId: string;
    to: string;
    message: string;
  }) {
    return this.post<{ messages: { id: string }[] }>(
      `/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          body: message,
        },
      },
    );
  }

  markMessageAsRead({
    phoneNumberId,
    messageId,
    showTypingIndicator = false,
  }: {
    phoneNumberId: string;
    messageId: string;
    showTypingIndicator?: boolean;
  }) {
    return this.post<{ success: boolean }>(`/${phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: showTypingIndicator
        ? {
            type: "text",
          }
        : undefined,
    });
  }

  sendCallToActionMessage({
    phoneNumberId,
    to,
    url,
    text,
    cta_display_text,
  }: {
    phoneNumberId: string;
    to: string;
    url: string;
    text: string;
    cta_display_text: string;
  }) {
    return this.post<{ messages: { id: string }[] }>(
      `/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: {
            text,
          },
          action: {
            name: "cta_url",
            parameters: {
              url,
              display_text: cta_display_text,
            },
          },
        },
      },
    );
  }

  // Files - Resumable Upload API
  // Step 1: Start an upload session
  startUploadSession({
    appId,
    fileName,
    fileLength,
    fileType,
  }: {
    appId: string;
    fileName: string;
    fileLength: number;
    fileType:
      | "application/pdf"
      | "image/jpeg"
      | "image/jpg"
      | "image/png"
      | "video/mp4";
  }) {
    return this.postWithParams<{ id: string }>(`/${appId}/uploads`, {
      file_name: fileName,
      file_length: fileLength.toString(),
      file_type: fileType,
    });
  }

  // Step 2: Upload the file binary to the session
  async uploadFileToSession({
    uploadSessionId,
    fileData,
    fileOffset = 0,
  }: {
    uploadSessionId: string;
    fileData: ArrayBuffer;
    fileOffset?: number;
  }): Promise<{ h: string }> {
    const response = await fetch(`${BASE_URL}/${uploadSessionId}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${this.config.accessToken}`,
        file_offset: fileOffset.toString(),
      },
      body: new Blob([fileData]),
    });
    return response.json() as Promise<{ h: string }>;
  }

  // Get upload status (for resuming interrupted uploads)
  async getUploadStatus({
    uploadSessionId,
  }: {
    uploadSessionId: string;
  }): Promise<{ id: string; file_offset: number }> {
    const response = await fetch(`${BASE_URL}/${uploadSessionId}`, {
      method: "GET",
      headers: {
        Authorization: `OAuth ${this.config.accessToken}`,
      },
    });
    return response.json() as Promise<{ id: string; file_offset: number }>;
  }
}

export const getWhatsappClient = () => {
  return new WhatsAppAPIClient({
    accessToken: env.META_ACCESS_KEY,
    businessAccountId: env.META_BUSINESS_ACCOUNT_ID,
  });
};
