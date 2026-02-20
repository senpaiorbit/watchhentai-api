import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const genre = new Hono();

// ─── shared parser ────────────────────────────────────────────────────────────

function parseGenreHtml(html: string, page: number, slug: string) {
  // Scope to <div class="items full"> to avoid sidebar w_item_b articles
  const itemsBlockMatch = html.match(
    /<div class="items full">([\s\S]*?)<\/div>\s*<div class="pagination/
  );
  const itemsHtml = itemsBlockMatch ? itemsBlockMatch[1] : html;

  const articleRegex = /<article\s[^>]*class="item tvshows"[\s\S]*?<\/article>/gi;
  const articleBlocks = itemsHtml.match(articleRegex) ?? [];

  const items = articleBlocks.map((art) => {
    // id
    const idMatch = art.match(/id="post-(\d+)"/);
    const id = idMatch ? idMatch[1] : "";

    // url
    const hrefMatch = art.match(/href="(https?:\/\/[^"]+\/series\/[^"]+)"/);
    const url = hrefMatch ? hrefMatch[1] : "";

    // title
    const titleMatch = art.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "";

    // poster
    const posterMatch = art.match(/data-src="([^"]+)"/);
    const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";

    // year — <div class="buttonyear"><span style="margin:5px">YEAR</span>
    const yearMatch = art.match(
      /class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i
    );
    const year = yearMatch ? yearMatch[1] : "";

    // censored
    const censored = !art.includes("buttonuncensured");

    return { id, title, url: resolveUrl(url), poster, year, censored };
  });

  // Genre name from <h1 class="heading-archive">Yuri</h1>
  const nameMatch = html.match(/<h1[^>]*class="[^"]*heading-archive[^"]*"[^>]*>([^<]+)<\/h1>/i);
  const name = nameMatch ? cleanText(nameMatch[1]) : slug;

  // Pagination from "Page 2 of 6"
  const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : page;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

  return {
    name,
    slug,
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

// ─── handler ──────────────────────────────────────────────────────────────────

async function handleGenre(slug: string, page: number, c: any) {
  const safePage = Math.max(1, isNaN(page) ? 1 : page);
  try {
    const path = safePage > 1
      ? `/genre/${slug}/page/${safePage}/`
      : `/genre/${slug}/`;
    const html = await fetchPage(path);
    const data = parseGenreHtml(html, safePage, slug);

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

/**
 * GET /api/genre/:slug          → page 1
 * GET /api/genre/:slug?page=N   → page N via query param
 * GET /api/genre/:slug/:page    → page N via path param
 */

// Route 1: /api/genre/yuri  or  /api/genre/yuri?page=2
genre.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  return handleGenre(slug, page, c);
});

// Route 2: /api/genre/yuri/2  /api/genre/yuri/3  etc.
genre.get("/:slug/:page", async (c) => {
  const slug = c.req.param("slug");
  const page = parseInt(c.req.param("page"), 10);
  return handleGenre(slug, page, c);
});

export default genre;
