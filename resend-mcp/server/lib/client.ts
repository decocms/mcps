const RESEND_API_BASE = "https://api.resend.com";

export interface ResendClientConfig {
  apiKey: string;
}

export interface SendEmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  bcc?: string | string[];
  cc?: string | string[];
  reply_to?: string | string[];
  headers?: Record<string, string>;
}

export interface SendEmailResponse {
  id: string;
}

export interface ResendError {
  message: string;
  name: string;
}

export class ResendClient {
  private apiKey: string;

  constructor(config: ResendClientConfig) {
    this.apiKey = config.apiKey;
  }

  async sendEmail(request: SendEmailRequest): Promise<{
    data: SendEmailResponse | null;
    error: ResendError | null;
  }> {
    try {
      const response = await fetch(`${RESEND_API_BASE}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          data: null,
          error: this.mapError(response.status, responseData),
        };
      }

      return {
        data: responseData as SendEmailResponse,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          name: "application_error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  private mapError(status: number, responseData: any): ResendError {
    const message = responseData?.message || "Unknown error";

    const errorCodeMap: Record<number, string> = {
      401: "missing_api_key",
      403: "invalid_api_key",
      404: "not_found",
      405: "method_not_allowed",
      422: "validation_error",
      429: "rate_limit_exceeded",
      500: "internal_server_error",
    };

    const name = errorCodeMap[status] || "application_error";
    return { name, message };
  }
}
