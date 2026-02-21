import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText } from "../../lib/format";

const watch = new Hono();

// ─── helpers ──────────────────────────────────────────────────────────────────

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8230;/g, "\u2026")
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim()
  );
}

/**
 * Extract the direct video URL from a jwplayer/plyr iframe src.
 *
 * Input:  https://watchhentai.net/jwplayer/?source=https%3A%2F%2Fhstorage.xyz%2Ffiles%2FT%2Ftsuki-kagerou%2Ftsuki-kagerou-1.mp4&id=6457&type=mp4
 * Output: https://hstorage.xyz/files/T/tsuki-kagerou/tsuki-kagerou-1.mp4
 */
function extractDirectSrc(playerUrl: string): string {
  try {
    // Handle HTML-entity-encoded ampersands
    const clean = playerUrl.replace(/&amp;/g, "&");
    const url = new URL(clean);
    const source = url.searchParams.get("source");
    if (source) {
      // source param is itself URL-encoded; decode it
      return decodeURIComponent(source);
    }
  } catch (_) {
    // Manual fallback regex
    const m = playerUrl.match(/[?&]source=([^&]+)/i);
    if (m) {
      try {
        return decodeURIComponent(m[1].replace(/&amp;/g, "&"));
      } catch (_) {
        return m[1];
      }
    }
  }
  return "";
}

/**
 * Build alternate player URL (jwplayer ↔ plyr swap).
 */
function buildAlternatePlayer(originalSrc: string): string {
  const clean = originalSrc.replace(/&amp;/g, "&");
  if (clean.includes("/jwplayer/")) {
    return clean.replace("/jwplayer/", "/plyr/");
  }
  if (clean.includes("/plyr/")) {
    return clean.replace("/plyr/", "/jwplayer/");
  }
  return "";
}

// ─── types ────────────────────────────────────────────────────────────────────

interface VideoPlayer {
  /** The full original player iframe src (jwplayer) */
  originalSrc: string;
  /** The alternate player src (plyr) */
  alternateSrc: string;
  /** The direct raw video URL extracted from originalSrc */
  src: string;
  /** File type hint from the player URL (mp4, m3u8, …) */
  type: string;
  /** WordPress post ID passed to the player */
  postId: string;
}

interface EpisodeItem {
  number: number;
  title: string;
  url: string;
  thumbnail: string;
  date: string;
  isCurrent: boolean;
}

interface WatchPageData {
  // Identity
  id: string;
  slug: string;
  title: string;
  episodeTitle: string;
  url: string;
  // Video
  player: VideoPlayer;
  // Thumbnail / schema
  thumbnail: string;
  duration: string;        // ISO 8601 e.g. PT28M00S
  uploadDate: string;
  views: string;
  // Series info
  seriesTitle: string;
  seriesUrl: string;
  seriesPoster: string;
  censored: "censored" | "uncensored" | "unknown";
  genres: { name: string; url: string }[];
  synopsis: string;
  // Navigation
  prevEpisode: { title: string; url: string } | null;
  nextEpisode: { title: string; url: string } | null;
  // Episode list (all episodes of the same series shown on the page)
  episodes: EpisodeItem[];
  // Download link
  downloadUrl: string;
}

// ─── parser ───────────────────────────────────────────────────────────────────

function parseWatchPage(html: string, slug: string): WatchPageData {
  // ── id ──────────────────────────────────────────────────────────────────────
  const idMatch = html.match(/postid-(\d+)/i);
  const id = idMatch ? idMatch[1] : "";

  // ── canonical URL ─────────────────────────────────────────────────────────
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/i);
  const url = canonicalMatch
    ? canonicalMatch[1]
    : `https://watchhentai.net/videos/${slug}/`;

  // ── title (full page title e.g. "Tsuki Kagerou – Episode 1") ──────────────
  // From <h1> inside #info .data
  const h1Match = html.match(/<h1>([^<]+)<\/h1>/i);
  const rawTitle = h1Match ? decodeHtmlEntities(h1Match[1]) : "";
  // Strip the " - Watch Hentai" suffix if present
  const title = rawTitle.replace(/\s*-\s*Watch Hentai\s*$/i, "").trim();

  // Series title and episode title split on " – Episode"
  const titleParts = title.split(/\s*[–-]\s*Episode\s+/i);
  const seriesTitle = titleParts[0]?.trim() ?? title;
  const episodeTitle = titleParts[1] ? `Episode ${titleParts[1].trim()}` : "";

  // ── player iframe ─────────────────────────────────────────────────────────
  // data-litespeed-src on the iframe#search_iframe
  const iframeMatch =
    html.match(/id="search_iframe"[^>]+data-litespeed-src='([^']+)'/i) ||
    html.match(/id="search_iframe"[^>]+data-litespeed-src="([^"]+)"/i) ||
    html.match(/id='search_iframe'[^>]+data-litespeed-src='([^']+)'/i) ||
    html.match(/class='metaframe rptss'[^>]+data-litespeed-src='([^']+)'/i);

  // Also check meta itemprop="contentUrl" as fallback
  const contentUrlMatch = html.match(
    /itemprop="contentUrl" content="([^"]+)"/i
  );

  const rawPlayerSrc = iframeMatch
    ? decodeHtmlEntities(iframeMatch[1])
    : contentUrlMatch
    ? decodeHtmlEntities(contentUrlMatch[1])
    : "";

  const directSrc = extractDirectSrc(rawPlayerSrc);
  const alternateSrc = buildAlternatePlayer(rawPlayerSrc);

  // type from player URL (?type=mp4)
  const typeMatch = rawPlayerSrc.replace(/&amp;/g, "&").match(/[?&]type=([^&]+)/i);
  const videoType = typeMatch ? typeMatch[1] : (directSrc.endsWith(".m3u8") ? "m3u8" : "mp4");

  // postId from player URL (&id=XXXX)
  const pidMatch = rawPlayerSrc.replace(/&amp;/g, "&").match(/[?&]id=(\d+)/i);
  const postId = pidMatch ? pidMatch[1] : id;

  const player: VideoPlayer = {
    originalSrc: rawPlayerSrc,
    alternateSrc,
    src: directSrc,
    type: videoType,
    postId,
  };

  // ── schema meta ───────────────────────────────────────────────────────────
  const thumbMatch =
    html.match(/itemprop="thumbnailUrl" content="([^"]+)"/i) ||
    html.match(/<meta property='og:image' content='([^']+)'/i);
  const thumbnail = thumbMatch ? thumbMatch[1] : "";

  const durMatch = html.match(/itemprop="duration" content="([^"]+)"/i);
  const duration = durMatch ? durMatch[1] : "";

  const uploadMatch = html.match(/itemprop="uploadDate" content="([^"]+)"/i);
  const uploadDate = uploadMatch ? uploadMatch[1] : "";

  // ── views ─────────────────────────────────────────────────────────────────
  const viewsMatch = html.match(/data-text='(\d+)\s*Views'/i) ||
    html.match(/(\d+)\s*Views<\/span>/i);
  const views = viewsMatch ? viewsMatch[1] : "";

  // ── series URL & poster ───────────────────────────────────────────────────
  // From the series link in the info box (poster section)
  const seriesUrlMatch = html.match(
    /href="(https:\/\/watchhentai\.net\/series\/[^"]+)"/i
  );
  const seriesUrl = seriesUrlMatch ? seriesUrlMatch[1] : "";

  // Poster img inside .poster a (not the timthumb ones)
  const posterMatch = html.match(
    /itemprop="image"\s+data-src="([^"]+\/uploads\/[^"]+\/poster\.[^"]+)"/i
  ) || html.match(/data-src="(https:\/\/watchhentai\.net\/uploads\/[^"]+\/poster\.[^"]+)"/i);
  const seriesPoster = posterMatch ? posterMatch[1] : "";

  // ── censored ─────────────────────────────────────────────────────────────
  // From the .poster div inside #info (not the new-episodes sidebar)
  const infoBlockMatch = html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
  const infoHtml = infoBlockMatch ? infoBlockMatch[1] : html.slice(0, 12000);
  let censored: WatchPageData["censored"] = "unknown";
  if (/<div class="buttoncensured">/i.test(infoHtml)) censored = "censored";
  else if (/<div class="buttonuncensured">/i.test(infoHtml)) censored = "uncensored";

  // ── genres ────────────────────────────────────────────────────────────────
  const sgeneroMatch = html.match(/<div class="sgeneros"[^>]*>([\s\S]*?)<\/div>/i);
  const genres: WatchPageData["genres"] = [];
  if (sgeneroMatch) {
    const gRe = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let gm: RegExpExecArray | null;
    while ((gm = gRe.exec(sgeneroMatch[1])) !== null) {
      genres.push({ name: cleanText(gm[2]), url: gm[1] });
    }
  }

  // ── synopsis ──────────────────────────────────────────────────────────────
  // <div class="synopsis"><p>...</p></div>
  const synMatch = html.match(/<div class="synopsis">\s*<p>([\s\S]*?)<\/p>/i);
  const synopsis = synMatch ? stripTags(synMatch[1]) : "";

  // ── prev / next navigation ────────────────────────────────────────────────
  // .pag_episodes .item anchors
  const pagBlock = html.match(/<div class='pag_episodes'>([\s\S]*?)<\/div>/i);
  let prevEpisode: WatchPageData["prevEpisode"] = null;
  let nextEpisode: WatchPageData["nextEpisode"] = null;
  if (pagBlock) {
    // PREV link – has class "nonex" when there's no prev (href="#")
    const prevMatch = pagBlock[1].match(
      /<a href='(https:\/\/[^']+)' title='([^']+)'>\s*<i class='fas fa-arrow-alt-circle-left/i
    );
    if (prevMatch) {
      prevEpisode = {
        url: prevMatch[1],
        title: decodeHtmlEntities(prevMatch[2]),
      };
    }
    // NEXT link
    const nextMatch = pagBlock[1].match(
      /title='([^']+)'><span>NEXT<\/span>[^<]*<i class='fas fa-arrow-alt-circle-right/i
    );
    const nextUrlMatch = pagBlock[1].match(
      /<a href='(https:\/\/watchhentai\.net\/videos\/[^']+)' title='([^']+)'><span>NEXT/i
    );
    if (nextUrlMatch) {
      nextEpisode = {
        url: nextUrlMatch[1],
        title: decodeHtmlEntities(nextUrlMatch[2]),
      };
    }
  }

  // ── episode list (all episodes of this series) ────────────────────────────
  const epBlockMatch = html.match(/<ul class='episodios'>([\s\S]*?)<\/ul>/i);
  const episodes: EpisodeItem[] = [];
  if (epBlockMatch) {
    // Current episode is marked with opacity: 0.2 via <style> for mark-N
    // We detect it from the CSS injected: #seasons .se-c .se-a ul.episodios li.mark-N { opacity: 0.2; }
    const currentMarkMatch = html.match(
      /ul\.episodios li\.mark-(\d+)\s*\{[^}]*opacity:\s*0\.2/i
    );
    const currentMark = currentMarkMatch ? parseInt(currentMarkMatch[1], 10) : -1;

    const liRe = /<li[^>]*class='mark-(\d+)'[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(epBlockMatch[1])) !== null) {
      const number = parseInt(li[1], 10);
      const liHtml = li[2];

      const thumbMatch2 = liHtml.match(/data-src='([^']+)'/i);
      const thumbnail2 = thumbMatch2 ? thumbMatch2[1] : "";

      const epUrlMatch = liHtml.match(/href='([^']+)'/i);
      const epUrl = epUrlMatch ? epUrlMatch[1] : "";

      const epTitleMatch = liHtml.match(/<a[^>]+>([^<]+)<\/a>/i);
      const epTitle = epTitleMatch ? cleanText(epTitleMatch[1]) : `Episode ${number}`;

      const epDateMatch = liHtml.match(/<span class='date'>([^<]+)<\/span>/i);
      const epDate = epDateMatch ? epDateMatch[1].trim() : "";

      if (epUrl) {
        episodes.push({
          number,
          title: epTitle,
          url: epUrl,
          thumbnail: thumbnail2,
          date: epDate,
          isCurrent: number === currentMark,
        });
      }
    }
    episodes.sort((a, b) => a.number - b.number);
  }

  // ── download URL ──────────────────────────────────────────────────────────
  const dlMatch = html.match(
    /href='(https:\/\/watchhentai\.net\/download\/[^']+)'\s+class='download-video'/i
  );
  const downloadUrl = dlMatch ? dlMatch[1] : "";

  return {
    id,
    slug,
    title,
    episodeTitle,
    url,
    player,
    thumbnail,
    duration,
    uploadDate,
    views,
    seriesTitle,
    seriesUrl,
    seriesPoster,
    censored,
    genres,
    synopsis,
    prevEpisode,
    nextEpisode,
    episodes,
    downloadUrl,
  };
}

// ─── handler ──────────────────────────────────────────────────────────────────

async function handleWatch(c: any) {
  // Accept slug from path param OR query param
  const slug =
    c.req.param?.("slug") ?? c.req.query("slug") ?? "";

  if (!slug) {
    return c.json(
      { success: false, error: "Missing slug. Use /api/watch/{slug} or /api/watch?slug={slug}" },
      400
    );
  }

  const path = `/videos/${slug}/`;

  try {
    const html = await fetchPage(path);
    const data = parseWatchPage(html, slug);
    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source: `https://watchhentai.net${path}`,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
}

// ─── routes ───────────────────────────────────────────────────────────────────
//
//  GET /api/watch?slug=tsuki-kagerou-episode-1-id-01
//  GET /api/watch/tsuki-kagerou-episode-1-id-01
//
watch.get("/", async (c) => handleWatch(c));
watch.get("/:slug", async (c) => handleWatch(c));

export default watch;
