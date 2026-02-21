import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";
import { cleanText, resolveUrl } from "../../lib/format";

const search = new Hono();

// ─── types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  poster: string;
  year: string;
  description: string;
}

interface SearchPagination {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

// ─── parser ───────────────────────────────────────────────────────────────────

function parseSearchHtml(html: string, query: string, page: number) {
  // Scope to the search-page content block to avoid sidebar pollution
  const contentMatch = html.match(
    /<div class="search-page">([\s\S]*?)<\/div>\s*<div class="sidebar/
  );
  const contentHtml = contentMatch ? contentMatch[1] : html;

  // Extract each result-item
  const itemRegex =
    /<div class="result-item">[\s\S]*?<\/article>\s*<\/div>/gi;
  const items = contentHtml.match(itemRegex) ?? [];

  const results: SearchResult[] = items.map((item) => {
    // URL and title from the .title anchor
    const titleMatch = item.match(
      /<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/i
    );
    const url = titleMatch ? resolveUrl(titleMatch[1]) : "";
    const title = titleMatch ? cleanText(titleMatch[2]) : "";

    // Poster — data-src on the lazy-loaded img
    const posterMatch = item.match(/data-src="([^"]+\/uploads\/[^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : "";

    // Year from <span class="year">
    const yearMatch = item.match(/<span class="year">(\d{4})<\/span>/i);
    const year = yearMatch ? yearMatch[1] : "";

    // Description snippet from .contenido <p>
    const descMatch = item.match(/<div class="contenido">\s*<p>([\s\S]*?)<\/p>/i);
    const description = descMatch
      ? cleanText(descMatch[1].replace(/\.\.\.$/, "").trim() + "...")
      : "";

    return { title, url, poster, year, description };
  });

  // Pagination — "Page X of Y" in .pagination <span>
  const pagMatch = contentHtml.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pagMatch ? parseInt(pagMatch[1], 10) : page;
  const totalPages = pagMatch ? parseInt(pagMatch[2], 10) : 1;

  const pagination: SearchPagination = {
    currentPage,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
    prevPage: currentPage > 1 ? currentPage - 1 : null,
  };

  return { query, results, pagination };
}

// ─── handler ──────────────────────────────────────────────────────────────────

async function handleSearch(c: any) {
  // ?q=... or ?s=... (both supported for convenience)
  const query = (c.req.query("q") || c.req.query("s") || "").trim();
  if (!query) {
    return c.json(
      { success: false, error: "Missing search query. Use ?q=your+query" },
      400
    );
  }

  // Page number: path param takes priority, then query param
  const pathPage = c.req.param("page");
  const queryPage = c.req.query("page");
  const page = Math.max(
    1,
    parseInt(pathPage || queryPage || "1", 10) || 1
  );

  // Build the URL the site expects:
  // page 1  → /?s=query
  // page N  → /page/N/?s=query
  const encodedQuery = encodeURIComponent(query);
  const path =
    page === 1 ? `/?s=${encodedQuery}` : `/page/${page}/?s=${encodedQuery}`;

  try {
    const html = await fetchPage(path);
    const data = parseSearchHtml(html, query, page);

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

// GET /api/search?q=keyword
// GET /api/search?q=keyword&page=2
// GET /api/search/:page?q=keyword
search.get("/", async (c) => handleSearch(c));
search.get("/:page", async (c) => handleSearch(c));

export default search;
