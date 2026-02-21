import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, resolveUrl } from "../../lib/format";

const calendar = new Hono();

// ─── types ────────────────────────────────────────────────────────────────────

interface CalendarEpisode {
  releaseDate: string;        // e.g. "December 05"
  poster: string;
  seriesTitle: string;
  seriesUrl: string;
  episodeTitle: string;       // e.g. "Episode 1"
  episodeUrl: string;
}

interface CalendarMonth {
  month: string;              // e.g. "December 2025"
  episodes: CalendarEpisode[];
}

// ─── parser ───────────────────────────────────────────────────────────────────

function parseCalendarHtml(html: string) {
  // Extract the calendar-page-content block to avoid sidebar pollution
  const contentMatch = html.match(
    /<div class="calendar-page-content">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="sidebar/
  );
  const contentHtml = contentMatch ? contentMatch[1] : html;

  // Extract last update date
  const lastUpdateMatch = contentHtml.match(
    /Last Update:\s*<strong>([^<]+)<\/strong>/i
  );
  const lastUpdate = lastUpdateMatch ? cleanText(lastUpdateMatch[1]) : null;

  // Split into month sections by finding <header><h2>...</h2></header> followed by archive-content
  // Pattern: <header><h2>Month Year</h2></header><div id="archive-content"...>...</div>
  const monthSectionRegex =
    /<header>\s*<h2>([^<]+)<\/h2>\s*<\/header>\s*<div[^>]*id="archive-content"[^>]*>([\s\S]*?)<\/div>\s*(?=<header>|<p><i class="fas fa-edit">|$)/gi;

  const months: CalendarMonth[] = [];
  let match: RegExpExecArray | null;

  while ((match = monthSectionRegex.exec(contentHtml)) !== null) {
    const monthLabel = cleanText(match[1]);
    const monthHtml = match[2];

    const episodes = parseMonthEpisodes(monthHtml);
    months.push({ month: monthLabel, episodes });
  }

  return { lastUpdate, months };
}

function parseMonthEpisodes(html: string): CalendarEpisode[] {
  const articleRegex = /<article\s[^>]*class="item tvshows"[\s\S]*?<\/article>/gi;
  const articles = html.match(articleRegex) ?? [];

  return articles.map((art) => {
    // Release date from buttonextra span — strip the clock icon text
    const dateMatch = art.match(
      /class="buttonextra"[\s\S]*?<span[^>]*>\s*(?:<i[^>]*><\/i>\s*)?([^<]+)<\/span>/i
    );
    const releaseDate = dateMatch ? cleanText(dateMatch[1]) : "";

    // Poster image — use src (already loaded, not lazy) or data-lazyloaded src attr
    const posterMatch = art.match(/<img[^>]+(?:src|data-src)="([^"]+\/uploads\/[^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : "";

    // Series URL and title from <span class="serie">
    const seriesLinkMatch = art.match(
      /<a\s+href="(https?:\/\/[^"]+\/series\/[^"]+)"[^>]*>[\s\S]*?<span class="serie[^"]*">([^<]+)<\/span>/i
    );
    const seriesUrl = seriesLinkMatch ? resolveUrl(seriesLinkMatch[1]) : "";
    const seriesTitle = seriesLinkMatch ? cleanText(seriesLinkMatch[2]) : "";

    // Episode URL and title from the /videos/ link + <h3>
    const episodeLinkMatch = art.match(
      /<a\s+href="(https?:\/\/[^"]+\/videos\/[^"]*)"[^>]*>[\s\S]*?<h3>([^<]+)<\/h3>/i
    );
    const episodeUrl = episodeLinkMatch ? resolveUrl(episodeLinkMatch[1]) : "";
    const episodeTitle = episodeLinkMatch ? cleanText(episodeLinkMatch[2]) : "";

    return {
      releaseDate,
      poster,
      seriesTitle,
      seriesUrl,
      episodeTitle,
      episodeUrl,
    };
  });
}

// ─── handler ──────────────────────────────────────────────────────────────────

async function handleCalendar(c: any) {
  try {
    const html = await fetchPage("/calendar/");
    const data = parseCalendarHtml(html);

    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source: "https://watchhentai.net/calendar/",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
}

// ─── routes ───────────────────────────────────────────────────────────────────

// GET /api/calendar
calendar.get("/", async (c) => handleCalendar(c));

export default calendar;
