import { Loader2, TrendingUp } from "lucide-react";
import { VideoRow } from "@/components/video-row.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import type { TopVideosWidgetData } from "@/types.ts";

// 5min poll: analytics move slowly and every call costs API quota.
const POLL_MS = 300_000;

export default function WidgetTopVideosPage() {
  const { data, loading, error } = usePollingTool<TopVideosWidgetData>(
    "YOUTUBE_ADMIN_WIDGET_TOP_VIDEOS",
    {},
    POLL_MS,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="p-4 text-xs text-red-600 dark:text-red-400">{error}</div>
    );
  }

  const videos = data?.topVideos ?? [];

  if (videos.length === 0) {
    return (
      <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-1 p-4 text-center">
        <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Sem dados de views nos últimos 28 dias.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-1.5 text-[11px] text-muted-foreground">
        Top vídeos · últimos 28 dias
      </p>
      {videos.map((video, index) => (
        <VideoRow key={video.videoId} video={video} rank={index + 1} />
      ))}
    </div>
  );
}
