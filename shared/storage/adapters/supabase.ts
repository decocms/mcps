import type { ObjectStorage } from "../interface.ts";

export interface SupabaseConfig {
  projectUrl: string;
  apiKey: string;
  bucketName: string;
}
export class SupabaseStorageAdapter implements ObjectStorage {
  private projectUrl: string;
  private apiKey: string;
  private bucketName: string;

  constructor(config: SupabaseConfig) {
    this.projectUrl = config.projectUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.bucketName = config.bucketName;
  }

  async getReadUrl(path: string, expiresIn: number): Promise<string> {
    const response = await fetch(
      `${this.projectUrl}/storage/v1/object/sign/${this.bucketName}/${path}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate Supabase read URL: ${error}`);
    }

    const data = await response.json() as { signedURL: string };
    return `${this.projectUrl}${data.signedURL}`;
  }

  async getWriteUrl(
    path: string,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      expiresIn: number;
    },
  ): Promise<string> {
    const response = await fetch(
      `${this.projectUrl}/storage/v1/object/upload/sign/${this.bucketName}/${path}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expiresIn: options.expiresIn,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate Supabase write URL: ${error}`);
    }

    const data = await response.json() as { url: string; token: string };
    return `${this.projectUrl}${data.url}?token=${data.token}`;
  }
  async uploadFile(
    path: string,
    data: Buffer | Uint8Array | Blob,
    options?: {
      contentType?: string;
      cacheControl?: string;
      upsert?: boolean;
    },
  ): Promise<{ url: string; path: string }> {
    const formData = new FormData();
    const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)]);
    formData.append("file", blob);

    const queryParams = new URLSearchParams();
    if (options?.contentType) {
      queryParams.append("contentType", options.contentType);
    }
    if (options?.cacheControl) {
      queryParams.append("cacheControl", options.cacheControl);
    }
    if (options?.upsert) {
      queryParams.append("upsert", "true");
    }

    const response = await fetch(
      `${this.projectUrl}/storage/v1/object/${this.bucketName}/${path}?${queryParams}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file to Supabase: ${error}`);
    }

    const result = await response.json() as { Key?: string };
    const publicUrl = `${this.projectUrl}/storage/v1/object/public/${this.bucketName}/${path}`;

    return {
      url: publicUrl,
      path: result.Key || path,
    };
  }

  getPublicUrl(path: string): string {
    return `${this.projectUrl}/storage/v1/object/public/${this.bucketName}/${path}`;
  }
}

