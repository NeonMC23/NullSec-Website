/**
 * NullSec — Tools Library
 * Searchable, filterable database of privacy tools and software.
 *
 * Data source: /data/tools.json (fetched at runtime).
 */
(function () {
  'use strict';

  let TOOLS = [];
  let allCategories = [];

  /* ------------------------------------------------------------------
   * Data loading
   * ---------------------------------------------------------------- */
  function loadTools() {
    Data.loadTools()
      .then(function (data) {
        TOOLS = data;
        allCategories = [...new Set(TOOLS.map(function (t) { return t.category; }))].sort();
        init();
      })
      .catch(function (err) {
        console.error('Failed to load tools:', err);
        let container = document.getElementById('tools-grid');
        if (container) {
          Utils.clear(container);
          container.appendChild(Utils.el('p', {
            style: 'color:var(--text-dim);text-align:center;grid-column:1/-1;padding:40px;',
            text: 'Could not load the Tools Library. Please refresh to try again.'
          }));
        }
      });
  }

  /* ------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------- */
  function renderTools(tools) {
    let container = document.getElementById('tools-grid');
    if (!container) return;
    Utils.clear(container);
    if (!tools.length) {
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);text-align:center;grid-column:1/-1;padding:40px;',
        text: 'No tools found matching your search.'
      }));
      return;
    }
    tools.forEach(function (t) {
      let idx = TOOLS.indexOf(t);
      let card = Utils.el('div', { class: 'tool-card', style: 'cursor:pointer;', dataset: { toolIdx: idx } });
      let top = Utils.el('div', { class: 'tool-top' });
      top.appendChild(Utils.el('h3', { text: t.name }));
      top.appendChild(Utils.el('span', { class: 'tool-category', text: t.category }));
      card.appendChild(top);
      card.appendChild(Utils.el('p', { text: t.desc }));
      let meta = Utils.el('div', { class: 'tool-meta' });
      let diffTag = Utils.el('span', { class: 'meta-tag' });
      diffTag.appendChild(document.createTextNode('Difficulty: '));
      for (let i = 0; i < t.difficulty; i++) diffTag.appendChild(Utils.el('span', { text: '\u25cf' }));
      meta.appendChild(diffTag);
      if (t.openSource) meta.appendChild(Utils.el('span', { class: 'meta-tag open-source', text: 'Open Source' }));
      if (t.free) meta.appendChild(Utils.el('span', { class: 'meta-tag free', text: 'Free' }));
      card.appendChild(meta);
      let links = Utils.el('div', { class: 'tool-links' });
      links.appendChild(Utils.el('span', {
        style: 'color:var(--accent);font-size:0.8125rem;font-weight:500;',
        text: 'Click for details \u2199'
      }));
      card.appendChild(links);
      container.appendChild(card);
    });
  }

  window.openToolModal = function (idx) {
    let t = TOOLS[idx];
    if (!t) return;

    // M25: opening a tool triggers an anonymous community activity event via the
    // service layer (backend resolves the country). No per-user tracking, no
    // fabricated success, offline is a no-op.
    if (window.ActivityService) {
      ActivityService.record('tool_used', 1);
    }

    let sub = Utils.el('div', { class: 'modal-sub' });
    sub.appendChild(Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:var(--accent-subtle);color:var(--accent);border-radius:100px;',
      text: t.category
    }));
    let diffTag = Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(52,211,153,0.12);color:#34D399;border-radius:100px;'
    });
    diffTag.appendChild(document.createTextNode('Difficulty: '));
    for (let i = 0; i < 5; i++) diffTag.appendChild(Utils.el('span', { text: i < t.difficulty ? '\u25cf' : '\u25cb' }));
    sub.appendChild(diffTag);
    if (t.openSource) sub.appendChild(Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(52,211,153,0.12);color:#34D399;border-radius:100px;',
      text: '\u2713 Open Source'
    }));
    if (t.free) sub.appendChild(Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(251,191,36,0.12);color:#FBBF24;border-radius:100px;',
      text: 'Free'
    }));

    let body = Utils.el('div', { class: 'modal-body' });
    body.appendChild(Utils.el('p', { text: t.desc }));
    body.appendChild(Utils.el('p', { text: 'This tool can be accessed directly from the official website. Check our guides for setup instructions and tips.' }));

    let actions = Utils.el('div', { class: 'modal-actions' });
    let visit = Utils.el('a', {
      href: Utils.safeUrl(t.url),
      class: 'btn btn-primary',
      target: '_blank',
      rel: 'noopener'
    });
    visit.appendChild(document.createTextNode('Visit website '));
    visit.appendChild(document.createTextNode('\u2199'));
    actions.appendChild(visit);
    let closeBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Close' });
    closeBtn.addEventListener('click', function () { Modal.close(); });
    actions.appendChild(closeBtn);

    let content = Utils.el('div', {});
    content.appendChild(Utils.el('h2', { text: t.name }));
    content.appendChild(sub);
    content.appendChild(body);
    content.appendChild(actions);

    Modal.open(content);
  };

  function bindToolCards() {
    document.addEventListener('click', function (e) {
      let card = e.target.closest ? e.target.closest('.tool-card[data-tool-idx]') : null;
      if (card) {
        window.openToolModal(parseInt(card.getAttribute('data-tool-idx'), 10));
      }
    });
  }

  function renderCategories(active) {
    let container = document.getElementById('tools-categories');
    if (!container) return;
    Utils.clear(container);
    function addCat(name, cat) {
      let btn = Utils.el('button', {
        class: 'tools-cat-btn' + (active === cat ? ' active' : ''),
        dataset: { cat: cat },
        text: name
      });
      btn.addEventListener('click', function () {
        let c = this.getAttribute('data-cat');
        container.querySelectorAll('.tools-cat-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        filterAndRender();
      });
      container.appendChild(btn);
    }
    addCat('All', 'all');
    allCategories.forEach(function (cat) { addCat(cat, cat); });
  }

  function filterAndRender() {
    let searchEl = document.getElementById('tools-search');
    let search = searchEl ? (searchEl.value || '').toLowerCase() : '';
    let activeCat = document.querySelector('.tools-cat-btn.active');
    let cat = activeCat ? activeCat.getAttribute('data-cat') : 'all';
    let filtered = TOOLS.filter(function (t) {
      let matchCat = cat === 'all' || t.category === cat;
      let matchSearch = !search || t.name.toLowerCase().indexOf(search) !== -1 ||
        t.desc.toLowerCase().indexOf(search) !== -1 ||
        t.category.toLowerCase().indexOf(search) !== -1;
      return matchCat && matchSearch;
    });
    renderTools(filtered);
  }

  function init() {
    renderCategories('all');
    renderTools(TOOLS);
    let searchInput = document.getElementById('tools-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(filterAndRender, 150));
    }
    let params = new URLSearchParams(window.location.search);
    let urlCat = params.get('category');
    if (urlCat) {
      document.querySelectorAll('.tools-cat-btn').forEach(function (b) {
        if (b.getAttribute('data-cat') === urlCat) b.click();
      });
    }
  }

  function initModule() {
    bindToolCards();
    loadTools();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModule);
  } else {
    initModule();
  }
})();
