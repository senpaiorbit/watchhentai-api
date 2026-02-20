const BASE_URL = "https://watchhentai.net";

// ─── HTTP ────────────────────────────────────────────────────────────────────

export async function fetchPage(path: string): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ─── Shared article parser (works for home, trending, genre, search) ─────────

interface SeriesItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  year: string;
  censored: boolean;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

/**
 * Extract only the main content articles from the page HTML,
 * scoped to <div class="items full"> to avoid sidebar w_item_b articles.
 */
function parseArticles(html: string): SeriesItem[] {
  // Scope to <div class="items full">...</div> block only
  const itemsBlockMatch = html.match(
    /<div class="items full">([\s\S]*?)<\/div>\s*<div class="pagination/
  );
  const itemsHtml = itemsBlockMatch ? itemsBlockMatch[1] : html;

  const articleRegex = /<article\s[^>]*class="item tvshows"[\s\S]*?<\/article>/gi;
  const articleBlocks = itemsHtml.match(articleRegex) ?? [];

  return articleBlocks.map((art) => {
    const idMatch = art.match(/id="post-(\d+)"/);
    const id = idMatch ? idMatch[1] : "";

    const hrefMatch = art.match(/href="(https?:\/\/[^"]+\/series\/[^"]+)"/);
    const url = hrefMatch ? hrefMatch[1] : "";

    const titleMatch = art.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const rawTitle = titleMatch ? titleMatch[1] : "";
    const title = decodeHtmlEntities(rawTitle.trim());

    const posterMatch = art.match(/data-src="([^"]+poster[^"]+)"/);
    const poster = posterMatch ? posterMatch[1] : "";

    // Year is inside: <div class="buttonyear"><span style="margin:5px">2023</span>
    const yearMatch = art.match(
      /class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i
    );
    const year = yearMatch ? yearMatch[1] : "";

    const censored = !art.includes("buttonuncensured");

    return { id, title, url, poster, year, censored };
  });
}

/**
 * Extract pagination from "Page X of Y" text.
 */
function parsePagination(html: string, fallbackPage: number): PaginationInfo {
  const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : fallbackPage;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;
  return {
    currentPage,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
    prevPage: currentPage > 1 ? currentPage - 1 : null,
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export async function scrapeHome() {
  const html = await fetchPage("/");

  // Featured slider items
  const featuredRegex = /<article\s[^>]*class="item tvshows"[\s\S]*?<\/article>/gi;
  const featuredHtml = (() => {
    const m = html.match(/<div[^>]+id="featured-titles"[^>]*>([\s\S]*?)<\/div>/);
    return m ? m[1] : html;
  })();
  const featured = (featuredHtml.match(featuredRegex) ?? []).map((art) => {
    const idMatch = art.match(/id="post-(\d+)"/);
    const hrefMatch = art.match(/href="(https?:\/\/[^"]+\/series\/[^"]+)"/);
    const titleMatch = art.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const posterMatch = art.match(/data-src="([^"]+poster[^"]+)"/);
    const yearMatch = art.match(/class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i);
    return {
      id: idMatch ? idMatch[1] : "",
      title: decodeHtmlEntities((titleMatch ? titleMatch[1] : "").trim()),
      url: hrefMatch ? hrefMatch[1] : "",
      poster: posterMatch ? posterMatch[1] : "",
      year: yearMatch ? yearMatch[1] : "",
      censored: !art.includes("buttonuncensured"),
    };
  });

  // Latest episodes (dt-episodes section)
  const episodesHtml = (() => {
    const m = html.match(/<div[^>]+id="dt-episodes"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    return m ? m[1] : "";
  })();
  const episodeRegex = /<article[\s\S]*?<\/article>/gi;
  const latestEpisodes = (episodesHtml.match(episodeRegex) ?? []).map((art) => {
    const hrefMatch = art.match(/href="(https?:\/\/[^"]+\/videos\/[^"]+)"/);
    const titleMatch = art.match(/<span[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/i);
    const posterMatch = art.match(/data-src="([^"]+)"/);
    return {
      url: hrefMatch ? hrefMatch[1] : "",
      title: decodeHtmlEntities((titleMatch ? titleMatch[1] : "").trim()),
      thumbnail: posterMatch ? posterMatch[1] : "",
    };
  }).filter((e) => e.url);

  return { featured, latestEpisodes };
}

// ─── Trending ────────────────────────────────────────────────────────────────

export async function scrapeTrending(page = 1) {
  const safePage = Math.max(1, page);
  const path = safePage > 1 ? `/trending/page/${safePage}/` : `/trending/`;
  const html = await fetchPage(path);
  const items = parseArticles(html);
  const pagination = parsePagination(html, safePage);
  return { items, pagination };
}

// ─── Genre list ───────────────────────────────────────────────────────────────

export async function scrapeGenreList() {
  const html = await fetchPage("/series/");
  const genreRegex = /<li class="cat-item[^"]*"><a href="(https?:\/\/[^"]+\/genre\/([^/]+)\/[^"]*)"[^>]*>([^<]+)<\/a>\s*(?:<i>(\d+)<\/i>)?/gi;
  const genres: Array<{ name: string; slug: string; url: string; count: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = genreRegex.exec(html)) !== null) {
    genres.push({
      url: m[1],
      slug: m[2],
      name: decodeHtmlEntities(m[3].trim()),
      count: m[4] ? parseInt(m[4], 10) : 0,
    });
  }
  return genres;
}

// ─── Genre page ───────────────────────────────────────────────────────────────

export async function scrapeGenre(slug: string, page = 1) {
  const safePage = Math.max(1, page);
  // URL pattern: /genre/yuri/  or  /genre/yuri/page/2/
  const path = safePage > 1 ? `/genre/${slug}/page/${safePage}/` : `/genre/${slug}/`;
  const html = await fetchPage(path);

  // Extract genre name from <h1 class="heading-archive">
  const nameMatch = html.match(/<h1[^>]*class="[^"]*heading-archive[^"]*"[^>]*>([^<]+)<\/h1>/i);
  const name = nameMatch ? decodeHtmlEntities(nameMatch[1].trim()) : slug;

  const items = parseArticles(html);
  const pagination = parsePagination(html, safePage);

  return { name, slug, items, pagination };
}

// ─── Series detail ────────────────────────────────────────────────────────────

export async function scrapeSeries(slug: string) {
  const html = await fetchPage(`/series/${slug}/`);

  // Title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*sheader[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim()) : slug;

  // Poster
  const posterMatch = html.match(/<div[^>]+class="[^"]*poster[^"]*"[^>]*>[\s\S]*?data-src="([^"]+)"/i)
    || html.match(/class="[^"]*main-poster[^"]*"[\s\S]*?data-src="([^"]+)"/i);
  const poster = posterMatch ? posterMatch[1] : "";

  // Description
  const descMatch = html.match(/<div[^>]+class="[^"]*wp-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch
    ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    : "";

  // Genres
  const genreMatches = html.matchAll(/<a[^>]+href="[^"]+\/genre\/([^/]+)\/[^"]*"[^>]*>([^<]+)<\/a>/gi);
  const genres = [...genreMatches].map((m) => ({
    slug: m[1],
    name: decodeHtmlEntities(m[2].trim()),
  }));

  // Year from meta or buttonyear
  const yearMatch = html.match(/class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i)
    || html.match(/<span[^>]+class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/i);
  const year = yearMatch ? yearMatch[1] : "";

  // Censored
  const censored = !html.includes("buttonuncensured");

  // Episodes
  const episodeRegex = /<li[^>]*class="[^"]*episodio[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const episodes: Array<{ number: string; title: string; url: string; date: string }> = [];
  let em: RegExpExecArray | null;
  while ((em = episodeRegex.exec(html)) !== null) {
    const epHref = em[1].match(/href="([^"]+)"/);
    const epTitle = em[1].match(/<a[^>]*>([^<]+)<\/a>/);
    const epNum = em[1].match(/numerando[^>]*>([^<]+)</);
    const epDate = em[1].match(/fecha[^>]*>([^<]+)</);
    if (epHref) {
      episodes.push({
        number: epNum ? epNum[1].trim() : "",
        title: epTitle ? decodeHtmlEntities(epTitle[1].trim()) : "",
        url: epHref[1],
        date: epDate ? epDate[1].trim() : "",
      });
    }
  }

  return { title, slug, poster, description, year, censored, genres, episodes };
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function scrapeSearch(query: string, page = 1) {
  const safePage = Math.max(1, page);
  const encoded = encodeURIComponent(query);
  const path = safePage > 1
    ? `/?s=${encoded}&page=${safePage}`
    : `/?s=${encoded}`;
  const html = await fetchPage(path);
  const items = parseArticles(html);
  const pagination = parsePagination(html, safePage);
  return { query, items, pagination };
}
