# WatchHentai Scraper API

A zero-dependency, serverless REST API that scrapes **watchhentai.net** and returns clean, structured JSON. Built with [Hono](https://hono.dev/) and deployed on **Vercel Edge Runtime**.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
  - [Home](#home)
  - [Trending](#trending)
  - [Episodes / Videos](#episodes--videos)
  - [Uncensored](#uncensored)
  - [Search](#search)
  - [Calendar](#calendar)
  - [Genres (list)](#genres-list)
  - [Genre (detail)](#genre-detail)
  - [Release Year](#release-year)
  - [Series (list)](#series-list)
  - [Series (detail)](#series-detail)
  - [Watch](#watch)
  - [Download](#download)
  - [Extra (site metadata)](#extra-site-metadata)
  - [Health](#health)
- [Response Shape](#response-shape)
- [Error Handling](#error-handling)

---

## Overview

Every route fetches the corresponding page from watchhentai.net using native `fetch`, parses the raw HTML with zero external scraping libraries, and returns structured JSON. Multi-quality video sources are resolved by additionally fetching the embedded jwplayer iframe page.

---

## Project Structure

```
/
├── api/
│   └── [[...route]].ts          # Vercel Edge entrypoint
├── src/
│   ├── index.ts                 # Hono app + route registration
│   ├── config/
│   │   └── index.ts             # Base URL, headers, defaults
│   ├── lib/
│   │   ├── scraper.ts           # HtmlDoc, fetchPage, scrapePlayerPage, all page scrapers
│   │   └── format.ts            # cleanText, normalizeThumbnail, resolveUrl, etc.
│   └── api/
│       └── pages/
│           ├── home.ts          # GET /api/home
│           ├── trending.ts      # GET /api/trending
│           ├── videos.ts        # GET /api/videos
│           ├── uncensored.ts    # GET /api/uncensored
│           ├── search.ts        # GET /api/search
│           ├── calendar.ts      # GET /api/calendar
│           ├── genre.ts         # GET /api/genre/:slug
│           ├── release.ts       # GET /api/release/:year
│           ├── series.ts        # GET /api/series (list + detail)
│           ├── watch.ts         # GET /api/watch/:slug
│           ├── download.ts      # GET /api/download/:slug
│           └── extra.ts         # GET /api/extra
├── vercel.json
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Vercel Edge (V8 isolates) |
| Framework | [Hono](https://hono.dev/) |
| Language | TypeScript |
| HTTP | Native `fetch` |
| HTML parsing | Custom `HtmlDoc` regex engine (zero dependencies) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli) (for local dev)

### Install

```bash
npm install
```

### Run locally

```bash
npx vercel dev
# API available at http://localhost:3000/api/...
```

### Deploy

```bash
npx vercel --prod
```

---

## API Reference

All routes are prefixed with `/api`. Every response follows the [standard response shape](#response-shape).

---

### Home

Returns the homepage sections: featured slider, new releases, trending, and any other content modules.

```
GET /api/home
```

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `sections` | `Section[]` | Array of named content sections (e.g. "Featured", "New Episodes") |
| `sections[].title` | `string` | Section heading |
| `sections[].items` | `Item[]` | Series/episode cards in that section |
| `sections[].items[].title` | `string` | Card title |
| `sections[].items[].url` | `string` | Absolute URL |
| `sections[].items[].thumbnail` | `string` | Cover image URL |
| `sections[].items[].rating` | `string` | Star rating (if present) |
| `sections[].items[].year` | `string` | Release year (if present) |

**Example:**

```
GET /api/home
```

---

### Trending

Returns the trending series/episodes list with optional pagination.

```
GET /api/trending
GET /api/trending?page=2
GET /api/trending/:page
```

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number |

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `items` | `Item[]` | Trending series cards |
| `items[].title` | `string` | Series title |
| `items[].url` | `string` | Series URL |
| `items[].thumbnail` | `string` | Poster image |
| `items[].rating` | `string` | Rating score |
| `items[].year` | `string` | Release year |
| `pagination` | `Pagination` | Page info |
| `pagination.current` | `number` | Current page |
| `pagination.total` | `number` | Total pages |
| `pagination.hasNext` | `boolean` | More pages available |
| `pagination.hasPrev` | `boolean` | Previous page available |

**Examples:**

```
GET /api/trending
GET /api/trending?page=3
GET /api/trending/3
```

---

### Episodes / Videos

Returns the latest episodes list with optional pagination.

```
GET /api/videos
GET /api/videos?page=2
GET /api/videos/:page
```

**Query Parameters:** Same as [Trending](#trending).

**Response `data`:** Same shape as [Trending](#trending).

**Examples:**

```
GET /api/videos
GET /api/videos?page=2
GET /api/videos/2
```

---

### Uncensored

Returns the uncensored episodes list with optional pagination.

```
GET /api/uncensored
GET /api/uncensored?page=2
GET /api/uncensored/:page
```

**Query Parameters:** Same as [Trending](#trending).

**Response `data`:** Same shape as [Trending](#trending).

---

### Search

Search series and episodes by keyword with optional pagination.

```
GET /api/search?q=keyword
GET /api/search?q=keyword&page=2
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | ✅ | Search keyword |
| `page` | `number` | ❌ | Page number (default `1`) |

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `query` | `string` | The search term used |
| `noResults` | `boolean` | `true` if the page returned no results |
| `items` | `Item[]` | Matching series cards |
| `pagination` | `Pagination` | Page info |

**Examples:**

```
GET /api/search?q=mama
GET /api/search?q=mama&page=2
```

---

### Calendar

Returns the airing calendar organised by month, with each month's episodes grouped by date.

```
GET /api/calendar
```

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `months` | `Month[]` | Array of months |
| `months[].name` | `string` | Month name e.g. `"February 2026"` |
| `months[].days` | `Day[]` | Days with episodes |
| `months[].days[].date` | `string` | Date string e.g. `"Feb 21"` |
| `months[].days[].episodes` | `Episode[]` | Episodes airing that day |
| `months[].days[].episodes[].title` | `string` | Episode title |
| `months[].days[].episodes[].url` | `string` | Episode URL |
| `months[].days[].episodes[].thumbnail` | `string` | Thumbnail URL |

---

### Genres (list)

Returns a flat list of all genres with their series counts.

```
GET /api/genres
```

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `genres` | `Genre[]` | All genre entries |
| `genres[].name` | `string` | Genre display name |
| `genres[].slug` | `string` | URL slug e.g. `"large-breasts"` |
| `genres[].url` | `string` | Full genre URL |
| `genres[].count` | `number` | Number of series in genre |

---

### Genre (detail)

Returns series/episodes under a specific genre with optional pagination.

```
GET /api/genre/:slug
GET /api/genre/:slug?page=2
GET /api/genre/:slug/:page
```

**Path Parameters:**

| Param | Description |
|---|---|
| `slug` | Genre slug e.g. `large-breasts`, `uncensored`, `vanilla-id-1` |

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number |

**Response `data`:** Same shape as [Trending](#trending), plus:

| Field | Type | Description |
|---|---|---|
| `genre` | `string` | Genre name |
| `items[].censored` | `string` | `"censored"` or `"uncensored"` badge (if present) |

**Examples:**

```
GET /api/genre/large-breasts
GET /api/genre/uncensored?page=2
GET /api/genre/vanilla-id-1
```

---

### Release Year

Returns series released in a specific year with optional pagination.

```
GET /api/release/:year
GET /api/release/:year?page=2
GET /api/release/:year/:page
```

**Path Parameters:**

| Param | Description |
|---|---|
| `year` | 4-digit year (1984–2026) |

**Validation:** Returns `400` if year is outside the valid range.

**Response `data`:** Same shape as [Trending](#trending).

**Examples:**

```
GET /api/release/2026
GET /api/release/2025?page=2
GET /api/release/2025/2
```

---

### Series (list)

Returns a paginated list of all series.

```
GET /api/series
GET /api/series?page=2
GET /api/series/:page          (numeric page only)
```

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `items` | `SeriesCard[]` | Series cards |
| `items[].title` | `string` | Series title |
| `items[].url` | `string` | Series detail URL |
| `items[].poster` | `string` | Poster image |
| `items[].rating` | `string` | Rating score |
| `items[].year` | `string` | Release year |
| `items[].censored` | `string` | Censorship badge |
| `pagination` | `Pagination` | Page info |

---

### Series (detail)

Returns comprehensive metadata for a single series including all episodes, genres, ratings, related series, and more.

```
GET /api/series/:slug
```

**Path Parameters:**

| Param | Description |
|---|---|
| `slug` | Series slug e.g. `seikou-senki-pony-celes-id-01` |

> The route auto-detects numeric-only slugs as list page numbers vs alphabetic slugs as detail requests.

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | WordPress post ID |
| `slug` | `string` | URL slug |
| `title` | `string` | Series title |
| `url` | `string` | Canonical series URL |
| `poster` | `string` | Portrait poster image |
| `backdrop` | `string` | Wide backdrop image |
| `rating` | `string` | Numeric rating |
| `year` | `string` | Release year |
| `status` | `string` | Airing status |
| `censored` | `string` | `"censored"` or `"uncensored"` |
| `genres` | `{name, url}[]` | Genre tags |
| `synopsis` | `string` | Full description |
| `episodes` | `Episode[]` | All episode entries |
| `episodes[].number` | `number` | Episode number |
| `episodes[].title` | `string` | Episode title |
| `episodes[].url` | `string` | Watch URL |
| `episodes[].thumbnail` | `string` | Episode thumbnail |
| `episodes[].date` | `string` | Air date |
| `related` | `SeriesCard[]` | Related series |
| `customFields` | `Record<string,string>` | Any extra metadata fields |

**Example:**

```
GET /api/series/seikou-senki-pony-celes-id-01
```

---

### Watch

Returns the full watch/stream page data for an episode, including **all quality video sources** resolved from the embedded jwplayer iframe page.

```
GET /api/watch/:slug
GET /api/watch?slug=episode-slug
```

**Path / Query Parameters:**

| Param | Description |
|---|---|
| `slug` | Episode slug e.g. `seikou-senki-pony-celes-episode-1-id-01` |

**How it works:**

1. Fetches the main watch page (`/videos/{slug}/`)
2. Extracts the jwplayer iframe URL
3. Fetches the player page and parses all quality variants
4. Falls back to the `?source=` URL param if the player page is unreachable

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | WordPress post ID |
| `slug` | `string` | Episode slug |
| `title` | `string` | Full episode title |
| `episodeTitle` | `string` | Episode portion e.g. `"Episode 1"` |
| `url` | `string` | Watch page URL |
| `player` | `VideoPlayer` | Player data (see below) |
| `player.originalSrc` | `string` | jwplayer iframe URL |
| `player.alternateSrc` | `string` | plyr iframe URL |
| `player.src` | `string` | Default/best video URL |
| `player.sources` | `VideoSource[]` | All quality variants |
| `player.sources[].src` | `string` | Direct video URL |
| `player.sources[].type` | `string` | MIME type e.g. `"video/mp4"` |
| `player.sources[].label` | `string` | Quality label e.g. `"1440p"`, `"1080p"`, `"720p"` |
| `player.duration` | `string` | ISO 8601 duration e.g. `"PT24M50S"` |
| `player.thumbnail` | `string` | Video thumbnail |
| `player.postId` | `string` | Post ID |
| `player.downloadUrl` | `string` | Download page URL |
| `thumbnail` | `string` | Episode thumbnail |
| `uploadDate` | `string` | ISO 8601 upload date |
| `views` | `string` | View count |
| `seriesTitle` | `string` | Parent series name |
| `seriesUrl` | `string` | Parent series URL |
| `seriesPoster` | `string` | Parent series poster |
| `censored` | `string` | `"censored"` or `"uncensored"` |
| `genres` | `{name, url}[]` | Genre tags |
| `synopsis` | `string` | Episode synopsis |
| `prevEpisode` | `NavEpisode \| null` | Previous episode link |
| `nextEpisode` | `NavEpisode \| null` | Next episode link |
| `episodes` | `EpisodeListItem[]` | All episodes in series |
| `episodes[].number` | `number` | Episode number |
| `episodes[].title` | `string` | Episode title |
| `episodes[].url` | `string` | Watch URL |
| `episodes[].thumbnail` | `string` | Thumbnail |
| `episodes[].date` | `string` | Air date |
| `episodes[].isCurrent` | `boolean` | Is this the currently watched episode |

**Example:**

```
GET /api/watch/seikou-senki-pony-celes-episode-1-id-01
```

**Example response (player block):**

```json
{
  "player": {
    "originalSrc": "https://watchhentai.net/jwplayer/?source=...&id=60829&type=mp4",
    "alternateSrc": "https://watchhentai.net/plyr/?source=...&id=60829&type=mp4",
    "src": "https://hstorage.xyz/files/S/seikou-senki-pony-celes/seikou-senki-pony-celes-1.mp4",
    "sources": [
      { "src": "https://hstorage.xyz/.../seikou-senki-pony-celes-1_1440p.mp4", "type": "video/mp4", "label": "1440p" },
      { "src": "https://hstorage.xyz/.../seikou-senki-pony-celes-1_1080p.mp4", "type": "video/mp4", "label": "1080p" },
      { "src": "https://hstorage.xyz/.../seikou-senki-pony-celes-1_720p.mp4",  "type": "video/mp4", "label": "720p"  }
    ],
    "type": "mp4",
    "duration": "PT24M50S",
    "thumbnail": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
    "postId": "60829",
    "downloadUrl": "https://watchhentai.net/download/seikou-senki-pony-celes-episode-1-id-01/"
  }
}
```

---

### Download

Returns the download page for an episode, including all quality download links with their direct CDN URLs.

```
GET /api/download/:slug
GET /api/download?slug=episode-slug
```

**Path / Query Parameters:**

| Param | Description |
|---|---|
| `slug` | Episode slug e.g. `seikou-senki-pony-celes-episode-1-id-01` |

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | WordPress post ID |
| `slug` | `string` | Episode slug |
| `title` | `string` | Full episode title |
| `episodeTitle` | `string` | Episode portion e.g. `"Episode 1"` |
| `seriesTitle` | `string` | Parent series name |
| `url` | `string` | Download page URL (canonical) |
| `watchUrl` | `string` | Corresponding watch/stream URL |
| `downloadUrl` | `string` | Same as `url` |
| `thumbnail` | `string` | Episode thumbnail |
| `previews` | `string[]` | Screenshot preview images (up to 9) |
| `sources` | `DownloadSource[]` | All quality download links |
| `sources[].url` | `string` | Direct CDN download URL |
| `sources[].label` | `string` | Quality e.g. `"1440p"`, `"1080p"`, `"720p"` |
| `sources[].host` | `string` | CDN hostname e.g. `"xupload.org"` |
| `seriesUrl` | `string` | Parent series URL |
| `prevEpisode` | `{title, url} \| null` | Previous episode download link |
| `nextEpisode` | `{title, url} \| null` | Next episode download link |
| `shareCount` | `string` | Social share count |
| `related` | `{title, url, poster}[]` | Related series |
| `datePublished` | `string` | ISO 8601 publish date |
| `dateModified` | `string` | ISO 8601 last modified date |
| `description` | `string` | Page meta description |

**Example:**

```
GET /api/download/seikou-senki-pony-celes-episode-1-id-01
```

**Example response (sources block):**

```json
{
  "sources": [
    { "url": "https://xupload.org/download/S/.../seikou-senki-pony-celes-1_1440p.mp4", "label": "1440p", "host": "xupload.org" },
    { "url": "https://xupload.org/download/S/.../seikou-senki-pony-celes-1_1080p.mp4", "label": "1080p", "host": "xupload.org" },
    { "url": "https://xupload.org/download/S/.../seikou-senki-pony-celes-1_720p.mp4",  "label": "720p",  "host": "xupload.org" }
  ],
  "previews": [
    "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-1.jpg",
    "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-2.jpg",
    "...up to 1-9.jpg"
  ]
}
```

---

### Extra (site metadata)

Returns all site-wide metadata in a single call: logo, navigation menu, genre dropdown, full genre list with counts, release years, popular/new sidebar series, footer links, and copyright — useful for bootstrapping a frontend app.

```
GET /api/extra
```

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `logo.url` | `string` | Logo image URL (SVG) |
| `logo.alt` | `string` | Logo alt text |
| `logo.homeUrl` | `string` | Site home URL |
| `menu` | `MenuItem[]` | Top-level navigation items |
| `menu[].name` | `string` | Label e.g. `"Home"`, `"Trending"` |
| `menu[].url` | `string` | Link URL |
| `menu[].title` | `string` | `title` attribute |
| `menuGenres` | `MenuGenre[]` | Genres listed in the Series dropdown (~27) |
| `menuGenres[].name` | `string` | Genre name |
| `menuGenres[].slug` | `string` | Genre slug |
| `menuGenres[].url` | `string` | Genre URL |
| `menuGenres[].title` | `string` | `title` attribute |
| `popular` | `SidebarItem[]` | Top-10 popular series (by views) |
| `newSeries` | `SidebarItem[]` | Top-10 newest series |
| `popular[].id` | `string` | Post ID |
| `popular[].title` | `string` | Series title |
| `popular[].url` | `string` | Series URL |
| `popular[].poster` | `string` | Poster thumbnail URL |
| `popular[].rating` | `string` | Rating score |
| `popular[].year` | `string` | Release year |
| `genres` | `SiteGenre[]` | Full genre list (100+ genres) |
| `genres[].name` | `string` | Genre name |
| `genres[].slug` | `string` | Genre slug |
| `genres[].url` | `string` | Genre URL |
| `genres[].count` | `number` | Number of series in genre |
| `years` | `string[]` | All release years, newest first (`["2026","2025",...]`) |
| `partnerLinks` | `{name, url}[]` | Footer partner/friend sites |
| `footerLinks` | `{name, url}[]` | Footer nav links |
| `copyright` | `string` | Copyright text e.g. `"WatchHentai.net © 2025"` |

---

### Health

Simple liveness check.

```
GET /api/health
```

**Response:**

```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2026-02-21T10:00:00.000Z"
}
```

---

## Response Shape

Every endpoint returns the same wrapper:

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source": "https://watchhentai.net/..."
  }
}
```

### Error

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

---

## Error Handling

| HTTP Status | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request (missing required param, invalid year, etc.) |
| `404` | Route not found |
| `500` | Upstream fetch failed or parse error |

All `500` responses include the raw error `.message` in the `error` field for debugging.

---

## Route Summary

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/home` | Homepage sections |
| `GET` | `/api/trending[?page=N]` | Trending series |
| `GET` | `/api/trending/:page` | Trending (paginated) |
| `GET` | `/api/videos[?page=N]` | Latest episodes |
| `GET` | `/api/videos/:page` | Latest episodes (paginated) |
| `GET` | `/api/uncensored[?page=N]` | Uncensored episodes |
| `GET` | `/api/uncensored/:page` | Uncensored (paginated) |
| `GET` | `/api/search?q=:query[&page=N]` | Search |
| `GET` | `/api/calendar` | Airing calendar |
| `GET` | `/api/genres` | All genres list |
| `GET` | `/api/genre/:slug[?page=N]` | Genre episodes |
| `GET` | `/api/genre/:slug/:page` | Genre episodes (paginated) |
| `GET` | `/api/release/:year[?page=N]` | Series by release year |
| `GET` | `/api/release/:year/:page` | Series by year (paginated) |
| `GET` | `/api/series[?page=N]` | All series list |
| `GET` | `/api/series/:slug` | Series detail (alphabetic slug) |
| `GET` | `/api/watch/:slug` | Episode watch + all video qualities |
| `GET` | `/api/watch?slug=:slug` | Episode watch (query param) |
| `GET` | `/api/download/:slug` | Episode download links |
| `GET` | `/api/download?slug=:slug` | Episode download (query param) |
| `GET` | `/api/extra` | Site logo, menu, genres, years, sidebar |
| `GET` | `/api/health` | Liveness check |
