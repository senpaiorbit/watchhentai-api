import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import home from "./api/pages/home";
import trending from "./api/pages/trending";
import {
  scrapeGenre,
  scrapeGenreList,
  scrapeSearch,
  scrapeSeries,
} from "./lib/scraper";

const app = new Hono().basePath("/api");

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use("*", cors());
app.use("*", logger());
app.use("*", prettyJSON());

// ─── Pages ────────────────────────────────────────────────────────────────────
app.route("/home", home);

// ─── Trending ─────────────────────────────────────────────────────────────────
// Handles all of:
//   GET /api/trending            → page 1
//   GET /api/trending?page=N     → page N via query param
//   GET /api/trending/N          → page N via path param
app.route("/trending", trending);

// ─── Genres ───────────────────────────────────────────────────────────────────
app.get("/genres", async (c) => {
  try {
    const data = await scrapeGenreList();
    return c.json({ success: true, data, meta: { scrapedAt: new Date().toISOString() } });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

app.get("/genre/:slug", async (c) => {
  const slug = c.req.param("slug");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  try {
    const data = await scrapeGenre(slug, page);
    return c.json({ success: true, data, meta: { scrapedAt: new Date().toISOString() } });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

// ─── Series ───────────────────────────────────────────────────────────────────
app.get("/series/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const data = await scrapeSeries(slug);
    return c.json({ success: true, data, meta: { scrapedAt: new Date().toISOString() } });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────
app.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const page = parseInt(c.req.query("page") ?? "1", 10);
  if (!query) return c.json({ success: false, error: "Missing query parameter: q" }, 400);
  try {
    const data = await scrapeSearch(query, page);
    return c.json({ success: true, data, meta: { scrapedAt: new Date().toISOString() } });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ success: true, status: "ok", timestamp: new Date().toISOString() })
);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.notFound((c) =>
  c.json(
    {
      success: false,
      error: "Route not found",
      available: [
        "GET /api/home",
        "GET /api/trending",
        "GET /api/trending?page=N",
        "GET /api/trending/:page",
        "GET /api/genres",
        "GET /api/genre/:slug?page=1",
        "GET /api/series/:slug",
        "GET /api/search?q=:query&page=1",
        "GET /api/health",
      ],
    },
    404
  )
);

export default app;
