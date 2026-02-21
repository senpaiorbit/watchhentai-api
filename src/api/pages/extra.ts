import { Hono } from "hono";
import { fetchPage, HtmlDoc } from "../../lib/scraper";
import { cleanText, resolveUrl } from "../../lib/format";

const extra = new Hono();

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SiteGenre {
  /** Display name e.g. "Large Breasts" */
  name:  string;
  /** URL slug e.g. "large-breasts" */
  slug:  string;
  /** Full URL */
  url:   string;
  /** Series count shown next to genre (0 if not present) */
  count: number;
}

export interface MenuGenre {
  name:  string;
  slug:  string;
  url:   string;
  /** title attribute value (often "<Name> Hentai") */
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
  // ── Branding ────────────────────────────────────────────────────────────────
  logo: {
    /** Absolute URL to the SVG/PNG logo */
    url:    string;
    /** Alt / title text */
    alt:    string;
    /** Site home URL */
    homeUrl: string;
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  /** Top-level nav menu items (Home, Trending, Series, Episodes, Uncensored…) */
  menu: MenuItem[];

  /** Genres listed in the Series dropdown submenu (quick-access genres) */
  menuGenres: MenuGenre[];

  // ── Sidebar ───────────────────────────────────────────────────────────────
  /** Popular series tab (by view count) */
  popular: SidebarSeriesItem[];

  /** New/recently added series tab */
  newSeries: SidebarSeriesItem[];

  // ── Full genre list ───────────────────────────────────────────────────────
  /**
   * Complete genre list from the sidebar .dt_mainmeta nav.genres section.
   * Includes all genres with their series counts.
   */
  genres: SiteGenre[];

  // ── Release years ─────────────────────────────────────────────────────────
  /**
   * All release years from the sidebar .dt_mainmeta nav.releases section,
   * in descending order (newest first).
   */
  years: string[];

  // ── Footer ────────────────────────────────────────────────────────────────
  /** Partner / friend site links from the footer */
  partnerLinks: { name: string; url: string }[];

  /** Footer nav links */
  footerLinks: { name: string; url: string }[];

  /** Copyright text e.g. "WatchHentai.net © 2025" */
  copyright: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════════════════════════

function parseSiteExtra(html: string): SiteExtraData {
  const doc = new HtmlDoc(html);

  // ── Logo ──────────────────────────────────────────────────────────────────
  // <div class="logo"><a href="https://watchhentai.net">
  //   <img src='https://watchhentai.net/logo.svg' width='123px' height='50px' title='Watch Hentai' alt='Watch Hentai'/>
  // </a></div>
  const logoBlockM = html.match(/<div class="logo">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/i);
  let logoUrl    = "";
  let logoAlt    = "";
  let logoHome   = "";
  if (logoBlockM) {
    logoHome = logoBlockM[1];
    const imgM = logoBlockM[2].match(/src='([^']+)'/i) ?? logoBlockM[2].match(/src="([^"]+)"/i);
    const altM = logoBlockM[2].match(/alt='([^']+)'/i) ?? logoBlockM[2].match(/alt="([^"]+)"/i);
    if (imgM) logoUrl = imgM[1];
    if (altM) logoAlt = altM[1];
  }

  // ── Main nav menu ─────────────────────────────────────────────────────────
  // <ul id="main_header" class="main-header">
  //   <li ...><a href="..." title="..."><i ...></i> Home</a></li>
  //   ...
  //   <li class="genres ..."><a href="/series/" title="...">Series</a>
  //     <ul class="sub-menu">...</ul>
  //   </li>
  // </ul>
  const menu: MenuItem[] = [];
  const menuGenres: MenuGenre[] = [];

  const mainHeaderM = html.match(
    /<ul id="main_header" class="main-header">([\s\S]*?)<\/ul>\s*<\/div>/i
  );
  if (mainHeaderM) {
    const menuHtml = mainHeaderM[1];

    // Top-level <li> items — extract just the first <a> of each <li>
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

    // Sub-menu genres (inside the <ul class="sub-menu"> of the Series <li>)
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
  // <div id="popular" class="dtw_content dt_views_count">
  //   <article class="w_item_b" id="post-XXXX">
  //     <a href="..." title="..."><div class="image"><img data-src="..." alt="..." /></div>
  //     <div class="data"><h3>Title</h3><div class="wextra"><b>7.5</b><span class="year">2020</span></div></div></a>
  //   </article>
  // </div>

  function parseSidebarSection(sectionHtml: string): SidebarSeriesItem[] {
    const items: SidebarSeriesItem[] = [];
    const artDoc = new HtmlDoc(sectionHtml);
    artDoc.articles().forEach((art) => {
      const id     = art.attr("article", "id").replace("post-", "");
      const url    = resolveUrl(art.attr("a", "href"));
      const poster = art.attr("img", "data-src");
      const title  = cleanText(art.tagText("h3") || art.attr("img", "alt"));
      const rating = cleanText(art.tagText("b"));
      const year   = cleanText(art.tagText("span"));
      if (url) items.push({ id, title, url, poster, rating, year });
    });
    return items;
  }

  const popularBlockM = html.match(/<div id="popular"[^>]*>([\s\S]*?)<\/div>\s*<div id="new"/i);
  const popular = popularBlockM ? parseSidebarSection(popularBlockM[1]) : [];

  const newBlockM = html.match(/<div id="new"[^>]*>([\s\S]*?)<\/div>\s*<\/aside>/i);
  const newSeries = newBlockM ? parseSidebarSection(newBlockM[1]) : [];

  // ── Full genre list ───────────────────────────────────────────────────────
  // <nav class="genres"><h2 class="widget-title">Genres</h2>
  //   <ul class="genres scrolling">
  //     <li class="cat-item cat-item-297"><a href=".../genre/3d/">3D</a> <i>40</i></li>
  //     ...
  //   </ul>
  // </nav>
  const genres: SiteGenre[] = [];
  const genreNavM = html.match(
    /<nav class="genres">([\s\S]*?)<\/nav>/i
  );
  if (genreNavM) {
    const genreRe =
      /<li[^>]*class="cat-item[^"]*"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*(?:<i>(\d+)<\/i>)?/gi;
    let gm: RegExpExecArray | null;
    while ((gm = genreRe.exec(genreNavM[1])) !== null) {
      const url   = gm[1];
      const name  = cleanText(gm[2]);
      const count = gm[3] ? parseInt(gm[3], 10) : 0;
      const slug  = url.replace(/.*\/genre\//, "").replace(/\/$/, "");
      genres.push({ name, slug, url: resolveUrl(url), count });
    }
  }

  // ── Release years ─────────────────────────────────────────────────────────
  // <nav class="releases"><h2>Release year</h2>
  //   <ul class="releases scrolling">
  //     <li><a href=".../release/2026/">2026</a></li>
  //     ...
  //   </ul>
  // </nav>
  const years: string[] = [];
  const yearNavM = html.match(/<nav class="releases">([\s\S]*?)<\/nav>/i);
  if (yearNavM) {
    const yearRe = /<a href="[^"]+\/release\/(\d{4})\/"[^>]*>/gi;
    let ym: RegExpExecArray | null;
    while ((ym = yearRe.exec(yearNavM[1])) !== null) {
      years.push(ym[1]);
    }
  }

  // ── Footer partner links ───────────────────────────────────────────────────
  // <div class="lista-patners">
  //   Friends » <a href="https://hentaiworld.tv/" title="Hentai World" ...>Hentai World</a>
  // </div>
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
  // <ul id="menu-footer" class="menu">
  //   <li ...><a href="https://watchhentai.net/contact/">Contact</a></li>
  // </ul>
  const footerLinks: { name: string; url: string }[] = [];
  const footerMenuM = html.match(/<ul id="menu-footer"[^>]*>([\s\S]*?)<\/ul>/i);
  if (footerMenuM) {
    const fRe = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fRe.exec(footerMenuM[1])) !== null) {
      footerLinks.push({ name: cleanText(fm[2]), url: fm[1] });
    }
  }

  // ── Copyright ──────────────────────────────────────────────────────────────
  // <div class="copy"><a href="/" title="Watch Hentai">WatchHentai.net</a> © 2025</div>
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
    // All the extra data is present on any full page — we use the home page
    // (or the search page for a "no results" example, both work identically).
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
// Routes
//
//   GET /api/extra
// ═══════════════════════════════════════════════════════════════════════════════

extra.get("/", async (c) => handleExtra(c));

export default extra;
