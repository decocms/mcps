export type McpStatus =
  | "initializing"
  | "connected"
  | "tool-input"
  | "tool-result"
  | "tool-cancelled"
  | "error";

export interface McpState<TInput = unknown, TResult = unknown> {
  status: McpStatus;
  toolName?: string;
  error?: string;
  toolInput?: TInput;
  toolResult?: TResult;
}

export const INITIAL_STATE: McpState = { status: "initializing" };

/* ---- mirrors of the server view shapes (server/tools/views.ts) ---- */

export interface SiteView {
  id: string;
  name: string;
  sourceRepo: string;
  sourceBranch: string;
  targetRepo: string | null;
  prodUrl: string;
  status: string;
  resumeStatus: string | null;
  phaseDetail: string | null;
  parityScore: number | null;
  parityTarget: number;
  bestScore: number | null;
  iterationsDone: number;
  maxIterations: number;
  issuesTotal: number;
  issuesOpen: number;
  issuesClosed: number;
  fixSessionsDone: number;
  maxFixSessions: number;
  workBranch: string;
  prNumber: number | null;
  prUrl: string | null;
  costTotal: number;
  previewUrl: string | null;
  previewReady: boolean;
  cfDeployUrl: string | null;
  error: string | null;
  needsHumanReason: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface DashboardData {
  sites: SiteView[];
  queue: {
    active: number;
    queued: number;
    needsHuman: number;
    done: number;
    maxConcurrent: number;
    provider: string;
  };
  updatedAt: string;
}

export interface ParityIssue {
  severity: string;
  category?: string;
  page?: string;
  summary: string;
  suggestedFix?: string;
}

export interface ParitySummary {
  verdict?: {
    status: string;
    score: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };
  parityOk?: boolean;
  topIssues?: ParityIssue[];
  perPage?: Array<{
    pagePath: string;
    viewport?: string;
    pctDiff?: number;
    verdict?: string;
    sectionsOnlyInProd?: string[];
  }>;
}

export interface RunMetaView {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
  commands?: Array<{ cmd: string; exit?: number }>;
  issues?: {
    taken?: number[];
    resolved?: number[];
    blocked?: Array<{ number: number; reason?: string }>;
    created?: number;
  };
  threadId?: string;
}

export interface RunView {
  id: string;
  kind: string;
  iteration: number;
  status: string;
  parityScore: number | null;
  summary: ParitySummary | null;
  hasArtifacts: boolean;
  threadId: string | null;
  logsTail: string | null;
  meta: RunMetaView | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface EventView {
  id: number;
  level: string;
  message: string;
  createdAt: string;
}

export interface SiteDetail {
  site: SiteView;
  runs: RunView[];
  events: EventView[];
}

export interface TerminalEntry {
  seq: number;
  role: string;
  kind: "text" | "command" | "tool" | "reasoning";
  text?: string;
  command?: string;
  exitCode?: number;
  output?: string;
  tool?: string;
}

export interface TerminalData {
  threadId: string | null;
  /** true when this is the still-running phase thread (not a past run). */
  live: boolean;
  entries: TerminalEntry[];
  updatedAt: string;
}

export interface ReportUrls {
  reportHtml: string | null;
  reportJson: string | null;
  heatmaps: Array<{ name: string; url: string }>;
}
