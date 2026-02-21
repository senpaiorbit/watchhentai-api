/*  WatchHentai — script.js
    ▸ No top-level execution — everything runs inside DOMContentLoaded
    ▸ No ES modules, no import/export
    ▸ Navbar built dynamically from /api/extra
    ▸ Works on: index.html  genre.html  series.html  watch.html
*/

document.addEventListener('DOMContentLoaded', function () {

  /* ── Config ─────────────────────────────────────────────── */
  var API = window.CONFIG ? window.CONFIG.API : 'https://watchhentai-api.vercel.app/api';
  var PAGE = document.body.getAttribute('data-page') || '';

  /* ══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */

  function apiFetch(path) {
    return fetch(API + path)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'API error');
        return j.data;
      });
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function params() {
    var p = {};
    new URLSearchParams(window.location.search).forEach(function (v, k) { p[k] = v; });
    return p;
  }

  function slugFrom(url) {
    if (!url) return '';
    return url.replace(/\/$/, '').split('/').pop();
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function show(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type === 'ok' ? 'ok' : 'err');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 12);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 400);
    }, 3400);
  }

  /* ── Skeletons ─────────────────────────────────────────── */
  function skels(n, ratio) {
    var ar = ratio || '2/3';
    var h = '';
    for (var i = 0; i < (n || 12); i++) {
      h += '<div class="sk-card">' +
        '<div class="sk sk-img" style="aspect-ratio:' + ar + '"></div>' +
        '<div class="sk sk-l"></div>' +
        '<div class="sk sk-l s"></div>' +
        '</div>';
    }
    return h;
  }

  function emptyHTML(msg) {
    return '<div class="empty" style="grid-column:1/-1">' +
      '<span class="empty-ico">📭</span>' +
      '<p>' + esc(msg) + '</p>' +
      '</div>';
  }

  /* ── Cards ─────────────────────────────────────────────── */
  function seriesCard(item) {
    var slug = slugFrom(item.url);
    var tag = '';
    if (item.censored === 'uncensored') tag = '<span class="card-badge cb-unc">Uncensored</span>';
    else if (item.censored === 'censored') tag = '<span class="card-badge cb-cen">Censored</span>';
    return '<a class="card" href="series.html?slug=' + esc(slug) + '">' +
      '<div class="card-thumb">' +
        '<img src="' + esc(item.poster || '') + '" alt="' + esc(item.title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/300x420/0e1220/e8334a?text=No+Image\'">' +
        tag +
        (item.rating ? '<span class="card-badge cb-rating">★ ' + esc(item.rating) + '</span>' : '') +
        (item.episodes ? '<span class="card-badge cb-ep">' + esc(item.episodes) + ' EP</span>' : '') +
        '<div class="card-play"><div class="card-play-inner">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '</div></div>' +
      '</div>' +
      '<div class="card-body">' +
        '<p class="card-name">' + esc(item.title) + '</p>' +
        '<div class="card-info">' + (item.year || '') + '</div>' +
      '</div>' +
    '</a>';
  }

  function epCard(item) {
    var slug = slugFrom(item.url);
    return '<a class="card ep" href="watch.html?slug=' + esc(slug) + '">' +
      '<div class="card-thumb">' +
        '<img src="' + esc(item.thumbnail || item.poster || '') + '" alt="' + esc(item.title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/400x225/0e1220/e8334a?text=No+Image\'">' +
        '<div class="card-play"><div class="card-play-inner">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '</div></div>' +
      '</div>' +
      '<div class="card-body">' +
        '<p class="card-name">' + esc(item.title) + '</p>' +
        '<div class="card-info">' +
          (item.date ? '<span>' + esc(item.date) + '</span>' : '') +
          (item.views ? '<span>👁 ' + esc(item.views) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function fillGrid(el, items, type, max) {
    if (!el) return;
    var list = max ? items.slice(0, max) : items;
    if (!list.length) { el.innerHTML = emptyHTML('No content available.'); return; }
    el.innerHTML = list.map(type === 'ep' ? epCard : seriesCard).join('');
  }

  /* ── Pagination ─────────────────────────────────────────── */
  function pagHTML(cur, total, onPage) {
    if (!total || total <= 1) return '';
    var pages = [], d = 2;
    for (var i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= cur - d && i <= cur + d)) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    var h = '<div class="pager" data-pager="1">';
    h += '<button class="pg-btn"' + (cur <= 1 ? ' disabled' : '') + ' data-p="' + (cur - 1) + '">‹</button>';
    pages.forEach(function (p) {
      if (p === '...') h += '<span class="pg-dots">…</span>';
      else h += '<button class="pg-btn' + (p === cur ? ' on' : '') + '" data-p="' + p + '">' + p + '</button>';
    });
    h += '<button class="pg-btn"' + (cur >= total ? ' disabled' : '') + ' data-p="' + (cur + 1) + '">›</button>';
    h += '</div>';
    return h;
  }

  function bindPager(container, cb) {
    if (!container) return;
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.pg-btn');
      if (btn && !btn.disabled) {
        cb(parseInt(btn.getAttribute('data-p'), 10));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     NAVBAR — built from /api/extra
  ══════════════════════════════════════════════════════════ */

  function buildNav(extra) {
    var genres = (extra && extra.menuGenres) || [];
    var dropItems = genres.map(function (g) {
      return '<a class="drop-a" href="genre.html?slug=' + esc(g.slug) + '">' + esc(g.name) + '</a>';
    }).join('');

    var mobGenres = genres.map(function (g) {
      return '<a class="mob-a" href="genre.html?slug=' + esc(g.slug) + '">' + esc(g.name) + '</a>';
    }).join('');

    var navEl = document.getElementById('mainNav');
    if (!navEl) return;

    navEl.innerHTML =
      '<div class="nav-inner">' +
        '<a href="index.html" class="nav-logo">Watch<em>Hentai</em></a>' +
        '<nav class="nav-links">' +
          '<a href="index.html" class="nav-a' + (PAGE === 'index' && !params().type ? ' on' : '') + '">Home</a>' +
          '<a href="index.html?type=trending" class="nav-a' + (PAGE === 'index' && params().type === 'trending' ? ' on' : '') + '">Trending</a>' +
          '<a href="index.html?type=videos" class="nav-a' + (PAGE === 'index' && params().type === 'videos' ? ' on' : '') + '">Episodes</a>' +
          '<a href="index.html?type=series" class="nav-a' + (PAGE === 'index' && params().type === 'series' ? ' on' : '') + '">Series</a>' +
          '<a href="genre.html?slug=uncensored" class="nav-a' + (PAGE === 'genre' && params().slug === 'uncensored' ? ' on' : '') + '">Uncensored</a>' +
          '<a href="index.html?type=calendar" class="nav-a' + (PAGE === 'index' && params().type === 'calendar' ? ' on' : '') + '">Calendar</a>' +
          (dropItems
            ? '<div class="nav-drop" id="navDrop">' +
                '<span class="nav-drop-btn">' +
                  'Genres ' +
                  '<svg viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '</span>' +
                '<div class="drop-panel">' + dropItems + '</div>' +
              '</div>'
            : ''
          ) +
        '</nav>' +
        '<div class="nav-right">' +
          '<form class="search-form" id="searchForm">' +
            '<div class="search-wrap">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
              '<input class="search-inp" id="searchInp" type="text" placeholder="Search series…" autocomplete="off">' +
            '</div>' +
            '<button class="search-btn" type="submit">Search</button>' +
          '</form>' +
        '</div>' +
        '<button class="nav-ham" id="navHam" aria-label="Menu"><span></span><span></span><span></span></button>' +
      '</div>' +

      /* Mobile drawer */
      '<div class="mobile-nav" id="mobNav">' +
        '<div class="mob-search">' +
          '<form id="mobSearchForm" style="display:flex;gap:.4rem;width:100%">' +
            '<input class="search-inp" id="mobSearchInp" type="text" placeholder="Search…" autocomplete="off" style="flex:1;width:auto">' +
            '<button class="search-btn" type="submit">Go</button>' +
          '</form>' +
        '</div>' +
        '<a class="mob-a" href="index.html">Home</a>' +
        '<a class="mob-a" href="index.html?type=trending">Trending</a>' +
        '<a class="mob-a" href="index.html?type=videos">Episodes</a>' +
        '<a class="mob-a" href="index.html?type=series">All Series</a>' +
        '<a class="mob-a" href="genre.html?slug=uncensored">Uncensored</a>' +
        '<a class="mob-a" href="index.html?type=calendar">Calendar</a>' +
        (mobGenres ? '<div class="mob-section-label">Genres</div>' + mobGenres : '') +
      '</div>';

    /* Hamburger */
    var ham = document.getElementById('navHam');
    var mob = document.getElementById('mobNav');
    if (ham && mob) {
      ham.addEventListener('click', function () {
        var open = mob.classList.toggle('open');
        ham.classList.toggle('open', open);
      });
    }

    /* Genres dropdown */
    var drop = document.getElementById('navDrop');
    if (drop) {
      drop.querySelector('.nav-drop-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        drop.classList.toggle('open');
      });
      document.addEventListener('click', function () { drop.classList.remove('open'); });
    }

    /* Search handlers */
    function bindSearch(formId, inpId) {
      var f = document.getElementById(formId);
      var i = document.getElementById(inpId);
      if (!f || !i) return;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = i.value.trim();
        if (q) window.location.href = 'index.html?search=' + encodeURIComponent(q);
      });
    }
    bindSearch('searchForm', 'searchInp');
    bindSearch('mobSearchForm', 'mobSearchInp');

    /* Pre-fill search input if on search page */
    var p = params();
    if (p.search) {
      var si = document.getElementById('searchInp');
      if (si) si.value = p.search;
    }
  }

  function buildFooter(extra) {
    var el = document.getElementById('siteFooter');
    if (!el) return;
    var links = (extra && extra.partnerLinks) || [];
    var copy = (extra && extra.copyright) || 'WatchHentai.net © 2025';
    var linksHtml = links.slice(0, 8).map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>';
    }).join('');
    el.innerHTML =
      '<div class="footer-inner">' +
        '<div class="footer-brand">Watch<em>Hentai</em></div>' +
        (linksHtml ? '<div class="footer-links-row">' + linksHtml + '</div>' : '') +
        '<p class="footer-copy">' + esc(copy) + ' — All rights belong to their respective owners. This site does not host any files.</p>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     INDEX PAGE
  ══════════════════════════════════════════════════════════ */

  function initIndex() {
    var p = params();

    if (p.search) {
      hideAll(['heroSec', 'homeSecs', 'listSec', 'calSec']);
      show('searchSec');
      runSearch(p.search, parseInt(p.page) || 1);
      return;
    }

    var type = p.type;
    if (type === 'trending' || type === 'videos' || type === 'series') {
      hideAll(['heroSec', 'homeSecs', 'searchSec', 'calSec']);
      show('listSec');
      var titles = { trending: 'Trending Series', videos: 'Latest Episodes', series: 'All Series' };
      var titleEl = document.getElementById('listTitle');
      if (titleEl) titleEl.textContent = titles[type] || '';
      runList(type, parseInt(p.page) || 1);
      return;
    }

    if (type === 'calendar') {
      hideAll(['heroSec', 'homeSecs', 'searchSec', 'listSec']);
      show('calSec');
      runCalendar();
      return;
    }

    /* Default: home */
    hideAll(['listSec', 'searchSec', 'calSec']);
    show('heroSec');
    show('homeSecs');
    runHome();
  }

  function hideAll(ids) {
    ids.forEach(function (id) { hide(id); });
  }

  /* HOME */
  function runHome() {
    var sliderEl = document.getElementById('heroSlider');
    var newEl = document.getElementById('newEpGrid');
    var trendEl = document.getElementById('trendGrid');

    if (newEl) newEl.innerHTML = skels(12, '16/9');
    if (trendEl) trendEl.innerHTML = skels(12);

    apiFetch('/home')
      .then(function (data) {
        buildSlider(data.featured || []);
        fillGrid(newEl, data.newEpisodes || [], 'ep', 12);
        fillGrid(trendEl, data.trending || [], 'series', 12);
      })
      .catch(function () {
        if (sliderEl) sliderEl.innerHTML = '';
        if (newEl) newEl.innerHTML = emptyHTML('Failed to load episodes.');
        if (trendEl) trendEl.innerHTML = emptyHTML('Failed to load trending.');
        toast('Failed to load home content');
      });
  }

  /* FEATURED SLIDER */
  function buildSlider(items) {
    var wrap = document.getElementById('heroSlider');
    if (!wrap) return;
    if (!items.length) { wrap.innerHTML = ''; return; }

    var idx = 0;
    var timer = null;

    function render(i) {
      clearTimeout(timer);
      var f = items[i];
      var slug = slugFrom(f.url);
      var genreHTML = (f.genres || []).slice(0, 3).map(function (g) {
        return '<span class="hero-tag">' + esc(g) + '</span>';
      }).join('');
      var syn = (f.synopsis || '').slice(0, 180) + (f.synopsis && f.synopsis.length > 180 ? '…' : '');
      var dots = items.map(function (_, j) {
        return '<span class="hero-dot' + (j === i ? ' on' : '') + '" data-i="' + j + '"></span>';
      }).join('');

      wrap.innerHTML =
        '<div class="hero-slide" style="background-image:url(\'' + esc(f.backdrop || f.poster) + '\')">' +
          '<div class="hero-content">' +
            (f.year ? '<div class="hero-tags"><span class="hero-tag alt">' + esc(f.year) + '</span>' + genreHTML + '</div>' : (genreHTML ? '<div class="hero-tags">' + genreHTML + '</div>' : '')) +
            '<h1 class="hero-title">' + esc(f.title) + '</h1>' +
            '<div class="hero-meta">' +
              (f.rating ? '<span class="rating">★ ' + esc(f.rating) + '</span>' : '') +
              (f.year ? '<span>' + esc(f.year) + '</span>' : '') +
            '</div>' +
            (syn ? '<p class="hero-synopsis">' + esc(syn) + '</p>' : '') +
            '<div class="hero-actions">' +
              '<a href="series.html?slug=' + esc(slug) + '" class="btn btn-red">▶ View Series</a>' +
              '<a href="series.html?slug=' + esc(slug) + '" class="btn btn-ghost">Episodes</a>' +
            '</div>' +
          '</div>' +
          '<div class="hero-poster-col">' +
            '<img class="hero-poster" src="' + esc(f.poster) + '" alt="' + esc(f.title) + '" onerror="this.style.display=\'none\'">' +
          '</div>' +
        '</div>' +
        '<div class="hero-dots">' + dots + '</div>' +
        (items.length > 1 ? '<button class="hero-prev">‹</button><button class="hero-next">›</button>' : '');

      /* Dot clicks */
      qsa('.hero-dot', wrap).forEach(function (d) {
        d.addEventListener('click', function () {
          idx = parseInt(d.getAttribute('data-i'), 10);
          render(idx);
        });
      });

      /* Prev/Next */
      var prev = qs('.hero-prev', wrap);
      var next = qs('.hero-next', wrap);
      if (prev) prev.addEventListener('click', function () { idx = (idx - 1 + items.length) % items.length; render(idx); });
      if (next) next.addEventListener('click', function () { idx = (idx + 1) % items.length; render(idx); });

      timer = setTimeout(function () {
        idx = (idx + 1) % items.length;
        render(idx);
      }, 6500);
    }

    render(0);
  }

  /* LIST (trending / videos / series) */
  function runList(type, page) {
    var grid = document.getElementById('listGrid');
    var pag = document.getElementById('listPag');
    if (!grid) return;

    var isEp = (type === 'videos');
    grid.innerHTML = skels(24, isEp ? '16/9' : '2/3');
    if (pag) pag.innerHTML = '';

    apiFetch('/' + type + '?page=' + page)
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) { grid.innerHTML = emptyHTML('No content found.'); return; }
        grid.innerHTML = items.map(isEp ? epCard : seriesCard).join('');
        if (pag) {
          pag.innerHTML = pagHTML(data.page || page, data.totalPages || 1, function (p) {
            window.location.href = 'index.html?type=' + type + '&page=' + p;
          });
          bindPager(pag, function (p) {
            window.location.href = 'index.html?type=' + type + '&page=' + p;
          });
        }
      })
      .catch(function () {
        grid.innerHTML = emptyHTML('Failed to load content.');
        toast('Load failed');
      });
  }

  /* CALENDAR */
  function runCalendar() {
    var el = document.getElementById('calContent');
    if (!el) return;
    el.innerHTML = '<div class="spin"></div>';

    apiFetch('/calendar')
      .then(function (data) {
        var months = data.months || [];
        if (!months.length) { el.innerHTML = emptyHTML('No calendar data.'); return; }
        var h = '';
        months.forEach(function (m) {
          var eps = m.episodes || [];
          if (!eps.length) return;
          h += '<div style="margin-bottom:2.5rem">';
          h += '<div class="section-hd"><div class="section-hd-left">' +
               '<span class="section-eyebrow">Schedule</span>' +
               '<h2 class="section-title">' + esc(m.month) + '</h2>' +
               '</div></div>';
          h += '<div class="grid ep">' + eps.map(epCard).join('') + '</div>';
          h += '</div>';
        });
        el.innerHTML = h || emptyHTML('No episodes scheduled.');
      })
      .catch(function () {
        el.innerHTML = emptyHTML('Failed to load calendar.');
      });
  }

  /* SEARCH */
  function runSearch(q, page) {
    var titleEl = document.getElementById('searchTitle');
    var grid = document.getElementById('searchGrid');
    var pag = document.getElementById('searchPag');

    if (titleEl) titleEl.innerHTML = 'Results for <span>"' + esc(q) + '"</span>';
    if (grid) grid.innerHTML = skels(24);
    if (pag) pag.innerHTML = '';

    apiFetch('/search?q=' + encodeURIComponent(q) + '&page=' + page)
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          if (grid) grid.innerHTML = emptyHTML('No results for "' + q + '"');
          return;
        }
        if (grid) grid.innerHTML = items.map(seriesCard).join('');
        if (pag) {
          pag.innerHTML = pagHTML(data.page || page, data.totalPages || 1, function (p) {
            window.location.href = 'index.html?search=' + encodeURIComponent(q) + '&page=' + p;
          });
          bindPager(pag, function (p) {
            window.location.href = 'index.html?search=' + encodeURIComponent(q) + '&page=' + p;
          });
        }
      })
      .catch(function () {
        if (grid) grid.innerHTML = emptyHTML('Search failed.');
      });
  }

  /* ══════════════════════════════════════════════════════════
     GENRE PAGE
  ══════════════════════════════════════════════════════════ */

  function initGenre() {
    var p = params();
    var slug = p.slug || '';
    var page = parseInt(p.page) || 1;

    /* Load sidebar */
    apiFetch('/genres')
      .then(function (genres) {
        var listEl = document.getElementById('gsList');
        if (!listEl) return;
        if (!genres || !genres.length) { listEl.innerHTML = '<p style="color:var(--text3);padding:.5rem .75rem;font-size:.8rem">No genres found.</p>'; return; }
        listEl.innerHTML = genres.map(function (g) {
          return '<a class="gs-a' + (g.slug === slug ? ' on' : '') + '" href="genre.html?slug=' + esc(g.slug) + '">' +
            esc(g.name) +
            '<span class="gs-count">' + (g.count || 0) + '</span>' +
          '</a>';
        }).join('');
      })
      .catch(function () {});

    if (!slug) return; /* Just sidebar, no grid */

    /* Load grid */
    var titleEl = document.getElementById('gsHeroTitle');
    var subEl = document.getElementById('gsHeroSub');
    var grid = document.getElementById('gsGrid');
    var pag = document.getElementById('gsPag');

    if (grid) grid.innerHTML = skels(24);

    apiFetch('/genre/' + slug + '?page=' + page)
      .then(function (data) {
        var name = data.genre || slug;
        document.title = name + ' — WatchHentai';
        if (titleEl) titleEl.textContent = name;
        if (subEl) subEl.textContent = (data.totalPages || 0) + ' pages of series';
        var items = data.items || [];
        if (!items.length) { if (grid) grid.innerHTML = emptyHTML('No series found.'); return; }
        if (grid) grid.innerHTML = items.map(seriesCard).join('');
        if (pag) {
          pag.innerHTML = pagHTML(data.page || page, data.totalPages || 1, function (p) {
            window.location.href = 'genre.html?slug=' + slug + '&page=' + p;
          });
          bindPager(pag, function (p) {
            window.location.href = 'genre.html?slug=' + slug + '&page=' + p;
          });
        }
      })
      .catch(function () {
        if (grid) grid.innerHTML = emptyHTML('Failed to load genre.');
        toast('Failed to load genre');
      });
  }

  /* ══════════════════════════════════════════════════════════
     SERIES DETAIL
  ══════════════════════════════════════════════════════════ */

  function initSeries() {
    var p = params();
    if (!p.slug) { window.location.href = 'index.html'; return; }

    var content = document.getElementById('seriesContent');
    if (content) content.innerHTML = '<div class="spin"></div>';

    apiFetch('/series/' + p.slug)
      .then(function (d) {
        document.title = d.title + ' — WatchHentai';
        renderSeries(d, content);
      })
      .catch(function () {
        if (content) content.innerHTML = '<div class="empty"><span class="empty-ico">⚠️</span><p>Series not found.</p></div>';
        toast('Failed to load series');
      });
  }

  function renderSeries(d, el) {
    if (!el) return;
    var cCls = d.censored === 'uncensored' ? 'unc' : d.censored === 'censored' ? 'cen' : '';
    var sCls = (d.status || '').toLowerCase();

    var genChips = (d.genres || []).map(function (g) {
      return '<a class="chip" href="genre.html?slug=' + esc(slugFrom(g.url)) + '">' + esc(g.name) + '</a>';
    }).join('');

    var eps = (d.episodes || []).map(function (ep) {
      var s = slugFrom(ep.url);
      return '<a class="ep-card-item" href="watch.html?slug=' + esc(s) + '">' +
        '<div class="ep-thumb">' +
          '<img src="' + esc(ep.thumbnail || '') + '" alt="EP ' + ep.number + '" loading="lazy" onerror="this.src=\'https://placehold.co/400x225/0e1220/e8334a?text=EP\'">' +
          '<div class="ep-play"><svg viewBox="0 0 24 24" fill="currentColor" width="44" height="44"><path d="M8 5v14l11-7z"/></svg></div>' +
        '</div>' +
        '<div class="ep-info">' +
          '<span class="ep-num">Episode ' + ep.number + '</span>' +
          '<span class="ep-name">' + esc(ep.title) + '</span>' +
          '<span class="ep-date">' + esc(ep.date || '') + '</span>' +
        '</div>' +
      '</a>';
    }).join('');

    var related = (d.related || []).slice(0, 6).map(function (r) {
      return '<a class="card" href="series.html?slug=' + esc(slugFrom(r.url)) + '">' +
        '<div class="card-thumb">' +
          '<img src="' + esc(r.poster || '') + '" alt="' + esc(r.title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/300x420/0e1220/e8334a?text=No+Image\'">' +
          '<div class="card-play"><div class="card-play-inner"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>' +
        '</div>' +
        '<div class="card-body"><p class="card-name">' + esc(r.title) + '</p></div>' +
      '</a>';
    }).join('');

    el.innerHTML =
      '<div class="series-hero" style="background-image:url(\'' + esc(d.backdrop || d.poster) + '\')">' +
        '<div class="series-hero-inner">' +
          '<img class="series-poster-img" src="' + esc(d.poster) + '" alt="' + esc(d.title) + '" onerror="this.src=\'https://placehold.co/300x420/0e1220/e8334a?text=No+Image\'">' +
          '<div class="series-meta-block">' +
            '<h1 class="series-ttl">' + esc(d.title) + '</h1>' +
            '<div class="meta-pills">' +
              (d.rating ? '<span class="pill">★ ' + esc(d.rating) + ' <small style="opacity:.6">(' + (d.votes||0) + ')</small></span>' : '') +
              (d.year ? '<span class="pill">📅 ' + esc(d.year) + '</span>' : '') +
              (d.status ? '<span class="pill ' + esc(sCls) + '">' + esc(d.status) + '</span>' : '') +
              (d.studio ? '<span class="pill">🎬 ' + esc(d.studio) + '</span>' : '') +
              (d.censored ? '<span class="pill ' + esc(cCls) + '">' + esc(d.censored) + '</span>' : '') +
            '</div>' +
            (genChips ? '<div class="genre-chips">' + genChips + '</div>' : '') +
            (d.synopsis ? '<p class="series-syn">' + esc(d.synopsis) + '</p>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="series-body-wrap">' +
        '<div class="section-hd">' +
          '<div class="section-hd-left">' +
            '<span class="section-eyebrow">All Episodes</span>' +
            '<h2 class="section-title">Episodes <small style="font-size:.55em;color:var(--red);font-family:var(--font-ui)">(' + (d.episodes||[]).length + ')</small></h2>' +
          '</div>' +
        '</div>' +
        (eps ? '<div class="ep-grid">' + eps + '</div>' : '<div class="empty"><span class="empty-ico">📺</span><p>No episodes yet.</p></div>') +

        (related
          ? '<div class="mt-6">' +
              '<div class="section-hd">' +
                '<div class="section-hd-left">' +
                  '<span class="section-eyebrow">More Like This</span>' +
                  '<h2 class="section-title">Related Series</h2>' +
                '</div>' +
              '</div>' +
              '<div class="grid">' + related + '</div>' +
            '</div>'
          : ''
        ) +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     WATCH PAGE
  ══════════════════════════════════════════════════════════ */

  function initWatch() {
    var p = params();
    if (!p.slug) { window.location.href = 'index.html'; return; }

    var content = document.getElementById('watchContent');
    if (content) content.innerHTML = '<div class="spin"></div>';

    apiFetch('/watch/' + p.slug)
      .then(function (d) {
        document.title = d.title + ' — WatchHentai';
        renderWatch(d, content);
      })
      .catch(function () {
        if (content) content.innerHTML = '<div class="empty"><span class="empty-ico">⚠️</span><p>Episode not found.</p></div>';
        toast('Failed to load episode');
      });
  }

  function renderWatch(d, el) {
    if (!el) return;
    var player = d.player || {};
    var sources = player.sources || [];
    var defaultSrc = sources.length ? sources[0].src : (player.src || '');

    var srcTags = sources.map(function (s) {
      return '<source src="' + esc(s.src) + '" type="' + esc(s.type) + '">';
    }).join('');
    if (!srcTags && defaultSrc) srcTags = '<source src="' + esc(defaultSrc) + '" type="video/mp4">';

    var qBtns = sources.map(function (s, i) {
      return '<button class="q-pill' + (i === 0 ? ' on' : '') + '" data-src="' + esc(s.src) + '">' + esc(s.label) + '</button>';
    }).join('');

    var genChips = (d.genres || []).map(function (g) {
      return '<a class="chip" href="genre.html?slug=' + esc(slugFrom(g.url)) + '">' + esc(g.name) + '</a>';
    }).join('');

    var serSlug = slugFrom(d.seriesUrl);
    var prevLnk = d.prevEpisode
      ? '<a href="watch.html?slug=' + esc(slugFrom(d.prevEpisode.url)) + '" class="btn btn-outline">‹ ' + esc(d.prevEpisode.title) + '</a>'
      : '<span></span>';
    var nextLnk = d.nextEpisode
      ? '<a href="watch.html?slug=' + esc(slugFrom(d.nextEpisode.url)) + '" class="btn btn-outline">' + esc(d.nextEpisode.title) + ' ›</a>'
      : '<span></span>';

    var sbEps = (d.episodes || []).map(function (ep) {
      var s = slugFrom(ep.url);
      return '<a class="ws-ep' + (ep.isCurrent ? ' now' : '') + '" href="watch.html?slug=' + esc(s) + '">' +
        '<img src="' + esc(ep.thumbnail || '') + '" alt="EP ' + ep.number + '" loading="lazy" onerror="this.src=\'https://placehold.co/82x47/0e1220/e8334a?text=EP\'">' +
        '<div class="ws-ep-i">' +
          '<span class="ws-ep-n">EP ' + ep.number + '</span>' +
          '<span class="ws-ep-t">' + esc(ep.title) + '</span>' +
          '<span class="ws-ep-d">' + esc(ep.date || '') + '</span>' +
        '</div>' +
        (ep.isCurrent ? '<span class="now-badge">▶ Now</span>' : '') +
      '</a>';
    }).join('');

    el.innerHTML =
      '<div class="watch-wrap">' +
        '<div class="watch-main">' +

          /* Player */
          '<div class="player-box">' +
            '<video id="vPlayer" controls preload="metadata" poster="' + esc(d.thumbnail || '') + '">' +
              srcTags +
              'Your browser does not support video.' +
            '</video>' +
            '<div class="player-toolbar">' +
              '<span class="ptb-title">' + esc(d.title) + '</span>' +
              (qBtns ? '<div class="q-pills">' + qBtns + '</div>' : '') +
              (player.downloadUrl ? '<a href="' + esc(player.downloadUrl) + '" class="btn btn-outline btn-sm" target="_blank">⬇ Download</a>' : '') +
            '</div>' +
          '</div>' +

          /* Nav */
          '<div class="ep-nav-bar">' +
            prevLnk +
            '<a href="series.html?slug=' + esc(serSlug) + '" class="btn btn-ghost">📋 All Episodes</a>' +
            nextLnk +
          '</div>' +

          /* Info */
          '<h1 class="watch-title">' + esc(d.title) + '</h1>' +
          '<div class="watch-meta">' +
            (d.views ? '<span class="pill">👁 ' + esc(d.views) + ' views</span>' : '') +
            (d.censored ? '<span class="pill ' + (d.censored === 'uncensored' ? 'unc' : 'cen') + '">' + esc(d.censored) + '</span>' : '') +
            genChips +
          '</div>' +
          (d.synopsis ? '<p class="watch-syn">' + esc(d.synopsis) + '</p>' : '') +

        '</div>' +

        /* Sidebar */
        '<aside class="watch-sidebar">' +
          '<div class="ws-header">' +
            '<img class="ws-poster" src="' + esc(d.seriesPoster || '') + '" alt="' + esc(d.seriesTitle || '') + '" onerror="this.src=\'https://placehold.co/48x68/0e1220/e8334a?text=P\'">' +
            '<div style="min-width:0">' +
              '<a class="ws-sname" href="series.html?slug=' + esc(serSlug) + '">' + esc(d.seriesTitle || '') + '</a>' +
            '</div>' +
          '</div>' +
          '<div class="ws-label">Episodes</div>' +
          '<div class="ws-eps" id="wsEpsList">' +
            (sbEps || '<div style="padding:1.5rem;text-align:center;color:var(--text3)">No episodes</div>') +
          '</div>' +
        '</aside>' +

      '</div>';

    /* Scroll to current */
    setTimeout(function () {
      var cur = qs('.ws-ep.now');
      if (cur) cur.scrollIntoView({ block: 'center' });
    }, 120);

    /* Quality switcher */
    var vid = document.getElementById('vPlayer');
    qsa('.q-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('.q-pill').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        if (vid) {
          var t = vid.currentTime;
          var playing = !vid.paused;
          vid.src = btn.getAttribute('data-src');
          vid.load();
          vid.currentTime = t;
          if (playing) vid.play().catch(function () {});
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     BOOT — load navbar first, then run page
  ══════════════════════════════════════════════════════════ */

  apiFetch('/extra')
    .then(function (extra) {
      buildNav(extra);
      buildFooter(extra);
    })
    .catch(function () {
      /* Navbar fallback — still works without extra API */
      buildNav({});
      buildFooter({});
    })
    .then(function () {
      /* Always runs whether extra succeeded or failed */
      if (PAGE === 'index')  initIndex();
      if (PAGE === 'genre')  initGenre();
      if (PAGE === 'series') initSeries();
      if (PAGE === 'watch')  initWatch();
    });

}); /* end DOMContentLoaded */
