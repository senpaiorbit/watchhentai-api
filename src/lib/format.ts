import { config } from "../config";

/** Resolve a relative URL to an absolute URL. */
export function resolveUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${config.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Clean and trim text content. */
export function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

/** Parse a view count string like "2.3k", "127.5k" into a number. */
export function parseViewCount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim().toLowerCase();
  const match = cleaned.match(/^([\d.]+)(k|m)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (match[2] === "k") return Math.round(num * 1000);
  if (match[2] === "m") return Math.round(num * 1_000_000);
  return Math.round(num);
}

/** Parse a relative time string like "1 day ago" into an ISO date string. */
export function parseRelativeTime(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  const now = new Date();
  const match = cleaned.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const ms: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };
  const date = new Date(now.getTime() - amount * (ms[unit] ?? 0));
  return date.toISOString();
}

/** Normalize a thumbnail URL — strips timthumb wrappers if needed. */
export function normalizeThumbnail(src: string): string {
  if (!src) return "";
  const match = src.match(/[?&]src=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return src;
}

export interface EpisodeItem {
  id: string;
  title: string;
  series: string;
  episode: string;
  url: string;
  thumbnail: string;
  subType: string;
  censored: boolean;
  views: number;
  uploadedAt: string | null;
  uploadedAtRaw: string;
}

export interface SeriesItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  year: string;
  censored: boolean;
}

export interface SliderItem {
  id: string;
  title: string;
  url: string;
  backdrop: string;
  year: string;
}
