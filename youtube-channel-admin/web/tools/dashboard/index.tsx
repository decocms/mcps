import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  MessageSquare,
  RefreshCw,
  ThumbsUp,
} from "lucide-react";
import { AlertRow } from "@/components/alert-row.tsx";
import { MetricTile } from "@/components/metric-tile.tsx";
import { Sparkline } from "@/components/sparkline.tsx";
import { VideoRow } from "@/components/video-row.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import {
  cn,
  formatCount,
  formatDuration,
  formatWatchHours,
  timeAgo,
} from "@/lib/utils.ts";
import type { DashboardData, MyVideo } from "@/types.ts";

const POLL_MS = 300_000;

const PRIVACY_LABEL: Record<string, string> = {
  public: "público",
  unlisted: "não listado",
  private: "privado",
};

function RecentVideoRow({ video }: { video: MyVideo }) {
  const hasProblem =
    video.uploadStatus === "failed" ||
    video.uploadStatus === "rejected" ||
    video.processingStatus === "failed";

  return (
    <a
      href={`https://studio.youtube.com/video/${video.videoId}/edit`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-md p-2 hover:bg-accent"
    >
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          className="h-12 w-21 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-12 w-21 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={video.title}>
          {video.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
          <span>{timeAgo(video.publishedAt)}</span>
          <span>{formatDuration(video.durationSeconds)}</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {formatCount(video.viewCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {formatCount(video.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {formatCount(video.commentCount)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {video.privacyStatus && (
          <span
            className={cn(
              "rounded-full border border-border px-2 py-0.5 text-[10px]",
              video.privacyStatus === "public"
                ? "text-primary-foreground bg-primary/80"
                : "text-muted-foreground",
            )}
          >
            {PRIVACY_LABEL[video.privacyStatus] ?? video.privacyStatus}
          </span>
        )}
        {hasProblem && (
          <span className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />
            problema
          </span>
        )}
      </div>
    </a>
  );
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePollingTool<DashboardData>(
    "YOUTUBE_ADMIN_DASHBOARD",
    {},
    POLL_MS,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="p-6 text-sm text-red-600 dark:text-red-400">{error}</div>
    );
  }
  if (!data) return null;

  const { channel, performance, topVideos, alerts, recentVideos } = data;
  const { totals } = performance;
  const netSubs = totals.subscribersGained - totals.subscribersLost;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
        {/* header */}
        <div className="flex items-center gap-3">
          {channel.thumbnailUrl && (
            <img
              src={channel.thumbnailUrl}
              alt=""
              className="h-10 w-10 rounded-full"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {channel.title}
            </h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCount(channel.subscriberCount)} inscritos ·{" "}
              {formatCount(channel.videoCount)} vídeos ·{" "}
              {formatCount(channel.viewCount)} views totais
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>

        {/* 28-day metrics */}
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Últimos 28 dias ({performance.startDate} → {performance.endDate})
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile label="Views" value={formatCount(totals.views)} />
            <MetricTile
              label="Tempo assistido"
              value={formatWatchHours(totals.watchMinutes)}
            />
            <MetricTile
              label="Inscritos (líquido)"
              value={
                netSubs >= 0 ? `+${formatCount(netSubs)}` : formatCount(netSubs)
              }
              hint={`+${formatCount(totals.subscribersGained)} / -${formatCount(totals.subscribersLost)}`}
            />
            <MetricTile
              label="Engajamento"
              value={formatCount(totals.likes + totals.comments)}
              hint={`${formatCount(totals.likes)} likes · ${formatCount(totals.comments)} comentários`}
            />
          </div>
          <div className="mt-2 rounded-md border border-border bg-card p-3">
            <Sparkline
              points={performance.daily.map((day) => day.views)}
              className="text-primary"
              height={48}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* top videos */}
          <section className="rounded-md border border-border bg-card p-2">
            <h2 className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">
              Top vídeos (28 dias)
            </h2>
            {topVideos.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                Sem dados de views no período.
              </p>
            ) : (
              topVideos.map((video, index) => (
                <VideoRow key={video.videoId} video={video} rank={index + 1} />
              ))
            )}
          </section>

          {/* alerts */}
          <section className="rounded-md border border-border bg-card p-2">
            <h2 className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">
              Alertas
            </h2>
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Nenhum vídeo com problema e nada aguardando moderação.
              </div>
            ) : (
              alerts.map((alert, index) => (
                <AlertRow
                  key={`${alert.kind}-${alert.videoId ?? index}`}
                  alert={alert}
                />
              ))
            )}
          </section>
        </div>

        {/* recent uploads */}
        <section className="rounded-md border border-border bg-card p-2">
          <h2 className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">
            Últimos uploads
          </h2>
          {recentVideos.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              Nenhum vídeo no canal ainda.
            </p>
          ) : (
            recentVideos.map((video) => (
              <RecentVideoRow key={video.videoId} video={video} />
            ))
          )}
        </section>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Atualizado {timeAgo(data.updatedAt)} · dados do YouTube Analytics
        </p>
      </div>
    </div>
  );
}
