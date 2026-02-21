/*  WatchHentai — script.js
    Everything inside DOMContentLoaded — zero top-level execution
    No ES modules. Plain var/function only.
    Navbar/footer from /api/extra. Hero fallback if featured=[].
*/
document.addEventListener('DOMContentLoaded', function () {

  var API  = (window.CONFIG && window.CONFIG.API) ? window.CONFIG.API : 'https://watchhentai-api.vercel.app/api';
  var PAGE = document.body.getAttribute('data-page') || '';

  /* ─── Core helpers ─────────────────────────────── */
  function apiFetch(path) {
    return fetch(API + path)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(j) {
        if (!j.success) throw new Error(j.error || 'API error');
        return j.data;
      });
  }

  function $  (sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$ (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function P() {
    var p = {};
    new URLSearchParams(window.location.search).forEach(function(v,k){ p[k]=v; });
    return p;
  }

  function slug(url) {
    if (!url) return '';
    return url.replace(/\/$/, '').split('/').pop();
  }

  function x(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function show(id){ var e=document.getElementById(id); if(e) e.classList.remove('hidden'); }
  function hide(id){ var e=document.getElementById(id); if(e) e.classList.add('hidden');    }
  function hideAll(arr){ arr.forEach(hide); }

  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast '+(type==='ok'?'ok':'err');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add('show'); }, 15);
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); },380); }, 3400);
  }

  /* ─── Skeletons ────────────────────────────────── */
  function skels(n, ar) {
    var h='', a=ar||'2/3';
    for(var i=0;i<(n||12);i++) {
      h+='<div class="sk-card"><div class="sk sk-img" style="aspect-ratio:'+a+'"></div><div class="sk sk-l"></div><div class="sk sk-l s"></div></div>';
    }
    return h;
  }
  function empty(msg){ return '<div class="empty" style="grid-column:1/-1"><span class="empty-ico">📭</span><p>'+x(msg)+'</p></div>'; }

  /* ─── Cards ────────────────────────────────────── */
  function playIco(){ return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }

  function serCard(it) {
    var s = slug(it.url);
    var tag='';
    if(it.censored==='uncensored') tag='<span class="cb cb-unc">Uncensored</span>';
    else if(it.censored==='censored') tag='<span class="cb cb-cen">Censored</span>';
    return '<a class="card" href="series.html?slug='+x(s)+'">' +
      '<div class="c-thumb">' +
        '<img src="'+x(it.poster||'')+'" alt="'+x(it.title)+'" loading="lazy" onerror="this.src=\'https://placehold.co/300x420/0e1220/e8334a?text=N\'">'+
        tag +
        (it.rating?'<span class="cb cb-rate">★ '+x(it.rating)+'</span>':'')+
        (it.episodes?'<span class="cb cb-ep">'+x(it.episodes)+' EP</span>':'')+
        '<div class="c-play"><div class="c-play-ico">'+playIco()+'</div></div>'+
      '</div>'+
      '<div class="c-body"><p class="c-name">'+x(it.title)+'</p><div class="c-info">'+x(it.year||'')+'</div></div>'+
    '</a>';
  }

  function epCard(it) {
    var s = slug(it.url);
    return '<a class="card ep" href="watch.html?slug='+x(s)+'">' +
      '<div class="c-thumb">' +
        '<img src="'+x(it.thumbnail||it.poster||'')+'" alt="'+x(it.title)+'" loading="lazy" onerror="this.src=\'https://placehold.co/400x225/0e1220/e8334a?text=N\'">'+
        '<div class="c-play"><div class="c-play-ico">'+playIco()+'</div></div>'+
      '</div>'+
      '<div class="c-body"><p class="c-name">'+x(it.title)+'</p>'+
      '<div class="c-info">'+
        (it.date?'<span>'+x(it.date)+'</span>':'')+
        (it.views?'<span>👁 '+x(it.views)+'</span>':'')+
      '</div></div>'+
    '</a>';
  }

  function fill(el, items, type, max) {
    if(!el) return;
    var list = max ? items.slice(0,max) : items;
    if(!list.length){ el.innerHTML=empty('No content available.'); return; }
    el.innerHTML = list.map(type==='ep'?epCard:serCard).join('');
  }

  /* ─── Pagination ───────────────────────────────── */
  function pagHTML(cur, total, fn) {
    if(!total||total<=1) return '';
    var pages=[], d=2;
    for(var i=1;i<=total;i++){
      if(i===1||i===total||(i>=cur-d&&i<=cur+d)) pages.push(i);
      else if(pages[pages.length-1]!=='...') pages.push('...');
    }
    var h='<div class="pager">';
    h+='<button class="pg"'+(cur<=1?' disabled':'')+' data-p="'+(cur-1)+'">‹</button>';
    pages.forEach(function(p){
      if(p==='...') h+='<span class="pg-dots">…</span>';
      else h+='<button class="pg'+(p===cur?' on':'')+'" data-p="'+p+'">'+p+'</button>';
    });
    h+='<button class="pg"'+(cur>=total?' disabled':'')+' data-p="'+(cur+1)+'">›</button>';
    h+='</div>';
    return h;
  }

  function bindPager(wrap, cb) {
    if(!wrap) return;
    wrap.addEventListener('click', function(e){
      var b=e.target.closest('.pg');
      if(b&&!b.disabled){ cb(parseInt(b.getAttribute('data-p'),10)); window.scrollTo({top:0,behavior:'smooth'}); }
    });
  }

  /* ══════════════════════════════════════════════════
     NAVBAR — from /api/extra, fallback static
  ══════════════════════════════════════════════════ */
  function buildNav(extra) {
    var genres = (extra&&extra.menuGenres) || [];
    var navEl = document.getElementById('mainNav');
    if(!navEl) return;

    var dropItems = genres.map(function(g){
      return '<a class="drop-a" href="genre.html?slug='+x(g.slug)+'">'+x(g.name)+'</a>';
    }).join('');

    var mobGenres = genres.map(function(g){
      return '<a class="mob-a" href="genre.html?slug='+x(g.slug)+'">'+x(g.name)+'</a>';
    }).join('');

    var p = P();
    function on(cond){ return cond?' on':''; }

    navEl.innerHTML =
      '<div class="nav-in">' +
        '<a href="index.html" class="nav-logo">Watch<em>Hentai</em></a>' +
        '<nav class="nav-links">' +
          '<a class="nav-a'+on(PAGE==='index'&&!p.type&&!p.search)+'" href="index.html">Home</a>' +
          '<a class="nav-a'+on(PAGE==='index'&&p.type==='trending')+'" href="index.html?type=trending">Trending</a>' +
          '<a class="nav-a'+on(PAGE==='index'&&p.type==='videos')+'" href="index.html?type=videos">Episodes</a>' +
          '<a class="nav-a'+on(PAGE==='index'&&p.type==='series')+'" href="index.html?type=series">Series</a>' +
          '<a class="nav-a'+on(PAGE==='genre'&&p.slug==='uncensored')+'" href="genre.html?slug=uncensored">Uncensored</a>' +
          '<a class="nav-a'+on(PAGE==='index'&&p.type==='calendar')+'" href="index.html?type=calendar">Calendar</a>' +
          (dropItems?
            '<div class="nav-drop" id="navDrop">'+
              '<span class="nav-drop-btn">Genres '+
                '<svg viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
              '</span>'+
              '<div class="drop-panel">'+dropItems+'</div>'+
            '</div>'
          : '<a class="nav-a'+on(PAGE==='genre')+'" href="genre.html">Genres</a>'
          ) +
        '</nav>' +
        '<div class="nav-right">' +
          '<form class="s-form" id="sfDsk">' +
            '<div class="s-wrap">'+
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>'+
              '<input class="s-inp" id="siDsk" type="text" placeholder="Search series…" autocomplete="off">'+
            '</div>'+
            '<button class="s-btn" type="submit">Search</button>'+
          '</form>'+
        '</div>'+
        '<button class="nav-ham" id="navHam" aria-label="Menu"><span></span><span></span><span></span></button>'+
      '</div>' +
      /* Mobile drawer */
      '<div class="mob-nav" id="mobNav">' +
        '<div class="mob-s">' +
          '<form id="sfMob" style="display:flex;gap:.4rem;width:100%">' +
            '<input class="s-inp" id="siMob" type="text" placeholder="Search…" autocomplete="off" style="flex:1;width:auto">' +
            '<button class="s-btn" type="submit">Go</button>' +
          '</form>' +
        '</div>' +
        '<a class="mob-a" href="index.html">Home</a>' +
        '<a class="mob-a" href="index.html?type=trending">Trending</a>' +
        '<a class="mob-a" href="index.html?type=videos">Episodes</a>' +
        '<a class="mob-a" href="index.html?type=series">All Series</a>' +
        '<a class="mob-a" href="genre.html?slug=uncensored">Uncensored</a>' +
        '<a class="mob-a" href="index.html?type=calendar">Calendar</a>' +
        (mobGenres?'<div class="mob-lbl">Genres</div>'+mobGenres:'') +
      '</div>';

    /* Hamburger */
    var ham = document.getElementById('navHam');
    var mob = document.getElementById('mobNav');
    if(ham&&mob){
      ham.addEventListener('click', function(){
        var o=mob.classList.toggle('open'); ham.classList.toggle('open',o);
      });
    }

    /* Dropdown */
    var drop = document.getElementById('navDrop');
    if(drop){
      drop.querySelector('.nav-drop-btn').addEventListener('click', function(e){
        e.stopPropagation(); drop.classList.toggle('open');
      });
      document.addEventListener('click', function(){ drop.classList.remove('open'); });
    }

    /* Search */
    function bindSearch(fid, iid){
      var f=document.getElementById(fid), i=document.getElementById(iid);
      if(!f||!i) return;
      if(p.search) i.value=p.search;
      f.addEventListener('submit', function(e){
        e.preventDefault();
        var q=i.value.trim();
        if(q) window.location.href='index.html?search='+encodeURIComponent(q);
      });
    }
    bindSearch('sfDsk','siDsk');
    bindSearch('sfMob','siMob');
  }

  function buildFooter(extra) {
    var el = document.getElementById('siteFooter');
    if(!el) return;
    var links = (extra&&extra.partnerLinks) || [];
    var copy  = (extra&&extra.copyright) || 'WatchHentai.net © 2025';
    var lh = links.slice(0,8).map(function(l){
      return '<a href="'+x(l.url)+'" target="_blank" rel="noopener">'+x(l.name)+'</a>';
    }).join('');
    el.innerHTML =
      '<div class="ft-in">' +
        '<div class="ft-brand">Watch<em>Hentai</em></div>' +
        (lh?'<div class="ft-links">'+lh+'</div>':'') +
        '<p class="ft-copy">'+x(copy)+' — All rights belong to their respective owners. This site does not host any files.</p>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════
     INDEX PAGE
  ══════════════════════════════════════════════════ */
  function initIndex() {
    var p = P();

    if(p.search){
      hideAll(['heroSec','homeSecs','listSec','calSec']);
      show('searchSec');
      doSearch(p.search, parseInt(p.page)||1);
      return;
    }

    var type = p.type;
    if(type==='trending'||type==='videos'||type==='series'){
      hideAll(['heroSec','homeSecs','searchSec','calSec']);
      show('listSec');
      var titles={trending:'Trending Series',videos:'Latest Episodes',series:'All Series'};
      var te=document.getElementById('listTitle'); if(te) te.textContent=titles[type]||'';
      doList(type, parseInt(p.page)||1);
      return;
    }

    if(type==='calendar'){
      hideAll(['heroSec','homeSecs','searchSec','listSec']);
      show('calSec');
      doCal();
      return;
    }

    /* HOME */
    hideAll(['listSec','searchSec','calSec']);
    show('heroSec');
    show('homeSecs');
    doHome();
  }

  /* HOME */
  function doHome() {
    var newEl   = document.getElementById('newEpGrid');
    var trendEl = document.getElementById('trendGrid');
    if(newEl)   newEl.innerHTML   = skels(12,'16/9');
    if(trendEl) trendEl.innerHTML = skels(12,'2/3');

    apiFetch('/home')
      .then(function(data){
        buildSlider(data.featured || []);
        fill(newEl,   data.newEpisodes||[], 'ep',     12);
        fill(trendEl, data.trending||[],    'series', 12);
      })
      .catch(function(){
        buildSlider([]);
        if(newEl)   newEl.innerHTML   = empty('Failed to load episodes.');
        if(trendEl) trendEl.innerHTML = empty('Failed to load trending.');
        toast('Failed to load home');
      });
  }

  /* HERO SLIDER */
  function buildSlider(items) {
    var wrap = document.getElementById('heroSlider');
    if(!wrap) return;

    /* If no featured items — show a clean fallback banner instead of blank space */
    if(!items.length){
      wrap.innerHTML =
        '<div class="hero-empty">' +
          '<div style="text-align:center;padding:3rem 1.4rem;animation:hIn .5s ease">' +
            '<p style="font-family:var(--fd);font-size:clamp(1.6rem,4vw,2.8rem);font-weight:700;color:#fff;margin-bottom:.75rem">Welcome to <span style="color:var(--red)">WatchHentai</span></p>' +
            '<p style="color:var(--t2);font-size:.9rem;margin-bottom:1.5rem">Browse thousands of hentai series and episodes</p>' +
            '<div style="display:flex;gap:.65rem;justify-content:center;flex-wrap:wrap">' +
              '<a href="index.html?type=trending" class="btn btn-red">🔥 Trending</a>' +
              '<a href="index.html?type=videos" class="btn btn-ghost">🎬 New Episodes</a>' +
              '<a href="genre.html" class="btn btn-ghost">🏷️ Browse Genres</a>' +
            '</div>' +
          '</div>' +
        '</div>';
      return;
    }

    var idx = 0, timer = null;

    function render(i) {
      clearTimeout(timer);
      var f = items[i];
      var s = slug(f.url);
      var genH = (f.genres||[]).slice(0,3).map(function(g){ return '<span class="h-tag">'+x(g)+'</span>'; }).join('');
      var syn  = (f.synopsis||'').slice(0,180) + (f.synopsis&&f.synopsis.length>180?'…':'');
      var dots = items.map(function(_,j){ return '<span class="h-dot'+(j===i?' on':'')+'" data-i="'+j+'"></span>'; }).join('');

      wrap.innerHTML =
        '<div class="hero-slide" style="background-image:url(\''+x(f.backdrop||f.poster)+'\')">' +
          '<div class="hero-content">' +
            (f.year||genH?
              '<div class="hero-tags">'+(f.year?'<span class="h-tag yr">'+x(f.year)+'</span>':'')+genH+'</div>':'') +
            '<h1 class="hero-title">'+x(f.title)+'</h1>' +
            '<div class="hero-meta">' +
              (f.rating?'<span class="h-rating">★ '+x(f.rating)+'</span>':'')+
              (f.year?'<span>'+x(f.year)+'</span>':'')+
            '</div>' +
            (syn?'<p class="hero-syn">'+x(syn)+'</p>':'')+
            '<div class="hero-acts">'+
              '<a href="series.html?slug='+x(s)+'" class="btn btn-red">▶ View Series</a>'+
              '<a href="series.html?slug='+x(s)+'" class="btn btn-ghost">Episodes</a>'+
            '</div>'+
          '</div>'+
          '<div class="hero-poster-col">'+
            '<img class="hero-poster" src="'+x(f.poster)+'" alt="'+x(f.title)+'" onerror="this.style.display=\'none\'">'+
          '</div>'+
        '</div>'+
        '<div class="hero-dots">'+dots+'</div>'+
        (items.length>1?'<button class="hero-prev">‹</button><button class="hero-next">›</button>':'');

      $$('.h-dot',wrap).forEach(function(d){
        d.addEventListener('click',function(){ idx=parseInt(d.getAttribute('data-i'),10); render(idx); });
      });
      var prev=$('.hero-prev',wrap), next=$('.hero-next',wrap);
      if(prev) prev.addEventListener('click',function(){ idx=(idx-1+items.length)%items.length; render(idx); });
      if(next) next.addEventListener('click',function(){ idx=(idx+1)%items.length; render(idx); });

      timer = setTimeout(function(){ idx=(idx+1)%items.length; render(idx); }, 6500);
    }
    render(0);
  }

  /* LIST */
  function doList(type, page) {
    var grid=$('div#listGrid'), pag=$('div#listPag');
    // fallback: get by id
    grid = document.getElementById('listGrid');
    pag  = document.getElementById('listPag');
    var isEp=(type==='videos');
    if(grid) grid.innerHTML=skels(24,isEp?'16/9':'2/3');
    if(pag)  pag.innerHTML='';

    apiFetch('/'+type+'?page='+page)
      .then(function(data){
        var items=data.items||[];
        if(!items.length){ if(grid) grid.innerHTML=empty('No content found.'); return; }
        if(grid) grid.innerHTML=items.map(isEp?epCard:serCard).join('');
        if(pag){
          pag.innerHTML=pagHTML(data.page||page, data.totalPages||1, function(p){
            window.location.href='index.html?type='+type+'&page='+p;
          });
          bindPager(pag, function(p){ window.location.href='index.html?type='+type+'&page='+p; });
        }
      })
      .catch(function(){ if(grid) grid.innerHTML=empty('Failed to load.'); toast('Load failed'); });
  }

  /* CALENDAR */
  function doCal() {
    var el=document.getElementById('calContent');
    if(!el) return;
    el.innerHTML='<div class="spin"></div>';
    apiFetch('/calendar')
      .then(function(data){
        var months=data.months||[];
        if(!months.length){ el.innerHTML=empty('No calendar data.'); return; }
        var h='';
        months.forEach(function(m){
          var eps=m.episodes||[];
          if(!eps.length) return;
          h+='<div style="margin-bottom:2.5rem">'+
             '<div class="sec-hd"><div class="sec-hd-l">'+
               '<span class="eyebrow">Schedule</span>'+
               '<h2 class="sec-title">'+x(m.month)+'</h2>'+
             '</div></div>'+
             '<div class="grid ep">'+eps.map(epCard).join('')+'</div>'+
             '</div>';
        });
        el.innerHTML=h||empty('No episodes scheduled.');
      })
      .catch(function(){ el.innerHTML=empty('Failed to load calendar.'); });
  }

  /* SEARCH */
  function doSearch(q, page) {
    var te=document.getElementById('searchTitle');
    var grid=document.getElementById('searchGrid');
    var pag=document.getElementById('searchPag');
    if(te) te.innerHTML='Results for <span>"'+x(q)+'"</span>';
    if(grid) grid.innerHTML=skels(24);
    if(pag) pag.innerHTML='';

    apiFetch('/search?q='+encodeURIComponent(q)+'&page='+page)
      .then(function(data){
        var items=data.items||[];
        if(!items.length){ if(grid) grid.innerHTML=empty('No results for "'+q+'"'); return; }
        if(grid) grid.innerHTML=items.map(serCard).join('');
        if(pag){
          pag.innerHTML=pagHTML(data.page||page, data.totalPages||1, function(p){
            window.location.href='index.html?search='+encodeURIComponent(q)+'&page='+p;
          });
          bindPager(pag, function(p){ window.location.href='index.html?search='+encodeURIComponent(q)+'&page='+p; });
        }
      })
      .catch(function(){ if(grid) grid.innerHTML=empty('Search failed.'); });
  }

  /* ══════════════════════════════════════════════════
     GENRE PAGE
  ══════════════════════════════════════════════════ */
  function initGenre() {
    var p=P(), s=p.slug||'', page=parseInt(p.page)||1;

    apiFetch('/genres')
      .then(function(genres){
        var listEl=document.getElementById('gsList');
        if(!listEl) return;
        if(!genres||!genres.length){ listEl.innerHTML='<p style="color:var(--t3);padding:.5rem .7rem;font-size:.79rem">No genres.</p>'; return; }
        listEl.innerHTML=genres.map(function(g){
          return '<a class="g-a'+(g.slug===s?' on':'')+'" href="genre.html?slug='+x(g.slug)+'">'+
            x(g.name)+'<span class="g-cnt">'+(g.count||0)+'</span></a>';
        }).join('');
      })
      .catch(function(){});

    if(!s) return;

    var titleEl=document.getElementById('gsTitle');
    var subEl  =document.getElementById('gsSub');
    var grid   =document.getElementById('gsGrid');
    var pag    =document.getElementById('gsPag');
    if(grid) grid.innerHTML=skels(24);

    apiFetch('/genre/'+s+'?page='+page)
      .then(function(data){
        var name=data.genre||s;
        document.title=name+' — WatchHentai';
        if(titleEl) titleEl.textContent=name;
        if(subEl)   subEl.textContent=(data.totalPages||0)+' pages of series';
        var items=data.items||[];
        if(!items.length){ if(grid) grid.innerHTML=empty('No series found.'); return; }
        if(grid) grid.innerHTML=items.map(serCard).join('');
        if(pag){
          pag.innerHTML=pagHTML(data.page||page, data.totalPages||1, function(p){
            window.location.href='genre.html?slug='+s+'&page='+p;
          });
          bindPager(pag, function(p){ window.location.href='genre.html?slug='+s+'&page='+p; });
        }
      })
      .catch(function(){
        if(grid) grid.innerHTML=empty('Failed to load genre.');
        toast('Failed to load genre');
      });
  }

  /* ══════════════════════════════════════════════════
     SERIES DETAIL
  ══════════════════════════════════════════════════ */
  function initSeries() {
    var p=P();
    if(!p.slug){ window.location.href='index.html'; return; }
    var el=document.getElementById('seriesContent');
    if(el) el.innerHTML='<div class="spin"></div>';

    apiFetch('/series/'+p.slug)
      .then(function(d){
        document.title=d.title+' — WatchHentai';
        renderSeries(d,el);
      })
      .catch(function(){
        if(el) el.innerHTML='<div class="empty"><span class="empty-ico">⚠️</span><p>Series not found.</p></div>';
        toast('Failed to load series');
      });
  }

  function renderSeries(d,el) {
    if(!el) return;
    var cCls=d.censored==='uncensored'?'unc':d.censored==='censored'?'cen':'';
    var sCls=(d.status||'').toLowerCase();

    var genChips=(d.genres||[]).map(function(g){
      return '<a class="chip" href="genre.html?slug='+x(slug(g.url))+'">'+x(g.name)+'</a>';
    }).join('');

    var eps=(d.episodes||[]).map(function(ep){
      var s2=slug(ep.url);
      return '<a class="ep-item" href="watch.html?slug='+x(s2)+'">'+
        '<div class="ep-thumb">'+
          '<img src="'+x(ep.thumbnail||'')+'" alt="EP '+ep.number+'" loading="lazy" onerror="this.src=\'https://placehold.co/400x225/0e1220/e8334a?text=EP\'">'+
          '<div class="ep-play"><svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40"><path d="M8 5v14l11-7z"/></svg></div>'+
        '</div>'+
        '<div class="ep-info">'+
          '<span class="ep-n">Episode '+ep.number+'</span>'+
          '<span class="ep-name">'+x(ep.title)+'</span>'+
          '<span class="ep-date">'+x(ep.date||'')+'</span>'+
        '</div>'+
      '</a>';
    }).join('');

    var related=(d.related||[]).slice(0,6).map(function(r){
      return '<a class="card" href="series.html?slug='+x(slug(r.url))+'">'+
        '<div class="c-thumb"><img src="'+x(r.poster||'')+'" alt="'+x(r.title)+'" loading="lazy" onerror="this.src=\'https://placehold.co/300x420/0e1220/e8334a?text=N\'">'+
        '<div class="c-play"><div class="c-play-ico">'+playIco()+'</div></div></div>'+
        '<div class="c-body"><p class="c-name">'+x(r.title)+'</p></div>'+
      '</a>';
    }).join('');

    el.innerHTML=
      '<div class="ser-hero" style="background-image:url(\''+x(d.backdrop||d.poster)+'\')">'+
        '<div class="ser-hero-in">'+
          '<img class="ser-poster" src="'+x(d.poster)+'" alt="'+x(d.title)+'" onerror="this.src=\'https://placehold.co/300x420/0e1220/e8334a?text=N\'">'+
          '<div class="ser-meta">'+
            '<h1 class="ser-ttl">'+x(d.title)+'</h1>'+
            '<div class="pills">'+
              (d.rating?'<span class="pill">★ '+x(d.rating)+'<small style="opacity:.6"> ('+x(d.votes||0)+')</small></span>':'')+
              (d.year?'<span class="pill">📅 '+x(d.year)+'</span>':'')+
              (d.status?'<span class="pill '+x(sCls)+'">'+x(d.status)+'</span>':'')+
              (d.studio?'<span class="pill">🎬 '+x(d.studio)+'</span>':'')+
              (d.censored?'<span class="pill '+x(cCls)+'">'+x(d.censored)+'</span>':'')+
            '</div>'+
            (genChips?'<div class="g-chips">'+genChips+'</div>':'')+
            (d.synopsis?'<p class="ser-syn">'+x(d.synopsis)+'</p>':'')+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="ser-body">'+
        '<div class="sec-hd"><div class="sec-hd-l"><span class="eyebrow">All Episodes</span>'+
        '<h2 class="sec-title">Episodes <small style="font-size:.5em;color:var(--red);font-family:var(--fu)">('+((d.episodes||[]).length)+')</small></h2>'+
        '</div></div>'+
        (eps?'<div class="ep-grid">'+eps+'</div>':'<div class="empty"><span class="empty-ico">📺</span><p>No episodes yet.</p></div>')+
        (related?
          '<div style="margin-top:3.5rem"><div class="sec-hd"><div class="sec-hd-l"><span class="eyebrow">More Like This</span><h2 class="sec-title">Related Series</h2></div></div>'+
          '<div class="grid">'+related+'</div></div>':'')
      +'</div>';
  }

  /* ══════════════════════════════════════════════════
     WATCH PAGE
  ══════════════════════════════════════════════════ */
  function initWatch() {
    var p=P();
    if(!p.slug){ window.location.href='index.html'; return; }
    var el=document.getElementById('watchContent');
    if(el) el.innerHTML='<div class="spin"></div>';

    apiFetch('/watch/'+p.slug)
      .then(function(d){
        document.title=d.title+' — WatchHentai';
        renderWatch(d,el);
      })
      .catch(function(){
        if(el) el.innerHTML='<div class="empty"><span class="empty-ico">⚠️</span><p>Episode not found.</p></div>';
        toast('Failed to load episode');
      });
  }

  function renderWatch(d,el) {
    if(!el) return;
    var player=d.player||{};
    var sources=player.sources||[];
    var defSrc=sources.length?sources[0].src:(player.src||'');

    var srcTags=sources.map(function(s){ return '<source src="'+x(s.src)+'" type="'+x(s.type)+'">'; }).join('');
    if(!srcTags&&defSrc) srcTags='<source src="'+x(defSrc)+'" type="video/mp4">';

    var qBtns=sources.map(function(s,i){
      return '<button class="q-pill'+(i===0?' on':'')+'" data-src="'+x(s.src)+'">'+x(s.label)+'</button>';
    }).join('');

    var genH=(d.genres||[]).map(function(g){
      return '<a class="chip" href="genre.html?slug='+x(slug(g.url))+'">'+x(g.name)+'</a>';
    }).join('');

    var serSlug=slug(d.seriesUrl);
    var prevLnk=d.prevEpisode?'<a href="watch.html?slug='+x(slug(d.prevEpisode.url))+'" class="btn btn-outline">‹ '+x(d.prevEpisode.title)+'</a>':'<span></span>';
    var nextLnk=d.nextEpisode?'<a href="watch.html?slug='+x(slug(d.nextEpisode.url))+'" class="btn btn-outline">'+x(d.nextEpisode.title)+' ›</a>':'<span></span>';

    var sbEps=(d.episodes||[]).map(function(ep){
      var s2=slug(ep.url);
      return '<a class="ws-ep'+(ep.isCurrent?' now':'')+'" href="watch.html?slug='+x(s2)+'">'+
        '<img src="'+x(ep.thumbnail||'')+'" alt="EP '+ep.number+'" loading="lazy" onerror="this.src=\'https://placehold.co/80x45/0e1220/e8334a?text=EP\'">'+
        '<div class="ws-ep-i">'+
          '<span class="ws-n">EP '+ep.number+'</span>'+
          '<span class="ws-t">'+x(ep.title)+'</span>'+
          '<span class="ws-d">'+x(ep.date||'')+'</span>'+
        '</div>'+
        (ep.isCurrent?'<span class="now-b">▶ Now</span>':'')+
      '</a>';
    }).join('');

    el.innerHTML=
      '<div class="w-wrap">'+
        '<div class="w-main">'+
          '<div class="player-box">'+
            '<video id="vPlayer" controls preload="metadata" poster="'+x(d.thumbnail||'')+'">'+
              srcTags+'Your browser does not support video.'+
            '</video>'+
            '<div class="player-bar">'+
              '<span class="pb-title">'+x(d.title)+'</span>'+
              (qBtns?'<div class="q-pills">'+qBtns+'</div>':'')+
              (player.downloadUrl?'<a href="'+x(player.downloadUrl)+'" class="btn btn-outline btn-sm" target="_blank">⬇ Download</a>':'')+
            '</div>'+
          '</div>'+
          '<div class="ep-nav">'+prevLnk+'<a href="series.html?slug='+x(serSlug)+'" class="btn btn-ghost">📋 All Episodes</a>'+nextLnk+'</div>'+
          '<h1 class="w-title">'+x(d.title)+'</h1>'+
          '<div class="w-meta">'+
            (d.views?'<span class="pill">👁 '+x(d.views)+' views</span>':'')+
            (d.censored?'<span class="pill '+(d.censored==='uncensored'?'unc':'cen')+'">'+x(d.censored)+'</span>':'')+
            genH+
          '</div>'+
          (d.synopsis?'<p class="w-syn">'+x(d.synopsis)+'</p>':'')+
        '</div>'+
        '<aside class="w-side">'+
          '<div class="ws-hd">'+
            '<img class="ws-poster" src="'+x(d.seriesPoster||'')+'" alt="'+x(d.seriesTitle||'')+'" onerror="this.src=\'https://placehold.co/46x66/0e1220/e8334a?text=P\'">'+
            '<div style="min-width:0"><a class="ws-sname" href="series.html?slug='+x(serSlug)+'">'+x(d.seriesTitle||'')+'</a></div>'+
          '</div>'+
          '<div class="ws-lbl">Episodes</div>'+
          '<div class="ws-eps" id="wsSideEps">'+(sbEps||'<div style="padding:1.5rem;text-align:center;color:var(--t3)">No episodes</div>')+'</div>'+
        '</aside>'+
      '</div>';

    /* Scroll to current episode */
    setTimeout(function(){
      var cur=$('.ws-ep.now');
      if(cur) cur.scrollIntoView({block:'center'});
    }, 120);

    /* Quality switcher */
    var vid=document.getElementById('vPlayer');
    $$('.q-pill').forEach(function(btn){
      btn.addEventListener('click',function(){
        $$('.q-pill').forEach(function(b){ b.classList.remove('on'); });
        btn.classList.add('on');
        if(vid){
          var t=vid.currentTime, playing=!vid.paused;
          vid.src=btn.getAttribute('data-src');
          vid.load(); vid.currentTime=t;
          if(playing) vid.play().catch(function(){});
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════
     BOOT — /api/extra first, then page init
     Both .then() AND .catch() call page init
  ══════════════════════════════════════════════════ */
  function runPage() {
    if(PAGE==='index')  initIndex();
    if(PAGE==='genre')  initGenre();
    if(PAGE==='series') initSeries();
    if(PAGE==='watch')  initWatch();
  }

  apiFetch('/extra')
    .then(function(extra){
      buildNav(extra);
      buildFooter(extra);
      runPage();
    })
    .catch(function(){
      /* Extra API failed → build fallback nav, still run page */
      buildNav({});
      buildFooter({});
      runPage();
    });

}); /* end DOMContentLoaded */
