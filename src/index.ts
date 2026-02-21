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
import search from "./api/pages/search";
import series from "./api/pages/series";
import watch from "./api/pages/watch";
import { scrapeGenreList } from "./lib/scraper";

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

// ─── Search ───────────────────────────────────────────────────────────────────
// GET /api/search?q=keyword
// GET /api/search?q=keyword&page=2
// GET /api/search/:page?q=keyword
app.route("/search", search);

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

// ─── Series (list + detail) ────────────────────────────────────────────────────
// GET /api/series                  → list page 1
// GET /api/series?page=N           → list page N
// GET /api/series/3                → list page 3 (numeric slug)
// GET /api/series/some-slug-id-01  → series detail
app.route("/series", series);

// ─── Watch (episode video page) ───────────────────────────────────────────────
// GET /api/watch?slug=tsuki-kagerou-episode-1-id-01
// GET /api/watch/tsuki-kagerou-episode-1-id-01
app.route("/watch", watch);

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
        "GET /api/search?q=keyword",
        "GET /api/search?q=keyword&page=N",
        "GET /api/search/:page?q=keyword",
        "GET /api/calendar",
        "GET /api/release/:year",
        "GET /api/release/:year?page=N",
        "GET /api/release/:year/:page",
        "GET /api/genre/:slug",
        "GET /api/genre/:slug?page=N",
        "GET /api/genre/:slug/:page",
        "GET /api/series",
        "GET /api/series?page=N",
        "GET /api/series/:page",
        "GET /api/series/:slug",
        "GET /api/watch?slug=episode-slug",
        "GET /api/watch/:slug",
        "GET /api/search?q=:query&page=1",
        "GET /api/health",
      ],
    },
    404
  )
);

export default app;
