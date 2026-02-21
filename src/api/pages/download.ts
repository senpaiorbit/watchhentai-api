import { Hono } from "hono";
import { fetchPage, HtmlDoc } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const download = new Hono();

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
  return decodeEntities(
    html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim()
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface DownloadSource {
  /** Direct CDN download URL */
  url: string;
  /** Quality label e.g. "1080p", "1440p", "720p" */
  label: string;
  /** CDN host extracted from URL e.g. "xupload.org" */
  host: string;
}

export interface DownloadPageData {
  // ── Identity ─────────────────────────────────────────────────────────────
  id:           string;
  slug:         string;
  title:        string;
  episodeTitle: string;
  seriesTitle:  string;
  url:          string;
  /** Canonical watch/stream URL for this episode */
  watchUrl:     string;
  /** Canonical download page URL */
  downloadUrl:  string;

  // ── Thumbnail & previews ─────────────────────────────────────────────────
  /** Episode thumbnail (main image on the page) */
  thumbnail:    string;
  /**
   * Preview screenshots from og:image meta tags.
   * The site exposes up to ~9 numbered screenshots per episode.
   */
  previews:     string[];

  // ── Download sources ─────────────────────────────────────────────────────
  /**
   * All quality download links extracted from the button group.
   * Each button maps to: { url, label, host }
   */
  sources:      DownloadSource[];

  // ── Series ────────────────────────────────────────────────────────────────
  seriesUrl:    string;

  // ── Navigation ────────────────────────────────────────────────────────────
  prevEpisode:  { title: string; url: string } | null;
  nextEpisode:  { title: string; url: string } | null;

  // ── Social ────────────────────────────────────────────────────────────────
  /** Shared count shown on the page */
  shareCount:   string;

  // ── Related series ────────────────────────────────────────────────────────
  related:      { title: string; url: string; poster: string }[];

  // ── Schema metadata ───────────────────────────────────────────────────────
  datePublished: string;
  dateModified:  string;
  description:   string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════════════════════════

function parseDownloadPage(html: string, slug: string): DownloadPageData {
  const doc = new HtmlDoc(html);

  // ── Post ID ────────────────────────────────────────────────────────────────
  const id = html.match(/postid-(\d+)/i)?.[1] ?? "";

  // ── Canonical & watch URL ─────────────────────────────────────────────────
  // The download page canonical is the download URL itself.
  // og:url points to the watch/stream URL.
  const downloadUrl =
    html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] ??
    `https://watchhentai.net/download/${slug}/`;

  const watchUrl =
    html.match(/<meta property="og:url" content="([^"]+)"/i)?.[1] ??
    html.match(/<meta property='og:url' content='([^']+)'/i)?.[1] ??
    "";

  // ── Title ─────────────────────────────────────────────────────────────────
  // <h1>Seikou Senki Pony Celes – Episode 1 download</h1>
  const rawTitle = decodeEntities(
    html.match(/<h1>([^<]+)<\/h1>/i)?.[1] ?? ""
  ).replace(/\s+download\s*$/i, "").trim();

  // Split "Series Name – Episode N"
  const titleParts = rawTitle.split(/\s*[–\-]\s*Episode\s+/i);
  const seriesTitle  = titleParts[0]?.trim() ?? rawTitle;
  const episodeTitle = titleParts[1] ? `Episode ${titleParts[1].trim()}` : "";
  const title        = rawTitle;

  // ── Thumbnail (main episode image) ───────────────────────────────────────
  // <img data-src="https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg" ... />
  // It's the big center image, NOT the og:image screenshots.
  // We look for the img with data-src containing the episode folder + /1.jpg
  const thumbMatch =
    html.match(/data-src="(https:\/\/watchhentai\.net\/uploads\/\d+\/[^"]+\/1\.jpg)"/i) ??
    html.match(/data-src="(https:\/\/watchhentai\.net\/uploads\/[^"]+\.jpg)"/i);
  const thumbnail = normalizeThumbnail(thumbMatch?.[1] ?? "");

  // ── Preview screenshots from og:image meta tags ───────────────────────────
  // <meta property='og:image' content='https://watchhentai.net/uploads/2026/.../1-1.jpg'/>
  // <meta property='og:image' content='...1-2.jpg'/>  ... etc.
  // We collect ALL og:image values and filter to the numbered screenshots.
  const ogImageRe = /<meta property='og:image' content='([^']+)'/gi;
  const previews: string[] = [];
  let ogM: RegExpExecArray | null;
  while ((ogM = ogImageRe.exec(html)) !== null) {
    const src = ogM[1];
    // Filter: numbered screenshots look like /1-1.jpg, /1-2.jpg, /2-1.jpg…
    // vs the poster thumbnail which looks like /1.jpg
    if (/\/\d+-\d+\.(jpg|png|webp)$/i.test(src)) {
      previews.push(src);
    }
  }

  // ── Download sources ──────────────────────────────────────────────────────
  // The buttons live inside <div class="_4continuar">:
  //   <button onclick="window.location.href = 'https://xupload.org/download/S/.../file_1440p.mp4'">
  //     <i class="fas fa-download"></i> 1440p
  //   </button>
  // The last button is "WATCH ONLINE" (different icon class), skip it.
  const sources: DownloadSource[] = [];
  const dlBlockMatch = html.match(/<div class=['"]_4continuar['"]>([\s\S]*?)<\/div>/i);
  if (dlBlockMatch) {
    const btnRe = /<button[^>]+onclick="window\.location\.href\s*=\s*'([^']+)'"[^>]*>([\s\S]*?)<\/button>/gi;
    let bm: RegExpExecArray | null;
    while ((bm = btnRe.exec(dlBlockMatch[1])) !== null) {
      const btnUrl  = bm[1].trim();
      const btnText = stripHtml(bm[2]);
      // Skip the "WATCH ONLINE" button (fa-play-circle icon, no fa-download)
      if (bm[0].includes("fa-play-circle") || btnText.toLowerCase().includes("watch online")) {
        continue;
      }
      // Extract quality label — take the visible text which is e.g. "1440p"
      const label = btnText.replace(/^[\s\S]*?([\d]+p)\s*$/i, "$1").trim() || btnText;
      // Extract CDN host from URL
      let host = "";
      try { host = new URL(btnUrl).hostname; } catch (_) {}
      sources.push({ url: btnUrl, label, host });
    }
  }

  // ── Series URL ────────────────────────────────────────────────────────────
  // The ALL nav link points to the series: href="https://watchhentai.net/series/..."
  const seriesUrl =
    html.match(/<a href="(https:\/\/watchhentai\.net\/series\/[^"]+)" title="[^"]*">\s*<i class='fas fa-bars'>/i)?.[1] ??
    html.match(/href="(https:\/\/watchhentai\.net\/series\/[^"]+)"/i)?.[1] ??
    "";

  // ── Prev / Next navigation ─────────────────────────────────────────────────
  // Same .pag_episodes pattern as the watch page.
  let prevEpisode: DownloadPageData["prevEpisode"] = null;
  let nextEpisode: DownloadPageData["nextEpisode"] = null;

  const pagBlock = html.match(/<div class='pag_episodes'>([\s\S]*?)<\/div>/i);
  if (pagBlock) {
    // PREV: real link (not href="#" / class="nonex")
    const prevM = pagBlock[1].match(
      /<a href='(https:\/\/watchhentai\.net\/download\/[^']+)'[^>]*title='([^']+)'>/i
    );
    if (prevM) prevEpisode = { url: prevM[1], title: decodeEntities(prevM[2]) };

    // NEXT: look for the NEXT span
    const nextM = pagBlock[1].match(
      /<a href='(https:\/\/watchhentai\.net\/download\/[^']+)'[^>]*title='([^']+)'>[^<]*<span>NEXT/i
    );
    if (nextM) nextEpisode = { url: nextM[1], title: decodeEntities(nextM[2]) };
  }

  // ── Share count ────────────────────────────────────────────────────────────
  // <span>Shared<b id='social_count'>86</b></span>
  const shareCount =
    html.match(/<b id=['"]social_count['"]>(\d+)<\/b>/i)?.[1] ?? "0";

  // ── Related series ────────────────────────────────────────────────────────
  // <div id="single_relacionados"><article><a href="..."><img data-src="..." alt="..." /></a></article>...
  const related: DownloadPageData["related"] = [];
  const relBlock = html.match(/<div id="single_relacionados">([\s\S]*?)<\/div>/i);
  if (relBlock) {
    const relDoc = new HtmlDoc(relBlock[1]);
    relDoc.articles().forEach((art) => {
      const url   = resolveUrl(art.attr("a", "href"));
      const poster = normalizeThumbnail(art.attr("img", "data-src"));
      const title  = cleanText(
        art.attr("img", "alt") || art.attr("img", "title")
      );
      if (url) related.push({ title, url, poster });
    });
  }

  // ── Schema JSON-LD (datePublished, dateModified, description) ──────────────
  let datePublished = "";
  let dateModified  = "";
  let description   = "";

  const schemaMatch = html.match(
    /<script[^>]+type="application\/ld\+json"[^>]*class="yoast-schema-graph"[^>]*>([\s\S]*?)<\/script>/i
  ) ?? html.match(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
  );

  if (schemaMatch) {
    try {
      const graph = JSON.parse(schemaMatch[1].trim());
      // Yoast wraps pages in @graph array
      const pages: any[] = graph["@graph"] ?? (Array.isArray(graph) ? graph : [graph]);
      const page = pages.find(
        (p: any) => p["@type"] === "WebPage" || p["@type"] === "Article"
      );
      if (page) {
        datePublished = page.datePublished ?? "";
        dateModified  = page.dateModified  ?? "";
        description   = page.description   ?? "";
      }
    } catch (_) {
      // regex fallback
      datePublished = schemaMatch[1].match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? "";
      dateModified  = schemaMatch[1].match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1]  ?? "";
      description   = schemaMatch[1].match(/"description"\s*:\s*"([^"]+)"/)?.[1]   ?? "";
    }
  }

  // ── Fallback description from <meta name="description"> ──────────────────
  if (!description) {
    description = decodeEntities(
      html.match(/<meta name="description" content="([^"]+)"/i)?.[1] ?? ""
    );
  }

  return {
    id,
    slug,
    title,
    episodeTitle,
    seriesTitle,
    url:          downloadUrl,
    watchUrl,
    downloadUrl,
    thumbnail,
    previews,
    sources,
    seriesUrl,
    prevEpisode,
    nextEpisode,
    shareCount,
    related,
    datePublished,
    dateModified,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════════

async function handleDownload(c: any) {
  // Accept slug from path param OR query param
  const slug: string = c.req.param?.("slug") ?? c.req.query("slug") ?? "";

  if (!slug) {
    return c.json(
      {
        success: false,
        error:
          "Missing slug. Use /api/download/{slug} or /api/download?slug={slug}",
      },
      400
    );
  }

  const path = `/download/${slug}/`;

  try {
    const html = await fetchPage(path);
    const data = parseDownloadPage(html, slug);

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
//   GET /api/download/seikou-senki-pony-celes-episode-1-id-01
//   GET /api/download?slug=seikou-senki-pony-celes-episode-1-id-01
// ═══════════════════════════════════════════════════════════════════════════════

download.get("/",      async (c) => handleDownload(c));
download.get("/:slug", async (c) => handleDownload(c));

export default download;
