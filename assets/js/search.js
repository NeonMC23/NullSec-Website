/**
 * NullSec — Search Module
 * Local full-text search over articles using Fuse.js.
 * Triggered by CTRL+K or clicking the search button.
 */

(function () {
  'use strict';

  let fuseInstance = null;
  let articlesData = [];

  /** Fetch articles and initialise Fuse. */
  async function loadSearchIndex() {
    try {
      articlesData = await Data.loadArticles();
      fuseInstance = new Fuse(articlesData, {
        keys: [
          { name: 'title', weight: 0.5 },
          { name: 'description', weight: 0.3 },
          { name: 'category', weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 2,
      });
    } catch (err) {
      console.warn('Search index failed to load:', err);
    }
  }

  /** Render search results into the modal. */
  function renderResults(query) {
    const container = document.getElementById('search-results');
    if (!container) return;

    Utils.clear(container);

    if (!query || !fuseInstance) {
      container.appendChild(Utils.el('div', { class: 'search-empty', text: 'Start typing to search articles...' }));
      return;
    }

    const results = fuseInstance.search(query);
    if (results.length === 0) {
      container.appendChild(Utils.el('div', { class: 'search-empty', text: 'No articles found. Try a different term.' }));
      return;
    }

    results.forEach((result) => {
      const item = Utils.el('a', { href: result.item.url, class: 'search-result-item' });
      item.appendChild(Utils.el('div', { class: 'title', text: result.item.title }));
      const meta = Utils.el('div', { class: 'meta' });
      meta.appendChild(document.createTextNode(result.item.category + ' \u00b7 ' + Utils.formatDate(result.item.date)));
      item.appendChild(meta);
      container.appendChild(item);
    });
  }

  /** Open the search modal. */
  function openSearch() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    if (!overlay || !input) return;
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 100);
    document.body.style.overflow = 'hidden';
    // Reload index if not yet loaded
    if (!fuseInstance) loadSearchIndex();
  }

  /** Close the search modal. */
  function closeSearch() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (input) input.value = '';
    const container = document.getElementById('search-results');
    if (container) {
      Utils.clear(container);
      container.appendChild(Utils.el('div', { class: 'search-empty', text: 'Start typing to search articles...' }));
    }
  }

  /** Bind search event listeners. */
  function bindEvents() {
    // Search button
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) searchBtn.addEventListener('click', openSearch);

    // Overlay click to close
    const overlay = document.getElementById('search-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSearch();
      });
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay?.classList.contains('open')) {
        closeSearch();
      }
    });

    // CTRL+K / CMD+K to open
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (overlay?.classList.contains('open')) {
          closeSearch();
        } else {
          openSearch();
        }
      }
    });

    // Live search input
    const input = document.getElementById('search-input');
    if (input) {
      input.addEventListener(
        'input',
        Utils.debounce((e) => renderResults(e.target.value), 150)
      );
    }
  }

  /** Initialise search.
   *  M55: Fuse/search index is built LAZILY on first use (openSearch calls
   *  loadSearchIndex() when the search modal opens). Previously the index was
   *  built eagerly on every page load, fetching articles.json and building the
   *  Fuse index even on pages that never open search (about, tools, contribute,
   *  public-profile, etc.). This is a redundant fetch + main-thread cost on
   *  those pages. Search behavior is unchanged: the modal still loads the index
   *  when opened (lazy path in openSearch). */
  function init() {
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
