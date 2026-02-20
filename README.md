# WatchHentai Scraper API

A Hono-based Vercel Edge API for scraping watchhentai.net. Zero external scraping dependencies — uses a built-in lightweight HTML parser.

## Project Structure

```
watchhentai-api/
├── api/
│   └── [[...route]].ts       # Vercel Edge catch-all handler
├── src/
│   ├── index.ts              # Main Hono app with all routes
│   ├── config/
│   │   └── index.ts          # Base URL + request config
│   ├── lib/
│   │   ├── scraper.ts        # Universal scraper (fetchPage + parsers)
│   │   └── format.ts         # Types + text/URL utilities
│   └── api/
│       └── pages/
│           └── home.ts       # /api/home route handler
├── vercel.json
├── tsconfig.json
└── package.json
```

## Available Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/home` | Home page: slider, recent episodes, category sections |
| GET | `/api/trending` | Trending series |
| GET | `/api/genres` | All genres from nav |
| GET | `/api/genre/:slug?page=1` | Browse a genre listing |
| GET | `/api/series/:slug` | Series details + episode list |
| GET | `/api/search?q=:query&page=1` | Search results |
| GET | `/api/health` | Health check |

## Setup

```bash
npm install
npx vercel dev      # local dev
npx vercel deploy   # deploy
```

## Adding a New Page

1. Send the URL + HTML to Claude
2. Claude updates `/lib/scraper.ts` with a new `scrapeXxx()` function
3. Claude creates `/api/pages/xxx.ts` with the Hono route handler
4. Claude registers the route in `src/index.ts`

## Workflow for Updates

Each time you provide a new URL and HTML:
- `scraper.ts` gets a new `scrapeXxx()` export
- `format.ts` gets any new type definitions
- A new `/api/pages/xxx.ts` file is created
- The new route is registered in `src/index.ts`
