import { Eye, ThumbsUp, Timer } from "lucide-react";
import { formatCount, formatWatchHours } from "@/lib/utils.ts";
import type { TopVideo } from "@/types.ts";

/** Compact row used by the top-videos widget and the dashboard list. */
export function VideoRow({ video, rank }: { video: TopVideo; rank?: number }) {
  return (
    <a
      href={video.watchUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-accent"
    >
      {rank != null && (
        <span className="w-4 shrink-0 text-center text-[11px] text-muted-foreground tabular-nums">
          {rank}
        </span>
      )}
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          className="h-9 w-16 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-9 w-16 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={video.title}>
          {video.title}
        </p>
        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {formatCount(video.views)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {formatWatchHours(video.watchMinutes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {formatCount(video.likes)}
          </span>
        </div>
      </div>
    </a>
  );
}
