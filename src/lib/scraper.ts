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

// ─── Fetch Helpers ────────────────────────────────────────────────────────────

/**
 * Fetch an HTML page from the site and return its text content.
 */
export async function fetchPage(path: string = "/"): Promise<string> {
  const url = path.startsWith("http") ? path : `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    headers: config.defaultHeaders,
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to fetch ${url}`);
  }

  return res.text();
}

// ─── Mini HTML Parser (no external deps) ─────────────────────────────────────

/**
 * A lightweight selector-based HTML extractor.
 * Works with Vercel Edge/Node without requiring cheerio or jsdom.
 */
export class HtmlDoc {
  constructor(public html: string) {}

  /** Extract all tag blocks matching a simple pattern */
  private blocks(tag: string, html = this.html): string[] {
    const results: string[] = [];
    // Self-closing or open tags with all attributes
    const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
    const closeTag = `</${tag}>`;

    let match: RegExpExecArray | null;
    while ((match = openRe.exec(html)) !== null) {
      const start = match.index;
      const closeIdx = html.toLowerCase().indexOf(closeTag.toLowerCase(), start + match[0].length);
      if (closeIdx === -1) {
        results.push(match[0]);
        continue;
      }
      results.push(html.slice(start, closeIdx + closeTag.length));
    }
    return results;
  }

  /** Find all <article> blocks (used for items) */
  articles(): HtmlDoc[] {
    return this.blocks("article").map((h) => new HtmlDoc(h));
  }

  /** Get the value of an attribute from the first matching tag */
  attr(tag: string, attribute: string, html = this.html): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "i");
    const m = html.match(re);
    if (!m) return "";
    const tagStr = m[0];
    const attrRe = new RegExp(`${attribute}=["']([^"']*?)["']`, "i");
    const am = tagStr.match(attrRe);
    return am ? am[1] : "";
  }

  /** Get all values of an attribute for a given tag */
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

  /** Get inner text content, stripping all HTML tags */
  text(html = this.html): string {
    return cleanText(html.replace(/<[^>]+>/g, " "));
  }

  /** Get text content of first matching tag */
  tagText(tag: string): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = this.html.match(re);
    return m ? this.text(m[1]) : "";
  }

  /** Select a subset of HTML by id */
  byId(id: string): HtmlDoc {
    const re = new RegExp(`id=["']${id}["']`, "i");
    const idMatch = this.html.match(re);
    if (!idMatch) return new HtmlDoc("");
    // Find surrounding div/section
    const start = this.html.lastIndexOf("<", idMatch.index!);
    // Walk to find matching closing tag
    const tagMatch = this.html.slice(start).match(/^<(\w+)/);
    if (!tagMatch) return new HtmlDoc(this.html.slice(start));
    const tag = tagMatch[1];
    const blocks = this.blocks(tag, this.html.slice(start));
    return new HtmlDoc(blocks[0] ?? "");
  }

  /** Extract all href values from <a> tags */
  hrefs(): string[] {
    return this.attrs("a", "href").filter(Boolean);
  }

  /** Check if text matches pattern */
  contains(text: string): boolean {
    return this.html.includes(text);
  }
}

// ─── Scraper Methods ──────────────────────────────────────────────────────────

/**
 * Parse slider (featured) items from the homepage HTML.
 */
export function parseSlider(doc: HtmlDoc): SliderItem[] {
  const sliderHtml = doc.byId("slider-movies-tvshows");
  return sliderHtml.articles().map((art) => {
    const id = art.attr("article", "id");
    const href = art.attr("a", "href");
    const title = art.tagText("h3") || art.attr("img", "alt");
    const backdropRaw = art.attr("img", "data-src");
    const year = art.tagText("span");

    return {
      id: id.replace("post-", ""),
      title: cleanText(title),
      url: resolveUrl(href),
      backdrop: normalizeThumbnail(backdropRaw),
      year: cleanText(year),
    };
  });
}

/**
 * Parse recent episode items from the homepage HTML.
 */
export function parseEpisodes(doc: HtmlDoc): EpisodeItem[] {
  // Find the "animation-2 items full" div
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

    // Sub/Dub
    const subMatch = art.html.match(/>(SUB|DUB)<\/span>/i);
    const subType = subMatch ? subMatch[1].toUpperCase() : "SUB";

    // Censored
    const censored = art.html.includes("buttoncensured");

    // Views
    const viewMatch = art.html.match(/fa-eye[^>]*>.*?([\d.,]+[km]?)\s*</i);
    const views = viewMatch ? parseViewCount(viewMatch[1]) : 0;

    // Time
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

/**
 * Parse series (tv-shows) items from a section of the page.
 */
export function parseSeriesSection(
  sectionHtml: string,
  sectionId: string
): SeriesItem[] {
  const re = new RegExp(`id=["']${sectionId}["'][\\s\\S]*?<\\/div>`, "i");

  // Grab the correct items div
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

/**
 * Parse all genre/category sections from the home page.
 */
export function parseHomeSections(doc: HtmlDoc): Record<string, SeriesItem[]> {
  const sectionIds = [
    { id: "dt-tvshows", name: "featured_series" },
    { id: "genre_uncensored", name: "uncensored" },
    { id: "genre_harem", name: "harem" },
    { id: "genre_school-girls", name: "school_girls" },
    { id: "genre_large-breasts", name: "large_breasts" },
  ];

  const result: Record<string, SeriesItem[]> = {};
  for (const { id, name } of sectionIds) {
    result[name] = parseSeriesSection(doc.html, id);
  }
  return result;
}

/**
 * Scrape the home page and return structured data.
 */
export async function scrapeHome() {
  const html = await fetchPage("/");
  const doc = new HtmlDoc(html);

  return {
    slider: parseSlider(doc),
    recentEpisodes: parseEpisodes(doc),
    sections: parseHomeSections(doc),
  };
}

/**
 * Scrape a series page by slug.
 * Example: /series/overflow-id-01/
 */
export async function scrapeSeries(slug: string) {
  const html = await fetchPage(`/series/${slug}/`);
  const doc = new HtmlDoc(html);

  const title = cleanText(
    doc.tagText("h1") || doc.tagText("h2")
  );

  // Description
  const descMatch = html.match(/<div[^>]*class="[^"]*wp-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? doc.text(descMatch[1]) : "";

  // Poster
  const posterMatch = html.match(/class="[^"]*poster[^"]*"[\s\S]*?data-src="([^"]+)"/i);
  const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";

  // Episodes list
  const epSection = new HtmlDoc(html);
  const episodes = epSection.articles()
    .filter((a) => a.html.includes("episode") || a.html.includes("Episode"))
    .map((art) => {
      const href = art.attr("a", "href");
      const epTitle = art.tagText("h3");
      const imgSrc = art.attr("img", "data-src");
      return {
        title: cleanText(epTitle),
        url: resolveUrl(href),
        thumbnail: normalizeThumbnail(imgSrc),
      };
    });

  return { title, description, poster, episodes };
}

/**
 * Scrape a genre/tag listing page.
 * Example: /genre/uncensored/
 */
export async function scrapeGenre(genre: string, page = 1) {
  const path = page > 1 ? `/genre/${genre}/page/${page}/` : `/genre/${genre}/`;
  const html = await fetchPage(path);
  const doc = new HtmlDoc(html);

  const items = doc.articles().map((art) => {
    const id = art.attr("article", "id").replace("post-", "");
    const href = art.attr("a", "href");
    const title = art.tagText("h3") || art.attr("img", "alt");
    const poster = art.attr("img", "data-src");
    const yearMatch = art.html.match(/buttonyear[^>]*>.*?(\d{4})/s);
    const year = yearMatch ? yearMatch[1] : "";

    return {
      id,
      title: cleanText(title),
      url: resolveUrl(href),
      poster: normalizeThumbnail(poster),
      year,
    };
  });

  return { genre, page, items };
}

/**
 * Scrape search results.
 * Example: /?s=overflow
 */
export async function scrapeSearch(query: string, page = 1) {
  const params = new URLSearchParams({ s: query });
  const path = page > 1 ? `/page/${page}/?${params}` : `/?${params}`;
  const html = await fetchPage(path);
  const doc = new HtmlDoc(html);

  const items = doc.articles().map((art) => {
    const id = art.attr("article", "id").replace("post-", "");
    const href = art.attr("a", "href");
    const title = art.tagText("h3") || art.attr("img", "alt");
    const poster = art.attr("img", "data-src");

    return {
      id,
      title: cleanText(title),
      url: resolveUrl(href),
      poster: normalizeThumbnail(poster),
    };
  });

  return { query, page, results: items };
}

/**
 * Scrape trending page.
 */
export async function scrapeTrending() {
  const html = await fetchPage("/trending/");
  const doc = new HtmlDoc(html);

  return doc.articles().map((art) => {
    const id = art.attr("article", "id").replace("post-", "");
    const href = art.attr("a", "href");
    const title = art.tagText("h3") || art.attr("img", "alt");
    const poster = art.attr("img", "data-src");
    const yearMatch = art.html.match(/buttonyear[^>]*>.*?(\d{4})/s);
    const year = yearMatch ? yearMatch[1] : "";

    return {
      id,
      title: cleanText(title),
      url: resolveUrl(href),
      poster: normalizeThumbnail(poster),
      year,
    };
  });
}

/**
 * Scrape all available genres from the main nav.
 */
export async function scrapeGenreList() {
  const html = await fetchPage("/");
  const navMatch = html.match(/<ul[^>]*class="sub-menu"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!navMatch) return [];

  const doc = new HtmlDoc(navMatch[1]);
  const links = doc.blocks("li", navMatch[1]);

  return links.map((li) => {
    const d = new HtmlDoc(li);
    const href = d.attr("a", "href");
    const title = d.attr("a", "title");
    const name = d.text();
    const slug = href.replace(/.*\/genre\//, "").replace(/\/$/, "");

    return {
      name: cleanText(name),
      title: cleanText(title),
      slug,
      url: resolveUrl(href),
    };
  });
}
