import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const release = new Hono();

// ─── parser ───────────────────────────────────────────────────────────────────

function parseReleaseHtml(html: string, year: string, page: number) {
  // Scope to <div class="items full"> to avoid sidebar articles
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

    // poster
    const posterMatch = art.match(/data-src="([^"]+)"/);
    const poster = posterMatch ? normalizeThumbnail(posterMatch[1]) : "";

    // year badge
    const yearMatch = art.match(
      /class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i
    );
    const yearBadge = yearMatch ? yearMatch[1] : year;

    // censored — true if buttoncensured present, false if buttonuncensured
    const censored = art.includes("buttoncensured");
    const uncensored = art.includes("buttonuncensured");
    // If neither badge, treat as censored by default
    const censoredStatus: "censored" | "uncensored" | "unknown" = uncensored
      ? "uncensored"
      : censored
      ? "censored"
      : "unknown";

    return {
      id,
      title,
      url: resolveUrl(url),
      poster,
      year: yearBadge,
      censored: censoredStatus,
    };
  });

  // Pagination "Page 2 of 2"
  const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : page;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

  return {
    year,
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

async function handleRelease(year: string, page: number, c: any) {
  // Validate year is a 4-digit number
  if (!/^\d{4}$/.test(year)) {
    return c.json({ success: false, error: "Invalid year format. Use a 4-digit year like 2025." }, 400);
  }

  const safePage = Math.max(1, isNaN(page) ? 1 : page);

  try {
    const path =
      safePage > 1
        ? `/release/${year}/page/${safePage}/`
        : `/release/${year}/`;

    const html = await fetchPage(path);
    const data = parseReleaseHtml(html, year, safePage);

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

// GET /api/release/:year          → page 1
// GET /api/release/:year?page=N   → page N via query param
// GET /api/release/:year/:page    → page N via path param

release.get("/:year", async (c) => {
  const year = c.req.param("year");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  return handleRelease(year, page, c);
});

release.get("/:year/:page", async (c) => {
  const year = c.req.param("year");
  const page = parseInt(c.req.param("page"), 10);
  return handleRelease(year, page, c);
});

export default release;
