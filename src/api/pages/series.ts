import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, resolveUrl } from "../../lib/format";

const series = new Hono();

// ─── types ────────────────────────────────────────────────────────────────────

interface SeriesItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  year: string;
  censored: "censored" | "uncensored" | "unknown";
}

interface SeriesPagination {
  currentPage: number;
  totalPages: number;
  totalSeries: number | null;
  hasNext: boolean;
  hasPrev: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

// ─── parser ───────────────────────────────────────────────────────────────────

function parseSeriesHtml(html: string, page: number) {
  // Scope to archive-content block only (avoids sidebar articles)
  const contentMatch = html.match(
    /<div id="archive-content"[^>]*>([\s\S]*?)<\/div>\s*<div class="pagination/
  );
  const contentHtml = contentMatch ? contentMatch[1] : html;

  // Total count from <header><h2>Recently added</h2><span>1,423</span></header>
  const totalMatch = html.match(
    /<header>\s*<h2>[^<]*<\/h2>\s*<span>([\d,]+)<\/span>\s*<\/header>/i
  );
  const totalSeries = totalMatch
    ? parseInt(totalMatch[1].replace(/,/g, ""), 10)
    : null;

  // Each article
  const articleRegex =
    /<article[^>]+class="item tvshows"[^>]*>([\s\S]*?)<\/article>/gi;
  const items: SeriesItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = articleRegex.exec(contentHtml)) !== null) {
    const art = match[0];

    // post id from article id="post-XXXXX"
    const idMatch = art.match(/id="post-(\d+)"/i);
    const id = idMatch ? idMatch[1] : "";

    // poster — data-src on the lazy img
    const posterMatch = art.match(/data-src="([^"]+\/uploads\/[^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : "";

    // URL from the <a href="..."> inside .poster that wraps .see
    const urlMatch = art.match(
      /<a href="(https:\/\/watchhentai\.net\/series\/[^"]+)">\s*<div class="see/i
    );
    // fallback: any /series/ link
    const urlMatch2 = art.match(/href="(https:\/\/watchhentai\.net\/series\/[^"]+)"/i);
    const url = resolveUrl((urlMatch || urlMatch2)?.[1] ?? "");

    // Title from <h3><a ...>TITLE</a></h3>
    const titleMatch = art.match(/<h3>\s*<a[^>]+>([^<]+)<\/a>\s*<\/h3>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "";

    // Year from .buttonyear span
    const yearMatch = art.match(
      /<div class="buttonyear">\s*<span[^>]*>(\d{4})<\/span>/i
    );
    const year = yearMatch ? yearMatch[1] : "";

    // Censored status
    let censored: SeriesItem["censored"] = "unknown";
    if (/<div class="buttoncensured">/i.test(art)) {
      censored = "censored";
    } else if (/<div class="buttonuncensured">/i.test(art)) {
      censored = "uncensored";
    }

    if (title) {
      items.push({ id, title, url, poster, year, censored });
    }
  }

  // Pagination from "Page X of Y" in .pagination <span>
  const pagMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pagMatch ? parseInt(pagMatch[1], 10) : page;
  const totalPages = pagMatch ? parseInt(pagMatch[2], 10) : 1;

  const pagination: SeriesPagination = {
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

// ─── handler ──────────────────────────────────────────────────────────────────

async function handleSeries(c: any) {
  const pathPage = c.req.param("page");
  const queryPage = c.req.query("page");
  const page = Math.max(
    1,
    parseInt(pathPage || queryPage || "1", 10) || 1
  );

  // page 1  → /series/
  // page N  → /series/page/N/
  const path = page === 1 ? "/series/" : `/series/page/${page}/`;

  try {
    const html = await fetchPage(path);
    const data = parseSeriesHtml(html, page);

    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source: `https://watchhentai.net${path}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
}

// ─── routes ───────────────────────────────────────────────────────────────────

// GET /api/series          → page 1
// GET /api/series?page=N   → page N
// GET /api/series/:page    → page N
series.get("/", async (c) => handleSeries(c));
series.get("/:page", async (c) => handleSeries(c));

export default series;
