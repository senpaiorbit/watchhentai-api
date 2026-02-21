// ─── API Helper ───────────────────────────────────────────────────────────────
const API = window.CONFIG.baseApiUrl;

async function apiFetch(endpoint) {
  try {
    const res = await fetch(`${API}${endpoint}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "API error");
    return json.data;
  } catch (e) {
    console.error("apiFetch error:", e);
    throw e;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
function getParams() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(params.entries());
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = "error") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3000);
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
function skeletonCards(n = 12) {
  return Array.from({ length: n }, () => `
    <div class="card skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="card-body">
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text short"></div>
      </div>
    </div>`).join("");
}

// ─── Card Builder ─────────────────────────────────────────────────────────────
function buildSeriesCard(item) {
  const tag = item.censored === "uncensored"
    ? `<span class="badge badge-uncensored">Uncensored</span>`
    : item.censored === "censored"
      ? `<span class="badge badge-censored">Censored</span>`
      : "";
  return `
    <a class="card" href="series.html?slug=${slugFromUrl(item.url)}">
      <div class="card-img-wrap">
        <img src="${item.poster}" alt="${item.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x420/1a1a2e/ff6b9d?text=No+Image'">
        ${tag}
        ${item.rating ? `<span class="badge badge-rating">⭐ ${item.rating}</span>` : ""}
        ${item.episodes ? `<span class="badge badge-ep">${item.episodes} EP</span>` : ""}
      </div>
      <div class="card-body">
        <p class="card-title">${item.title}</p>
        ${item.year ? `<span class="card-year">${item.year}</span>` : ""}
      </div>
    </a>`;
}

function buildEpisodeCard(item) {
  const slug = slugFromUrl(item.url);
  return `
    <a class="card episode-card" href="watch.html?slug=${slug}">
      <div class="card-img-wrap">
        <img src="${item.thumbnail || item.poster}" alt="${item.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x225/1a1a2e/ff6b9d?text=No+Image'">
        <span class="play-icon">▶</span>
      </div>
      <div class="card-body">
        <p class="card-title">${item.title}</p>
        ${item.date ? `<span class="card-year">${item.date}</span>` : ""}
        ${item.views ? `<span class="card-views">👁 ${item.views}</span>` : ""}
      </div>
    </a>`;
}

function slugFromUrl(url = "") {
  if (!url) return "";
  const parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1];
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function buildPagination(current, total, onPageChange) {
  if (total <= 1) return "";
  const pages = [];
  const delta = 2;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return `<nav class="pagination" aria-label="Pagination">
    <button class="page-btn" ${current <= 1 ? "disabled" : ""} data-page="${current - 1}">‹ Prev</button>
    ${pages.map(p => p === "..."
      ? `<span class="page-dots">…</span>`
      : `<button class="page-btn ${p === current ? "active" : ""}" data-page="${p}">${p}</button>`
    ).join("")}
    <button class="page-btn" ${current >= total ? "disabled" : ""} data-page="${current + 1}">Next ›</button>
  </nav>`;
}

function attachPagination(container, callback) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (btn && !btn.disabled) {
      const page = parseInt(btn.dataset.page);
      callback(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

// ─── Search Bar ───────────────────────────────────────────────────────────────
function initSearch() {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  if (!form || !input) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) window.location.href = `index.html?search=${encodeURIComponent(q)}`;
  });
}

// ─── Navbar Active ────────────────────────────────────────────────────────────
function setNavActive() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-link").forEach(a => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
}

// ─── Lazy image fallback ──────────────────────────────────────────────────────
function fixBrokenImages() {
  document.querySelectorAll("img").forEach(img => {
    img.onerror = function () {
      this.src = "https://via.placeholder.com/300x420/1a1a2e/ff6b9d?text=No+Image";
    };
  });
}

// ─── Page: INDEX ──────────────────────────────────────────────────────────────
async function initIndexPage() {
  initSearch();
  setNavActive();

  const params = getParams();

  // Search mode
  if (params.search) {
    document.getElementById("homeHero")?.classList.add("d-none");
    document.getElementById("homeSections")?.classList.add("d-none");
    const searchSection = document.getElementById("searchSection");
    if (searchSection) searchSection.classList.remove("d-none");
    await loadSearchResults(params.search, parseInt(params.page) || 1);
    return;
  }

  // Normal home
  try {
    const data = await apiFetch("/home");
    renderFeatured(data.featured || []);
    renderHomeSection("newEpisodesGrid", data.newEpisodes || [], "episode");
    renderHomeSection("trendingGrid", data.trending || [], "series");
  } catch (e) {
    showToast("Failed to load home content");
  }
}

function renderFeatured(items) {
  const wrap = document.getElementById("featuredSlider");
  if (!wrap || !items.length) return;
  let idx = 0;

  function render(i) {
    const f = items[i];
    wrap.innerHTML = `
      <div class="featured-slide" style="background-image: linear-gradient(to right, rgba(10,10,20,0.97) 40%, rgba(10,10,20,0.5)), url('${f.backdrop || f.poster}')">
        <div class="featured-content">
          <div class="featured-genres">${(f.genres || []).map(g => `<span class="chip">${g}</span>`).join("")}</div>
          <h1 class="featured-title">${f.title}</h1>
          <div class="featured-meta">
            ${f.rating ? `<span>⭐ ${f.rating}</span>` : ""}
            ${f.year ? `<span>${f.year}</span>` : ""}
          </div>
          <p class="featured-synopsis">${(f.synopsis || "").slice(0, 200)}${f.synopsis?.length > 200 ? "…" : ""}</p>
          <div class="featured-actions">
            <a href="series.html?slug=${slugFromUrl(f.url)}" class="btn btn-primary">View Series</a>
          </div>
        </div>
        <div class="featured-poster">
          <img src="${f.poster}" alt="${f.title}">
        </div>
      </div>
      <div class="featured-dots">
        ${items.map((_, j) => `<span class="dot ${j === i ? "active" : ""}" data-idx="${j}"></span>`).join("")}
      </div>
      <button class="slider-btn prev" id="sliderPrev">‹</button>
      <button class="slider-btn next" id="sliderNext">›</button>`;

    document.getElementById("sliderPrev")?.addEventListener("click", () => {
      idx = (idx - 1 + items.length) % items.length;
      render(idx);
    });
    document.getElementById("sliderNext")?.addEventListener("click", () => {
      idx = (idx + 1) % items.length;
      render(idx);
    });
    wrap.querySelectorAll(".dot").forEach(d => {
      d.addEventListener("click", () => { idx = parseInt(d.dataset.idx); render(idx); });
    });
  }

  render(0);
  setInterval(() => { idx = (idx + 1) % items.length; render(idx); }, 6000);
}

function renderHomeSection(id, items, type) {
  const grid = document.getElementById(id);
  if (!grid) return;
  if (!items.length) { grid.innerHTML = `<p class="empty-msg">No content available.</p>`; return; }
  grid.innerHTML = items.slice(0, 12).map(i => type === "episode" ? buildEpisodeCard(i) : buildSeriesCard(i)).join("");
}

async function loadSearchResults(q, page = 1) {
  const grid = document.getElementById("searchGrid");
  const pagination = document.getElementById("searchPagination");
  const title = document.getElementById("searchTitle");
  if (title) title.textContent = `Search: "${q}"`;
  if (grid) grid.innerHTML = skeletonCards();

  try {
    const data = await apiFetch(`/search?q=${encodeURIComponent(q)}&page=${page}`);
    if (!data.items.length) {
      grid.innerHTML = `<div class="empty-state"><span>🔍</span><p>No results for "${q}"</p></div>`;
      if (pagination) pagination.innerHTML = "";
      return;
    }
    grid.innerHTML = data.items.map(buildSeriesCard).join("");
    if (pagination) {
      pagination.innerHTML = buildPagination(data.page, data.totalPages, (p) => {
        window.location.href = `index.html?search=${encodeURIComponent(q)}&page=${p}`;
      });
    }
  } catch (e) {
    if (grid) grid.innerHTML = `<div class="empty-state"><span>⚠️</span><p>Search failed.</p></div>`;
  }
}

// ─── Page: GENRE ──────────────────────────────────────────────────────────────
async function initGenrePage() {
  initSearch();
  setNavActive();
  const params = getParams();
  const slug = params.slug;
  let page = parseInt(params.page) || 1;

  const grid = document.getElementById("genreGrid");
  const pagination = document.getElementById("genrePagination");
  const genreTitle = document.getElementById("genreTitle");
  const genreList = document.getElementById("genreList");

  // Load genres sidebar
  try {
    const genres = await apiFetch("/genres");
    if (genreList) {
      genreList.innerHTML = genres.map(g => `
        <a href="genre.html?slug=${g.slug}" class="genre-pill ${g.slug === slug ? "active" : ""}">
          ${g.name} <span class="genre-count">${g.count}</span>
        </a>`).join("");
    }
  } catch (e) {}

  if (!slug) {
    if (genreTitle) genreTitle.textContent = "All Genres";
    if (grid) grid.innerHTML = `<div class="empty-state"><span>🏷️</span><p>Select a genre from the sidebar.</p></div>`;
    return;
  }

  async function loadPage(p) {
    if (grid) grid.innerHTML = skeletonCards();
    try {
      const data = await apiFetch(`/genre/${slug}?page=${p}`);
      if (genreTitle) genreTitle.textContent = data.genre || slug;
      document.title = `${data.genre || slug} — WatchHentai`;
      if (!data.items.length) {
        grid.innerHTML = `<div class="empty-state"><span>🏷️</span><p>No series found.</p></div>`;
        return;
      }
      grid.innerHTML = data.items.map(buildSeriesCard).join("");
      if (pagination) {
        pagination.innerHTML = buildPagination(data.page, data.totalPages, (np) => {
          window.location.href = `genre.html?slug=${slug}&page=${np}`;
        });
      }
    } catch (e) {
      if (grid) grid.innerHTML = `<div class="empty-state"><span>⚠️</span><p>Failed to load genre.</p></div>`;
    }
  }

  loadPage(page);
}

// ─── Page: SERIES DETAIL ──────────────────────────────────────────────────────
async function initSeriesPage() {
  initSearch();
  setNavActive();
  const params = getParams();
  const slug = params.slug;

  if (!slug) { window.location.href = "index.html"; return; }

  const content = document.getElementById("seriesContent");
  if (content) content.innerHTML = `<div class="loading-spinner"></div>`;

  try {
    const data = await apiFetch(`/series/${slug}`);
    document.title = `${data.title} — WatchHentai`;
    renderSeriesDetail(data);
  } catch (e) {
    if (content) content.innerHTML = `<div class="empty-state"><span>⚠️</span><p>Series not found.</p></div>`;
    showToast("Failed to load series");
  }
}

function renderSeriesDetail(d) {
  const content = document.getElementById("seriesContent");
  if (!content) return;

  content.innerHTML = `
    <div class="series-hero" style="background-image: linear-gradient(to bottom, rgba(10,10,20,0.5) 0%, rgba(10,10,20,1) 100%), url('${d.backdrop || d.poster}')">
      <div class="series-hero-inner container">
        <div class="series-poster-wrap">
          <img src="${d.poster}" alt="${d.title}" class="series-poster">
        </div>
        <div class="series-info">
          <h1 class="series-title">${d.title}</h1>
          <div class="series-meta">
            ${d.rating ? `<span class="meta-tag">⭐ ${d.rating} <small>(${d.votes} votes)</small></span>` : ""}
            ${d.year ? `<span class="meta-tag">📅 ${d.year}</span>` : ""}
            ${d.status ? `<span class="meta-tag status-${d.status.toLowerCase()}">${d.status}</span>` : ""}
            ${d.studio ? `<span class="meta-tag">🎬 ${d.studio}</span>` : ""}
            ${d.censored ? `<span class="meta-tag badge-${d.censored}">${d.censored}</span>` : ""}
          </div>
          <div class="series-genres">
            ${(d.genres || []).map(g => `<a href="genre.html?slug=${slugFromUrl(g.url)}" class="chip">${g.name}</a>`).join("")}
          </div>
          <p class="series-synopsis">${d.synopsis || ""}</p>
        </div>
      </div>
    </div>

    <div class="container series-body">
      <h2 class="section-title">Episodes <span class="count-badge">${d.episodes?.length || 0}</span></h2>
      <div class="episodes-grid">
        ${(d.episodes || []).map(ep => `
          <a href="watch.html?slug=${slugFromUrl(ep.url)}" class="episode-item">
            <div class="ep-thumb-wrap">
              <img src="${ep.thumbnail}" alt="${ep.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x225/1a1a2e/ff6b9d?text=EP'">
              <span class="play-icon">▶</span>
            </div>
            <div class="ep-info">
              <span class="ep-num">EP ${ep.number}</span>
              <span class="ep-title">${ep.title}</span>
              <span class="ep-date">${ep.date || ""}</span>
            </div>
          </a>`).join("")}
      </div>

      ${d.related?.length ? `
        <h2 class="section-title mt-5">Related Series</h2>
        <div class="cards-grid">
          ${d.related.map(r => `
            <a class="card" href="series.html?slug=${slugFromUrl(r.url)}">
              <div class="card-img-wrap">
                <img src="${r.poster}" alt="${r.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x420/1a1a2e/ff6b9d?text=No+Image'">
              </div>
              <div class="card-body"><p class="card-title">${r.title}</p></div>
            </a>`).join("")}
        </div>` : ""}
    </div>`;
}

// ─── Page: WATCH ──────────────────────────────────────────────────────────────
async function initWatchPage() {
  initSearch();
  setNavActive();
  const params = getParams();
  const slug = params.slug;

  if (!slug) { window.location.href = "index.html"; return; }

  const content = document.getElementById("watchContent");
  if (content) content.innerHTML = `<div class="loading-spinner"></div>`;

  try {
    const data = await apiFetch(`/watch/${slug}`);
    document.title = `${data.title} — WatchHentai`;
    renderWatchPage(data);
  } catch (e) {
    if (content) content.innerHTML = `<div class="empty-state"><span>⚠️</span><p>Episode not found.</p></div>`;
    showToast("Failed to load episode");
  }
}

function renderWatchPage(d) {
  const content = document.getElementById("watchContent");
  if (!content) return;

  const sources = d.player?.sources || [];
  const defaultSrc = sources[0]?.src || d.player?.src || "";

  content.innerHTML = `
    <div class="container watch-layout">
      <div class="watch-main">
        <!-- Player -->
        <div class="player-wrap">
          <video id="mainPlayer" controls preload="metadata" poster="${d.thumbnail}">
            ${sources.map(s => `<source src="${s.src}" type="${s.type}" label="${s.label}">`).join("")}
            ${!sources.length && defaultSrc ? `<source src="${defaultSrc}" type="video/mp4">` : ""}
            Your browser does not support HTML5 video.
          </video>
          <div class="player-controls-bar">
            <span class="player-title">${d.title}</span>
            <div class="quality-picker">
              ${sources.map((s, i) => `<button class="quality-btn ${i === 0 ? "active" : ""}" data-src="${s.src}">${s.label}</button>`).join("")}
            </div>
            ${d.player?.downloadUrl ? `<a href="${d.player.downloadUrl}" class="btn btn-sm btn-outline" target="_blank">⬇ Download</a>` : ""}
          </div>
        </div>

        <!-- Nav -->
        <div class="episode-nav">
          ${d.prevEpisode ? `<a href="watch.html?slug=${slugFromUrl(d.prevEpisode.url)}" class="btn btn-outline">‹ ${d.prevEpisode.title}</a>` : `<span></span>`}
          <a href="series.html?slug=${slugFromUrl(d.seriesUrl)}" class="btn btn-secondary">📋 All Episodes</a>
          ${d.nextEpisode ? `<a href="watch.html?slug=${slugFromUrl(d.nextEpisode.url)}" class="btn btn-outline">${d.nextEpisode.title} ›</a>` : `<span></span>`}
        </div>

        <!-- Info -->
        <div class="watch-info">
          <h1 class="watch-title">${d.title}</h1>
          <div class="series-meta">
            ${d.views ? `<span class="meta-tag">👁 ${d.views} views</span>` : ""}
            ${d.censored ? `<span class="meta-tag badge-${d.censored}">${d.censored}</span>` : ""}
            ${(d.genres || []).map(g => `<a href="genre.html?slug=${slugFromUrl(g.url)}" class="chip">${g.name}</a>`).join("")}
          </div>
          ${d.synopsis ? `<p class="watch-synopsis">${d.synopsis}</p>` : ""}
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="watch-sidebar">
        <div class="sidebar-series-info">
          <img src="${d.seriesPoster}" alt="${d.seriesTitle}" class="sidebar-poster">
          <div>
            <a href="series.html?slug=${slugFromUrl(d.seriesUrl)}" class="sidebar-series-title">${d.seriesTitle}</a>
          </div>
        </div>
        <h3 class="sidebar-heading">Episodes</h3>
        <div class="sidebar-episodes">
          ${(d.episodes || []).map(ep => `
            <a href="watch.html?slug=${slugFromUrl(ep.url)}" class="sidebar-ep ${ep.isCurrent ? "current" : ""}">
              <img src="${ep.thumbnail}" alt="EP ${ep.number}" loading="lazy" onerror="this.src='https://via.placeholder.com/120x68/1a1a2e/ff6b9d?text=EP'">
              <div class="sidebar-ep-info">
                <span class="sidebar-ep-num">EP ${ep.number}</span>
                <span class="sidebar-ep-title">${ep.title}</span>
                <span class="sidebar-ep-date">${ep.date || ""}</span>
              </div>
              ${ep.isCurrent ? `<span class="now-playing">▶ Now</span>` : ""}
            </a>`).join("")}
        </div>
      </aside>
    </div>`;

  // Quality switcher
  const player = document.getElementById("mainPlayer");
  document.querySelectorAll(".quality-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".quality-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const currentTime = player.currentTime;
      const paused = player.paused;
      player.src = btn.dataset.src;
      player.currentTime = currentTime;
      if (!paused) player.play();
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "index") initIndexPage();
  else if (page === "genre") initGenrePage();
  else if (page === "series") initSeriesPage();
  else if (page === "watch") initWatchPage();
  fixBrokenImages();
});
