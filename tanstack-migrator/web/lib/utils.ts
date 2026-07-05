import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export function duration(
  startIso: string | null,
  endIso: string | null,
): string {
  if (!startIso) return "—";
  const end = endIso ? Date.parse(endIso) : Date.now();
  const minutes = Math.floor((end - Date.parse(startIso)) / 60_000);
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`;
}

export function clockTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour12: false });
}

/** Studio host — single source for deep links into the CMS. */
export const STUDIO_URL = "https://studio.decocms.com";

/** Deep link to a decopilot thread in the studio (Run rows + live terminal). */
export function studioThreadUrl(threadId: string): string {
  return `${STUDIO_URL}/threads/${threadId}`;
}
