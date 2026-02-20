import { Hono } from "hono";
import { fetchPage } from "../../lib/scraper";

const videos = new Hono();

// ─── shared parser ────────────────────────────────────────────────────────────

function decodeHtml(str: string): string {
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

function parseVideosHtml(html: string, page: number) {
  // Scope to <div id="archive-content" ...> to avoid sidebar articles
  const blockMatch = html.match(
    /<div[^>]+id="archive-content"[^>]*>([\s\S]*?)<\/div>\s*<div class="pagination/
  );
  const contentHtml = blockMatch ? blockMatch[1] : html;

  // Each episode: <article class="item se episodes" id="post-XXXXX">
  const articleRegex = /<article\s[^>]*class="item se episodes"[\s\S]*?<\/article>/gi;
  const articleBlocks = contentHtml.match(articleRegex) ?? [];

  const items = articleBlocks.map((art) => {
    // id
    const idMatch = art.match(/id="post-(\d+)"/);
    const id = idMatch ? idMatch[1] : "";

    // episode url — href in /videos/ path
    const hrefMatch = art.match(/href="(https?:\/\/[^"]+\/videos\/[^"]+)"/);
    const url = hrefMatch ? hrefMatch[1] : "";

    // thumbnail — data-src on the img tag
    const thumbMatch = art.match(/data-src="(https?:\/\/[^"]+)"/);
    const thumbnail = thumbMatch ? thumbMatch[1] : "";

    // series name — <span class="serie">Seikon no Aria</span>
    const seriesMatch = art.match(/<span[^>]+class="serie"[^>]*>([^<]+)<\/span>/i);
    const series = seriesMatch ? decodeHtml(seriesMatch[1].trim()) : "";

    // episode title — <h3>Episode 1</h3>
    const epTitleMatch = art.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const episodeTitle = epTitleMatch ? decodeHtml(epTitleMatch[1].trim()) : "";

    // full title = "Series – Episode N"
    const title = series && episodeTitle ? `${series} – ${episodeTitle}` : series || episodeTitle;

    // views — <i class="fas fa-eye"></i>  33.7k
    const viewsMatch = art.match(/fa-eye[^<]*<\/i>\s*([\d.,]+[kKmM]?)/);
    const views = viewsMatch ? viewsMatch[1].trim() : "";

    // posted — <i class="fas fa-clock"></i>  3 months ago
    const postedMatch = art.match(/fa-clock[^<]*<\/i>\s*([^<]+)/);
    const posted = postedMatch ? postedMatch[1].trim() : "";

    // censored
    const censored = !art.includes("buttonuncensured");

    // sub/dub label — <div class="buttonextra" ...><span ...>SUB</span>
    const labelMatch = art.match(/buttonextra[^>]*>[\s\S]*?<span[^>]*>\s*([A-Z]+)\s*<\/span>/i);
    const label = labelMatch ? labelMatch[1].trim() : "";

    return { id, series, episodeTitle, title, url, thumbnail, views, posted, censored, label };
  });

  // Total count from <span>3,690</span> next to <header>
  const totalMatch = html.match(/<header[^>]*>[\s\S]*?<span>([\d,]+)<\/span>/i);
  const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : null;

  // Pagination from "Page 3 of 123"
  const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : page;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

  return {
    items,
    totalCount,
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

async function handleVideos(page: number, c: any) {
  const safePage = Math.max(1, isNaN(page) ? 1 : page);
  try {
    const path = safePage > 1 ? `/videos/page/${safePage}/` : `/videos/`;
    const html = await fetchPage(path);
    const data = parseVideosHtml(html, safePage);

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

// GET /api/videos          → page 1
// GET /api/videos?page=N   → page N via query param
// GET /api/videos/:page    → page N via path param

videos.get("/", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10);
  return handleVideos(page, c);
});

videos.get("/:page", async (c) => {
  const page = parseInt(c.req.param("page"), 10);
  return handleVideos(page, c);
});

export default videos;
