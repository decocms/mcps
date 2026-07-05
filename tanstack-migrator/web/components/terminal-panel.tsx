import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Sparkles,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { usePollingTool } from "@/hooks/use-tool.ts";
import { cn, studioThreadUrl } from "@/lib/utils.ts";
import type { TerminalData } from "@/types.ts";

/**
 * Live terminal for the drawer — replays the current migration session's thread
 * as a scrolling command/narration transcript (like the agentic CMS terminal),
 * so you can watch what the agent is doing in real time. Polls SITE_TERMINAL
 * fast while the phase thread is live, slow when it's showing a past session.
 * Fixed dark palette on purpose: a terminal reads as a terminal in both themes.
 */
export function TerminalPanel({
  siteId,
  active,
}: {
  siteId: string;
  /** the site is in an active phase — initial guess for the poll cadence */
  active: boolean;
}) {
  // poll fast while there's live work; the server's `live` flag (a running
  // phase thread) is the source of truth, so a mismatched `active` guess (e.g.
  // a legacy status) self-corrects after the first fetch. `active` still keeps
  // us fast in the gap between phases before a thread exists.
  const [fast, setFast] = useState(active);
  const { data, loading, error } = usePollingTool<TerminalData>(
    "SITE_TERMINAL",
    { siteId },
    fast ? 3500 : 12000,
  );
  useEffect(() => {
    if (data) setFast(data.live || active);
  }, [data?.live, active]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const count = data?.entries.length ?? 0;

  // auto-follow: stick to the bottom as new lines arrive, but respect a user
  // who scrolled up to read history (don't yank them back down)
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const threadUrl = data?.threadId ? studioThreadUrl(data.threadId) : null;

  return (
    <div className="flex min-h-[24rem] flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200">
      {/* title bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <SquareTerminal className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-zinc-300">
          Terminal do agente
        </span>
        {data?.live ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            ao vivo
          </span>
        ) : (
          data?.threadId && (
            <span className="text-[10px] text-zinc-500">última sessão</span>
          )
        )}
        <div className="ml-auto flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] text-zinc-500 tabular-nums">
              {count} linhas
            </span>
          )}
          {threadUrl && (
            <a
              href={threadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
            >
              thread <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* transcript */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {loading && !data && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> conectando à
            sessão…
          </div>
        )}
        {error && !data && <div className="text-red-400">{error}</div>}
        {data && count === 0 && (
          <div className="text-zinc-500">
            {data.threadId
              ? "Sessão despachada — aguardando os primeiros comandos…"
              : "Nenhuma sessão iniciada ainda para este site."}
          </div>
        )}

        {data?.entries.map((e) => {
          if (e.kind === "command") {
            const failed = typeof e.exitCode === "number" && e.exitCode !== 0;
            return (
              <div key={e.seq} className="mb-1.5">
                <div className="flex items-start gap-1.5">
                  <span className="shrink-0 select-none text-emerald-400">
                    $
                  </span>
                  <span className="whitespace-pre-wrap break-all text-zinc-100">
                    {e.command}
                  </span>
                  {typeof e.exitCode === "number" && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded px-1 text-[9px] tabular-nums",
                        failed
                          ? "bg-red-500/20 text-red-400"
                          : "bg-emerald-500/15 text-emerald-400",
                      )}
                    >
                      exit {e.exitCode}
                    </span>
                  )}
                </div>
                {e.output && (
                  <pre className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all pl-3 text-zinc-500">
                    {e.output}
                  </pre>
                )}
              </div>
            );
          }
          if (e.kind === "tool") {
            return (
              <div
                key={e.seq}
                className="mb-1.5 flex items-center gap-1.5 text-sky-300/80"
              >
                <Wrench className="h-3 w-3 shrink-0" />
                <span className="font-medium">{e.tool}</span>
                {e.text && (
                  <span className="truncate text-zinc-500">{e.text}</span>
                )}
              </div>
            );
          }
          if (e.kind === "reasoning") {
            return (
              <div
                key={e.seq}
                className="mb-1.5 whitespace-pre-wrap break-words pl-3 italic text-zinc-600"
              >
                {e.text}
              </div>
            );
          }
          // assistant narration
          return (
            <div
              key={e.seq}
              className="mb-1.5 flex items-start gap-1.5 text-zinc-300"
            >
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
              <span className="whitespace-pre-wrap break-words">{e.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
