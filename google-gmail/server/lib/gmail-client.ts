/**
 * Gmail API client
 * Handles all communication with the Gmail API
 */

import { ENDPOINTS } from "../constants.ts";
import type {
  Message,
  MessageListResponse,
  ListMessagesInput,
  GetMessageInput,
  SendMessageInput,
  ModifyMessageInput,
  Thread,
  ThreadListResponse,
  ListThreadsInput,
  GetThreadInput,
  ModifyThreadInput,
  Label,
  LabelListResponse,
  CreateLabelInput,
  UpdateLabelInput,
  Draft,
  DraftListResponse,
  ListDraftsInput,
  CreateDraftInput,
  ParsedMessage,
  MessagePart,
} from "./types.ts";

export interface GmailClientConfig {
  accessToken: string;
}

export class GmailClient {
  private accessToken: string;

  constructor(config: GmailClientConfig) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${error}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // ==================== Message Helpers ====================

  /**
   * Parse a Gmail message into a more usable format
   */
  parseMessage(message: Message): ParsedMessage {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    // Extract body from parts
    let bodyText = "";
    let bodyHtml = "";
    const attachments: ParsedMessage["attachments"] = [];

    const extractBody = (part: MessagePart) => {
      if (part.mimeType === "text/plain" && part.body?.data) {
        bodyText = this.decodeBase64(part.body.data);
      } else if (part.mimeType === "text/html" && part.body?.data) {
        bodyHtml = this.decodeBase64(part.body.data);
      } else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size,
          attachmentId: part.body.attachmentId,
        });
      }

      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };

    if (message.payload) {
      extractBody(message.payload);
    }

    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      snippet: message.snippet || "",
      from: getHeader("From"),
      to: getHeader("To"),
      cc: getHeader("Cc"),
      bcc: getHeader("Bcc"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      bodyText,
      bodyHtml,
      attachments,
    };
  }

  /**
   * Decode base64url encoded string (UTF-8 safe)
   */
  private decodeBase64(data: string): string {
    // Convert base64url to base64
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    try {
      // Use Buffer for proper UTF-8 decoding
      return Buffer.from(base64, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }

  /**
   * Encode string to base64url (UTF-8 safe)
   */
  private encodeBase64(data: string): string {
    // Use Buffer for proper UTF-8 encoding
    const base64 = Buffer.from(data, "utf-8").toString("base64");
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /**
   * Build raw RFC 2822 message
   */
  private buildRawMessage(input: SendMessageInput): string {
    const lines: string[] = [];

    lines.push(`To: ${input.to}`);
    if (input.cc) lines.push(`Cc: ${input.cc}`);
    if (input.bcc) lines.push(`Bcc: ${input.bcc}`);
    if (input.replyTo) lines.push(`Reply-To: ${input.replyTo}`);
    if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
    if (input.references) lines.push(`References: ${input.references}`);
    lines.push(`Subject: ${input.subject}`);
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("");
    lines.push(input.body);

    return this.encodeBase64(lines.join("\r\n"));
  }

  // ==================== Message Methods ====================

  /**
   * List messages in the mailbox
   */
  async listMessages(input: ListMessagesInput = {}): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
  }> {
    const url = new URL(ENDPOINTS.MESSAGES);

    if (input.maxResults)
      url.searchParams.set("maxResults", String(input.maxResults));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    if (input.q) url.searchParams.set("q", input.q);
    if (input.labelIds)
      input.labelIds.forEach((id) => url.searchParams.append("labelIds", id));
    if (input.includeSpamTrash !== undefined)
      url.searchParams.set("includeSpamTrash", String(input.includeSpamTrash));

    const response = await this.request<MessageListResponse>(url.toString());

    return {
      messages: response.messages || [],
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(input: GetMessageInput): Promise<Message> {
    const url = new URL(ENDPOINTS.MESSAGE(input.id));

    if (input.format) url.searchParams.set("format", input.format);
    if (input.metadataHeaders) {
      input.metadataHeaders.forEach((h) =>
        url.searchParams.append("metadataHeaders", h),
      );
    }

    return this.request<Message>(url.toString());
  }

  /**
   * Send a new message
   */
  async sendMessage(input: SendMessageInput): Promise<Message> {
    const raw = this.buildRawMessage(input);

    const body: any = { raw };
    if (input.threadId) {
      body.threadId = input.threadId;
    }

    return this.request<Message>(ENDPOINTS.MESSAGE_SEND, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Move message to trash
   */
  async trashMessage(messageId: string): Promise<Message> {
    return this.request<Message>(ENDPOINTS.MESSAGE_TRASH(messageId), {
      method: "POST",
    });
  }

  /**
   * Remove message from trash
   */
  async untrashMessage(messageId: string): Promise<Message> {
    return this.request<Message>(ENDPOINTS.MESSAGE_UNTRASH(messageId), {
      method: "POST",
    });
  }

  /**
   * Permanently delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.MESSAGE(messageId), {
      method: "DELETE",
    });
  }

  /**
   * Modify message labels
   */
  async modifyMessage(input: ModifyMessageInput): Promise<Message> {
    return this.request<Message>(ENDPOINTS.MESSAGE_MODIFY(input.id), {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: input.addLabelIds || [],
        removeLabelIds: input.removeLabelIds || [],
      }),
    });
  }

  // ==================== Thread Methods ====================

  /**
   * List threads in the mailbox
   */
  async listThreads(input: ListThreadsInput = {}): Promise<{
    threads: Array<{ id: string; snippet?: string; historyId?: string }>;
    nextPageToken?: string;
  }> {
    const url = new URL(ENDPOINTS.THREADS);

    if (input.maxResults)
      url.searchParams.set("maxResults", String(input.maxResults));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    if (input.q) url.searchParams.set("q", input.q);
    if (input.labelIds)
      input.labelIds.forEach((id) => url.searchParams.append("labelIds", id));
    if (input.includeSpamTrash !== undefined)
      url.searchParams.set("includeSpamTrash", String(input.includeSpamTrash));

    const response = await this.request<ThreadListResponse>(url.toString());

    return {
      threads: response.threads || [],
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Get a specific thread by ID
   */
  async getThread(input: GetThreadInput): Promise<Thread> {
    const url = new URL(ENDPOINTS.THREAD(input.id));

    if (input.format) url.searchParams.set("format", input.format);
    if (input.metadataHeaders) {
      input.metadataHeaders.forEach((h) =>
        url.searchParams.append("metadataHeaders", h),
      );
    }

    return this.request<Thread>(url.toString());
  }

  /**
   * Move thread to trash
   */
  async trashThread(threadId: string): Promise<Thread> {
    return this.request<Thread>(ENDPOINTS.THREAD_TRASH(threadId), {
      method: "POST",
    });
  }

  /**
   * Remove thread from trash
   */
  async untrashThread(threadId: string): Promise<Thread> {
    return this.request<Thread>(ENDPOINTS.THREAD_UNTRASH(threadId), {
      method: "POST",
    });
  }

  /**
   * Modify thread labels
   */
  async modifyThread(input: ModifyThreadInput): Promise<Thread> {
    return this.request<Thread>(ENDPOINTS.THREAD_MODIFY(input.id), {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: input.addLabelIds || [],
        removeLabelIds: input.removeLabelIds || [],
      }),
    });
  }

  /**
   * Permanently delete a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.THREAD(threadId), {
      method: "DELETE",
    });
  }

  // ==================== Label Methods ====================

  /**
   * List all labels
   */
  async listLabels(): Promise<Label[]> {
    const response = await this.request<LabelListResponse>(ENDPOINTS.LABELS);
    return response.labels || [];
  }

  /**
   * Get a specific label by ID
   */
  async getLabel(labelId: string): Promise<Label> {
    return this.request<Label>(ENDPOINTS.LABEL(labelId));
  }

  /**
   * Create a new label
   */
  async createLabel(input: CreateLabelInput): Promise<Label> {
    return this.request<Label>(ENDPOINTS.LABELS, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Update a label
   */
  async updateLabel(input: UpdateLabelInput): Promise<Label> {
    const { id, ...data } = input;
    return this.request<Label>(ENDPOINTS.LABEL(id), {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a label
   */
  async deleteLabel(labelId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.LABEL(labelId), {
      method: "DELETE",
    });
  }

  // ==================== Draft Methods ====================

  /**
   * List drafts
   */
  async listDrafts(input: ListDraftsInput = {}): Promise<{
    drafts: Array<{ id: string; message: { id: string; threadId: string } }>;
    nextPageToken?: string;
  }> {
    const url = new URL(ENDPOINTS.DRAFTS);

    if (input.maxResults)
      url.searchParams.set("maxResults", String(input.maxResults));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    if (input.q) url.searchParams.set("q", input.q);
    if (input.includeSpamTrash !== undefined)
      url.searchParams.set("includeSpamTrash", String(input.includeSpamTrash));

    const response = await this.request<DraftListResponse>(url.toString());

    return {
      drafts: response.drafts || [],
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Get a specific draft by ID
   */
  async getDraft(draftId: string, format?: string): Promise<Draft> {
    const url = new URL(ENDPOINTS.DRAFT(draftId));
    if (format) url.searchParams.set("format", format);

    return this.request<Draft>(url.toString());
  }

  /**
   * Create a new draft
   */
  async createDraft(input: CreateDraftInput): Promise<Draft> {
    const raw = this.buildRawMessage({
      to: input.to,
      subject: input.subject,
      body: input.body,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      inReplyTo: input.inReplyTo,
      references: input.references,
    });

    const body: any = {
      message: { raw },
    };
    if (input.threadId) {
      body.message.threadId = input.threadId;
    }

    return this.request<Draft>(ENDPOINTS.DRAFTS, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Update a draft
   */
  async updateDraft(draftId: string, input: CreateDraftInput): Promise<Draft> {
    const raw = this.buildRawMessage({
      to: input.to,
      subject: input.subject,
      body: input.body,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      inReplyTo: input.inReplyTo,
      references: input.references,
    });

    const body: any = {
      message: { raw },
    };
    if (input.threadId) {
      body.message.threadId = input.threadId;
    }

    return this.request<Draft>(ENDPOINTS.DRAFT(draftId), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /**
   * Send a draft
   */
  async sendDraft(draftId: string): Promise<Message> {
    return this.request<Message>(ENDPOINTS.DRAFT_SEND, {
      method: "POST",
      body: JSON.stringify({ id: draftId }),
    });
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.DRAFT(draftId), {
      method: "DELETE",
    });
  }
}

// Re-export getGoogleAccessToken from env.ts for convenience
export { getGoogleAccessToken as getAccessToken } from "./env.ts";
