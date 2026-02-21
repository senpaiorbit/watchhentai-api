import { Hono } from "hono";
import {
  fetchPage,
  HtmlDoc,
  scrapePlayerPage,
  type PlayerPageData,
  type VideoSource,
} from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const watch = new Hono();

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function decodeEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g,  "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014")
    .replace(/&#8230;/g, "\u2026")
    .trim();
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim());
}

/**
 * Extract the raw player URL from the watch page iframe.
 * The iframe uses data-litespeed-src (lazy-loaded) or a regular src.
 *
 * Example iframe src:
 *   https://watchhentai.net/jwplayer/?source=https%3A%2F%2Fhstorage.xyz%2F...mp4&id=6457&type=mp4
 */
function extractPlayerUrl(html: string): string {
  const patterns = [
    /id="search_iframe"[^>]+data-litespeed-src='([^']+)'/i,
    /id="search_iframe"[^>]+data-litespeed-src="([^"]+)"/i,
    /id='search_iframe'[^>]+data-litespeed-src='([^']+)'/i,
    /class='metaframe rptss'[^>]+data-litespeed-src='([^']+)'/i,
    /itemprop="contentUrl"\s+content="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return "";
}

/**
 * Extract the direct CDN video URL from a player URL's `?source=` param.
 *
 * Input:  https://watchhentai.net/jwplayer/?source=https%3A%2F%2Fhstorage.xyz%2F...mp4&id=6457&type=mp4
 * Output: https://hstorage.xyz/files/T/tsuki-kagerou/tsuki-kagerou-1.mp4
 */
function extractDirectSrc(playerUrl: string): string {
  const clean = playerUrl.replace(/&amp;/g, "&");
  try {
    const source = new URL(clean).searchParams.get("source");
    if (source) return decodeURIComponent(source);
  } catch (_) {
    const m = clean.match(/[?&]source=([^&]+)/i);
    if (m) { try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; } }
  }
  return "";
}

/** Swap /jwplayer/ ↔ /plyr/ for the alternate player URL */
function buildAlternatePlayer(src: string): string {
  const clean = src.replace(/&amp;/g, "&");
  if (clean.includes("/jwplayer/")) return clean.replace("/jwplayer/", "/plyr/");
  if (clean.includes("/plyr/"))     return clean.replace("/plyr/", "/jwplayer/");
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface WatchEpisodeItem {
  number:    number;
  title:     string;
  url:       string;
  thumbnail: string;
  date:      string;
  isCurrent: boolean;
}

interface VideoPlayer {
  /** Full jwplayer iframe URL (from the main watch page) */
  originalSrc:  string;
  /** Alternate player URL (plyr ↔ jwplayer swap) */
  alternateSrc: string;
  /**
   * Default direct CDN video URL — same as sources[0].src when there is
   * only one quality, or the base jw.file URL otherwise.
   */
  src:     string;
  /** All quality sources scraped from the player page */
  sources: VideoSource[];
  /** Video container type: "mp4", "m3u8", … */
  type:     string;
  /** ISO 8601 duration e.g. "PT24M50S" — from player page schema */
  duration: string;
  /** Thumbnail URL — from player page jw.image / schema */
  thumbnail: string;
  /** WordPress post ID */
  postId: string;
  /** Download page URL */
  downloadUrl: string;
}

interface WatchPageData {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:           string;
  slug:         string;
  title:        string;
  episodeTitle: string;
  url:          string;

  // ── Video ─────────────────────────────────────────────────────────────────
  player: VideoPlayer;

  // ── Page meta ─────────────────────────────────────────────────────────────
  /** Thumbnail from the main watch page (itemprop / og:image) */
  thumbnail:  string;
  uploadDate: string;
  views:      string;

  // ── Series ────────────────────────────────────────────────────────────────
  seriesTitle:  string;
  seriesUrl:    string;
  seriesPoster: string;
  censored:     "censored" | "uncensored" | "unknown";
  genres:       { name: string; url: string }[];
  synopsis:     string;

  // ── Navigation ────────────────────────────────────────────────────────────
  prevEpisode: { title: string; url: string } | null;
  nextEpisode: { title: string; url: string } | null;

  // ── Episode list ──────────────────────────────────────────────────────────
  episodes: WatchEpisodeItem[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main page parser
// ═══════════════════════════════════════════════════════════════════════════════

interface ParsedWatchPage {
  id:           string;
  slug:         string;
  title:        string;
  episodeTitle: string;
  url:          string;
  playerUrl:    string;
  alternateSrc: string;
  videoType:    string;
  postId:       string;
  thumbnail:    string;
  uploadDate:   string;
  views:        string;
  seriesTitle:  string;
  seriesUrl:    string;
  seriesPoster: string;
  censored:     WatchPageData["censored"];
  genres:       WatchPageData["genres"];
  synopsis:     string;
  prevEpisode:  WatchPageData["prevEpisode"];
  nextEpisode:  WatchPageData["nextEpisode"];
  episodes:     WatchEpisodeItem[];
}

function parseWatchPage(html: string, slug: string): ParsedWatchPage {
  const doc = new HtmlDoc(html);

  // ── Post ID ────────────────────────────────────────────────────────────────
  const id = html.match(/postid-(\d+)/i)?.[1] ?? "";

  // ── Canonical URL ──────────────────────────────────────────────────────────
  const url =
    html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] ??
    `https://watchhentai.net/videos/${slug}/`;

  // ── Title ──────────────────────────────────────────────────────────────────
  const rawTitle = decodeEntities(
    (html.match(/<h1>([^<]+)<\/h1>/i)?.[1] ?? "")
  ).replace(/\s*-\s*Watch Hentai\s*$/i, "").trim();

  // Split "Series Name – Episode N"
  const titleParts = rawTitle.split(/\s*[–\-]\s*Episode\s+/i);
  const seriesTitle  = titleParts[0]?.trim() ?? rawTitle;
  const episodeTitle = titleParts[1] ? `Episode ${titleParts[1].trim()}` : "";
  const title        = rawTitle;

  // ── Player iframe URL ──────────────────────────────────────────────────────
  const playerUrl = extractPlayerUrl(html);
  const alternateSrc = buildAlternatePlayer(playerUrl);

  // type from ?type= param (may be "mp4,1080p,1440p" so take first token)
  const typeRaw = playerUrl.replace(/&amp;/g, "&").match(/[?&]type=([^&]+)/i)?.[1] ?? "mp4";
  const videoType = typeRaw.split(",")[0];

  // postId from ?id= param
  const postId =
    playerUrl.replace(/&amp;/g, "&").match(/[?&]id=(\d+)/i)?.[1] ?? id;

  // ── Thumbnail from main page ───────────────────────────────────────────────
  const thumbnail =
    html.match(/itemprop="thumbnailUrl" content="([^"]+)"/i)?.[1] ??
    html.match(/<meta property='og:image' content='([^']+)'/i)?.[1] ??
    "";

  // ── Upload date & views ────────────────────────────────────────────────────
  const uploadDate =
    html.match(/itemprop="uploadDate" content="([^"]+)"/i)?.[1] ?? "";

  const views =
    html.match(/data-text='(\d+)\s*Views'/i)?.[1] ??
    html.match(/<meta itemprop='userInteractionCount' content='(\d+)/i)?.[1] ??
    "";

  // ── Series URL & poster ────────────────────────────────────────────────────
  const seriesUrl =
    html.match(/href="(https:\/\/watchhentai\.net\/series\/[^"]+)"/i)?.[1] ?? "";

  const seriesPoster =
    html.match(/itemprop="image"\s+data-src="([^"]+\/uploads\/[^"]+\/poster\.[^"]+)"/i)?.[1] ??
    html.match(/data-src="(https:\/\/watchhentai\.net\/uploads\/[^"]+\/poster\.[^"]+)"/i)?.[1] ??
    "";

  // ── Censored — scope to the #info block to avoid sidebar noise ────────────
  const infoHtml =
    html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ??
    html.slice(0, 14000);
  let censored: WatchPageData["censored"] = "unknown";
  if (/<div class="buttoncensured">/i.test(infoHtml))    censored = "censored";
  else if (/<div class="buttonuncensured">/i.test(infoHtml)) censored = "uncensored";

  // ── Genres — from .sgeneros ────────────────────────────────────────────────
  const genres: WatchPageData["genres"] = [];
  const sgeneroBlock = html.match(/<div class="sgeneros"[^>]*>([\s\S]*?)<\/div>/i);
  if (sgeneroBlock) {
    const re = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let gm: RegExpExecArray | null;
    while ((gm = re.exec(sgeneroBlock[1])) !== null) {
      genres.push({ name: cleanText(gm[2]), url: gm[1] });
    }
  }

  // ── Synopsis ───────────────────────────────────────────────────────────────
  const synopsis = stripHtml(
    html.match(/<div class="synopsis">\s*<p>([\s\S]*?)<\/p>/i)?.[1] ?? ""
  );

  // ── Prev / Next navigation ─────────────────────────────────────────────────
  let prevEpisode: WatchPageData["prevEpisode"] = null;
  let nextEpisode: WatchPageData["nextEpisode"] = null;
  const pagBlock = html.match(/<div class='pag_episodes'>([\s\S]*?)<\/div>/i);
  if (pagBlock) {
    // PREV: real link (not href="#" / class="nonex")
    const prevM = pagBlock[1].match(
      /<a href='(https:\/\/watchhentai\.net\/videos\/[^']+)' title='([^']+)'>\s*<i class='fas fa-arrow-alt-circle-left/i
    );
    if (prevM) prevEpisode = { url: prevM[1], title: decodeEntities(prevM[2]) };

    // NEXT
    const nextM = pagBlock[1].match(
      /<a href='(https:\/\/watchhentai\.net\/videos\/[^']+)' title='([^']+)'><span>NEXT/i
    );
    if (nextM) nextEpisode = { url: nextM[1], title: decodeEntities(nextM[2]) };
  }

  // ── Episode list ───────────────────────────────────────────────────────────
  // Current episode is identified via injected CSS: li.mark-N { opacity: 0.2; }
  const currentMark =
    parseInt(html.match(/ul\.episodios li\.mark-(\d+)\s*\{[^}]*opacity:\s*0\.2/i)?.[1] ?? "0", 10);

  const episodes: WatchEpisodeItem[] = [];
  const epBlock = html.match(/<ul class='episodios'>([\s\S]*?)<\/ul>/i);
  if (epBlock) {
    const liRe = /<li[^>]*class='mark-(\d+)'[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(epBlock[1])) !== null) {
      const num   = parseInt(li[1], 10);
      const liHtml = li[2];
      const epUrl  = liHtml.match(/href='([^']+)'/i)?.[1] ?? "";
      if (!epUrl) continue;
      const epThumb = liHtml.match(/data-src='([^']+)'/i)?.[1] ?? "";
      const rawEpTitle = liHtml.match(/<a[^>]+>([^<]+)<\/a>/i)?.[1] ?? `Episode ${num}`;
      const epDate  = liHtml.match(/<span class='date'>([^<]+)<\/span>/i)?.[1]?.trim() ?? "";
      episodes.push({
        number:    num,
        title:     cleanText(rawEpTitle),
        url:       epUrl,
        thumbnail: normalizeThumbnail(epThumb),
        date:      epDate,
        isCurrent: num === currentMark,
      });
    }
    episodes.sort((a, b) => a.number - b.number);
  }

  return {
    id, slug, title, episodeTitle, url,
    playerUrl, alternateSrc, videoType, postId,
    thumbnail, uploadDate, views,
    seriesTitle, seriesUrl, seriesPoster,
    censored, genres, synopsis,
    prevEpisode, nextEpisode, episodes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════════

async function handleWatch(c: any) {
  // Accept slug from path param OR query param
  const slug: string = c.req.param?.("slug") ?? c.req.query("slug") ?? "";

  if (!slug) {
    return c.json(
      {
        success: false,
        error: "Missing slug. Use /api/watch/{slug} or /api/watch?slug={slug}",
      },
      400
    );
  }

  const path = `/videos/${slug}/`;

  try {
    // ── 1. Fetch + parse main watch page ─────────────────────────────────────
    const mainHtml = await fetchPage(path);
    const page     = parseWatchPage(mainHtml, slug);

    // ── 2. Fetch + parse the JWPlayer page for quality sources ────────────────
    //       Falls back gracefully if the player page is unreachable.
    let playerData: PlayerPageData = {
      sources:     [],
      defaultSrc:  extractDirectSrc(page.playerUrl),
      thumbnail:   page.thumbnail,
      duration:    "",
      downloadUrl: "",
    };

    if (page.playerUrl) {
      try {
        playerData = await scrapePlayerPage(page.playerUrl);
      } catch (_) {
        // Player fetch failed — build a single-source fallback from the URL params
        const fallbackSrc = extractDirectSrc(page.playerUrl);
        if (fallbackSrc) {
          const label = fallbackSrc.match(/_(\d+p)\./)?.[1] ?? "default";
          playerData.sources    = [{ src: fallbackSrc, type: "video/mp4", label }];
          playerData.defaultSrc = fallbackSrc;
        }
      }
    }

    // ── 3. Build final response ───────────────────────────────────────────────
    const player: VideoPlayer = {
      originalSrc:  page.playerUrl,
      alternateSrc: page.alternateSrc,
      src:          playerData.defaultSrc,
      sources:      playerData.sources,
      type:         page.videoType,
      duration:     playerData.duration,
      thumbnail:    playerData.thumbnail || page.thumbnail,
      postId:       page.postId,
      downloadUrl:  playerData.downloadUrl,
    };

    const data: WatchPageData = {
      id:           page.id,
      slug,
      title:        page.title,
      episodeTitle: page.episodeTitle,
      url:          page.url,
      player,
      thumbnail:    page.thumbnail,
      uploadDate:   page.uploadDate,
      views:        page.views,
      seriesTitle:  page.seriesTitle,
      seriesUrl:    page.seriesUrl,
      seriesPoster: page.seriesPoster,
      censored:     page.censored,
      genres:       page.genres,
      synopsis:     page.synopsis,
      prevEpisode:  page.prevEpisode,
      nextEpisode:  page.nextEpisode,
      episodes:     page.episodes,
    };

    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source:    `https://watchhentai.net${path}`,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
//
//   GET /api/watch/tsuki-kagerou-episode-1-id-01
//   GET /api/watch?slug=tsuki-kagerou-episode-1-id-01
// ═══════════════════════════════════════════════════════════════════════════════

watch.get("/",      async (c) => handleWatch(c));
watch.get("/:slug", async (c) => handleWatch(c));

export default watch;
