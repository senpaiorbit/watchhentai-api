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

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchPage(path: string = "/"): Promise<string> {
  const url = path.startsWith("http") ? path : `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    headers: config.defaultHeaders,
    signal: AbortSignal.timeout(config.timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch ${url}`);
  return res.text();
}

// ─── Mini HTML Doc ────────────────────────────────────────────────────────────

export class HtmlDoc {
  constructor(public html: string) {}

  private blocks(tag: string, html = this.html): string[] {
    const results: string[] = [];
    const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
    const closeTag = `</${tag}>`;
    let match: RegExpExecArray | null;
    while ((match = openRe.exec(html)) !== null) {
      const start = match.index;
      const closeIdx = html.toLowerCase().indexOf(closeTag.toLowerCase(), start + match[0].length);
      if (closeIdx === -1) { results.push(match[0]); continue; }
      results.push(html.slice(start, closeIdx + closeTag.length));
    }
    return results;
  }

  articles(): HtmlDoc[] {
    return this.blocks("article").map((h) => new HtmlDoc(h));
  }

  attr(tag: string, attribute: string, html = this.html): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "i");
    const m = html.match(re);
    if (!m) return "";
    const attrRe = new RegExp(`${attribute}=["']([^"']*?)["']`, "i");
    const am = m[0].match(attrRe);
    return am ? am[1] : "";
  }

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

  text(html = this.html): string {
    return cleanText(html.replace(/<[^>]+>/g, " "));
  }

  tagText(tag: string): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = this.html.match(re);
    return m ? this.text(m[1]) : "";
  }

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

  hrefs(): string[] {
    return this.attrs("a", "href").filter(Boolean);
  }

  contains(text: string): boolean {
    return this.html.includes(text);
  }
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

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

export function parseSeriesSection(sectionHtml: string, sectionId: string): SeriesItem[] {
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

// ─── Scrape Functions ─────────────────────────────────────────────────────────

export async function scrapeHome() {
  const html = await fetchPage("/");
  const doc = new HtmlDoc(html);
  return {
    slider: parseSlider(doc),
    recentEpisodes: parseEpisodes(doc),
    sections: parseHomeSections(doc),
  };
}

export async function scrapeSeries(slug: string) {
  const html = await fetchPage(`/series/${slug}/`);
  const doc = new HtmlDoc(html);
  const title = cleanText(doc.tagText("h1") || doc.tagText("h2"));
  const descMatch = html.match(/<div[^>]*class="[^"]*wp-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? doc.text(descMatch[1]) : "";
  const posterMatch = html.match(/class="[^"]*poster[^"]*"[\s\S]*?data-src="([^"]+)"/i);
  const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";
  const epSection = new HtmlDoc(html);
  const episodes = epSection.articles()
    .filter((a) => a.html.includes("episode") || a.html.includes("Episode"))
    .map((art) => ({
      title: cleanText(art.tagText("h3")),
      url: resolveUrl(art.attr("a", "href")),
      thumbnail: normalizeThumbnail(art.attr("img", "data-src")),
    }));
  return { title, description, poster, episodes };
}

export async function scrapeGenre(genre: string, page = 1) {
  const path = page > 1 ? `/genre/${genre}/page/${page}/` : `/genre/${genre}/`;
  const html = await fetchPage(path);
  const doc = new HtmlDoc(html);
  const items = doc.articles().map((art) => ({
    id: art.attr("article", "id").replace("post-", ""),
    title: cleanText(art.tagText("h3") || art.attr("img", "alt")),
    url: resolveUrl(art.attr("a", "href")),
    poster: normalizeThumbnail(art.attr("img", "data-src")),
    year: (art.html.match(/buttonyear[^>]*>.*?(\d{4})/s) ?? [])[1] ?? "",
  }));
  return { genre, page, items };
}

export async function scrapeSearch(query: string, page = 1) {
  const params = new URLSearchParams({ s: query });
  const path = page > 1 ? `/page/${page}/?${params}` : `/?${params}`;
  const html = await fetchPage(path);
  const doc = new HtmlDoc(html);
  const results = doc.articles().map((art) => ({
    id: art.attr("article", "id").replace("post-", ""),
    title: cleanText(art.tagText("h3") || art.attr("img", "alt")),
    url: resolveUrl(art.attr("a", "href")),
    poster: normalizeThumbnail(art.attr("img", "data-src")),
  }));
  return { query, page, results };
}

export async function scrapeTrending() {
  const html = await fetchPage("/trending/");
  const doc = new HtmlDoc(html);
  return doc.articles().map((art) => ({
    id: art.attr("article", "id").replace("post-", ""),
    title: cleanText(art.tagText("h3") || art.attr("img", "alt")),
    url: resolveUrl(art.attr("a", "href")),
    poster: normalizeThumbnail(art.attr("img", "data-src")),
    year: (art.html.match(/buttonyear[^>]*>.*?(\d{4})/s) ?? [])[1] ?? "",
  }));
}

export async function scrapeGenreList() {
  const html = await fetchPage("/");
  const navMatch = html.match(/<ul[^>]*class="sub-menu"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!navMatch) return [];
  const doc = new HtmlDoc(navMatch[1]);
  const links = doc.hrefs();
  const titles = doc.attrs("a", "title");
  const texts = navMatch[1].match(/<a[^>]*>([^<]+)<\/a>/gi) ?? [];
  return links.map((href, i) => ({
    name: cleanText(texts[i]?.replace(/<[^>]+>/g, "") ?? ""),
    title: cleanText(titles[i] ?? ""),
    slug: href.replace(/.*\/genre\//, "").replace(/\/$/, ""),
    url: resolveUrl(href),
  }));
}
