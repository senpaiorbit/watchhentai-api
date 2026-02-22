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
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract every <article>...</article> block using simple indexOf.
 * Articles never nest so this is always reliable.
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
 * Unwrap timthumb PHP resizer URL → real CDN URL.
 *   /timthumb/sidebar.php?src=https://...  →  https://...
 */
function unwrapTimthumb(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/[?&]src=([^&]+)/i);
  if (!m) return raw;
  try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
}

/**
 * Parse sidebar series items from a block of HTML that contains <article> tags.
 * Works for both the "popular" and "new" sections.
 */
function parseSidebarSection(sectionHtml: string): SidebarSeriesItem[] {
  const items: SidebarSeriesItem[] = [];
  for (const artHtml of extractArticles(sectionHtml)) {
    const idM    = artHtml.match(/\bid=["']post-(\d+)["']/i);
    const hrefM  = artHtml.match(/<a\s[^>]*\bhref=["']([^"']+)["']/i);
    if (!hrefM) continue;

    const dataSrcM = artHtml.match(/\bdata-src=["']([^"']+)["']/i);
    const h3M      = artHtml.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const altM     = artHtml.match(/\balt=["']([^"']+)["']/i);
    const ratingM  = artHtml.match(/<b[^>]*>([^<]+)<\/b>/i);
    const yearM    = artHtml.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>([^<]*)<\/span>/i);

    items.push({
      id:     idM     ? idM[1]                         : "",
      title:  h3M     ? cleanText(h3M[1])              : altM ? cleanText(altM[1]) : "",
      url:    resolveUrl(hrefM[1]),
      poster: dataSrcM ? unwrapTimthumb(dataSrcM[1])   : "",
      rating: ratingM ? cleanText(ratingM[1])           : "",
      year:   yearM   ? cleanText(yearM[1])             : "",
    });
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════════════════════════

function parseSiteExtra(html: string): SiteExtraData {

  // ── Logo ──────────────────────────────────────────────────────────────────
  let logoUrl  = "";
  let logoAlt  = "";
  let logoHome = "";
  const logoBlockM = html.match(
    /<div class="logo">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/i
  );
  if (logoBlockM) {
    logoHome = logoBlockM[1];
    const imgM = logoBlockM[2].match(/src='([^']+)'/i) ?? logoBlockM[2].match(/src="([^"]+)"/i);
    const altM = logoBlockM[2].match(/alt='([^']+)'/i) ?? logoBlockM[2].match(/alt="([^"]+)"/i);
    if (imgM) logoUrl = imgM[1];
    if (altM) logoAlt = altM[1];
  }

  // ── Main nav menu ─────────────────────────────────────────────────────────
  // Use the DESKTOP header nav: <ul id="main_header" class="main-header">
  // This appears once in the <header id="header" class="main"> block.
  // We must stop before the mobile nav which also has id="main_header".
  const menu:       MenuItem[]  = [];
  const menuGenres: MenuGenre[] = [];

  // Extract only the desktop header block to avoid matching the mobile clone
  const desktopHeaderM = html.match(
    /<header[^>]+id="header"[^>]*>([\s\S]*?)<\/header>/i
  );
  const navSource = desktopHeaderM ? desktopHeaderM[1] : html;

  const mainHeaderM = navSource.match(
    /<ul id="main_header" class="main-header">([\s\S]*?)<\/ul>\s*<\/div>/i
  );
  if (mainHeaderM) {
    const menuHtml = mainHeaderM[1];

    // Top-level <li> items — only direct children, not sub-menu items
    // We extract only the first <a> of each top-level <li>
    const liBlocks = menuHtml.split(/<li\s/i).slice(1);
    for (const liBlock of liBlocks) {
      // Skip if this is a sub-menu item (it would be inside a <ul class="sub-menu">)
      const firstAnchorM = liBlock.match(/^[^>]*>\s*<a href="([^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/i);
      if (!firstAnchorM) continue;
      const rawName = cleanText(firstAnchorM[3].replace(/<[^>]+>/g, " "));
      if (!rawName) continue;
      menu.push({
        name:  rawName,
        url:   resolveUrl(firstAnchorM[1]),
        title: firstAnchorM[2] ?? rawName,
      });
    }

    // Sub-menu genres (inside <ul class="sub-menu">)
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
  // ROOT CAUSE OF EMPTY DATA:
  //   The sidebar with popular/new/genres/years DOES NOT EXIST on the home page (/).
  //   It only appears on interior pages like /trending/, /genre/*, search results, etc.
  //   So when extra.ts fetched "/", all four sections returned [].
  //
  // FIX: We now receive the HTML of an interior page (/trending/) which always
  //   has the full sidebar. See handleExtra() below which fetches /trending/.
  //
  // Structure in the actual HTML:
  //   <div id="popular" class="dtw_content dt_views_count">
  //     <article class="w_item_b" id="post-1014">...</article>
  //     ...10 articles...
  //   </div>
  //   <div id="new" style="display: none;" class="dtw_content dt_views_count">
  //     <article class="w_item_b" id="post-60827">...</article>
  //     ...10 articles...
  //   </div>
  //
  // We slice between unique string anchors to avoid lazy-regex nesting issues.

  // Popular: from start of '<div id="popular"' to start of '<div id="new"'
  const popStart  = html.indexOf('<div id="popular"');
  const newStart  = html.indexOf('<div id="new"');
  const asideEnd  = html.indexOf("</aside>", newStart > -1 ? newStart : popStart);

  const popularSection = popStart !== -1 && newStart !== -1
    ? html.slice(popStart, newStart)
    : "";
  const newSection = newStart !== -1 && asideEnd !== -1
    ? html.slice(newStart, asideEnd + "</aside>".length)
    : "";

  const popular   = parseSidebarSection(popularSection);
  const newSeries = parseSidebarSection(newSection);

  // ── Full genre list ───────────────────────────────────────────────────────
  //
  // Structure:
  //   <ul class="genres scrolling">
  //     <li class="cat-item cat-item-297">
  //       <a href="https://watchhentai.net/genre/3d/">3D</a>
  //       <i>40</i>
  //     </li>
  //     ...100+ items...
  //   </ul>
  //
  // ROOT CAUSE: Also only present on interior pages, not the home page.
  // FIX: Same page fetch fix as above. Extraction uses nesting-aware depth
  //      counter to find the real closing </ul>.

  const genres: SiteGenre[] = [];
  const GENRE_UL = '<ul class="genres scrolling">';
  const genreUlStart = html.indexOf(GENRE_UL);

  if (genreUlStart !== -1) {
    // Walk forward counting <ul>/<ul> to find the matching </ul>
    let depth = 1;
    let pos   = genreUlStart + GENRE_UL.length;
    let endPos = -1;
    while (pos < html.length && depth > 0) {
      const lo        = html.toLowerCase();
      const nextOpen  = lo.indexOf("<ul", pos);
      const nextClose = lo.indexOf("</ul>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 3;
      } else {
        depth--;
        if (depth === 0) endPos = nextClose;
        else pos = nextClose + 5;
      }
    }
    const genreUlHtml = endPos !== -1
      ? html.slice(genreUlStart + GENRE_UL.length, endPos)
      : html.slice(genreUlStart + GENRE_UL.length);

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
  // Structure:
  //   <ul class="releases scrolling">
  //     <li><a href="https://watchhentai.net/release/2026/">2026</a></li>
  //     ...
  //   </ul>
  //
  // ROOT CAUSE: Also only present on interior pages.
  // FIX: Same page fetch fix. Simple indexOf extraction (no nested <ul> here).

  const years: string[] = [];
  const REL_UL    = '<ul class="releases scrolling">';
  const relUlStart = html.indexOf(REL_UL);

  if (relUlStart !== -1) {
    const relCloseIdx = html.toLowerCase().indexOf("</ul>", relUlStart + REL_UL.length);
    const relUlHtml   = relCloseIdx !== -1
      ? html.slice(relUlStart + REL_UL.length, relCloseIdx)
      : html.slice(relUlStart + REL_UL.length);

    const yearRe = /<a href="[^"]+\/release\/(\d{4})\/"[^>]*>/gi;
    let ym: RegExpExecArray | null;
    while ((ym = yearRe.exec(relUlHtml)) !== null) {
      years.push(ym[1]);
    }
  }

  // ── Footer partner links ──────────────────────────────────────────────────
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
    // ROOT CAUSE OF ALL EMPTY ARRAYS:
    //   The home page (/) has a completely different layout — it has a slider,
    //   recent episodes, and genre carousels but NO sidebar. The sidebar with
    //   popular/new series, full genre list, and release years only appears on
    //   interior pages (search results, trending, genre pages, series detail, etc.)
    //
    // FIX: Fetch /trending/ instead of /. The trending page always has:
    //   - Same header/nav as the home page (logo, menu, menuGenres)
    //   - Same footer (partnerLinks, footerLinks, copyright)
    //   - Full sidebar: popular tab, new tab, genre list, release years
    //
    // We fetch just ONE page and extract everything from it.
    const html = await fetchPage("/trending/");
    const data = parseSiteExtra(html);

    return c.json({
      success: true,
      data,
      meta: {
        scrapedAt: new Date().toISOString(),
        source:    "https://watchhentai.net/trending/",
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
