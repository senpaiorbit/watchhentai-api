import { Hono } from "hono";
import { fetchPage, HtmlDoc } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const trending = new Hono();

/**
 * GET /api/trending?page=1
 * GET /api/trending/?page=1   (alias, both work)
 * Returns trending series with pagination (48 pages total).
 */
trending.get("/", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));

  try {
    const path = page > 1 ? `/trending/page/${page}/` : `/trending/`;
    const html = await fetchPage(path);
    const doc = new HtmlDoc(html);

    const items = doc.articles()
      .filter((art) => art.html.includes("item tvshows"))
      .map((art) => {
        const id = art.attr("article", "id").replace("post-", "");
        const href = art.attr("a", "href");
        const title = art.tagText("h3") || cleanText(art.attr("img", "alt"));
        const poster = art.attr("img", "data-src");

        // Fix: correctly extract year from:
        // <div class="buttonyear"><span style="margin:5px">2023</span></div>
        // Old regex used /s flag on buttonyear pattern which missed whitespace between tags
        const yearMatch = art.html.match(
          /class="buttonyear"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\s*<\/span>/i
        );
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

    // Extract "Page X of Y" from pagination block
    const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
    const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : page;
    const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

    return c.json({
      success: true,
      data: {
        items,
        pagination: {
          currentPage,
          totalPages,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
          nextPage: currentPage < totalPages ? currentPage + 1 : null,
          prevPage: currentPage > 1 ? currentPage - 1 : null,
        },
      },
      meta: {
        scrapedAt: new Date().toISOString(),
        source: `https://watchhentai.net/trending/${page > 1 ? `page/${page}/` : ""}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

export default trending;
