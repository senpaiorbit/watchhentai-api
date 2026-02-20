import { Hono } from "hono";
import { scrapeHome } from "../../lib/scraper";

const home = new Hono();

/**
 * GET /api/home
 * Returns structured home page data:
 * - slider: featured/spotlight series
 * - recentEpisodes: latest uploaded episodes
 * - sections: grouped series by category (featured, uncensored, harem, etc.)
 */
home.get("/", async (c) => {
  try {
    const data = await scrapeHome();
    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source: "https://watchhentai.net",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

export default home;
