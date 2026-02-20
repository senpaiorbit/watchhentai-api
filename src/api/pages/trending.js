import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const trending = new Hono();

// ─── shared parser ────────────────────────────────────────────────────────────

function parseTrendingHtml(html: string, page: number) {
  // Only grab articles inside <div class="items full"> — not sidebar w_item_b articles
  const itemsBlockMatch = html.match(
    /<div class="items full">([\s\S]*?)<\/div>\s*<div class="pagination/
  );
  const itemsHtml = itemsBlockMatch ? itemsBlockMatch[1] : html;

  // Split into individual <article ...> blocks
  const articleRegex = /<article\s[^>]*class="item tvshows"[\s\S]*?<\/article>/gi;
  const articleBlocks = itemsHtml.match(articleRegex) ?? [];

  const items = articleBlocks.map((art) => {
    // id
    const idMatch = art.match(/id="post-(\d+)"/);
    const id = idMatch ? idMatch[1] : "";

    // url
    const hrefMatch = art.match(/href="(https?:\/\/[^"]+\/series\/[^"]+)"/);
    const url = hrefMatch ? hrefMatch[1] : "";

    // title — prefer <h3><a ...>TITLE</a></h3>
    const titleMatch = art.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "";

    // poster — data-src on <img>
    const posterMatch = art.match(/data-src="([^"]+)"/);
    const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";

    // year — <div class="buttonyear"><span ...>YEAR</span>
    const yearMatch = art.match(/class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i);
    const year = yearMatch ? yearMatch[1] : "";

    // censored — buttonuncensured = uncensored, buttoncensured = censored
    const censored = !art.includes("buttonuncensured");

    return { id, title, url: resolveUrl(url), poster, year, censored };
  });

  // Pagination — "Page 2 of 48" text in <div class="pagination">
  const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : page;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

  return {
    items,
    pagination: {
      currentPage,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
      prevPage: currentPage > 1 ? currentPage - 1 : null,
    },
  };
}

// ─── routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/trending          → page 1
 * GET /api/trending?page=N   → page N (query param)
 * GET /api/trending/2        → page 2 (path param, mirrors site URL pattern)
 */

async function handleTrending(page: number, c: any) {
  const safePage = Math.max(1, isNaN(page) ? 1 : page);
  try {
    const path = safePage > 1 ? `/trending/page/${safePage}/` : `/trending/`;
    const html = await fetchPage(path);
    const data = parseTrendingHtml(html, safePage);

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

// Route 1: /api/trending  or  /api/trending?page=N
trending.get("/", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10);
  return handleTrending(page, c);
});

// Route 2: /api/trending/2  /api/trending/3  etc. (path-style)
trending.get("/:page", async (c) => {
  const page = parseInt(c.req.param("page"), 10);
  return handleTrending(page, c);
});

export default trending;
