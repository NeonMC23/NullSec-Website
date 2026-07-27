/**
 * Nullsec — Articles Module
 * Loads article metadata from /data/articles.json and renders
 * the article cards on the articles listing page.
 * Supports filtering by category and sorting.
 */

(function () {
  'use strict';

  /** Main entry: load and render articles on articles.html */
  async function loadArticles() {
    const grid = document.getElementById('articles-grid');
    if (!grid) return; // Not on the articles page

    try {
      const res = await fetch('/data/articles.json');
      const articles = await res.json();
      renderArticles(articles, grid);
      setupFilters(articles, grid);
    } catch (err) {
      grid.innerHTML =
        '<p style="color: var(--text-dim);">Failed to load articles. Please try again later.</p>';
      console.error('Articles load error:', err);
    }
  }

  /**
   * Render an array of articles into the grid.
   * @param {Array} articles
   * @param {HTMLElement} grid
   */
  function renderArticles(articles, grid) {
    if (articles.length === 0) {
      grid.innerHTML =
        '<p style="color: var(--text-dim);">No articles published yet. Check back soon.</p>';
      return;
    }

    grid.innerHTML = articles
      .map(
        (a) => `
        <a href="${a.url}" class="article-card fade-in">
          <img
            src="${a.cover || '/assets/images/placeholder.webp'}"
            alt="${Utils.sanitize(a.title)}"
            class="article-card-cover"
            loading="lazy"
            onerror="this.src='/assets/images/placeholder.webp'"
          />
          <div class="article-card-body">
            <span class="article-card-category">${Utils.sanitize(a.category)}</span>
            <h3 class="article-card-title">${Utils.sanitize(a.title)}</h3>
            <p class="article-card-description">${Utils.sanitize(a.description)}</p>
            <div class="article-card-meta">
              <span>${Utils.formatDate(a.date)}</span>
              <span class="dot"></span>
              <span>${a.readingTime}</span>
            </div>
          </div>
        </a>
      `
      )
      .join('');
  }

  /**
   * Set up category filter and sort buttons.
   * @param {Array} originalArticles - Full article list
   * @param {HTMLElement} grid
   */
  function setupFilters(originalArticles, grid) {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sort-select');

    if (!filterBtns.length && !sortSelect) return;

    let activeCategory = 'all';
    let activeSort = sortSelect?.value || 'newest';

    function applyFiltersAndSort() {
      let filtered =
        activeCategory === 'all'
          ? [...originalArticles]
          : originalArticles.filter((a) => a.category === activeCategory);

      // Sort
      switch (activeSort) {
        case 'newest':
          filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
          break;
        case 'oldest':
          filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
          break;
        case 'category':
          filtered.sort((a, b) => a.category.localeCompare(b.category));
          break;
        case 'featured':
          filtered.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
          break;
        default:
          break;
      }

      renderArticles(filtered, grid);
    }

    // Filter buttons
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.getAttribute('data-category') || 'all';
        applyFiltersAndSort();
      });
    });

    // Sort select
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        activeSort = sortSelect.value;
        applyFiltersAndSort();
      });
    }

    // Initial render
    applyFiltersAndSort();
  }

  // Auto-initialise on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadArticles);
  } else {
    loadArticles();
  }
})();
