<p align="center">
  <img src="https://watchhentai.net/logo.svg" alt="WatchHentai Logo" width="200"/>
</p>

# WatchHentai.net Scraper API  
  
A zero-dependency REST API built with **Hono** on **Vercel Edge Runtime** that scrapes [watchhentai.net](https://watchhentai.net) and returns clean, structured JSON.  
  
---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Vercel Edge (Node.js 18+) |
| Framework | [Hono](https://hono.dev/) |
| Language | TypeScript |
| Scraping | Regex + custom `HtmlDoc` class (no Puppeteer, no Cheerio) |

---

## Base URL

```
https://your-deployment.vercel.app/api
```

All routes are prefixed with `/api`.

---

## Response Envelope

Every endpoint returns the same top-level envelope:

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

On error:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

---

## Endpoints

### 1. `GET /api/health`

Health check.

**Response**
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2026-02-21T10:00:00.000Z"
}
```

---

### 2. `GET /api/extra`

Site-wide metadata — logo, navigation menu, sidebar popular/new series, full genre list with counts, release years, and footer links. Useful as a one-time bootstrap call for any frontend.

**Response**
```json
{
  "success": true,
  "data": {
    "logo": {
      "url":     "https://watchhentai.net/logo.svg",
      "alt":     "Watch Hentai",
      "homeUrl": "https://watchhentai.net"
    },
    "menu": [
      { "name": "Home",       "url": "https://watchhentai.net/",                 "title": "Watch Hentai" },
      { "name": "Trending",   "url": "https://watchhentai.net/trending/",         "title": "Trending Hentai" },
      { "name": "Series",     "url": "https://watchhentai.net/series/",           "title": "Watch Hentai Series" },
      { "name": "Episodes",   "url": "https://watchhentai.net/videos/",           "title": "Hentai Episodes" },
      { "name": "Uncensored", "url": "https://watchhentai.net/genre/uncensored/", "title": "Watch Uncensored Hentai" },
      { "name": "2025",       "url": "https://watchhentai.net/release/2025/",     "title": "Watch Hentai of 2025" },
      { "name": "Calendar",   "url": "https://watchhentai.net/calendar/",         "title": "Hentai Calendar" }
    ],
    "menuGenres": [
      { "name": "3D",       "slug": "3d",       "url": "https://watchhentai.net/genre/3d/",       "title": "3D Hentai" },
      { "name": "Ahegao",   "slug": "ahegao",   "url": "https://watchhentai.net/genre/ahegao/",   "title": "Ahegao Hentai" },
      { "name": "Anal",     "slug": "anal",     "url": "https://watchhentai.net/genre/anal/",     "title": "Anal Hentai" }
    ],
    "popular": [
      {
        "id":     "1014",
        "title":  "Ane wa Yanmama Junyuu-chuu",
        "url":    "https://watchhentai.net/series/ane-wa-yanmama-junyuu-chuu-id-01/",
        "poster": "https://watchhentai.net/timthumb/sidebar.php?src=https://watchhentai.net/uploads/2022/5/.../poster.jpg",
        "rating": "7.5",
        "year":   "2020"
      }
    ],
    "newSeries": [
      {
        "id":     "60827",
        "title":  "Seikou Senki Pony Celes",
        "url":    "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
        "poster": "https://watchhentai.net/timthumb/sidebar.php?src=https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/poster.jpg",
        "rating": "8.2",
        "year":   ""
      }
    ],
    "genres": [
      { "name": "3D",           "slug": "3d",           "url": "https://watchhentai.net/genre/3d/",           "count": 40 },
      { "name": "Ahegao",       "slug": "ahegao",       "url": "https://watchhentai.net/genre/ahegao/",       "count": 201 },
      { "name": "Large Breasts","slug": "large-breasts","url": "https://watchhentai.net/genre/large-breasts/","count": 527 },
      { "name": "School Girls", "slug": "school-girls", "url": "https://watchhentai.net/genre/school-girls/", "count": 639 }
    ],
    "years": ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "...", "1984"],
    "partnerLinks": [
      { "name": "Hentai World", "url": "https://hentaiworld.tv/" },
      { "name": "Anime Porn",   "url": "https://www.xanimeporn.com/" }
    ],
    "footerLinks": [
      { "name": "Contact", "url": "https://watchhentai.net/contact/" }
    ],
    "copyright": "WatchHentai.net © 2025"
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/"
  }
}
```

---

### 3. `GET /api/home`

Home page — featured sliders, new episodes, trending, and all section modules.

**Response**
```json
{
  "success": true,
  "data": {
    "featured": [
      {
        "title":    "Seikou Senki Pony Celes",
        "url":      "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
        "poster":   "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/poster.jpg",
        "backdrop": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/backdrop.jpg",
        "rating":   "8.2",
        "year":     "2026",
        "genres":   ["Censored", "Large Breasts"],
        "synopsis": "Story synopsis text here..."
      }
    ],
    "newEpisodes": [
      {
        "title":     "Seikou Senki Pony Celes – Episode 1",
        "url":       "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
        "thumbnail": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
        "date":      "Feb. 21, 2026"
      }
    ],
    "trending": [
      {
        "title":  "Series Title",
        "url":    "https://watchhentai.net/series/series-slug-id-01/",
        "poster": "https://watchhentai.net/uploads/.../poster.jpg",
        "rating": "7.5",
        "year":   "2022"
      }
    ],
    "sections": [
      {
        "title": "Latest Episodes",
        "items": [
          { "title": "...", "url": "...", "thumbnail": "..." }
        ]
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/"
  }
}
```

---

### 4. `GET /api/trending`
### `GET /api/trending?page=2`
### `GET /api/trending/:page`

Trending series list with pagination.

**Response**
```json
{
  "success": true,
  "data": {
    "page":       1,
    "totalPages": 12,
    "items": [
      {
        "title":    "Series Title",
        "url":      "https://watchhentai.net/series/series-slug-id-01/",
        "poster":   "https://watchhentai.net/uploads/.../poster.jpg",
        "rating":   "7.5",
        "year":     "2022",
        "censored": "censored"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/trending/"
  }
}
```

---

### 5. `GET /api/videos`
### `GET /api/videos?page=2`
### `GET /api/videos/:page`

Latest episode videos list with pagination.

**Response**
```json
{
  "success": true,
  "data": {
    "page":       1,
    "totalPages": 50,
    "items": [
      {
        "title":     "Seikou Senki Pony Celes – Episode 1",
        "url":       "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
        "thumbnail": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
        "date":      "Feb. 21, 2026",
        "views":     "1234"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/videos/"
  }
}
```

---

### 6. `GET /api/uncensored`
### `GET /api/uncensored?page=2`
### `GET /api/uncensored/:page`

Uncensored series list with pagination. Same shape as `/api/trending`.

**Response**
```json
{
  "success": true,
  "data": {
    "page":       1,
    "totalPages": 8,
    "items": [
      {
        "title":    "Series Title",
        "url":      "https://watchhentai.net/series/series-slug-id-01/",
        "poster":   "https://watchhentai.net/uploads/.../poster.jpg",
        "rating":   "7.2",
        "year":     "2024",
        "censored": "uncensored"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/genre/uncensored/"
  }
}
```

---

### 7. `GET /api/release/:year`
### `GET /api/release/:year?page=2`
### `GET /api/release/:year/:page`

Series released in a specific year. Year must be between `1984` and `2099`.

**Example:** `GET /api/release/2026`

**Response**
```json
{
  "success": true,
  "data": {
    "year":       "2026",
    "page":       1,
    "totalPages": 3,
    "items": [
      {
        "title":    "Seikou Senki Pony Celes",
        "url":      "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
        "poster":   "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/poster.jpg",
        "rating":   "8.2",
        "year":     "2026",
        "censored": "censored"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/release/2026/"
  }
}
```

---

### 8. `GET /api/calendar`

Release calendar grouped by month, showing upcoming and recent episode schedules.

**Response**
```json
{
  "success": true,
  "data": {
    "months": [
      {
        "month": "February 2026",
        "episodes": [
          {
            "date":         "21",
            "seriesTitle":  "Seikou Senki Pony Celes",
            "episodeTitle": "Episode 1",
            "url":          "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
            "thumbnail":    "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg"
          }
        ]
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/calendar/"
  }
}
```

---

### 9. `GET /api/search?q=keyword`
### `GET /api/search?q=keyword&page=2`

Search for series or episodes. Returns an empty `items` array (not an error) when no results are found.

**Query Parameters**

| Param | Required | Description |
|---|---|---|
| `q` | ✅ | Search keyword |
| `page` | ❌ | Page number (default: `1`) |

**Response — with results**
```json
{
  "success": true,
  "data": {
    "query":      "kanojo",
    "page":       1,
    "totalPages": 2,
    "total":      18,
    "items": [
      {
        "title":    "Kanojo ga Separate o Matou Riyuu",
        "url":      "https://watchhentai.net/series/kanojo-ga-separate-o-matou-riyuu-id-01/",
        "poster":   "https://watchhentai.net/uploads/2025/kanojo-ga-separate-o-matou-riyuu/poster.jpg",
        "rating":   "6.2",
        "year":     "2025",
        "censored": "censored"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/?s=kanojo"
  }
}
```

**Response — no results**
```json
{
  "success": true,
  "data": {
    "query":      "Chhhhhhhh",
    "page":       1,
    "totalPages": 0,
    "total":      0,
    "items":      []
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/?s=Chhhhhhhh"
  }
}
```

---

### 10. `GET /api/genres`

Complete flat list of all genres scraped from the series listing page, with series counts.

**Response**
```json
{
  "success": true,
  "data": [
    { "name": "3D",           "slug": "3d",           "url": "https://watchhentai.net/genre/3d/",           "count": 40 },
    { "name": "Ahegao",       "slug": "ahegao",       "url": "https://watchhentai.net/genre/ahegao/",       "count": 201 },
    { "name": "Anal",         "slug": "anal",         "url": "https://watchhentai.net/genre/anal/",         "count": 348 },
    { "name": "Large Breasts","slug": "large-breasts","url": "https://watchhentai.net/genre/large-breasts/","count": 527 },
    { "name": "Rape",         "slug": "rape",         "url": "https://watchhentai.net/genre/rape/",         "count": 533 },
    { "name": "School Girls", "slug": "school-girls", "url": "https://watchhentai.net/genre/school-girls/", "count": 639 }
  ],
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/series/"
  }
}
```

---

### 11. `GET /api/genre/:slug`
### `GET /api/genre/:slug?page=2`
### `GET /api/genre/:slug/:page`

Series list filtered by a single genre slug. Same item shape as `/api/trending`.

**Example:** `GET /api/genre/uncensored`

**Response**
```json
{
  "success": true,
  "data": {
    "genre":      "Uncensored",
    "slug":       "uncensored",
    "page":       1,
    "totalPages": 18,
    "items": [
      {
        "title":    "Series Title",
        "url":      "https://watchhentai.net/series/series-slug-id-01/",
        "poster":   "https://watchhentai.net/uploads/.../poster.jpg",
        "rating":   "8.7",
        "year":     "2025",
        "censored": "uncensored"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/genre/uncensored/"
  }
}
```

---

### 12. `GET /api/series`
### `GET /api/series?page=2`
### `GET /api/series/:page`

Paginated list of all series with grid card data.

**Response**
```json
{
  "success": true,
  "data": {
    "page":       1,
    "totalPages": 80,
    "items": [
      {
        "title":    "Seikou Senki Pony Celes",
        "url":      "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
        "poster":   "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/poster.jpg",
        "rating":   "8.2",
        "year":     "2026",
        "censored": "censored",
        "episodes": "1"
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/series/"
  }
}
```

---

### 13. `GET /api/series/:slug`

Full series detail page. Auto-detected when `:slug` contains letters (not a pure page number).

**Example:** `GET /api/series/seikou-senki-pony-celes-id-01`

**Response**
```json
{
  "success": true,
  "data": {
    "id":          "60827",
    "slug":        "seikou-senki-pony-celes-id-01",
    "title":       "Seikou Senki Pony Celes",
    "url":         "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
    "poster":      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/poster.jpg",
    "backdrop":    "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/backdrop.jpg",
    "rating":      "8.2",
    "votes":       "45",
    "year":        "2026",
    "status":      "Ongoing",
    "studio":      "Studio Name",
    "censored":    "censored",
    "synopsis":    "Full synopsis text here...",
    "genres": [
      { "name": "Censored",      "url": "https://watchhentai.net/genre/censored/" },
      { "name": "Large Breasts", "url": "https://watchhentai.net/genre/large-breasts/" }
    ],
    "episodes": [
      {
        "number":    1,
        "title":     "Episode 1",
        "url":       "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
        "thumbnail": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
        "date":      "Feb. 21, 2026"
      }
    ],
    "related": [
      {
        "title":  "Related Series Title",
        "url":    "https://watchhentai.net/series/related-series-id-01/",
        "poster": "https://watchhentai.net/uploads/.../poster.jpg"
      }
    ],
    "backdrops": [
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-1.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-2.jpg"
    ],
    "datePublished": "2026-02-02T19:50:25+00:00",
    "dateModified":  "2026-02-06T00:59:42+00:00"
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/"
  }
}
```

---

### 14. `GET /api/watch/:slug`
### `GET /api/watch?slug=episode-slug`

Episode watch / stream page. Makes **two requests** internally — the main watch page and the embedded jwplayer iframe — to extract all available quality video sources.

**Example:** `GET /api/watch/seikou-senki-pony-celes-episode-1-id-01`

**Response**
```json
{
  "success": true,
  "data": {
    "id":           "60829",
    "slug":         "seikou-senki-pony-celes-episode-1-id-01",
    "title":        "Seikou Senki Pony Celes – Episode 1",
    "episodeTitle": "Episode 1",
    "seriesTitle":  "Seikou Senki Pony Celes",
    "url":          "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
    "player": {
      "originalSrc":  "https://watchhentai.net/jwplayer/?source=https%3A%2F%2Fhstorage.xyz%2F...&id=60829&type=mp4&quality=1080p,1440p",
      "alternateSrc": "https://watchhentai.net/plyr/?source=https%3A%2F%2Fhstorage.xyz%2F...&id=60829&type=mp4",
      "src":          "https://hstorage.xyz/files/S/seikou-senki-pony-celes/seikou-senki-pony-celes-1.mp4",
      "sources": [
        { "src": "https://hstorage.xyz/.../seikou-senki-pony-celes-1_1440p.mp4", "type": "video/mp4", "label": "1440p" },
        { "src": "https://hstorage.xyz/.../seikou-senki-pony-celes-1_1080p.mp4", "type": "video/mp4", "label": "1080p" },
        { "src": "https://hstorage.xyz/.../seikou-senki-pony-celes-1_720p.mp4",  "type": "video/mp4", "label": "720p"  }
      ],
      "type":        "mp4",
      "duration":    "PT24M50S",
      "thumbnail":   "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
      "postId":      "60829",
      "downloadUrl": "https://watchhentai.net/download/seikou-senki-pony-celes-episode-1-id-01/"
    },
    "thumbnail":    "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
    "uploadDate":   "2026-02-21T00:00:00+00:00",
    "views":        "1234",
    "seriesUrl":    "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
    "seriesPoster": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/poster.jpg",
    "censored":     "censored",
    "genres": [
      { "name": "Censored",      "url": "https://watchhentai.net/genre/censored/" },
      { "name": "Large Breasts", "url": "https://watchhentai.net/genre/large-breasts/" }
    ],
    "synopsis":    "Synopsis text...",
    "prevEpisode": null,
    "nextEpisode": {
      "title": "Episode 2",
      "url":   "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-2-id-01/"
    },
    "episodes": [
      {
        "number":    1,
        "title":     "Episode 1",
        "url":       "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
        "thumbnail": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
        "date":      "Feb. 21, 2026",
        "isCurrent": true
      },
      {
        "number":    2,
        "title":     "Episode 2",
        "url":       "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-2-id-01/",
        "thumbnail": "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/2.jpg",
        "date":      "Mar. 07, 2026",
        "isCurrent": false
      }
    ]
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/"
  }
}
```

#### `player` object fields

| Field | Type | Description |
|---|---|---|
| `src` | `string` | Default / fallback direct video URL from the `jw` object |
| `sources` | `array` | All quality variants — use for a quality picker UI |
| `sources[].src` | `string` | Direct streamable MP4 URL |
| `sources[].type` | `string` | Always `"video/mp4"` |
| `sources[].label` | `string` | Quality label e.g. `"1440p"`, `"1080p"`, `"720p"` |
| `duration` | `string` | ISO 8601 duration e.g. `"PT24M50S"` = 24 min 50 sec |
| `type` | `string` | Container hint: `"mp4"` or `"m3u8"` |
| `downloadUrl` | `string` | Link to the `/download/` page for this episode |
| `originalSrc` | `string` | Full jwplayer iframe URL |
| `alternateSrc` | `string` | Alternate plyr iframe URL |

---

### 15. `GET /api/download/:slug`
### `GET /api/download?slug=episode-slug`

Episode download page. Returns direct CDN download links for all quality variants, preview screenshots, navigation, and social data.

**Example:** `GET /api/download/seikou-senki-pony-celes-episode-1-id-01`

**Response**
```json
{
  "success": true,
  "data": {
    "id":           "60829",
    "slug":         "seikou-senki-pony-celes-episode-1-id-01",
    "title":        "Seikou Senki Pony Celes – Episode 1",
    "episodeTitle": "Episode 1",
    "seriesTitle":  "Seikou Senki Pony Celes",
    "url":          "https://watchhentai.net/download/seikou-senki-pony-celes-episode-1-id-01/",
    "watchUrl":     "https://watchhentai.net/videos/seikou-senki-pony-celes-episode-1-id-01/",
    "downloadUrl":  "https://watchhentai.net/download/seikou-senki-pony-celes-episode-1-id-01/",
    "thumbnail":    "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1.jpg",
    "previews": [
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-1.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-2.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-3.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-4.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-5.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-6.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-7.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-8.jpg",
      "https://watchhentai.net/uploads/2026/seikou-senki-pony-celes/1-9.jpg"
    ],
    "sources": [
      { "url": "https://xupload.org/download/S/seikou-senki-pony-celes/seikou-senki-pony-celes-1_1440p.mp4", "label": "1440p", "host": "xupload.org" },
      { "url": "https://xupload.org/download/S/seikou-senki-pony-celes/seikou-senki-pony-celes-1_1080p.mp4", "label": "1080p", "host": "xupload.org" },
      { "url": "https://xupload.org/download/S/seikou-senki-pony-celes/seikou-senki-pony-celes-1_720p.mp4",  "label": "720p",  "host": "xupload.org" }
    ],
    "seriesUrl":   "https://watchhentai.net/series/seikou-senki-pony-celes-id-01/",
    "prevEpisode": null,
    "nextEpisode": {
      "title": "Episode 2",
      "url":   "https://watchhentai.net/download/seikou-senki-pony-celes-episode-2-id-01/"
    },
    "shareCount": "86",
    "related": [
      {
        "title":  "Tsugou no Yoi Sexfriend?",
        "url":    "https://watchhentai.net/series/tsugou-no-yoi-sexfriend-id-01/",
        "poster": "https://watchhentai.net/uploads/2022/11/tsugou-no-yoi-sexfriend/poster.jpg"
      }
    ],
    "datePublished": "2026-02-02T19:50:25+00:00",
    "dateModified":  "2026-02-06T00:59:42+00:00",
    "description":   "Watch Seikou Senki Pony Celes - Episode 1 online free download HD..."
  },
  "meta": {
    "scrapedAt": "2026-02-21T10:00:00.000Z",
    "source":    "https://watchhentai.net/download/seikou-senki-pony-celes-episode-1-id-01/"
  }
}
```

#### `/api/watch` vs `/api/download` — source comparison

| Endpoint | Field | CDN Host | Use case |
|---|---|---|---|
| `/api/watch` | `player.sources[].src` | `hstorage.xyz` | Direct in-browser video streaming |
| `/api/download` | `sources[].url` | `xupload.org` | File download via CDN download page |

---

## Route Summary Table

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/extra` | Logo, menu, genres, years, popular/new, footer |
| `GET` | `/api/home` | Home page featured content |
| `GET` | `/api/trending` | Trending series — page 1 |
| `GET` | `/api/trending?page=N` | Trending series — page N |
| `GET` | `/api/trending/:page` | Trending series — page N (path) |
| `GET` | `/api/videos` | Latest episodes — page 1 |
| `GET` | `/api/videos?page=N` | Latest episodes — page N |
| `GET` | `/api/videos/:page` | Latest episodes — page N (path) |
| `GET` | `/api/uncensored` | Uncensored series — page 1 |
| `GET` | `/api/uncensored?page=N` | Uncensored series — page N |
| `GET` | `/api/uncensored/:page` | Uncensored series — page N (path) |
| `GET` | `/api/release/:year` | Series by release year — page 1 |
| `GET` | `/api/release/:year?page=N` | Series by release year — page N |
| `GET` | `/api/release/:year/:page` | Series by release year — page N (path) |
| `GET` | `/api/calendar` | Release calendar by month |
| `GET` | `/api/search?q=keyword` | Search — page 1 |
| `GET` | `/api/search?q=keyword&page=N` | Search — page N |
| `GET` | `/api/genres` | All genres with series counts |
| `GET` | `/api/genre/:slug` | Series filtered by genre — page 1 |
| `GET` | `/api/genre/:slug?page=N` | Series filtered by genre — page N |
| `GET` | `/api/genre/:slug/:page` | Series filtered by genre — page N (path) |
| `GET` | `/api/series` | All series list — page 1 |
| `GET` | `/api/series?page=N` | All series list — page N |
| `GET` | `/api/series/:page` | All series list — page N (path, digits only) |
| `GET` | `/api/series/:slug` | Series detail (auto-detected by slug) |
| `GET` | `/api/watch/:slug` | Episode stream + all quality sources |
| `GET` | `/api/watch?slug=episode-slug` | Episode stream (query param) |
| `GET` | `/api/download/:slug` | Episode download links + previews |
| `GET` | `/api/download?slug=episode-slug` | Episode download (query param) |

---

## Error Responses

### 400 Bad Request
Returned when a required parameter is missing.
```json
{
  "success": false,
  "error": "Missing slug. Use /api/watch/{slug} or /api/watch?slug={slug}"
}
```

### 422 Unprocessable Entity
Returned for invalid parameter values (e.g. out-of-range year).
```json
{
  "success": false,
  "error": "Invalid year. Must be between 1984 and 2099."
}
```

### 404 Not Found
Returned when no route matches the request.
```json
{
  "success": false,
  "error": "Route not found",
  "available": [
    "GET /api/home",
    "GET /api/trending",
    "..."
  ]
}
```

### 500 Internal Server Error
Returned when the upstream fetch or parse fails.
```json
{
  "success": false,
  "error": "fetch failed"
}
```

---

## Project Structure

```
/
├── api/
│   └── [[...route]].ts           # Vercel Edge entry point
├── src/
│   ├── index.ts                  # Hono app + all route registrations
│   ├── config/
│   │   └── index.ts              # BASE_URL, default headers, timeouts
│   ├── lib/
│   │   ├── scraper.ts            # HtmlDoc class, fetchPage(), scrape* functions
│   │   └── format.ts             # cleanText(), resolveUrl(), normalizeThumbnail()
│   └── api/
│       └── pages/
│           ├── home.ts           # GET /api/home
│           ├── trending.ts       # GET /api/trending
│           ├── videos.ts         # GET /api/videos
│           ├── uncensored.ts     # GET /api/uncensored
│           ├── release.ts        # GET /api/release/:year
│           ├── calendar.ts       # GET /api/calendar
│           ├── search.ts         # GET /api/search
│           ├── genre.ts          # GET /api/genre/:slug
│           ├── series.ts         # GET /api/series (list + detail)
│           ├── watch.ts          # GET /api/watch/:slug
│           ├── download.ts       # GET /api/download/:slug
│           └── extra.ts          # GET /api/extra
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## Notes

- **No authentication** — all endpoints are public, no API key required.
- **CORS** — enabled on all routes (`*`).
- **Pretty JSON** — all responses are indented automatically.
- **Pagination** — `page` is accepted both as a query param (`?page=2`) and as a path segment (`/2`). Default is always `1`.
- **Slug detection** — `/api/series/:slug` auto-routes to list vs detail by checking if the segment is digits-only (list page) or contains letters (detail).
- **Two-request endpoints** — `/api/watch` makes 2 HTTP requests (main page + jwplayer iframe) to extract multi-quality sources. Expect ~300–600ms extra latency vs single-request endpoints.
- **`isCurrent`** — in the `/api/watch` episodes list, the currently playing episode has `"isCurrent": true` so you can highlight it in a UI without re-parsing the URL.
- **`censored` field** — possible values are `"censored"`, `"uncensored"`, or `""` (unknown).
- **`duration`** — returned as an ISO 8601 duration string (`PT24M50S`). Parse with `luxon`, `dayjs`, or the native `Temporal` API.
