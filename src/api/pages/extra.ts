import { Hono } from "hono";
import { fetchPage, HtmlDoc } from "../../lib/scraper";
import { cleanText, resolveUrl } from "../../lib/format";

const extra = new Hono();

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SiteGenre {
  name:  string;
  slug:  string;
  url:   string;
  count: number;
}

export interface MenuGenre {
  name:  string;
  slug:  string;
  url:   string;
  title: string;
}

export interface MenuItem {
  name:  string;
  url:   string;
  title: string;
}

export interface SidebarSeriesItem {
  id:     string;
  title:  string;
  url:    string;
  poster: string;
  rating: string;
  year:   string;
}

export interface SiteExtraData {
  logo: {
    url:     string;
    alt:     string;
    homeUrl: string;
  };
  menu:         MenuItem[];
  menuGenres:   MenuGenre[];
  popular:      SidebarSeriesItem[];
  newSeries:    SidebarSeriesItem[];
  genres:       SiteGenre[];
  years:        string[];
  partnerLinks: { name: string; url: string }[];
  footerLinks:  { name: string; url: string }[];
  copyright:    string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Low-level helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract every <article>...</article> block from a raw HTML string.
 * Uses simple indexOf scanning — articles never nest so this is reliable.
 */
function extractArticles(html: string): string[] {
  const results: string[] = [];
  const OPEN  = "<article";
  const CLOSE = "</article>";
  let pos = 0;
  while (pos < html.length) {
    const start = html.toLowerCase().indexOf(OPEN.toLowerCase(), pos);
    if (start === -1) break;
    const end = html.toLowerCase().indexOf(CLOSE.toLowerCase(), start);
    if (end === -1) break;
    results.push(html.slice(start, end + CLOSE.length));
    pos = end + CLOSE.length;
  }
  return results;
}

/**
 * Unwrap a timthumb PHP resizer URL to the real CDN URL.
 *   /timthumb/sidebar.php?src=https://...  →  https://...
 */
function unwrapTimthumb(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/[?&]src=([^&]+)/i);
  if (!m) return raw;
  try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
}

/**
 * Extract HTML between two string markers (startMarker inclusive, up to endMarker).
 * Returns "" if either marker is not found.
 */
function sliceBetween(html: string, startMarker: string, endMarker: string): string {
  const si = html.indexOf(startMarker);
  if (si === -1) return "";
  const ei = html.indexOf(endMarker, si + startMarker.length);
  if (ei === -1) return html.slice(si);
  return html.slice(si, ei + endMarker.length);
}

/**
 * Parse sidebar series articles (popular / new sections).
 *
 * ROOT CAUSE OF EMPTY RESULTS:
 *   The old regex  /<div id="popular"[^>]*>([\s\S]*?)<\/div>\s*<div id="new"/i
 *   is lazy (*?) so it stops at the FIRST </div> inside the section — which is
 *   the closing tag of  <div class="image">  inside the first <article>.
 *   Result: captured HTML contains zero articles.
 *
 * FIX:
 *   Use extractArticles() (simple indexOf scan between known unique boundaries)
 *   instead of a lazy regex that breaks on nested elements.
 */
function parseSidebarSection(sectionHtml: string): SidebarSeriesItem[] {
  const items: SidebarSeriesItem[] = [];
  for (const artHtml of extractArticles(sectionHtml)) {
    // id
    const idM = artHtml.match(/\bid=["']post-(\d+)["']/i);
    const id  = idM ? idM[1] : "";

    // url — first <a href>
    const hrefM = artHtml.match(/<a\s[^>]*\bhref=["']([^"']+)["']/i);
    const url   = hrefM ? resolveUrl(hrefM[1]) : "";
    if (!url) continue;

    // poster — data-src (lazy-loaded), unwrap timthumb
    const dataSrcM = artHtml.match(/\bdata-src=["']([^"']+)["']/i);
    const poster   = dataSrcM ? unwrapTimthumb(dataSrcM[1]) : "";

    // title — <h3>
    const h3M  = artHtml.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    let title  = h3M ? cleanText(h3M[1]) : "";
    if (!title) {
      const altM = artHtml.match(/\balt=["']([^"']+)["']/i);
      title = altM ? cleanText(altM[1]) : "";
    }

    // rating — <b>7.5</b>
    const ratingM = artHtml.match(/<b[^>]*>([^<]+)<\/b>/i);
    const rating  = ratingM ? cleanText(ratingM[1]) : "";

    // year — <span class="year">2020</span>
    const yearM = artHtml.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>([^<]*)<\/span>/i);
    const year  = yearM ? cleanText(yearM[1]) : "";

    items.push({ id, title, url, poster, rating, year });
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════════════════════════

function parseSiteExtra(html: string): SiteExtraData {

  // ── Logo ──────────────────────────────────────────────────────────────────
  // <div class="logo"><a href="https://watchhentai.net">
  //   <img src='https://watchhentai.net/logo.svg' ... title='Watch Hentai' alt='Watch Hentai'/>
  // </a></div>
  let logoUrl  = "";
  let logoAlt  = "";
  let logoHome = "";
  const logoBlockM = html.match(
    /<div class="logo">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/i
  );
  if (logoBlockM) {
    logoHome = logoBlockM[1];
    const imgM = logoBlockM[2].match(/src='([^']+)'/i)
              ?? logoBlockM[2].match(/src="([^"]+)"/i);
    const altM = logoBlockM[2].match(/alt='([^']+)'/i)
              ?? logoBlockM[2].match(/alt="([^"]+)"/i);
    if (imgM) logoUrl = imgM[1];
    if (altM) logoAlt = altM[1];
  }

  // ── Main nav menu ─────────────────────────────────────────────────────────
  // The desktop nav lives inside:
  //   <ul id="main_header" class="main-header">…</ul>
  // which is inside <div class="menu-header-container"> → </div>
  // We extract the block between the unique id and the closing </div> of its parent.
  const menu:       MenuItem[]  = [];
  const menuGenres: MenuGenre[] = [];

  const mainHeaderM = html.match(
    /<ul id="main_header" class="main-header">([\s\S]*?)<\/ul>\s*<\/div>/i
  );
  if (mainHeaderM) {
    const menuHtml = mainHeaderM[1];

    // Top-level <li> items
    const topLiRe = /<li[^>]*class="[^"]*menu-item[^"]*"[^>]*>\s*\n?<a href="([^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi;
    let liM: RegExpExecArray | null;
    while ((liM = topLiRe.exec(menuHtml)) !== null) {
      const rawName = cleanText(liM[3].replace(/<[^>]+>/g, " "));
      if (rawName) {
        menu.push({
          name:  rawName,
          url:   resolveUrl(liM[1]),
          title: liM[2] ?? rawName,
        });
      }
    }

    // Sub-menu genres
    const subMenuM = menuHtml.match(/<ul class="sub-menu">([\s\S]*?)<\/ul>/i);
    if (subMenuM) {
      const subRe = /<a href="([^"]+)" title="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = subRe.exec(subMenuM[1])) !== null) {
        const name = cleanText(sm[3]);
        const url  = sm[1];
        const slug = url.replace(/.*\/genre\//, "").replace(/\/$/, "");
        menuGenres.push({ name, slug, url: resolveUrl(url), title: sm[2] });
      }
    }
  }

  // ── Sidebar: Popular & New tabs ───────────────────────────────────────────
  //
  // HTML structure (actual, from real page):
  //
  //   <aside id="dtw_content_views-2" class="widget doothemes_widget">
  //     <div id="popular" class="dtw_content dt_views_count">
  //       <article class="w_item_b" id="post-1014"> ... </article>
  //       ... (10 articles)
  //     </div>
  //     <div id="new" style="display: none;" class="dtw_content dt_views_count">
  //       <article class="w_item_b" id="post-60827"> ... </article>
  //       ... (10 articles)
  //     </div>
  //   </aside>
  //
  // ROOT CAUSE: old code used a lazy regex  /<div id="popular"[^>]*>([\s\S]*?)<\/div>/
  // which stops at the FIRST </div> encountered — that's the closing </div> of
  // <div class="image"> inside the very first <article>. Zero articles captured.
  //
  // FIX: Use sliceBetween() with unique string anchors to get the full section,
  // then extractArticles() to pull out each <article>...</article> block.

  // Popular: from '<div id="popular"' up to (but not including) '<div id="new"'
  const popularSection = sliceBetween(html, '<div id="popular"', '<div id="new"');
  const popular = parseSidebarSection(popularSection);

  // New: from '<div id="new"' up to '</aside>'
  const newSection = sliceBetween(html, '<div id="new"', "</aside>");
  const newSeries = parseSidebarSection(newSection);

  // ── Full genre list ───────────────────────────────────────────────────────
  //
  // HTML structure (actual):
  //   <div class="dt_mainmeta">
  //     <nav class="genres">
  //       <h2 class="widget-title">Genres</h2>
  //       <ul class="genres scrolling">
  //         <li class="cat-item cat-item-297">
  //           <a href="https://watchhentai.net/genre/3d/">3D</a>
  //           <i>40</i>
  //         </li>
  //         ...
  //       </ul>
  //     </nav>
  //   </div>
  //
  // ROOT CAUSE: old regex  /<nav class="genres">([\s\S]*?)<\/nav>/i  uses lazy *?
  // which stops at the first </nav>. But between the opening <nav> tag and the
  // real </nav> there are many nested elements whose closing tags don't include
  // </nav>, so actually the match is correct here — BUT the actual page has TWO
  // <div class="dt_mainmeta"> blocks: one for genres, one for releases.  The
  // issue is that some builds of the regex engine may match the wrong one, or
  // the <ul class="genres scrolling"> content is so long that the lazy match
  // terminates prematurely on a false positive somewhere inside.
  //
  // FIX: Extract the genres <ul> content using a two-step approach:
  //   1. Find the unique '<ul class="genres scrolling">' open tag.
  //   2. Scan forward counting <ul>/<ul> pairs to find the matching </ul>.
  //      Then run the per-<li> regex on that bounded content.

  const genres: SiteGenre[] = [];

  // Step 1: find genre ul start
  const genreUlMarker = '<ul class="genres scrolling">';
  const genreUlStart  = html.indexOf(genreUlMarker);
  if (genreUlStart !== -1) {
    // Step 2: find matching </ul> by counting nesting
    let depth = 1;
    let pos   = genreUlStart + genreUlMarker.length;
    while (pos < html.length && depth > 0) {
      const nextOpen  = html.toLowerCase().indexOf("<ul", pos);
      const nextClose = html.toLowerCase().indexOf("</ul>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 3;
      } else {
        depth--;
        if (depth > 0) pos = nextClose + 5;
        else pos = nextClose; // we'll slice up to here
      }
    }
    const genreUlHtml = html.slice(genreUlStart + genreUlMarker.length, pos);

    // Parse each <li class="cat-item ..."> entry
    const genreRe = /<li[^>]*class="cat-item[^"]*"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*(?:<i>(\d+)<\/i>)?/gi;
    let gm: RegExpExecArray | null;
    while ((gm = genreRe.exec(genreUlHtml)) !== null) {
      const url   = gm[1];
      const name  = cleanText(gm[2]);
      const count = gm[3] ? parseInt(gm[3], 10) : 0;
      const slug  = url.replace(/.*\/genre\//, "").replace(/\/$/, "");
      genres.push({ name, slug, url: resolveUrl(url), count });
    }
  }

  // ── Release years ─────────────────────────────────────────────────────────
  //
  // HTML structure (actual):
  //   <div class="dt_mainmeta">
  //     <nav class="releases">
  //       <h2>Release year</h2>
  //       <ul class="releases scrolling">
  //         <li><a href="https://watchhentai.net/release/2026/">2026</a></li>
  //         ...
  //       </ul>
  //     </nav>
  //   </div>
  //
  // ROOT CAUSE: same lazy-regex issue as genres. The regex grabs content up to
  // the first </nav> but the captures can terminate early.
  //
  // FIX: Same nesting-aware approach — find '<ul class="releases scrolling">',
  // scan to the matching </ul>, then parse year links within that bounded range.

  const years: string[] = [];

  const relUlMarker = '<ul class="releases scrolling">';
  const relUlStart  = html.indexOf(relUlMarker);
  if (relUlStart !== -1) {
    const relCloseIdx = html.toLowerCase().indexOf("</ul>", relUlStart + relUlMarker.length);
    const relUlHtml   = relCloseIdx !== -1
      ? html.slice(relUlStart + relUlMarker.length, relCloseIdx)
      : html.slice(relUlStart + relUlMarker.length);

    const yearRe = /<a href="[^"]+\/release\/(\d{4})\/"[^>]*>/gi;
    let ym: RegExpExecArray | null;
    while ((ym = yearRe.exec(relUlHtml)) !== null) {
      years.push(ym[1]);
    }
  }

  // ── Footer partner links ──────────────────────────────────────────────────
  // <div class="lista-patners">Friends » <a href="...">Name</a> ...</div>
  const partnerLinks: { name: string; url: string }[] = [];
  const partnerBlockM = html.match(/<div class="lista-patners">([\s\S]*?)<\/div>/i);
  if (partnerBlockM) {
    const pRe = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pRe.exec(partnerBlockM[1])) !== null) {
      partnerLinks.push({ name: cleanText(pm[2]), url: pm[1] });
    }
  }

  // ── Footer nav links ──────────────────────────────────────────────────────
  // <ul id="menu-footer" class="menu"><li ...><a href="...">Contact</a></li></ul>
  const footerLinks: { name: string; url: string }[] = [];
  const footerMenuM = html.match(/<ul id="menu-footer"[^>]*>([\s\S]*?)<\/ul>/i);
  if (footerMenuM) {
    const fRe = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fRe.exec(footerMenuM[1])) !== null) {
      footerLinks.push({ name: cleanText(fm[2]), url: fm[1] });
    }
  }

  // ── Copyright ─────────────────────────────────────────────────────────────
  // <div class="copy"><a href="/">WatchHentai.net</a> © 2025</div>
  const copyM = html.match(/<div class="copy">([\s\S]*?)<\/div>/i);
  const copyright = copyM
    ? cleanText(copyM[1].replace(/<[^>]+>/g, " "))
    : "";

  return {
    logo: { url: logoUrl, alt: logoAlt, homeUrl: logoHome },
    menu,
    menuGenres,
    popular,
    newSeries,
    genres,
    years,
    partnerLinks,
    footerLinks,
    copyright,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════════

async function handleExtra(c: any) {
  try {
    const html = await fetchPage("/");
    const data = parseSiteExtra(html);
    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source:    "https://watchhentai.net/",
      },
    });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes  —  GET /api/extra
// ═══════════════════════════════════════════════════════════════════════════════

extra.get("/", async (c) => handleExtra(c));

export default extra;
