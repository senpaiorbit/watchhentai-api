/* ═══════════════════════════════════════════════════════════
   WatchHentai — script.js
   Universal JS for index, genre, series, watch pages
   All pages detect via data-page on <body>
   Navbar loaded dynamically from /api/extra
═══════════════════════════════════════════════════════════ */

var API = CONFIG.baseApiUrl;

/* ──────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────── */
function apiFetch(endpoint) {
  return fetch(API + endpoint)
    .then(function(r) { return r.json(); })
    .then(function(json) {
      if (!json.success) throw new Error(json.error || "API error");
      return json.data;
    });
}

function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
function qsa(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

function getParams() {
  var p = {};
  new URLSearchParams(window.location.search).forEach(function(v, k) { p[k] = v; });
  return p;
}

function slugFromUrl(url) {
  if (!url) return "";
  var parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1];
}

/* ──────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────── */
function toast(msg, type) {
  var el = document.createElement("div");
  el.className = "toast " + (type === "ok" ? "ok" : "err");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.classList.add("show"); }, 10);
  setTimeout(function() {
    el.classList.remove("show");
    setTimeout(function() { el.remove(); }, 400);
  }, 3200);
}

/* ──────────────────────────────────────────────────────────
   SKELETON CARDS
────────────────────────────────────────────────────────── */
function skeletons(n, ratio) {
  var html = "";
  for (var i = 0; i < (n || 12); i++) {
    html += '<div class="sk-card">' +
      '<div class="skeleton sk-img" style="aspect-ratio:' + (ratio || "2/3") + '"></div>' +
      '<div class="skeleton sk-line"></div>' +
      '<div class="skeleton sk-line s"></div>' +
      '</div>';
  }
  return html;
}

/* ──────────────────────────────────────────────────────────
   CARD BUILDERS
────────────────────────────────────────────────────────── */
function seriesCard(item) {
  var slug = slugFromUrl(item.url);
  var tag = "";
  if (item.censored === "uncensored") tag = '<span class="badge b-uncensored">Uncensored</span>';
  else if (item.censored === "censored") tag = '<span class="badge b-censored">Censored</span>';

  return '<a class="card" href="series.html?slug=' + slug + '">' +
    '<div class="card-img-wrap">' +
      '<img src="' + (item.poster || "") + '" alt="' + escHtml(item.title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/300x420/131929/ff3f7a?text=No+Image\'">' +
      tag +
      (item.rating ? '<span class="badge b-rating">★ ' + item.rating + '</span>' : '') +
      (item.episodes ? '<span class="badge b-ep">' + item.episodes + ' EP</span>' : '') +
    '</div>' +
    '<div class="card-body">' +
      '<p class="card-title">' + escHtml(item.title) + '</p>' +
      '<div class="card-meta">' + (item.year || "") + '</div>' +
    '</div>' +
  '</a>';
}

function episodeCard(item) {
  var slug = slugFromUrl(item.url);
  return '<a class="card ep-card" href="watch.html?slug=' + slug + '">' +
    '<div class="card-img-wrap">' +
      '<img src="' + (item.thumbnail || item.poster || "") + '" alt="' + escHtml(item.title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/400x225/131929/ff3f7a?text=No+Image\'">' +
      '<span class="play-icon">▶</span>' +
    '</div>' +
    '<div class="card-body">' +
      '<p class="card-title">' + escHtml(item.title) + '</p>' +
      '<div class="card-meta">' +
        (item.date ? '<span>' + item.date + '</span>' : '') +
        (item.views ? '<span>👁 ' + item.views + '</span>' : '') +
      '</div>' +
    '</div>' +
  '</a>';
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ──────────────────────────────────────────────────────────
   PAGINATION
────────────────────────────────────────────────────────── */
function buildPagination(current, total, onPage) {
  if (!total || total <= 1) return "";
  var pages = [];
  var delta = 2;
  for (var i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  var html = '<nav class="pagination">';
  html += '<button class="page-btn"' + (current <= 1 ? " disabled" : "") + ' data-page="' + (current - 1) + '">‹ Prev</button>';
  pages.forEach(function(p) {
    if (p === "...") {
      html += '<span class="page-dots">…</span>';
    } else {
      html += '<button class="page-btn' + (p === current ? " active" : "") + '" data-page="' + p + '">' + p + '</button>';
    }
  });
  html += '<button class="page-btn"' + (current >= total ? " disabled" : "") + ' data-page="' + (current + 1) + '">Next ›</button>';
  html += '</nav>';

  return html;
}

function attachPagination(containerEl, cb) {
  if (!containerEl) return;
  containerEl.addEventListener("click", function(e) {
    var btn = e.target.closest(".page-btn");
    if (btn && !btn.disabled) {
      cb(parseInt(btn.dataset.page, 10));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

/* ──────────────────────────────────────────────────────────
   DYNAMIC NAVBAR from /api/extra
────────────────────────────────────────────────────────── */
function buildNavbar(data) {
  var page = document.body.dataset.page || "";

  // Build main nav links (first few fixed items + genres dropdown)
  var fixedLinks = [
    { name: "Home", href: "index.html" },
    { name: "Trending", href: "index.html?type=trending" },
    { name: "Episodes", href: "index.html?type=videos" },
    { name: "Series", href: "index.html?type=series" },
    { name: "Uncensored", href: "genre.html?slug=uncensored" },
    { name: "Calendar", href: "index.html?type=calendar" }
  ];

  var activeMap = {
    "index": "Home",
    "genre": "Genres",
    "series": "",
    "watch": ""
  };
  var activeName = activeMap[page] || "";

  var navLinksHtml = fixedLinks.map(function(l) {
    var isActive = (l.name === activeName || (page === "index" && l.name === "Home" && !getParams().type));
    return '<li><a href="' + l.href + '" class="nav-link' + (isActive ? " active" : "") + '">' + l.name + '</a></li>';
  }).join("");

  // Genres dropdown from API data
  var genres = data.menuGenres || [];
  if (genres.length) {
    var dropItems = genres.map(function(g) {
      return '<a class="dropdown-item" href="genre.html?slug=' + escHtml(g.slug) + '">' + escHtml(g.name) + '</a>';
    }).join("");
    navLinksHtml += '<li class="nav-dropdown" id="genreDropdown">' +
      '<span class="nav-dropdown-toggle">' +
        'Genres ' +
        '<svg viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</span>' +
      '<div class="dropdown-menu">' + dropItems + '</div>' +
    '</li>';
  }

  // Build mobile links
  var mobileLinksHtml = fixedLinks.map(function(l) {
    return '<a href="' + l.href + '" class="mobile-link">' + l.name + '</a>';
  }).join("");
  if (genres.length) {
    mobileLinksHtml += '<div style="padding:.5rem .75rem;font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--dim);font-weight:700;margin-top:.5rem">Genres</div>';
    genres.forEach(function(g) {
      mobileLinksHtml += '<a href="genre.html?slug=' + escHtml(g.slug) + '" class="mobile-link">' + escHtml(g.name) + '</a>';
    });
  }

  // Copyright for footer
  window._extraData = data;

  // Inject into navbar placeholder
  var navEl = qs("#mainNav");
  if (!navEl) return;

  navEl.innerHTML =
    '<div class="navbar-inner">' +
      '<a href="index.html" class="navbar-brand">Watch<span>Hentai</span></a>' +
      '<ul class="navbar-nav" id="desktopNav">' + navLinksHtml + '</ul>' +
      '<div class="navbar-search">' +
        '<form id="searchForm" autocomplete="off">' +
          '<input type="text" id="searchInput" class="search-input" placeholder="Search series…">' +
          '<button type="submit" class="search-btn">Search</button>' +
        '</form>' +
      '</div>' +
      '<button class="navbar-toggle" id="navToggle" aria-label="Menu"><span></span><span></span><span></span></button>' +
    '</div>' +
    '<div class="mobile-drawer" id="mobileDrawer">' +
      '<div class="mobile-search">' +
        '<form id="mobileSearchForm" autocomplete="off" style="display:flex;gap:.5rem;width:100%">' +
          '<input type="text" id="mobileSearchInput" class="search-input" placeholder="Search series…" style="width:100%">' +
          '<button type="submit" class="search-btn">Go</button>' +
        '</form>' +
      '</div>' +
      mobileLinksHtml +
    '</div>';

  // Hamburger toggle
  var toggle = qs("#navToggle");
  var drawer = qs("#mobileDrawer");
  if (toggle && drawer) {
    toggle.addEventListener("click", function() {
      drawer.classList.toggle("open");
    });
  }

  // Genres dropdown
  var dropEl = qs("#genreDropdown");
  if (dropEl) {
    dropEl.querySelector(".nav-dropdown-toggle").addEventListener("click", function(e) {
      e.stopPropagation();
      dropEl.classList.toggle("open");
    });
    document.addEventListener("click", function() { dropEl.classList.remove("open"); });
  }

  // Search forms
  function handleSearch(inputId) {
    var form = qs("#" + (inputId === "searchInput" ? "searchForm" : "mobileSearchForm"));
    var inp = qs("#" + inputId);
    if (!form || !inp) return;
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var q = inp.value.trim();
      if (q) window.location.href = "index.html?search=" + encodeURIComponent(q);
    });
  }
  handleSearch("searchInput");
  handleSearch("mobileSearchInput");
}

function initNavbar() {
  return apiFetch("/extra").then(function(data) {
    buildNavbar(data);
  }).catch(function() {
    // Fallback static navbar if API fails
    var navEl = qs("#mainNav");
    if (!navEl) return;
    navEl.innerHTML =
      '<div class="navbar-inner">' +
        '<a href="index.html" class="navbar-brand">Watch<span>Hentai</span></a>' +
        '<ul class="navbar-nav">' +
          '<li><a href="index.html" class="nav-link">Home</a></li>' +
          '<li><a href="index.html?type=trending" class="nav-link">Trending</a></li>' +
          '<li><a href="index.html?type=videos" class="nav-link">Episodes</a></li>' +
          '<li><a href="genre.html" class="nav-link">Genres</a></li>' +
          '<li><a href="genre.html?slug=uncensored" class="nav-link">Uncensored</a></li>' +
        '</ul>' +
        '<div class="navbar-search">' +
          '<form id="searchForm" autocomplete="off">' +
            '<input type="text" id="searchInput" class="search-input" placeholder="Search series…">' +
            '<button type="submit" class="search-btn">Search</button>' +
          '</form>' +
        '</div>' +
        '<button class="navbar-toggle" id="navToggle"><span></span><span></span><span></span></button>' +
      '</div>' +
      '<div class="mobile-drawer" id="mobileDrawer">' +
        '<form id="mobileSearchForm" style="display:flex;gap:.5rem;margin-bottom:.75rem">' +
          '<input type="text" id="mobileSearchInput" class="search-input" placeholder="Search…" style="flex:1">' +
          '<button type="submit" class="search-btn">Go</button>' +
        '</form>' +
        '<a href="index.html" class="mobile-link">Home</a>' +
        '<a href="index.html?type=trending" class="mobile-link">Trending</a>' +
        '<a href="genre.html" class="mobile-link">Genres</a>' +
      '</div>';

    var toggle = qs("#navToggle"), drawer = qs("#mobileDrawer");
    if (toggle && drawer) toggle.addEventListener("click", function() { drawer.classList.toggle("open"); });

    [["searchForm","searchInput"],["mobileSearchForm","mobileSearchInput"]].forEach(function(pair) {
      var f = qs("#"+pair[0]), i = qs("#"+pair[1]);
      if (f && i) f.addEventListener("submit", function(e) {
        e.preventDefault();
        var q = i.value.trim();
        if (q) window.location.href = "index.html?search=" + encodeURIComponent(q);
      });
    });
  });
}

/* ──────────────────────────────────────────────────────────
   FOOTER from /api/extra data
────────────────────────────────────────────────────────── */
function renderFooter() {
  var footerEl = qs("#siteFooter");
  if (!footerEl) return;
  var data = window._extraData || {};
  var partners = data.partnerLinks || [];
  var copy = data.copyright || "WatchHentai.net © 2025";
  var linksHtml = partners.slice(0, 8).map(function(l) {
    return '<a href="' + escHtml(l.url) + '" target="_blank" rel="noopener">' + escHtml(l.name) + '</a>';
  }).join("");

  footerEl.innerHTML =
    '<div class="container">' +
      (linksHtml ? '<div class="footer-links">' + linksHtml + '</div>' : '') +
      '<p>' + escHtml(copy) + ' — All content belongs to their respective owners.</p>' +
      '<p class="copy">This site does not host any files. Powered by WatchHentai API.</p>' +
    '</div>';
}

/* ══════════════════════════════════════════════════════════
   PAGE: INDEX
══════════════════════════════════════════════════════════ */
function initIndexPage() {
  var params = getParams();

  // Search mode
  if (params.search) {
    showEl("searchSection");
    hideEl("heroSection");
    hideEl("homeSections");
    loadSearch(params.search, parseInt(params.page) || 1);
    return;
  }

  // Type pages (trending / videos / series / calendar)
  var type = params.type;
  if (type === "trending") {
    showEl("listSection");
    hideEl("heroSection");
    hideEl("homeSections");
    qs("#listTitle").textContent = "Trending Series";
    loadList("trending", parseInt(params.page) || 1);
    return;
  }
  if (type === "videos") {
    showEl("listSection");
    hideEl("heroSection");
    hideEl("homeSections");
    qs("#listTitle").textContent = "Latest Episodes";
    loadList("videos", parseInt(params.page) || 1);
    return;
  }
  if (type === "series") {
    showEl("listSection");
    hideEl("heroSection");
    hideEl("homeSections");
    qs("#listTitle").textContent = "All Series";
    loadList("series", parseInt(params.page) || 1);
    return;
  }
  if (type === "calendar") {
    showEl("calendarSection");
    hideEl("heroSection");
    hideEl("homeSections");
    loadCalendar();
    return;
  }

  // Normal home page
  loadHome();
}

function loadHome() {
  var featuredEl = qs("#featuredSlider");
  var newEpGrid = qs("#newEpGrid");
  var trendGrid = qs("#trendGrid");

  apiFetch("/home").then(function(data) {
    renderFeatured(data.featured || []);
    fillGrid(newEpGrid, data.newEpisodes || [], "episode", 12);
    fillGrid(trendGrid, data.trending || [], "series", 12);
  }).catch(function() {
    if (featuredEl) featuredEl.innerHTML = '<div class="empty-state"><span class="icon">⚠️</span><p>Failed to load home content.</p></div>';
    toast("Failed to load home content");
  });
}

function renderFeatured(items) {
  var wrap = qs("#featuredSlider");
  if (!wrap) return;
  if (!items.length) { wrap.innerHTML = ""; return; }

  var idx = 0;
  var timer;

  function render(i) {
    clearTimeout(timer);
    var f = items[i];
    var genreChips = (f.genres || []).map(function(g) { return '<span class="chip">' + escHtml(g) + '</span>'; }).join("");
    var synopsis = (f.synopsis || "").slice(0, 190) + (f.synopsis && f.synopsis.length > 190 ? "…" : "");
    var dots = items.map(function(_, j) {
      return '<span class="dot' + (j === i ? " active" : "") + '" data-i="' + j + '"></span>';
    }).join("");
    var slug = slugFromUrl(f.url);

    wrap.innerHTML =
      '<div class="featured-slide" style="background-image:url(\'' + escHtml(f.backdrop || f.poster) + '\')">' +
        '<div class="featured-content">' +
          (genreChips ? '<div class="featured-genres">' + genreChips + '</div>' : '') +
          '<h1 class="featured-title">' + escHtml(f.title) + '</h1>' +
          '<div class="featured-meta">' +
            (f.rating ? '<span>★ ' + f.rating + '</span>' : '') +
            (f.year ? '<span>' + f.year + '</span>' : '') +
          '</div>' +
          (synopsis ? '<p class="featured-synopsis">' + escHtml(synopsis) + '</p>' : '') +
          '<div class="featured-actions">' +
            '<a href="series.html?slug=' + slug + '" class="btn btn-primary">View Series</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="slider-dots">' + dots + '</div>' +
      (items.length > 1 ? '<button class="slider-btn prev" id="slPrev">‹</button><button class="slider-btn next" id="slNext">›</button>' : '');

    // Dots
    qsa(".dot", wrap).forEach(function(d) {
      d.addEventListener("click", function() {
        idx = parseInt(d.dataset.i, 10);
        render(idx);
      });
    });
    // Prev/Next
    var prev = qs("#slPrev"); var next = qs("#slNext");
    if (prev) prev.addEventListener("click", function() { idx = (idx - 1 + items.length) % items.length; render(idx); });
    if (next) next.addEventListener("click", function() { idx = (idx + 1) % items.length; render(idx); });

    timer = setTimeout(function() {
      idx = (idx + 1) % items.length;
      render(idx);
    }, 6000);
  }

  render(0);
}

/* Generic list loader (trending / videos / series) */
function loadList(type, page) {
  var grid = qs("#listGrid");
  var pag = qs("#listPagination");
  if (!grid) return;
  grid.innerHTML = skeletons(24, type === "videos" ? "16/9" : "2/3");

  var endpoint = "/" + type + "?page=" + page;
  apiFetch(endpoint).then(function(data) {
    var items = data.items || [];
    if (!items.length) {
      grid.innerHTML = emptyState("No content found.");
      return;
    }
    var isEp = (type === "videos");
    grid.innerHTML = items.map(isEp ? episodeCard : seriesCard).join("");

    if (pag) {
      pag.innerHTML = buildPagination(data.page || page, data.totalPages || 1, function(p) {
        window.location.href = "index.html?type=" + type + "&page=" + p;
      });
    }
  }).catch(function(e) {
    grid.innerHTML = emptyState("Failed to load content.");
    toast("Load failed");
  });
}

/* Calendar */
function loadCalendar() {
  var el = qs("#calendarContent");
  if (!el) return;
  el.innerHTML = '<div class="spinner"></div>';
  apiFetch("/calendar").then(function(data) {
    var months = data.months || [];
    if (!months.length) { el.innerHTML = emptyState("No calendar data."); return; }
    var html = "";
    months.forEach(function(m) {
      html += '<div class="calendar-month">';
      html += '<h2 class="section-title">' + escHtml(m.month) + '</h2>';
      html += '<div class="cards-grid">';
      (m.episodes || []).forEach(function(ep) {
        html += episodeCard(ep);
      });
      html += '</div></div>';
    });
    el.innerHTML = html;
  }).catch(function() {
    el.innerHTML = emptyState("Failed to load calendar.");
  });
}

/* Search */
function loadSearch(q, page) {
  var grid = qs("#searchGrid");
  var pag = qs("#searchPag");
  var title = qs("#searchTitle");
  if (title) title.textContent = 'Results for "' + q + '"';
  if (grid) grid.innerHTML = skeletons();

  apiFetch("/search?q=" + encodeURIComponent(q) + "&page=" + page).then(function(data) {
    if (!data.items || !data.items.length) {
      grid.innerHTML = emptyState('No results for "' + escHtml(q) + '"');
      if (pag) pag.innerHTML = "";
      return;
    }
    grid.innerHTML = data.items.map(seriesCard).join("");
    if (pag) {
      pag.innerHTML = buildPagination(data.page || page, data.totalPages || 1, function(p) {
        window.location.href = "index.html?search=" + encodeURIComponent(q) + "&page=" + p;
      });
    }
  }).catch(function() {
    if (grid) grid.innerHTML = emptyState("Search failed.");
  });
}

/* ══════════════════════════════════════════════════════════
   PAGE: GENRE
══════════════════════════════════════════════════════════ */
function initGenrePage() {
  var params = getParams();
  var slug = params.slug;
  var page = parseInt(params.page) || 1;

  // Load genre sidebar from /genres
  apiFetch("/genres").then(function(genres) {
    var sidebarEl = qs("#genreList");
    if (!sidebarEl) return;
    if (!genres || !genres.length) { sidebarEl.innerHTML = '<p style="color:var(--muted);padding:.5rem">No genres found.</p>'; return; }
    sidebarEl.innerHTML = genres.map(function(g) {
      return '<a href="genre.html?slug=' + escHtml(g.slug) + '" class="genre-pill' + (g.slug === slug ? " active" : "") + '">' +
        escHtml(g.name) +
        '<span class="genre-count">' + (g.count || 0) + '</span>' +
      '</a>';
    }).join("");
  }).catch(function() {});

  if (!slug) {
    var heroEl = qs("#genreHeroTitle");
    if (heroEl) heroEl.textContent = "Browse Genres";
    return;
  }

  loadGenrePage(slug, page);
}

function loadGenrePage(slug, page) {
  var grid = qs("#genreGrid");
  var pag = qs("#genrePag");
  var heroEl = qs("#genreHeroTitle");
  if (grid) grid.innerHTML = skeletons();

  apiFetch("/genre/" + slug + "?page=" + page).then(function(data) {
    if (heroEl) { heroEl.textContent = data.genre || slug; document.title = data.genre + " — WatchHentai"; }
    var items = data.items || [];
    if (!items.length) { grid.innerHTML = emptyState("No series found for this genre."); return; }
    grid.innerHTML = items.map(seriesCard).join("");
    if (pag) {
      pag.innerHTML = buildPagination(data.page || page, data.totalPages || 1, function(p) {
        window.location.href = "genre.html?slug=" + slug + "&page=" + p;
      });
    }
  }).catch(function() {
    if (grid) grid.innerHTML = emptyState("Failed to load genre.");
    toast("Failed to load genre");
  });
}

/* ══════════════════════════════════════════════════════════
   PAGE: SERIES DETAIL
══════════════════════════════════════════════════════════ */
function initSeriesPage() {
  var params = getParams();
  var slug = params.slug;
  if (!slug) { window.location.href = "index.html"; return; }

  var content = qs("#seriesContent");
  if (content) content.innerHTML = '<div class="spinner"></div>';

  apiFetch("/series/" + slug).then(function(data) {
    document.title = data.title + " — WatchHentai";
    renderSeriesDetail(data, content);
  }).catch(function() {
    if (content) content.innerHTML = emptyState("Series not found.");
    toast("Failed to load series");
  });
}

function renderSeriesDetail(d, content) {
  if (!content) return;

  var censorClass = d.censored === "uncensored" ? "unc" : (d.censored === "censored" ? "cen" : "");
  var statusClass = d.status ? d.status.toLowerCase() : "";

  var genreChips = (d.genres || []).map(function(g) {
    return '<a href="genre.html?slug=' + escHtml(slugFromUrl(g.url)) + '" class="chip">' + escHtml(g.name) + '</a>';
  }).join("");

  var episodesHtml = (d.episodes || []).map(function(ep) {
    var epSlug = slugFromUrl(ep.url);
    return '<a href="watch.html?slug=' + epSlug + '" class="ep-item">' +
      '<div class="ep-thumb">' +
        '<img src="' + escHtml(ep.thumbnail || "") + '" alt="EP ' + ep.number + '" loading="lazy" onerror="this.src=\'https://placehold.co/400x225/131929/ff3f7a?text=EP\'">' +
        '<span class="play-icon">▶</span>' +
      '</div>' +
      '<div class="ep-body">' +
        '<span class="ep-num">EP ' + ep.number + '</span>' +
        '<span class="ep-title">' + escHtml(ep.title) + '</span>' +
        '<span class="ep-date">' + escHtml(ep.date || "") + '</span>' +
      '</div>' +
    '</a>';
  }).join("");

  var relatedHtml = (d.related || []).map(function(r) {
    return '<a class="card" href="series.html?slug=' + slugFromUrl(r.url) + '">' +
      '<div class="card-img-wrap"><img src="' + escHtml(r.poster || "") + '" alt="' + escHtml(r.title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/300x420/131929/ff3f7a?text=No+Image\'"></div>' +
      '<div class="card-body"><p class="card-title">' + escHtml(r.title) + '</p></div>' +
    '</a>';
  }).join("");

  content.innerHTML =
    '<div class="series-hero" style="background-image:url(\'' + escHtml(d.backdrop || d.poster) + '\')">' +
      '<div class="container series-hero-inner">' +
        '<img src="' + escHtml(d.poster) + '" alt="' + escHtml(d.title) + '" class="series-poster" onerror="this.src=\'https://placehold.co/300x420/131929/ff3f7a?text=No+Image\'">' +
        '<div class="series-info">' +
          '<h1 class="series-title">' + escHtml(d.title) + '</h1>' +
          '<div class="meta-row">' +
            (d.rating ? '<span class="meta-tag">★ ' + d.rating + ' <small style="opacity:.6">(' + (d.votes||0) + ' votes)</small></span>' : '') +
            (d.year ? '<span class="meta-tag">📅 ' + d.year + '</span>' : '') +
            (d.status ? '<span class="meta-tag ' + statusClass + '">' + d.status + '</span>' : '') +
            (d.studio ? '<span class="meta-tag">🎬 ' + escHtml(d.studio) + '</span>' : '') +
            (d.censored ? '<span class="meta-tag ' + censorClass + '">' + d.censored + '</span>' : '') +
          '</div>' +
          (genreChips ? '<div class="genres-row">' + genreChips + '</div>' : '') +
          (d.synopsis ? '<p class="series-synopsis">' + escHtml(d.synopsis) + '</p>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="container series-body">' +
      '<h2 class="section-title">Episodes <span class="count-pill">' + (d.episodes || []).length + '</span></h2>' +
      (episodesHtml ? '<div class="episodes-grid">' + episodesHtml + '</div>' : '<div class="empty-state"><span class="icon">📺</span><p>No episodes yet.</p></div>') +
      (relatedHtml ? '<h2 class="section-title mt-5">Related Series</h2><div class="cards-grid">' + relatedHtml + '</div>' : '') +
    '</div>';
}

/* ══════════════════════════════════════════════════════════
   PAGE: WATCH
══════════════════════════════════════════════════════════ */
function initWatchPage() {
  var params = getParams();
  var slug = params.slug;
  if (!slug) { window.location.href = "index.html"; return; }

  var content = qs("#watchContent");
  if (content) content.innerHTML = '<div class="spinner"></div>';

  apiFetch("/watch/" + slug).then(function(data) {
    document.title = data.title + " — WatchHentai";
    renderWatchPage(data, content);
  }).catch(function() {
    if (content) content.innerHTML = emptyState("Episode not found.");
    toast("Failed to load episode");
  });
}

function renderWatchPage(d, content) {
  if (!content) return;

  var player = d.player || {};
  var sources = player.sources || [];
  var defaultSrc = sources.length ? sources[0].src : (player.src || "");

  var sourceTags = sources.map(function(s) {
    return '<source src="' + escHtml(s.src) + '" type="' + escHtml(s.type) + '">';
  }).join("");
  if (!sourceTags && defaultSrc) sourceTags = '<source src="' + escHtml(defaultSrc) + '" type="video/mp4">';

  var qualityBtns = sources.map(function(s, i) {
    return '<button class="q-btn' + (i === 0 ? " active" : "") + '" data-src="' + escHtml(s.src) + '">' + escHtml(s.label) + '</button>';
  }).join("");

  var genreChips = (d.genres || []).map(function(g) {
    return '<a href="genre.html?slug=' + escHtml(slugFromUrl(g.url)) + '" class="chip">' + escHtml(g.name) + '</a>';
  }).join("");

  var seriesSlug = slugFromUrl(d.seriesUrl);
  var prevLink = d.prevEpisode
    ? '<a href="watch.html?slug=' + slugFromUrl(d.prevEpisode.url) + '" class="btn btn-outline">‹ ' + escHtml(d.prevEpisode.title) + '</a>'
    : '<span></span>';
  var nextLink = d.nextEpisode
    ? '<a href="watch.html?slug=' + slugFromUrl(d.nextEpisode.url) + '" class="btn btn-outline">' + escHtml(d.nextEpisode.title) + ' ›</a>'
    : '<span></span>';

  var sbEpisodes = (d.episodes || []).map(function(ep) {
    var epSlug = slugFromUrl(ep.url);
    return '<a href="watch.html?slug=' + epSlug + '" class="sb-ep' + (ep.isCurrent ? " current" : "") + '">' +
      '<img src="' + escHtml(ep.thumbnail || "") + '" alt="EP ' + ep.number + '" loading="lazy" onerror="this.src=\'https://placehold.co/120x68/131929/ff3f7a?text=EP\'">' +
      '<div class="sb-ep-info">' +
        '<span class="sb-ep-num">EP ' + ep.number + '</span>' +
        '<span class="sb-ep-title">' + escHtml(ep.title) + '</span>' +
        '<span class="sb-ep-date">' + escHtml(ep.date || "") + '</span>' +
      '</div>' +
      (ep.isCurrent ? '<span class="now-tag">▶ Now</span>' : '') +
    '</a>';
  }).join("");

  content.innerHTML =
    '<div class="container watch-layout">' +
      '<div class="watch-main">' +
        '<div class="player-wrap">' +
          '<video id="mainPlayer" controls preload="metadata" poster="' + escHtml(d.thumbnail || "") + '">' +
            sourceTags +
            'Your browser does not support HTML5 video.' +
          '</video>' +
          '<div class="player-bar">' +
            '<span class="player-bar-title">' + escHtml(d.title) + '</span>' +
            (qualityBtns ? '<div class="quality-picker">' + qualityBtns + '</div>' : '') +
            (player.downloadUrl ? '<a href="' + escHtml(player.downloadUrl) + '" class="btn btn-sm btn-outline" target="_blank">⬇ Download</a>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ep-nav">' +
          prevLink +
          '<a href="series.html?slug=' + seriesSlug + '" class="btn btn-secondary">📋 All Episodes</a>' +
          nextLink +
        '</div>' +
        '<h1 class="watch-title">' + escHtml(d.title) + '</h1>' +
        '<div class="meta-row">' +
          (d.views ? '<span class="meta-tag">👁 ' + escHtml(d.views) + ' views</span>' : '') +
          (d.censored ? '<span class="meta-tag ' + (d.censored === "uncensored" ? "unc" : "cen") + '">' + d.censored + '</span>' : '') +
          genreChips +
        '</div>' +
        (d.synopsis ? '<p class="watch-synopsis">' + escHtml(d.synopsis) + '</p>' : '') +
      '</div>' +
      '<aside class="watch-sidebar">' +
        '<div class="sb-series">' +
          '<img src="' + escHtml(d.seriesPoster || "") + '" alt="' + escHtml(d.seriesTitle || "") + '" class="sb-poster" onerror="this.src=\'https://placehold.co/52x74/131929/ff3f7a?text=P\'">' +
          '<div><a href="series.html?slug=' + seriesSlug + '" class="sb-series-title">' + escHtml(d.seriesTitle || "") + '</a></div>' +
        '</div>' +
        '<div class="sb-heading">Episodes</div>' +
        '<div class="sb-episodes">' + (sbEpisodes || '<div style="padding:1.5rem;color:var(--muted);text-align:center;">No episodes</div>') + '</div>' +
      '</aside>' +
    '</div>';

  // Scroll sidebar to current episode
  setTimeout(function() {
    var cur = qs(".sb-ep.current");
    if (cur) cur.scrollIntoView({ block: "center" });
  }, 100);

  // Quality switcher
  var videoEl = qs("#mainPlayer");
  qsa(".q-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      qsa(".q-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      if (videoEl) {
        var t = videoEl.currentTime;
        var playing = !videoEl.paused;
        videoEl.src = btn.dataset.src;
        videoEl.load();
        videoEl.currentTime = t;
        if (playing) videoEl.play().catch(function(){});
      }
    });
  });
}

/* ──────────────────────────────────────────────────────────
   UTILS
────────────────────────────────────────────────────────── */
function fillGrid(el, items, type, max) {
  if (!el) return;
  if (!items || !items.length) { el.innerHTML = emptyState("No content available."); return; }
  var slice = max ? items.slice(0, max) : items;
  el.innerHTML = slice.map(type === "episode" ? episodeCard : seriesCard).join("");
}

function emptyState(msg) {
  return '<div class="empty-state" style="grid-column:1/-1"><span class="icon">📭</span><p>' + escHtml(msg) + '</p></div>';
}

function showEl(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove("d-none");
}

function hideEl(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add("d-none");
}

/* ──────────────────────────────────────────────────────────
   INIT — wait for DOM then run
────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", function() {
  var page = document.body.dataset.page;

  // Always init navbar first, then page
  initNavbar().then(function() {
    renderFooter();
    if (page === "index")  initIndexPage();
    if (page === "genre")  initGenrePage();
    if (page === "series") initSeriesPage();
    if (page === "watch")  initWatchPage();
  });
});
