import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, resolveUrl } from "../../lib/format";

const series = new Hono();

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
    .replace(/&hellip;/g, "\u2026")
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim()
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST  –  /api/series  or  /api/series/:pageNumber
// ═══════════════════════════════════════════════════════════════════════════════

interface SeriesListItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  year: string;
  censored: "censored" | "uncensored" | "unknown";
}

interface SeriesListPagination {
  currentPage: number;
  totalPages: number;
  totalSeries: number | null;
  hasNext: boolean;
  hasPrev: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

function parseSeriesListHtml(html: string, page: number) {
  // Scope to archive-content block only (avoids sidebar noise)
  const contentMatch = html.match(
    /<div id="archive-content"[^>]*>([\s\S]*?)(?=<div class="pagination|<div class="sidebar)/
  );
  const contentHtml = contentMatch ? contentMatch[1] : html;

  // Total series count from <header>...<span>1,423</span>
  const totalMatch = html.match(
    /<header>\s*<h2>[^<]*<\/h2>\s*<span>([\d,]+)<\/span>\s*<\/header>/i
  );
  const totalSeries = totalMatch
    ? parseInt(totalMatch[1].replace(/,/g, ""), 10)
    : null;

  // Parse each article
  const articleRegex =
    /<article[^>]+class="item tvshows"[^>]*>([\s\S]*?)<\/article>/gi;
  const items: SeriesListItem[] = [];
  let m: RegExpExecArray | null;

  while ((m = articleRegex.exec(contentHtml)) !== null) {
    const art = m[0];

    const idMatch = art.match(/id="post-(\d+)"/i);
    const id = idMatch ? idMatch[1] : "";

    const posterMatch = art.match(/data-src="([^"]+\/uploads\/[^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : "";

    const urlMatch =
      art.match(
        /<a href="(https:\/\/watchhentai\.net\/series\/[^"]+)">\s*<div class="see/i
      ) || art.match(/href="(https:\/\/watchhentai\.net\/series\/[^"]+)"/i);
    const url = resolveUrl(urlMatch?.[1] ?? "");

    const titleMatch = art.match(/<h3>\s*<a[^>]+>([^<]+)<\/a>\s*<\/h3>/i);
    const title = titleMatch
      ? decodeHtmlEntities(cleanText(titleMatch[1]))
      : "";

    const yearMatch = art.match(
      /<div class="buttonyear">\s*<span[^>]*>(\d{4})<\/span>/i
    );
    const year = yearMatch ? yearMatch[1] : "";

    let censored: SeriesListItem["censored"] = "unknown";
    if (/<div class="buttoncensured">/i.test(art)) censored = "censored";
    else if (/<div class="buttonuncensured">/i.test(art)) censored = "uncensored";

    if (title) items.push({ id, title, url, poster, year, censored });
  }

  // Pagination from "Page X of Y"
  const pagMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pagMatch ? parseInt(pagMatch[1], 10) : page;
  const totalPages = pagMatch ? parseInt(pagMatch[2], 10) : 1;

  const pagination: SeriesListPagination = {
    currentPage,
    totalPages,
    totalSeries,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
    prevPage: currentPage > 1 ? currentPage - 1 : null,
  };

  return { series: items, pagination };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETAIL  –  /api/series/:slug
// ═══════════════════════════════════════════════════════════════════════════════

interface Genre {
  name: string;
  url: string;
}

interface Episode {
  number: number;
  title: string;
  url: string;
  thumbnail: string;
  date: string;
}

interface RelatedSeries {
  title: string;
  url: string;
  poster: string;
}

interface SeriesDetail {
  // Identity
  id: string;
  slug: string;
  title: string;
  url: string;
  poster: string;
  censored: "censored" | "uncensored" | "unknown";
  // Taxonomy / meta
  dateCreated: string;
  genres: Genre[];
  // Ratings
  rating: string;
  ratingCount: string;
  favorites: string;
  watchedCount: string;
  // Content
  synopsis: string;
  backdrops: string[];
  // Episodes
  episodes: Episode[];
  // About box
  alternativeTitle: string;
  firstAirDate: string;
  lastAirDate: string;
  seasons: string;
  episodeCount: string;
  averageDuration: string;
  quality: string;
  studio: string;
  // Related
  related: RelatedSeries[];
}

function parseSeriesDetailHtml(html: string, slug: string): SeriesDetail {
  // ── id ──────────────────────────────────────────────────────────────────────
  const idMatch =
    html.match(/postid-(\d+)/i) ||
    html.match(/data-post-id="(\d+)"/i);
  const id = idMatch ? idMatch[1] : "";

  // ── title ────────────────────────────────────────────────────────────────────
  const titleMatch = html.match(/<div class="data">\s*<h1>([^<]+)<\/h1>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : "";

  // ── canonical URL ─────────────────────────────────────────────────────────────
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/i);
  const url = canonicalMatch
    ? canonicalMatch[1]
    : `https://watchhentai.net/series/${slug}/`;

  // ── poster ───────────────────────────────────────────────────────────────────
  // The poster is the first lazy-loaded img inside .sheader .poster with itemprop="image"
  const posterMatch =
    html.match(/itemprop="image"[^>]*data-src="([^"]+)"/i) ||
    html.match(/data-src="([^"]+\/uploads\/[^"]+\/poster\.[^"]+)"/i);
  const poster = posterMatch ? posterMatch[1] : "";

  // ── censored status ───────────────────────────────────────────────────────────
  // Scope to .sheader only so sidebar doesn't pollute
  const sheaderMatch = html.match(
    /<div class="sheader">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="sbox"/
  );
  const sheaderHtml = sheaderMatch ? sheaderMatch[1] : html.slice(0, 8000);
  let censored: SeriesDetail["censored"] = "unknown";
  if (/<div class="buttoncensured">/i.test(sheaderHtml)) censored = "censored";
  else if (/<div class="buttonuncensured">/i.test(sheaderHtml)) censored = "uncensored";

  // ── date created ─────────────────────────────────────────────────────────────
  const dateMatch = html.match(/itemprop="dateCreated">([^<]+)<\/span>/i);
  const dateCreated = dateMatch ? dateMatch[1].trim() : "";

  // ── genres ────────────────────────────────────────────────────────────────────
  const sgeneroMatch = html.match(/<div class="sgeneros">([\s\S]*?)<\/div>/i);
  const genres: Genre[] = [];
  if (sgeneroMatch) {
    const gRe = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let gm: RegExpExecArray | null;
    while ((gm = gRe.exec(sgeneroMatch[1])) !== null) {
      genres.push({ name: cleanText(gm[2]), url: gm[1] });
    }
  }

  // ── rating ────────────────────────────────────────────────────────────────────
  const ratingMatch = html.match(
    /<span class="dt_rating_vgs" itemprop="ratingValue">([^<]+)<\/span>/i
  );
  const rating = ratingMatch ? ratingMatch[1].trim() : "";

  const ratingCountMatch = html.match(
    /<span class="rating-count" itemprop="ratingCount">([^<]+)<\/span>/i
  );
  const ratingCount = ratingCountMatch ? ratingCountMatch[1].trim() : "";

  // ── favorites & watched ───────────────────────────────────────────────────────
  // list-count-POSTID and views-count-POSTID spans
  const favMatch = html.match(/class="list-count-\d+">(\d+)<\/span>/i);
  const favorites = favMatch ? favMatch[1] : "";
  const viewsMatch = html.match(/class="views-count-\d+">(\d+)<\/span>/i);
  const watchedCount = viewsMatch ? viewsMatch[1] : "";

  // ── synopsis ──────────────────────────────────────────────────────────────────
  // .wp-content > <p> (before gallery)
  const synopsisBlockMatch = html.match(
    /<div class="wp-content">([\s\S]*?)<div id='dt_galery'/i
  );
  let synopsis = "";
  if (synopsisBlockMatch) {
    const pMatch = synopsisBlockMatch[1].match(/<p>([\s\S]*?)<\/p>/i);
    if (pMatch) synopsis = stripTags(pMatch[1]);
  }

  // ── backdrops ─────────────────────────────────────────────────────────────────
  const backdrops: string[] = [];
  // Primary: from gallery div
  const galleryMatch = html.match(/<div id='dt_galery'[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (galleryMatch) {
    const bRe = /data-src='([^']+)'/gi;
    let bm: RegExpExecArray | null;
    while ((bm = bRe.exec(galleryMatch[1])) !== null) {
      if (!backdrops.includes(bm[1])) backdrops.push(bm[1]);
    }
  }
  // Fallback: og:image meta tags
  if (backdrops.length === 0) {
    const ogRe = /<meta property='og:image' content='([^']+)'/gi;
    let om: RegExpExecArray | null;
    while ((om = ogRe.exec(html)) !== null) {
      if (!backdrops.includes(om[1])) backdrops.push(om[1]);
    }
  }

  // ── episodes ──────────────────────────────────────────────────────────────────
  const epBlockMatch = html.match(/<ul class='episodios'>([\s\S]*?)<\/ul>/i);
  const episodes: Episode[] = [];
  if (epBlockMatch) {
    const liRe = /<li[^>]*class='mark-(\d+)'[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(epBlockMatch[1])) !== null) {
      const number = parseInt(li[1], 10);
      const liHtml = li[2];

      const thumbMatch = liHtml.match(/data-src='([^']+)'/i);
      const thumbnail = thumbMatch ? thumbMatch[1] : "";

      const epUrlMatch = liHtml.match(/href='([^']+)'/i);
      const epUrl = epUrlMatch ? epUrlMatch[1] : "";

      // Title from the anchor text
      const epTitleMatch = liHtml.match(/<a[^>]+>([^<]+)<\/a>/i);
      const epTitle = epTitleMatch
        ? cleanText(epTitleMatch[1])
        : `Episode ${number}`;

      const epDateMatch = liHtml.match(/<span class='date'>([^<]+)<\/span>/i);
      const epDate = epDateMatch ? epDateMatch[1].trim() : "";

      if (epUrl) {
        episodes.push({ number, title: epTitle, url: epUrl, thumbnail, date: epDate });
      }
    }
    episodes.sort((a, b) => a.number - b.number);
  }

  // ── about / custom_fields ─────────────────────────────────────────────────────
  function getCustomField(label: string): string {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<b class="variante">${escaped}<\\/b>\\s*<span class="valor">([\\s\\S]*?)<\\/span>`,
      "i"
    );
    const fm = html.match(re);
    return fm ? stripTags(fm[1]) : "";
  }

  const alternativeTitle = getCustomField("Alternative title");
  const firstAirDate     = getCustomField("First air date");
  const lastAirDate      = getCustomField("Last air date");
  const seasons          = getCustomField("Seasons");
  const episodeCount     = getCustomField("Episodes");
  const averageDuration  = getCustomField("Average Duration");
  const quality          = getCustomField("Quality");
  const studio           = getCustomField("Studio");

  // ── related series ────────────────────────────────────────────────────────────
  const relatedBlockMatch = html.match(
    /<div id="single_relacionados">([\s\S]*?)<\/div>/i
  );
  const related: RelatedSeries[] = [];
  if (relatedBlockMatch) {
    const artRe = /<article>([\s\S]*?)<\/article>/gi;
    let ra: RegExpExecArray | null;
    while ((ra = artRe.exec(relatedBlockMatch[1])) !== null) {
      const raHtml = ra[1];
      const raUrlMatch = raHtml.match(
        /href="(https:\/\/watchhentai\.net\/series\/[^"]+)"/i
      );
      const raPosterMatch = raHtml.match(/data-src="([^"]+\/uploads\/[^"]+)"/i);
      const raTitleMatch = raHtml.match(/alt="([^"]+)"/i);
      if (raUrlMatch && raTitleMatch) {
        related.push({
          title: decodeHtmlEntities(raTitleMatch[1]),
          url: raUrlMatch[1],
          poster: raPosterMatch ? raPosterMatch[1] : "",
        });
      }
    }
  }

  return {
    id,
    slug,
    title,
    url,
    poster,
    censored,
    dateCreated,
    genres,
    rating,
    ratingCount,
    favorites,
    watchedCount,
    synopsis,
    backdrops,
    episodes,
    alternativeTitle,
    firstAirDate,
    lastAirDate,
    seasons,
    episodeCount,
    averageDuration,
    quality,
    studio,
    related,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// route handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSeriesList(c: any, pageOverride?: number) {
  const pathPage  = c.req.param?.("slug") ?? c.req.param?.("page");
  const queryPage = c.req.query("page");
  const page = pageOverride
    ?? Math.max(1, parseInt(pathPage || queryPage || "1", 10) || 1);

  const path = page === 1 ? "/series/" : `/series/page/${page}/`;

  try {
    const html = await fetchPage(path);
    const data = parseSeriesListHtml(html, page);
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

async function handleSeriesDetail(c: any, slug: string) {
  const path = `/series/${slug}/`;
  try {
    const html = await fetchPage(path);
    const data = parseSeriesDetailHtml(html, slug);
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

// ═══════════════════════════════════════════════════════════════════════════════
// routes
//
//  GET /api/series                → list page 1
//  GET /api/series?page=N         → list page N (via query)
//  GET /api/series/3              → list page 3 (numeric slug → list)
//  GET /api/series/some-slug-id-01 → detail page
// ═══════════════════════════════════════════════════════════════════════════════

series.get("/", async (c) => handleSeriesList(c));

series.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  // Pure number → treat as list page
  if (/^\d+$/.test(slug)) {
    return handleSeriesList(c, parseInt(slug, 10));
  }
  return handleSeriesDetail(c, slug);
});

export default series;
