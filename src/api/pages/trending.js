import { Hono } from "hono";
import { fetchPage, HtmlDoc } from "../../lib/scraper";
import { cleanText, normalizeThumbnail, resolveUrl } from "../../lib/format";

const trending = new Hono();

/**
 * GET /api/trending?page=1
 * Returns trending series with pagination support.
 * Page info is extracted from the pagination block on the page.
 */
trending.get("/", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10);

  try {
    const path = page > 1 ? `/trending/page/${page}/` : `/trending/`;
    const html = await fetchPage(path);
    const doc = new HtmlDoc(html);

    // Parse items — same article structure as rest of site
    const items = doc.articles()
      .filter((art) => art.html.includes("item tvshows"))
      .map((art) => {
        const id = art.attr("article", "id").replace("post-", "");
        const href = art.attr("a", "href");
        const title = art.tagText("h3") || cleanText(art.attr("img", "alt"));
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

    // Extract pagination info
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
