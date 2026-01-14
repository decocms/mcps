/**
 * Gmail API types
 */

// ============================================================================
// Message Types
// ============================================================================

export interface MessagePartHeader {
  name: string;
  value: string;
}

export interface MessagePartBody {
  attachmentId?: string;
  size: number;
  data?: string; // Base64 encoded
}

export interface MessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: MessagePartHeader[];
  body: MessagePartBody;
  parts?: MessagePart[];
}

export interface Message {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: MessagePart;
  sizeEstimate?: number;
  raw?: string; // Base64 encoded full message
}

export interface MessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ListMessagesInput {
  maxResults?: number;
  pageToken?: string;
  q?: string; // Gmail search query
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface GetMessageInput {
  id: string;
  format?: "minimal" | "full" | "raw" | "metadata";
  metadataHeaders?: string[];
}

export interface SendMessageInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface ModifyMessageInput {
  id: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

// ============================================================================
// Thread Types
// ============================================================================

export interface Thread {
  id: string;
  historyId?: string;
  messages?: Message[];
  snippet?: string;
}

export interface ThreadListResponse {
  threads?: Array<{ id: string; snippet?: string; historyId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ListThreadsInput {
  maxResults?: number;
  pageToken?: string;
  q?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface GetThreadInput {
  id: string;
  format?: "minimal" | "full" | "metadata";
  metadataHeaders?: string[];
}

export interface ModifyThreadInput {
  id: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

// ============================================================================
// Label Types
// ============================================================================

export type LabelType = "system" | "user";
export type LabelListVisibility =
  | "labelShow"
  | "labelShowIfUnread"
  | "labelHide";
export type MessageListVisibility = "show" | "hide";

export interface LabelColor {
  textColor?: string;
  backgroundColor?: string;
}

export interface Label {
  id: string;
  name: string;
  messageListVisibility?: MessageListVisibility;
  labelListVisibility?: LabelListVisibility;
  type: LabelType;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: LabelColor;
}

export interface LabelListResponse {
  labels: Label[];
}

export interface CreateLabelInput {
  name: string;
  messageListVisibility?: MessageListVisibility;
  labelListVisibility?: LabelListVisibility;
  color?: LabelColor;
}

export interface UpdateLabelInput {
  id: string;
  name?: string;
  messageListVisibility?: MessageListVisibility;
  labelListVisibility?: LabelListVisibility;
  color?: LabelColor;
}

// ============================================================================
// Draft Types
// ============================================================================

export interface Draft {
  id: string;
  message: Message;
}

export interface DraftListResponse {
  drafts?: Array<{ id: string; message: { id: string; threadId: string } }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ListDraftsInput {
  maxResults?: number;
  pageToken?: string;
  q?: string;
  includeSpamTrash?: boolean;
}

export interface CreateDraftInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface UpdateDraftInput {
  id: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

export interface SendDraftInput {
  id: string;
}

// ============================================================================
// Parsed Message (simplified for tools output)
// ============================================================================

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId?: string;
  }>;
}
