import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const uncensored = new Hono();

// ─── parser (identical structure to genre pages) ─────────────────────────────

function parseUncensoredHtml(html: string, page: number) {
  // Scope to <div class="items full"> to avoid sidebar w_item_b articles
  const blockMatch = html.match(
    /<div class="items full">([\s\S]*?)<\/div>\s*<div class="pagination/
  );
  const itemsHtml = blockMatch ? blockMatch[1] : html;

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

    // poster — data-src on the <img>
    const posterMatch = art.match(/data-src="([^"]+)"/);
    const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";

    // year — <div class="buttonyear"><span style="margin:5px">2014</span>
    const yearMatch = art.match(
      /class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i
    );
    const year = yearMatch ? yearMatch[1] : "";

    // all items on this page have buttonuncensured — always false (uncensored)
    const censored = !art.includes("buttonuncensured");

    return { id, title, url: resolveUrl(url), poster, year, censored };
  });

  // Pagination from "Page 2 of 15"
  const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : page;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

  return {
    name: "Uncensored",
    slug: "uncensored",
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

async function handleUncensored(page: number, c: any) {
  const safePage = Math.max(1, isNaN(page) ? 1 : page);
  try {
    const path =
      safePage > 1
        ? `/genre/uncensored/page/${safePage}/`
        : `/genre/uncensored/`;
    const html = await fetchPage(path);
    const data = parseUncensoredHtml(html, safePage);

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

// GET /api/uncensored          → page 1
// GET /api/uncensored?page=N   → page N via query param
// GET /api/uncensored/:page    → page N via path param

uncensored.get("/", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10);
  return handleUncensored(page, c);
});

uncensored.get("/:page", async (c) => {
  const page = parseInt(c.req.param("page"), 10);
  return handleUncensored(page, c);
});

export default uncensored;
