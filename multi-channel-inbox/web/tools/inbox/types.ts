export interface Source {
  id: string;
  source_type: "slack" | "discord" | "gmail";
  connection_id: string;
  external_channel_id: string | null;
  external_channel_name: string | null;
  gmail_label: string | null;
  gmail_query: string | null;
  enabled: boolean;
}

export interface Conversation {
  id: string;
  source_id: string;
  source_type: "slack" | "discord" | "gmail";
  external_thread_id: string | null;
  subject: string | null;
  status: "open" | "in_progress" | "resolved" | "archived";
  priority: "low" | "normal" | "high" | "urgent";
  category: string | null;
  assignee: string | null;
  customer_name: string | null;
  customer_id: string | null;
  last_message_at: string | null;
  message_count: number;
  ai_summary: string | null;
  tags: string[] | null;
  created_at: string;
}

export interface Message {
  id: string;
  external_message_id: string;
  source_type: string;
  direction: "inbound" | "outbound";
  sender_name: string | null;
  sender_id: string | null;
  content: string;
  content_html: string | null;
  has_attachments: boolean;
  created_at: string;
}

export interface InboxStats {
  by_status: Array<{ status: string; count: number }>;
  by_source: Array<{ source_type: string; count: number }>;
  by_priority: Array<{ priority: string; count: number }>;
  total_open: number;
  total_conversations: number;
}

export type StatusFilter =
  | "open"
  | "in_progress"
  | "resolved"
  | "archived"
  | undefined;
export type SourceFilter = "slack" | "discord" | "gmail" | undefined;
export type PriorityFilter = "low" | "normal" | "high" | "urgent" | undefined;
