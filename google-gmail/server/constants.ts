/**
 * Gmail API constants and configuration
 */

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// API Endpoints
export const ENDPOINTS = {
  // Messages
  MESSAGES: `${GMAIL_API_BASE}/messages`,
  MESSAGE: (messageId: string) =>
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}`,
  MESSAGE_SEND: `${GMAIL_API_BASE}/messages/send`,
  MESSAGE_TRASH: (messageId: string) =>
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/trash`,
  MESSAGE_UNTRASH: (messageId: string) =>
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/untrash`,
  MESSAGE_MODIFY: (messageId: string) =>
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/modify`,

  // Threads
  THREADS: `${GMAIL_API_BASE}/threads`,
  THREAD: (threadId: string) =>
    `${GMAIL_API_BASE}/threads/${encodeURIComponent(threadId)}`,
  THREAD_TRASH: (threadId: string) =>
    `${GMAIL_API_BASE}/threads/${encodeURIComponent(threadId)}/trash`,
  THREAD_UNTRASH: (threadId: string) =>
    `${GMAIL_API_BASE}/threads/${encodeURIComponent(threadId)}/untrash`,
  THREAD_MODIFY: (threadId: string) =>
    `${GMAIL_API_BASE}/threads/${encodeURIComponent(threadId)}/modify`,

  // Labels
  LABELS: `${GMAIL_API_BASE}/labels`,
  LABEL: (labelId: string) =>
    `${GMAIL_API_BASE}/labels/${encodeURIComponent(labelId)}`,

  // Drafts
  DRAFTS: `${GMAIL_API_BASE}/drafts`,
  DRAFT: (draftId: string) =>
    `${GMAIL_API_BASE}/drafts/${encodeURIComponent(draftId)}`,
  DRAFT_SEND: `${GMAIL_API_BASE}/drafts/send`,
};

// Default pagination
export const DEFAULT_MAX_RESULTS = 50;

// System labels
export const SYSTEM_LABELS = {
  INBOX: "INBOX",
  SENT: "SENT",
  DRAFT: "DRAFT",
  SPAM: "SPAM",
  TRASH: "TRASH",
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  IMPORTANT: "IMPORTANT",
  CATEGORY_PERSONAL: "CATEGORY_PERSONAL",
  CATEGORY_SOCIAL: "CATEGORY_SOCIAL",
  CATEGORY_PROMOTIONS: "CATEGORY_PROMOTIONS",
  CATEGORY_UPDATES: "CATEGORY_UPDATES",
  CATEGORY_FORUMS: "CATEGORY_FORUMS",
} as const;

// Message format options
export const MESSAGE_FORMAT = {
  MINIMAL: "minimal",
  FULL: "full",
  RAW: "raw",
  METADATA: "metadata",
} as const;

// Label visibility options
export const LABEL_LIST_VISIBILITY = {
  SHOW: "labelShow",
  SHOW_IF_UNREAD: "labelShowIfUnread",
  HIDE: "labelHide",
} as const;

// Label message list visibility options
export const MESSAGE_LIST_VISIBILITY = {
  SHOW: "show",
  HIDE: "hide",
} as const;

// Label type
export const LABEL_TYPE = {
  SYSTEM: "system",
  USER: "user",
} as const;

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  GMAIL_READONLY: "https://www.googleapis.com/auth/gmail.readonly",
  GMAIL_SEND: "https://www.googleapis.com/auth/gmail.send",
  GMAIL_MODIFY: "https://www.googleapis.com/auth/gmail.modify",
  GMAIL_LABELS: "https://www.googleapis.com/auth/gmail.labels",
} as const;
