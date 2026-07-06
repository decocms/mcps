import { AlertTriangle, OctagonX } from "lucide-react";
import type { ChannelAlert } from "@/types.ts";

export function AlertRow({ alert }: { alert: ChannelAlert }) {
  const Icon = alert.severity === "error" ? OctagonX : AlertTriangle;
  const color =
    alert.severity === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-amber-600 dark:text-amber-400";

  const body = (
    <div className="flex items-start gap-2 rounded-md p-1.5 hover:bg-accent">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        {alert.title && (
          <p className="truncate text-xs font-medium" title={alert.title}>
            {alert.title}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">{alert.message}</p>
      </div>
    </div>
  );

  if (alert.videoId) {
    return (
      <a
        href={`https://studio.youtube.com/video/${alert.videoId}/edit`}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
        {body}
      </a>
    );
  }
  return body;
}
