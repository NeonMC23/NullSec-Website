/**
 * Nullsec — Search Module
 * Local full-text search over articles using Fuse.js.
 * Triggered by CTRL+K or clicking the search button.
 */

(function () {
  'use strict';

  let fuseInstance = null;
  let articlesData = [];

  /** Fetch articles.json and initialise Fuse. */
  async function loadSearchIndex() {
    try {
      const res = await fetch('/data/articles.json');
      articlesData = await res.json();
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

    if (!query || !fuseInstance) {
      container.innerHTML =
        '<div class="search-empty">Start typing to search articles...</div>';
      return;
    }

    const results = fuseInstance.search(query);
    if (results.length === 0) {
      container.innerHTML =
        '<div class="search-empty">No articles found. Try a different term.</div>';
      return;
    }

    container.innerHTML = results
      .map(
        (result) => `
          <a href="${result.item.url}" class="search-result-item">
            <div class="title">${Utils.sanitize(result.item.title)}</div>
            <div class="meta">${Utils.sanitize(result.item.category)} &middot; ${Utils.formatDate(result.item.date)}</div>
          </a>
        `
      )
      .join('');
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
      container.innerHTML =
        '<div class="search-empty">Start typing to search articles...</div>';
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

  /** Initialise search. */
  function init() {
    loadSearchIndex();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
