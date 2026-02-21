import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import home from "./api/pages/home";
import trending from "./api/pages/trending";
import genre from "./api/pages/genre";
import videos from "./api/pages/videos";
import uncensored from "./api/pages/uncensored";
import release from "./api/pages/release";
import calendar from "./api/pages/calendar";
import { scrapeGenreList, scrapeSearch, scrapeSeries } from "./lib/scraper";

const app = new Hono().basePath("/api");

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use("*", cors());
app.use("*", logger());
app.use("*", prettyJSON());

// ─── Pages ────────────────────────────────────────────────────────────────────
app.route("/home", home);

// ─── Trending ─────────────────────────────────────────────────────────────────
// GET /api/trending
// GET /api/trending?page=N
// GET /api/trending/:page
app.route("/trending", trending);

// ─── Episodes / Videos ───────────────────────────────────────────────────────
// GET /api/videos
// GET /api/videos?page=N
// GET /api/videos/:page
app.route("/videos", videos);

// ─── Uncensored ───────────────────────────────────────────────────────────────
// GET /api/uncensored
// GET /api/uncensored?page=N
// GET /api/uncensored/:page
app.route("/uncensored", uncensored);

// ─── Release Year ─────────────────────────────────────────────────────────────
// GET /api/release/:year
// GET /api/release/:year?page=N
// GET /api/release/:year/:page
app.route("/release", release);

// ─── Calendar ─────────────────────────────────────────────────────────────────
// GET /api/calendar
app.route("/calendar", calendar);

// ─── Genres ───────────────────────────────────────────────────────────────────
// GET /api/genres
app.get("/genres", async (c) => {
  try {
    const data = await scrapeGenreList();
    return c.json({ success: true, data, meta: { scrapedAt: new Date().toISOString() } });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

// GET /api/genre/:slug
// GET /api/genre/:slug?page=N
// GET /api/genre/:slug/:page
app.route("/genre", genre);

// ─── Series ───────────────────────────────────────────────────────────────────
// GET /api/series/:slug
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
// GET /api/search?q=:query&page=1
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
        "GET /api/videos",
        "GET /api/videos?page=N",
        "GET /api/videos/:page",
        "GET /api/uncensored",
        "GET /api/uncensored?page=N",
        "GET /api/uncensored/:page",
        "GET /api/calendar",
        "GET /api/release/:year",
        "GET /api/release/:year?page=N",
        "GET /api/release/:year/:page",
        "GET /api/genre/:slug",
        "GET /api/genre/:slug?page=N",
        "GET /api/genre/:slug/:page",
        "GET /api/series/:slug",
        "GET /api/search?q=:query&page=1",
        "GET /api/health",
      ],
    },
    404
  )
);

export default app;
