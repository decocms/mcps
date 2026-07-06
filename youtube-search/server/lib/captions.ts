/**
 * Transcript segment formatting: youtubei.js transcript segments →
 * plain text / SRT / VTT / timed JSON.
 */

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export type TranscriptFormat = "text" | "srt" | "vtt" | "json";

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function formatTimestamp(ms: number, separator: "," | "."): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${separator}${pad(millis, 3)}`;
}

export function toPlainText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n");
}

export function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${formatTimestamp(s.startMs, ",")} --> ${formatTimestamp(s.endMs, ",")}\n${s.text.trim()}\n`,
    )
    .join("\n");
}

export function toVtt(segments: TranscriptSegment[]): string {
  const cues = segments
    .map(
      (s) =>
        `${formatTimestamp(s.startMs, ".")} --> ${formatTimestamp(s.endMs, ".")}\n${s.text.trim()}\n`,
    )
    .join("\n");
  return `WEBVTT\n\n${cues}`;
}

export function renderTranscript(
  segments: TranscriptSegment[],
  format: TranscriptFormat,
): string {
  switch (format) {
    case "srt":
      return toSrt(segments);
    case "vtt":
      return toVtt(segments);
    case "json":
      return JSON.stringify(segments);
    default:
      return toPlainText(segments);
  }
}
