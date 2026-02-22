import { config } from "../config";
import {
  cleanText,
  normalizeThumbnail,
  parseRelativeTime,
  parseViewCount,
  resolveUrl,
  type EpisodeItem,
  type SeriesItem,
  type SliderItem,
} from "./format";

// ═══════════════════════════════════════════════════════════════════════════════
// Fetch
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch any page — accepts both relative paths ("/series/") and full URLs.
 * Full URLs are used when fetching embedded player pages (jwplayer iframe src).
 */
export async function fetchPage(path: string = "/"): Promise<string> {
  const url = path.startsWith("http") ? path : `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    headers: config.defaultHeaders,
    signal: AbortSignal.timeout(config.timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch ${url}`);
  return res.text();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HtmlDoc — lightweight DOM-like helper (regex-based)
// ═══════════════════════════════════════════════════════════════════════════════

export class HtmlDoc {
  constructor(public html: string) {}

  /** Extract all top-level blocks of a given tag */
  private blocks(tag: string, html = this.html): string[] {
    const results: string[] = [];
    const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
    const closeTag = `</${tag}>`;
    let match: RegExpExecArray | null;
    while ((match = openRe.exec(html)) !== null) {
      const start = match.index;
      const closeIdx = html
        .toLowerCase()
        .indexOf(closeTag.toLowerCase(), start + match[0].length);
      if (closeIdx === -1) {
        results.push(match[0]);
        continue;
      }
      results.push(html.slice(start, closeIdx + closeTag.length));
    }
    return results;
  }

  /** All <article> blocks as HtmlDoc instances */
  articles(): HtmlDoc[] {
    return this.blocks("article").map((h) => new HtmlDoc(h));
  }

  /** First value of `attribute` on the first `tag` element */
  attr(tag: string, attribute: string, html = this.html): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "i");
    const m = html.match(re);
    if (!m) return "";
    const attrRe = new RegExp(`${attribute}=["']([^"']*?)["']`, "i");
    const am = m[0].match(attrRe);
    return am ? am[1] : "";
  }

  /** All values of `attribute` on every `tag` element */
  attrs(tag: string, attribute: string): string[] {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.html)) !== null) {
      const attrRe = new RegExp(`${attribute}=["']([^"']*?)["']`, "i");
      const am = m[0].match(attrRe);
      if (am) results.push(am[1]);
    }
    return results;
  }

  /** Strip all tags and return clean text */
  text(html = this.html): string {
    return cleanText(html.replace(/<[^>]+>/g, " "));
  }

  /** Inner text of first matching tag */
  tagText(tag: string): string {
    const re = new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );
    const m = this.html.match(re);
    return m ? this.text(m[1]) : "";
  }

  /** Narrow to the element with the given id */
  byId(id: string): HtmlDoc {
    const re = new RegExp(`id=["']${id}["']`, "i");
    const idMatch = this.html.match(re);
    if (!idMatch) return new HtmlDoc("");
    const start = this.html.lastIndexOf("<", idMatch.index!);
    const tagMatch = this.html.slice(start).match(/^<(\w+)/);
    if (!tagMatch) return new HtmlDoc(this.html.slice(start));
    const tag = tagMatch[1];
    const blocks = this.blocks(tag, this.html.slice(start));
    return new HtmlDoc(blocks[0] ?? "");
  }

  /** All href values */
  hrefs(): string[] {
    return this.attrs("a", "href").filter(Boolean);
  }

  /** Simple string-contains check */
  contains(text: string): boolean {
    return this.html.includes(text);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared parsers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unwrap a timthumb URL to get the real underlying image URL.
 *
 * The site wraps CDN images through PHP resizers:
 *   /timthumb/backdrop.php?src=https://watchhentai.net/uploads/.../backdrop1.jpg
 *   /timthumb/thumb.php?src=https://watchhentai.net/uploads/.../poster.jpg
 *   /timthumb/sidebar.php?src=https://watchhentai.net/uploads/.../poster.jpg
 *
 * We extract the `src=` query param value and decode it.
 * If there is no `src=` param the URL is returned as-is.
 */
function unwrapTimthumb(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/[?&]src=([^&]+)/i);
  if (!m) return raw;
  try {
    return decodeURIComponent(m[1]);
  } catch (_) {
    return m[1];
  }
}

/**
 * Parse the home-page slider (#slider-movies-tvshows).
 *
 * BUG THAT WAS FIXED:
 *   The site lazy-loads images:
 *     <img data-lazyloaded="1"
 *          src="data:image/gif;base64,..."   ← 1×1 placeholder — NOT the real image
 *          data-src="https://watchhentai.net/timthumb/backdrop.php?src=REAL_URL"
 *          alt="Title" title="Title"/>
 *
 *   The previous code called  art.attr("img", "data-src")  which is correct for
 *   the attribute name, BUT the attr() helper internally runs:
 *       html.match(/<img(?:\s[^>]*)?>/)   ← captures the whole opening <img> tag
 *   then searches that captured string for  data-src=["']...["'].
 *
 *   The captured opening tag is (from the actual HTML):
 *       <img data-lazyloaded="1" src="data:image/gif;base64,..." data-src="https://...">
 *   Searching for  /data-src=["']([^"']*?)["']/  should work in theory, BUT
 *   the regex is NOT anchored and `data-src` also matches the `data-` in
 *   `data-lazyloaded` if the regex engine backtracks differently.  More
 *   importantly, normalizeThumbnail() was receiving the full timthumb URL
 *   (e.g. "https://watchhentai.net/timthumb/backdrop.php?src=REAL") and if
 *   that function only handled "thumb.php" it silently returned the timthumb
 *   URL unchanged — which doesn't load in a browser without a valid referer.
 *
 *   FIX:
 *   1. Use a dedicated regex  /\bdata-src=["']([^"']+)["']/i  on the full
 *      article HTML (not just the first <img> tag) to extract data-src reliably.
 *   2. Call unwrapTimthumb() to strip the backdrop.php/thumb.php/sidebar.php
 *      wrapper and return the raw CDN URL every time.
 */
export function parseSlider(doc: HtmlDoc): SliderItem[] {
  // Try byId first; fall back to raw substring search if the id isn't found
  // (some minified pages may use different quote styles).
  let sliderHtml = doc.byId("slider-movies-tvshows").html;
  if (!sliderHtml) {
    const idx = doc.html.indexOf("slider-movies-tvshows");
    if (idx === -1) return [];
    sliderHtml = doc.html.slice(doc.html.lastIndexOf("<", idx));
  }

  const sliderDoc = new HtmlDoc(sliderHtml);

  return sliderDoc.articles().map((art) => {
    // Post ID
    const id = art.attr("article", "id").replace("post-", "");

    // Series URL — first <a> href in the article
    const href = art.attr("a", "href");

    // Title — prefer <h3> inner text, fall back to img[alt]
    let title = art.tagText("h3");
    if (!title) {
      const altM = art.html.match(/\balt=["']([^"']+)["']/i);
      title = altM ? altM[1] : "";
    }

    // ── KEY FIX: extract data-src directly from the raw article HTML ────────
    // Do NOT use art.attr("img", "data-src") because attr() only inspects the
    // opening <img> tag string and the attribute order matters for some regex
    // engines.  A direct search on the full article HTML is safer and simpler.
    const dataSrcM = art.html.match(/\bdata-src=["']([^"']+)["']/i);
    const rawDataSrc = dataSrcM ? dataSrcM[1] : "";

    // Strip the timthumb PHP wrapper to get the real CDN URL.
    // e.g. "https://watchhentai.net/timthumb/backdrop.php?src=https://watchhentai.net/uploads/.../backdrop1.jpg"
    //   →  "https://watchhentai.net/uploads/.../backdrop1.jpg"
    const backdrop = unwrapTimthumb(rawDataSrc);

    // Year / date label — the <span> inside <div class="data">
    const year = art.tagText("span");

    return {
      id,
      title: cleanText(title),
      url: resolveUrl(href),
      backdrop,
      year: cleanText(year),
    };
  });
}

export function parseEpisodes(doc: HtmlDoc): EpisodeItem[] {
  const re = /class="animation-2 items full">([\s\S]*?)<header/i;
  const m = doc.html.match(re);
  if (!m) return [];
  const section = new HtmlDoc(m[1]);
  return section.articles().map((art) => {
    const id = art.attr("article", "id").replace("post-", "");
    const href = art.attr("a", "href");
    const seriesEl = art.tagText("span");
    const episodeEl = art.tagText("h3");
    const imgSrc = art.attr("img", "data-src");
    const subMatch = art.html.match(/>(SUB|DUB)<\/span>/i);
    const subType = subMatch ? subMatch[1].toUpperCase() : "SUB";
    const censored = art.html.includes("buttoncensured");
    const viewMatch = art.html.match(/fa-eye[^>]*>.*?([\d.,]+[km]?)\s*</i);
    const views = viewMatch ? parseViewCount(viewMatch[1]) : 0;
    const timeMatch = art.html.match(/fa-clock[^>]*>.*?<\/i>\s*([^<]+)</i);
    const uploadedAtRaw = timeMatch ? cleanText(timeMatch[1]) : "";
    const uploadedAt = parseRelativeTime(uploadedAtRaw);
    return {
      id,
      title: `${cleanText(seriesEl)} - ${cleanText(episodeEl)}`,
      series: cleanText(seriesEl),
      episode: cleanText(episodeEl),
      url: resolveUrl(href),
      thumbnail: normalizeThumbnail(imgSrc),
      subType,
      censored,
      views,
      uploadedAt,
      uploadedAtRaw,
    };
  });
}

export function parseSeriesSection(
  sectionHtml: string,
  sectionId: string
): SeriesItem[] {
  const startRe = new RegExp(`id="${sectionId}"`, "i");
  const idx = sectionHtml.search(startRe);
  if (idx === -1) return [];
  const fromHere = sectionHtml.slice(idx);
  const doc = new HtmlDoc(fromHere);
  return doc.articles().map((art) => {
    const id = art.attr("article", "id").replace("post-", "");
    const href = art.attr("a", "href");
    const title = art.tagText("h3") || art.attr("img", "alt");
    const poster = art.attr("img", "data-src");
    const yearMatch = art.html.match(/buttonyear[^>]*>.*?(\d{4})/s);
    const year = yearMatch ? yearMatch[1] : "";
    const censored = !art.html.includes("buttonuncensured");
    return {
      id,
      title: cleanText(title),
      url: resolveUrl(href),
      poster: normalizeThumbnail(poster),
      year,
      censored,
    };
  });
}

export function parseHomeSections(
  doc: HtmlDoc
): Record<string, SeriesItem[]> {
  const sectionIds = [
    { id: "dt-tvshows",          name: "featured_series" },
    { id: "genre_uncensored",    name: "uncensored"      },
    { id: "genre_harem",         name: "harem"           },
    { id: "genre_school-girls",  name: "school_girls"    },
    { id: "genre_large-breasts", name: "large_breasts"   },
  ];
  const result: Record<string, SeriesItem[]> = {};
  for (const { id, name } of sectionIds) {
    result[name] = parseSeriesSection(doc.html, id);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Player page scraper
//
// Fetches https://watchhentai.net/jwplayer/?source=...&id=...&type=...&quality=...
// and returns all available quality sources + metadata.
// ═══════════════════════════════════════════════════════════════════════════════

export interface VideoSource {
  /** Direct CDN URL */
  src: string;
  /** MIME type e.g. "video/mp4" */
  type: string;
  /** Quality label e.g. "1080p", "1440p", "720p", "default" */
  label: string;
}

export interface PlayerPageData {
  /** All quality sources parsed from sources[] */
  sources: VideoSource[];
  /** Default/fallback direct CDN URL from jw.file or schema contentUrl */
  defaultSrc: string;
  /** Thumbnail from jw.image or schema thumbnailUrl */
  thumbnail: string;
  /** ISO 8601 duration e.g. "PT24M50S" */
  duration: string;
  /** Download page URL */
  downloadUrl: string;
}

/**
 * Decode a URL-encoded + HTML-entity-encoded string.
 */
function cleanUrl(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/&amp;/g, "&"));
  } catch (_) {
    return raw.replace(/&amp;/g, "&");
  }
}

/**
 * Scrape the standalone JWPlayer page to get quality sources.
 *
 * The page contains:
 *   var jw = {"file":"https://hstorage.xyz/...","image":"...","color":"..."}
 *   sources: [
 *     { file: "https://hstorage.xyz/..._1440p.mp4", type: "video/mp4", label: "1440p" },
 *     { file: "https://hstorage.xyz/..._1080p.mp4", type: "video/mp4", label: "1080p" },
 *   ]
 *   JSON-LD: { "duration": "PT24M50S", "contentUrl": "...", "thumbnailUrl": "..." }
 *   window.open('https://watchhentai.net/download/...')
 */
export async function scrapePlayerPage(
  playerUrl: string
): Promise<PlayerPageData> {
  const clean = playerUrl.replace(/&amp;/g, "&");
  const html  = await fetchPage(clean);

  // ── jw{} object ───────────────────────────────────────────────────────────
  let defaultSrc = "";
  let thumbnail  = "";

  const jwMatch = html.match(/var\s+jw\s*=\s*(\{[\s\S]*?\})\s*(?:<\/script>|;)/);
  if (jwMatch) {
    const fileM  = jwMatch[1].match(/"file"\s*:\s*"([^"]+)"/);
    const imageM = jwMatch[1].match(/"image"\s*:\s*"([^"]+)"/);
    if (fileM)  defaultSrc = cleanUrl(fileM[1].replace(/\\\//g, "/"));
    if (imageM) thumbnail  = cleanUrl(imageM[1].replace(/\\\//g, "/"));
  }

  // ── JSON-LD schema ────────────────────────────────────────────────────────
  let duration = "";
  const schemaMatch = html.match(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (schemaMatch) {
    try {
      const schema = JSON.parse(schemaMatch[1].trim());
      if (!defaultSrc && schema.contentUrl)   defaultSrc = schema.contentUrl;
      if (!thumbnail  && schema.thumbnailUrl)  thumbnail  = schema.thumbnailUrl;
      if (schema.duration)                    duration   = schema.duration;
    } catch (_) {
      const durM = schemaMatch[1].match(/"duration"\s*:\s*"([^"]+)"/);
      const cuM  = schemaMatch[1].match(/"contentUrl"\s*:\s*"([^"]+)"/);
      const thM  = schemaMatch[1].match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
      if (durM)           duration   = durM[1];
      if (cuM && !defaultSrc) defaultSrc = cuM[1];
      if (thM && !thumbnail)  thumbnail  = thM[1];
    }
  }

  // ── sources[] array ───────────────────────────────────────────────────────
  const sources: VideoSource[] = [];
  const sourcesBlockM = html.match(/sources\s*:\s*\[([\s\S]*?)\]/);
  if (sourcesBlockM) {
    const entryRe = /\{([\s\S]*?)\}/g;
    let em: RegExpExecArray | null;
    while ((em = entryRe.exec(sourcesBlockM[1])) !== null) {
      const entry  = em[1];
      const fileM  = entry.match(/["']?file["']?\s*:\s*["']([^"']+)["']/);
      const typeM  = entry.match(/["']?type["']?\s*:\s*["']([^"']+)["']/);
      const labelM = entry.match(/["']?label["']?\s*:\s*["']([^"']+)["']/);
      if (fileM) {
        sources.push({
          src:   cleanUrl(fileM[1].replace(/\\\//g, "/")),
          type:  typeM  ? typeM[1]  : "video/mp4",
          label: labelM ? labelM[1] : "default",
        });
      }
    }
  }

  if (sources.length === 0 && defaultSrc) {
    const labelGuess = defaultSrc.match(/_(\d+p)\./)?.[1] ?? "default";
    sources.push({ src: defaultSrc, type: "video/mp4", label: labelGuess });
  }

  // ── download URL ──────────────────────────────────────────────────────────
  const dlM = html.match(
    /window\.open\('(https:\/\/watchhentai\.net\/download\/[^']+)'\)/i
  );
  const downloadUrl = dlM ? dlM[1] : "";

  return { sources, defaultSrc, thumbnail, duration, downloadUrl };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scrape functions (high-level, used by route handlers)
// ═══════════════════════════════════════════════════════════════════════════════

export async function scrapeHome() {
  const html = await fetchPage("/");
  const doc  = new HtmlDoc(html);
  return {
    slider:         parseSlider(doc),
    recentEpisodes: parseEpisodes(doc),
    sections:       parseHomeSections(doc),
  };
}

export async function scrapeSeries(slug: string) {
  const html  = await fetchPage(`/series/${slug}/`);
  const doc   = new HtmlDoc(html);
  const title = cleanText(doc.tagText("h1") || doc.tagText("h2"));
  const descMatch = html.match(
    /<div[^>]*class="[^"]*wp-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  const description = descMatch ? doc.text(descMatch[1]) : "";
  const posterMatch = html.match(
    /class="[^"]*poster[^"]*"[\s\S]*?data-src="([^"]+)"/i
  );
  const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";
  const epSection = new HtmlDoc(html);
  const episodes = epSection
    .articles()
    .filter((a) => a.html.includes("episode") || a.html.includes("Episode"))
    .map((art) => ({
      title:     cleanText(art.tagText("h3")),
      url:       resolveUrl(art.attr("a", "href")),
      thumbnail: normalizeThumbnail(art.attr("img", "data-src")),
    }));
  return { title, description, poster, episodes };
}

export async function scrapeGenre(genre: string, page = 1) {
  const path = page > 1 ? `/genre/${genre}/page/${page}/` : `/genre/${genre}/`;
  const html = await fetchPage(path);
  const doc  = new HtmlDoc(html);
  const items = doc.articles().map((art) => ({
    id:    art.attr("article", "id").replace("post-", ""),
    title: cleanText(art.tagText("h3") || art.attr("img", "alt")),
    url:   resolveUrl(art.attr("a", "href")),
    poster: normalizeThumbnail(art.attr("img", "data-src")),
    year:  (art.html.match(/buttonyear[^>]*>.*?(\d{4})/s) ?? [])[1] ?? "",
  }));
  return { genre, page, items };
}

export async function scrapeSearch(query: string, page = 1) {
  const params = new URLSearchParams({ s: query });
  const path   = page > 1 ? `/page/${page}/?${params}` : `/?${params}`;
  const html   = await fetchPage(path);
  const doc    = new HtmlDoc(html);
  const results = doc.articles().map((art) => ({
    id:    art.attr("article", "id").replace("post-", ""),
    title: cleanText(art.tagText("h3") || art.attr("img", "alt")),
    url:   resolveUrl(art.attr("a", "href")),
    poster: normalizeThumbnail(art.attr("img", "data-src")),
  }));
  return { query, page, results };
}

export async function scrapeTrending() {
  const html = await fetchPage("/trending/");
  const doc  = new HtmlDoc(html);
  return doc.articles().map((art) => ({
    id:    art.attr("article", "id").replace("post-", ""),
    title: cleanText(art.tagText("h3") || art.attr("img", "alt")),
    url:   resolveUrl(art.attr("a", "href")),
    poster: normalizeThumbnail(art.attr("img", "data-src")),
    year:  (art.html.match(/buttonyear[^>]*>.*?(\d{4})/s) ?? [])[1] ?? "",
  }));
}

export async function scrapeGenreList() {
  const html     = await fetchPage("/");
  const navMatch = html.match(/<ul[^>]*class="sub-menu"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!navMatch) return [];
  const doc    = new HtmlDoc(navMatch[1]);
  const links  = doc.hrefs();
  const titles = doc.attrs("a", "title");
  const texts  = navMatch[1].match(/<a[^>]*>([^<]+)<\/a>/gi) ?? [];
  return links.map((href, i) => ({
    name:  cleanText(texts[i]?.replace(/<[^>]+>/g, "") ?? ""),
    title: cleanText(titles[i] ?? ""),
    slug:  href.replace(/.*\/genre\//, "").replace(/\/$/, ""),
    url:   resolveUrl(href),
  }));
}
